import { memo, useMemo, useSyncExternalStore, type ComponentType as ReactComponentType, type ReactNode } from "react";
import { DEFAULT_CATALOG } from "../catalog/catalog.js";
import { SkeletonLines } from "../catalog/components.js";
import type { Catalog, Picture } from "../catalog/types.js";

const NO_ASSETS: Readonly<Record<string, Picture>> = {};
import { isMutating, ROOT_ID, stateKeysOf, type OmniNode, type Primitive, type ToolRegistry } from "@omni-ir/core";
import type { OmniDocument, OmniStore } from "@omni-ir/core";
import {
  OmniContext,
  runHandler,
  useOmni,
  useStateValues,
  type MutationCall,
  type OmniContextValue,
  type RendererEvent,
} from "./context.js";
import { McpMutationBoundary } from "./McpMutationBoundary.js";
import { NodeErrorBoundary } from "./NodeErrorBoundary.js";
import { NodeFallback } from "./NodeFallback.js";

export interface OmniRendererProps {
  store: OmniStore;
  tools: ToolRegistry;
  onMutation: (call: MutationCall) => void | Promise<void>;
  onEvent?: (event: RendererEvent) => void;
  /** Host-supplied catalog (trusted code). Defaults to the built-in Trusted Catalog. */
  catalog?: Catalog;
  /** The app's image asset registry. Without it, Images show their alt text. */
  assets?: Readonly<Record<string, Picture>>;
  locale?: string;
  /**
   * Light (the default), dark, or the device's setting. The app chooses; the stream can't. Colours,
   * font and radius come from the design tokens (`--omni-*` CSS variables), which the app may set.
   */
  theme?: "light" | "dark" | "system";
}

export function OmniRenderer({
  store,
  tools,
  onMutation,
  onEvent,
  catalog = DEFAULT_CATALOG,
  assets = NO_ASSETS,
  locale = "en-US",
  theme = "light",
}: OmniRendererProps) {
  const value = useMemo<OmniContextValue>(
    () => ({ store, tools, catalog, assets, locale, onMutation, report: (event) => onEvent?.(event) }),
    [store, tools, catalog, assets, locale, onMutation, onEvent],
  );
  return (
    <OmniContext.Provider value={value}>
      <div className="omni-root" data-theme={theme}>
        <VersionNotice />
        <NodeSlot id={ROOT_ID} />
      </div>
    </OmniContext.Provider>
  );
}

/** When the stream was written for a newer version, say so above the screen (SPEC.md section 8). */
function VersionNotice() {
  const { store } = useOmni();
  const getNewer = () => store.getSnapshot().newerVersion;
  const newer = useSyncExternalStore(store.subscribe, getNewer, getNewer);
  if (!newer) return null;
  return (
    <p className="omni-version-notice" role="status">
      This screen was made for a newer version of the app. The app needs an update to show all of it.
    </p>
  );
}

type Slot = OmniNode | "pending" | "missing";

/** What one id should show right now. Returns stable values, so unrelated updates don't re-render it. */
function slotOf(doc: OmniDocument, id: string): Slot {
  const node = doc.nodes.get(id);
  const unavailable = doc.complete ? "missing" : "pending";
  if (node === undefined) return unavailable;
  // R1: a node whose state has not been declared yet waits like a missing child.
  for (const key of stateKeysOf(node)) if (!Object.hasOwn(doc.state, key)) return unavailable;
  return node;
}

/** One child position. It subscribes to its own id only (R3), so siblings and parents stay untouched. */
function NodeSlot({ id }: { id: string }) {
  const { store } = useOmni();
  const getSlot = () => slotOf(store.getSnapshot(), id);
  const slot = useSyncExternalStore(store.subscribe, getSlot, getSlot);
  if (slot === "pending") return <SkeletonLines lines={1} pendingId={id} />;
  if (slot === "missing") return <NodeFallback id={id} reason="missing" />;
  return <ResolvedSlot node={slot} />;
}

function ResolvedSlot({ node }: { node: OmniNode }) {
  const { report } = useOmni();
  const keys = useMemo(() => stateKeysOf(node), [node]);
  const values = useStateValues(keys);
  return (
    <NodeErrorBoundary id={node.id} resetKeys={[node, values]} report={report}>
      <MemoNode node={node} keys={keys} values={values} />
    </NodeErrorBoundary>
  );
}

const MemoNode = memo(function Node({
  node,
  keys,
  values,
}: {
  node: OmniNode;
  keys: readonly string[];
  values: readonly Primitive[];
}) {
  const ctx = useOmni();
  const props = resolveProps(node.props, keys, values);
  const children: ReactNode = node.children.map((child) => <NodeSlot key={child} id={child} />);
  // One cast: the node's type picks its catalog entry, and the props match that type by construction.
  const Component = ctx.catalog[node.type] as ReactComponentType<Record<string, unknown>>;
  const base = { id: node.id, props, children, locale: ctx.locale };

  if (node.type === "Image" || node.type === "ListItem") {
    const name = node.type === "Image" ? node.props.asset : node.props.image;
    const picture = name !== undefined && Object.hasOwn(ctx.assets, name) ? ctx.assets[name] : undefined;
    return <Component {...base} picture={picture} />;
  }

  if (node.type === "Input" || node.type === "DateInput" || node.type === "Select") {
    const key = node.props.value.key;
    const onChange = (value: string) => runHandler(ctx.report, node.id, () => ctx.store.setState(key, value));
    return <Component {...base} value={String(props.value ?? "")} onChange={onChange} />;
  }

  if (node.type === "Switch") {
    const key = node.props.value.key;
    const onChange = (value: boolean) => runHandler(ctx.report, node.id, () => ctx.store.setState(key, value));
    return <Component {...base} value={props.value === true} onChange={onChange} />;
  }

  if (node.type === "BarChart" || node.type === "LineChart") {
    return (
      <ChildData ids={node.children} read={(n) => (n.type === "Series" ? { id: n.id, name: n.props.name, values: n.props.values } : undefined)}>
        {(series) => <Component {...base} series={series} />}
      </ChildData>
    );
  }

  if (node.type === "PieChart") {
    return (
      <ChildData ids={node.children} read={(n) => (n.type === "Slice" ? { id: n.id, name: n.props.name, value: n.props.value } : undefined)}>
        {(slices) => <Component {...base} slices={slices} />}
      </ChildData>
    );
  }

  if (node.type === "Tabs") {
    return <TabLabels ids={node.children}>{(tabs) => <Component {...base} tabs={tabs} />}</TabLabels>;
  }

  if (node.type === "Button") {
    if (isMutating(node)) {
      return <McpMutationBoundary id={node.id}>{(governance) => <Component {...base} {...governance} />}</McpMutationBoundary>;
    }
    const onPress = () => runHandler(ctx.report, node.id, () => ctx.report({ type: "press", id: node.id }));
    return <Component {...base} onPress={onPress} disabled={false} error={undefined} mcpTool={undefined} />;
  }

  return <Component {...base} />;
});

/**
 * Tabs show their Tabs' labels, which arrive on the Tabs' own lines. This subscribes to those labels
 * only (a joined string, so unrelated changes don't re-render the Tabs).
 */
function TabLabels({ ids, children }: { ids: readonly string[]; children: (tabs: { id: string; label: string | undefined }[]) => ReactNode }) {
  const { store } = useOmni();
  const read = () => {
    const nodes = store.getSnapshot().nodes;
    return JSON.stringify(ids.map((id) => {
      const n = nodes.get(id);
      return n?.type === "Tab" ? n.props.label : null;
    }));
  };
  const joined = useSyncExternalStore(store.subscribe, read, read);
  const labels = useMemo(() => JSON.parse(joined) as (string | null)[], [joined]);
  return <>{children(ids.map((id, i) => ({ id, label: labels[i] ?? undefined })))}</>;
}

/**
 * Charts draw their Series or Slices, which arrive on their own lines. This subscribes to those
 * children's data only (a joined string, so unrelated changes don't re-render the chart).
 */
function ChildData<T>({ ids, read, children }: { ids: readonly string[]; read: (node: OmniNode) => T | undefined; children: (data: (T | undefined)[]) => ReactNode }) {
  const { store } = useOmni();
  const get = () => {
    const nodes = store.getSnapshot().nodes;
    return JSON.stringify(ids.map((id) => {
      const n = nodes.get(id);
      return n === undefined ? null : (read(n) ?? null);
    }));
  };
  const joined = useSyncExternalStore(store.subscribe, get, get);
  const data = useMemo(() => (JSON.parse(joined) as (T | null)[]).map((d) => d ?? undefined), [joined]);
  return <>{children(data)}</>;
}

function resolveProps(props: object, keys: readonly string[], values: readonly Primitive[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(props)) {
    if (typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "state") {
      out[name] = values[keys.indexOf((value as { key: string }).key)] ?? null;
    } else {
      out[name] = value;
    }
  }
  return out;
}
