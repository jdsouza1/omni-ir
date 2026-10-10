// Reactive document store, shaped for React's useSyncExternalStore.
// Every change produces a new snapshot object, but node objects are shared between snapshots:
// only the node a new line defines is a new object (R3), so memoized components can skip the rest.
// The maps and sets inside a snapshot are shared too, and grow in place as lines arrive: copying
// them on every line made a long stream quadratic (PLAN-HARDENING.md C.2). Read a snapshot through
// selectors, as the renderers do; copy a map if you need it frozen.
import { stateKeysOf, type MutationStatement, type OmniNode, type Primitive, type Statement } from "./schema.js";

export interface OmniDocument {
  /** Components by id. Only the object for a newly arrived node is ever replaced (R3). */
  readonly nodes: ReadonlyMap<string, OmniNode>;
  /** McpMutations by the id of the node they govern. */
  readonly mutations: ReadonlyMap<string, MutationStatement>;
  /** Current state values: declared by the stream, then edited by Inputs. */
  readonly state: Readonly<Record<string, Primitive>>;
  /** Node ids and $state keys that are referenced but have not arrived yet. */
  readonly pending: ReadonlySet<string>;
  /** After end of stream: references that never arrived. */
  readonly missing: ReadonlySet<string>;
  readonly complete: boolean;
  /** Line 1 was a version marker for a newer Omni-IR version than this one ([3.9]). */
  readonly newerVersion: boolean;
  /**
   * The last update applied after the stream ended ([10.29]): how many have been applied, and the ids
   * and $keys it assigned. Renderers use it to announce changed Notices ([8.8]).
   */
  readonly lastUpdate?: { readonly count: number; readonly assigned: readonly string[] };
}

/** An update the parser has checked (SPEC.md [10.33]), applied to the store in one step. */
export interface StoreUpdate {
  /** Components, McpMutations and state the update assigned and the screen kept. */
  assigned: readonly Statement[];
  /** Ids of components and McpMutations it took off the screen, with the targets of those McpMutations. */
  removed: readonly { id: string; target?: string }[];
  /** References nothing defines after the update. */
  missing: readonly string[];
}

export interface ApplyResult {
  /** References that became pending because of this statement. */
  pending: string[];
  /** Pending references this statement resolved. */
  resolved: string[];
}

export interface OmniStore {
  getSnapshot(): OmniDocument;
  subscribe(listener: () => void): () => void;
  /** Record that the stream needs a newer version ([3.9]). Called by the parser only. */
  markNewerVersion?(): void;
  /** Add an already-validated statement. Called by the parser only. */
  apply(statement: Statement): ApplyResult;
  /** End of stream: every still-pending reference becomes missing. */
  finish(): void;
  /** Local state edit from an Input (R1). The key must already be declared by the stream. */
  setState(key: string, value: Primitive): void;
  /** Apply a checked update ([10.29]). Called by the parser only. */
  applyUpdate?(update: StoreUpdate): void;
}

const EMPTY: OmniDocument = {
  nodes: new Map(),
  mutations: new Map(),
  state: {},
  pending: new Set(),
  missing: new Set(),
  complete: false,
  newerVersion: false,
};

export function createStore(): OmniStore {
  let doc = EMPTY;
  // Owned by this store and shared by its snapshots (see the note at the top).
  const nodes = new Map<string, OmniNode>();
  const mutations = new Map<string, MutationStatement>();
  const pending = new Set<string>();
  let state: Record<string, Primitive> = {};
  const listeners = new Set<() => void>();

  function commit(next: OmniDocument) {
    doc = next;
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot: () => doc,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    apply(statement) {
      const result: ApplyResult = { pending: [], resolved: [] };

      const define = (id: string) => {
        if (pending.delete(id)) result.resolved.push(id);
      };

      if (statement.kind === "state") {
        state[statement.key] = statement.value;
        define(statement.key);
      } else if (statement.kind === "node") {
        nodes.set(statement.id, statement);
        define(statement.id);
      } else {
        mutations.set(statement.target, statement);
      }

      if (statement.kind !== "state") {
        const refs = [...(statement.kind === "node" ? statement.children : []), ...stateKeysOf(statement)];
        for (const ref of refs) {
          const known = ref.startsWith("$") ? Object.hasOwn(state, ref) : nodes.has(ref);
          if (!known && !pending.has(ref)) {
            pending.add(ref);
            result.pending.push(ref);
          }
        }
      }

      commit({ ...doc, nodes, mutations, state, pending });
      return result;
    },

    markNewerVersion() {
      if (!doc.newerVersion) commit({ ...doc, newerVersion: true });
    },

    finish() {
      if (doc.complete) return;
      commit({ ...doc, pending: new Set(), missing: new Set(doc.pending), complete: true });
    },

    applyUpdate(update) {
      for (const { id, target } of update.removed) {
        nodes.delete(id);
        if (target !== undefined && mutations.get(target)?.id === id) mutations.delete(target);
      }
      let changedState = false;
      const assigned: string[] = [];
      for (const s of update.assigned) {
        if (s.kind === "state") {
          assigned.push(s.key);
          if (!changedState) {
            state = { ...state };
            changedState = true;
          }
          state[s.key] = s.value;
        } else if (s.kind === "node") {
          assigned.push(s.id);
          nodes.set(s.id, s);
        } else {
          assigned.push(s.id);
          // A replaced McpMutation may govern another Button now.
          for (const [target, m] of mutations) if (m.id === s.id) mutations.delete(target);
          mutations.set(s.target, s);
        }
      }
      const count = (doc.lastUpdate?.count ?? 0) + 1;
      commit({ ...doc, nodes, mutations, state, missing: new Set(update.missing), lastUpdate: { count, assigned } });
    },

    setState(key, value) {
      if (!Object.hasOwn(doc.state, key)) throw new Error(`OmniStore: state ${key} is not declared`);
      if (Object.is(doc.state[key], value)) return;
      // An edit gets a new state object, so a component holding the old one sees the change.
      state = { ...state, [key]: value };
      commit({ ...doc, state });
    },
  };
}
