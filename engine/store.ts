// Reactive document store for useSyncExternalStore. (Stub: implemented after the tests.)
import type { MutationStatement, OmniNode, Primitive, Statement } from "./schema";

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
  apply(statement: Statement): ApplyResult;
  finish(): void;
  setState(key: string, value: Primitive): void;
}

export function createStore(): OmniStore {
  throw new Error("not implemented");
}
