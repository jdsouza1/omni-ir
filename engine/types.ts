// Grammar-level types: what the tokenizer produces before any schema validation.
// Nothing here is trusted. `engine/schema.ts` decides what is allowed.

export type RawValue =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" }
  | { kind: "ident"; name: string }
  | { kind: "state"; key: string }
  | { kind: "array"; items: RawValue[] }
  | { kind: "object"; entries: [string, RawValue][] }
  /** A component call used as a value. Always rejected by the schema (flat syntax). */
  | { kind: "call"; callee: string };

export type RawStatement =
  | { kind: "state"; key: string; value: RawValue }
  | { kind: "call"; id: string; callee: string; args: RawValue[]; named: [string, RawValue][] };

export type IssueCode =
  // line-level
  | "syntax"
  | "unterminated_string"
  | "line_too_long"
  | "not_flat"
  | "unknown_component"
  | "invalid_props"
  | "unknown_tool"
  // document-level
  | "duplicate_id"
  | "duplicate_child"
  | "multiple_parents"
  | "cycle"
  | "root_as_child"
  | "child_not_component"
  | "input_state_type"
  | "duplicate_mutation"
  | "dangling_ref"
  | "missing_state"
  | "missing_root"
  | "ungoverned_mutation"
  | "mutation_target_not_interactive"
  // runtime (renderer)
  | "mutation_blocked"
  | "node_crashed"
  | "handler_failed"
  // warnings
  | "unknown_escape";

export interface Issue {
  code: IssueCode;
  message: string;
  /** IR id the issue is about, when there is one. */
  id?: string;
  /** 1-based line number in the stream, filled in by the parser. */
  line?: number;
  path?: (string | number)[];
}
