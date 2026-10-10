import { memo, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ComponentType as ReactComponentType, type ReactNode } from "react";
import { DEFAULT_CATALOG } from "../catalog/catalog.js";
import { fillTemplate, resolveStrings, type StringKey } from "../catalog/strings.js";
import { SkeletonLines } from "../catalog/components.js";
import type { AppViews, Catalog, Picture } from "../catalog/types.js";

const NO_ASSETS: Readonly<Record<string, Picture>> = {};
const NO_VIEWS: AppViews = {};
import { checkField, editedKey, isField, isMutating, ROOT_ID, stateKeysOf, type AppNode, type FieldType, type OmniNode, type Primitive, type ToolRegistry } from "@omni-ir/core";
import type { OmniDocument, OmniStore } from "@omni-ir/core";
import {
  createConfirmations,
  type Confirmation,
  createFieldVisibility,
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
  /**
   * Pictures the app looks up when a screen is drawn (Step 20), for names that match the parser's
   * picture patterns, such as `product-1042`. Return undefined when there is none.
   */
  resolvePicture?: (name: string) => Picture | undefined;
  /** The app's views for its own components (Step 20), by name. Pass the same components to the parser. */
  components?: AppViews;
  locale?: string;
  /**
   * Light (the default), dark, or the device's setting. The app chooses; the stream can't. Colours,
   * font and radius come from the design tokens (`--omni-*` CSS variables), which the app may set.
   */
  theme?: "light" | "dark" | "system";
  /**
   * The renderer's own words, replacing the English ones key by key (for example `{ loading: "Chargement" }`).
   * Shown as plain text; set by the app, never by the stream.
   */
  strings?: Partial<Record<StringKey, string>>;
  /**
   * Actions that need the person's confirmation, by tool, with the app's sentence for each (SPEC.md [9.1]).
   * `{name}` is filled with that param's value, as plain text, once: for example
   * `{ "payments.confirm": "Pay {amount} now?" }`. Or a function that writes the sentence from the
   * checked params, to format them: `(p) => \`Pay ${usd.format(p.amount)}?\``. Shown as plain text
   * either way. The stream can't skip, change or draw it.
   */
  confirm?: Readonly<Record<string, Confirmation>>;
}

const NO_CONFIRMATIONS: Readonly<Record<string, Confirmation>> = {};

export function OmniRenderer({
  store,
  tools,
  onMutation,
  onEvent,
  catalog = DEFAULT_CATALOG,
  assets = NO_ASSETS,
  locale = "en-US",
  theme = "light",
  strings,
  confirm = NO_CONFIRMATIONS,
  resolvePicture,
  components = NO_VIEWS,
}: OmniRendererProps) {
  const words = useMemo(() => resolveStrings(strings), [strings]);
  // One per screen: a new store is a new screen, with no messages shown yet.
  const fields = useMemo(() => createFieldVisibility(), [store]);
  const [confirmations] = useState(createConfirmations);
  const root = useRef<HTMLDivElement>(null);
  const value = useMemo<OmniContextValue>(
    () => ({
      store,
      tools,
      catalog,
      assets,
      picture: (name) => (name === undefined ? undefined : Object.hasOwn(assets, name) ? assets[name] : resolvePicture?.(name)),
      views: components,
      locale,
      strings: words,
      onMutation,
      report: (event) => onEvent?.(event),
      fields,
      confirm,
      askConfirmation: confirmations.ask,
      root,
    }),
    [store, tools, catalog, assets, resolvePicture, components, locale, words, onMutation, onEvent, fields, confirm, confirmations],
  );
  return (
    <OmniContext.Provider value={value}>
      <div className="omni-root" data-theme={theme} ref={root}>
        <VersionNotice />
        <NodeSlot id={ROOT_ID} />
        <ConfirmDialog confirmations={confirmations} />
      </div>
    </OmniContext.Provider>
  );
}

/**
 * The renderer's own confirmation ([9.1]): the app's sentence, Cancel and Confirm. Cancel has focus
 * first, Escape cancels, and focus returns to the button that asked.
 */
function ConfirmDialog({ confirmations }: { confirmations: ReturnType<typeof createConfirmations> }) {
  const { strings } = useOmni();
  const pending = useSyncExternalStore(confirmations.subscribe, confirmations.current, confirmations.current);
  const cancel = useRef<HTMLButtonElement>(null);
  const textId = useId();
  useEffect(() => {
    if (pending === null) return;
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancel.current?.focus();
    return () => returnTo?.focus();
  }, [pending]);
  if (pending === null) return null;
  return (
    <div className="omni-dialog-backdrop">
      <div
        className="omni-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-describedby={textId}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            pending.answer(false);
          }
        }}
      >
        <p id={textId} className="omni-dialog__text">
          {pending.text}
        </p>
        <div className="omni-dialog__actions">
          <button ref={cancel} type="button" className="omni-button omni-button--secondary" onClick={() => pending.answer(false)}>
            {strings.cancel}
          </button>
          <button type="button" className="omni-button omni-button--primary" onClick={() => pending.answer(true)}>
            {strings.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

/** When the stream was written for a newer version, say so above the screen (SPEC.md section 8). */
function VersionNotice() {
  const { store, strings } = useOmni();
  const getNewer = () => store.getSnapshot().newerVersion;
  const newer = useSyncExternalStore(store.subscribe, getNewer, getNewer);
  if (!newer) return null;
  return (
    <p className="omni-version-notice" role="status">
      {strings.newerVersion}
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
  const { store, strings } = useOmni();
  const getSlot = () => slotOf(store.getSnapshot(), id);
  const slot = useSyncExternalStore(store.subscribe, getSlot, getSlot);
  if (slot === "pending") return <SkeletonLines lines={1} pendingId={id} label={strings.loading} />;
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
  if (node.type === "App") return <AppComponentNode node={node} props={props} children={children} />;
  // One cast: the node's type picks its catalog entry, and the props match that type by construction.
  const Component = ctx.catalog[node.type] as ReactComponentType<Record<string, unknown>>;
  const base = { id: node.id, props, children, locale: ctx.locale, strings: ctx.strings };

  if (node.type === "Image" || node.type === "ListItem") {
    const name = node.type === "Image" ? node.props.asset : node.props.image;
    return <Component {...base} picture={ctx.picture(name)} />;
  }

  if (isField(node)) {
    return <FieldNode node={node} value={props.value as Primitive}>{(feedback) => {
      const key = node.props.value.key;
      if (node.type === "Switch") {
        const onChange = (value: boolean) => runHandler(ctx.report, node.id, () => ctx.store.setState(key, value));
        return <Component {...base} {...feedback} value={props.value === true} onChange={onChange} />;
      }
      const onChange = (value: string) => runHandler(ctx.report, node.id, () => ctx.store.setState(key, value));
      return <Component {...base} {...feedback} value={String(props.value ?? "")} onChange={onChange} />;
    }}</FieldNode>;
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
 * A field's checks ([8.1]–[8.5]): its problem, in the renderer's own words, once the person has left
 * the field or a press has read it. Subscribes to its own visibility only.
 */
/**
 * An app's own component (Step 20): drawn by the app's view, or the renderer's fallback where the app
 * gave none. A component that edits a `$state` changes it through the renderer, and a field gets the
 * same messages as the catalog's fields.
 */
function AppComponentNode({ node, props, children }: { node: AppNode; props: Record<string, unknown>; children: ReactNode }) {
  const ctx = useOmni();
  const View = Object.hasOwn(ctx.views, node.name) ? ctx.views[node.name] : undefined;
  if (View === undefined) return <NodeFallback id={node.id} reason="unsupported" />;
  const base = { id: node.id, name: node.name, props, children, locale: ctx.locale, strings: ctx.strings, picture: ctx.picture };
  const key = editedKey(node);
  if (key === undefined || node.holds === undefined) return <View {...base} />;
  const value = (props.value ?? null) as Primitive;
  const onChange = (next: Primitive) => runHandler(ctx.report, node.id, () => ctx.store.setState(key, next));
  if (!isField(node)) return <View {...base} field={{ value, onChange }} />;
  return <FieldNode node={node} value={value}>{(feedback) => <View {...base} field={{ value, onChange, ...feedback }} />}</FieldNode>;
}

function FieldNode({
  node,
  value,
  children,
}: {
  node: Extract<OmniNode, { type: FieldType }> | AppNode;
  value: Primitive;
  children: (feedback: { error: string | undefined; errorId: string; onBlur: () => void }) => ReactNode;
}) {
  const { fields, strings } = useOmni();
  const errorId = useId();
  const isShown = () => fields.isShown(node.id);
  const shown = useSyncExternalStore(fields.subscribe, isShown, isShown);
  const problem = checkField(node.type, node.props, value);
  const error = shown && problem !== null ? fillTemplate(strings[problem.message], problem.values ?? {}) : undefined;
  return <>{children({ error, errorId, onBlur: () => fields.show([node.id]) })}</>;
}

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
