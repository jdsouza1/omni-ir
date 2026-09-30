import { memo, useMemo, useSyncExternalStore, type ComponentType as ReactComponentType, type ReactNode } from "react";
import { DEFAULT_CATALOG } from "../catalog/catalog";
import { SkeletonLines } from "../catalog/components";
import type { Catalog } from "../catalog/types";
import { isMutating, ROOT_ID, stateKeysOf, type OmniNode, type Primitive, type ToolRegistry } from "../engine/schema";
import type { OmniDocument, OmniStore } from "../engine/store";
import {
  OmniContext,
  runHandler,
  useOmni,
  useStateValues,
  type MutationCall,
  type OmniContextValue,
  type RendererEvent,
} from "./context";
import { McpMutationBoundary } from "./McpMutationBoundary";
import { NodeErrorBoundary } from "./NodeErrorBoundary";
import { NodeFallback } from "./NodeFallback";

export interface OmniRendererProps {
  store: OmniStore;
  tools: ToolRegistry;
  onMutation: (call: MutationCall) => void | Promise<void>;
  onEvent?: (event: RendererEvent) => void;
  /** Host-supplied catalog (trusted code). Defaults to the built-in Trusted Catalog. */
  catalog?: Catalog;
  locale?: string;
}

export function OmniRenderer({ store, tools, onMutation, onEvent, catalog = DEFAULT_CATALOG, locale = "en-US" }: OmniRendererProps) {
  const value = useMemo<OmniContextValue>(
    () => ({ store, tools, catalog, locale, onMutation, report: (event) => onEvent?.(event) }),
    [store, tools, catalog, locale, onMutation, onEvent],
  );
  return (
    <OmniContext.Provider value={value}>
      <div className="omni-root">
        <NodeSlot id={ROOT_ID} />
      </div>
    </OmniContext.Provider>
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
  const slot = useSyncExternalStore(store.subscribe, () => slotOf(store.getSnapshot(), id));
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

  if (node.type === "Input") {
    const key = node.props.value.key;
    const onChange = (value: string) => runHandler(ctx.report, node.id, () => ctx.store.setState(key, value));
    return <Component {...base} value={String(props.value ?? "")} onChange={onChange} />;
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
