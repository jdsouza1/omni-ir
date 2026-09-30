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

export interface IssueInfo {
  severity: "error" | "warning";
  /**
   * When the issue is found: "line" as the line arrives (an error rejects that line), "end" when the
   * stream ends, "renderer" while the screen is in use.
   */
  stage: "line" | "end" | "renderer";
  /** One plain sentence; SPEC.md's issue table is generated from these. */
  meaning: string;
}

/** Every issue code with its severity, stage and meaning. Adding a code without an entry fails to compile. */
export const ISSUE_CODES = {
  syntax: { severity: "error", stage: "line", meaning: "The line doesn't follow the grammar." },
  unterminated_string: { severity: "error", stage: "line", meaning: "A string has no closing double quote." },
  line_too_long: { severity: "error", stage: "line", meaning: "The line is longer than the line length limit." },
  not_flat: { severity: "error", stage: "line", meaning: "A component call appears inside another statement's arguments." },
  unknown_component: { severity: "error", stage: "line", meaning: "The component isn't in the catalog." },
  invalid_props: {
    severity: "error",
    stage: "line",
    meaning: "An argument or value breaks the component's rules: wrong type, unknown prop, value not allowed, too long or repeated.",
  },
  unknown_tool: { severity: "error", stage: "line", meaning: "An McpMutation names a tool that isn't in the app's tool registry." },
  duplicate_id: { severity: "error", stage: "line", meaning: "An id or $state key is assigned a second time. The first assignment stays." },
  duplicate_child: { severity: "error", stage: "line", meaning: "The same id appears twice in one children list." },
  multiple_parents: { severity: "error", stage: "line", meaning: "A component is listed as a child of a second component." },
  cycle: { severity: "error", stage: "line", meaning: "A component would contain itself through its children." },
  root_as_child: { severity: "error", stage: "line", meaning: "root is listed as a child." },
  child_not_component: { severity: "error", stage: "line", meaning: "A children list names an McpMutation." },
  input_state_type: { severity: "error", stage: "line", meaning: "An Input is bound to state that doesn't hold text." },
  duplicate_mutation: { severity: "error", stage: "line", meaning: "A button that already has an McpMutation gets a second one." },
  dangling_ref: { severity: "error", stage: "end", meaning: "A referenced component or McpMutation target never arrived." },
  missing_state: { severity: "error", stage: "end", meaning: "A $state key is used but never declared." },
  missing_root: { severity: "error", stage: "end", meaning: "No root line arrived." },
  ungoverned_mutation: { severity: "error", stage: "end", meaning: "A button with an action has no McpMutation." },
  mutation_target_not_interactive: {
    severity: "error",
    stage: "end",
    meaning: "An McpMutation targets a component that has no action.",
  },
  mutation_blocked: {
    severity: "error",
    stage: "renderer",
    meaning: "When pressed, the action's tool or params failed the registry's checks, so nothing was sent.",
  },
  node_crashed: { severity: "error", stage: "renderer", meaning: "A component failed while rendering. Only its own slot shows a fallback." },
  handler_failed: { severity: "error", stage: "renderer", meaning: "An action's handler failed or the server refused it." },
  unknown_escape: {
    severity: "warning",
    stage: "line",
    meaning: "A backslash sequence other than \\\", \\\\ or \\n was kept as literal text. The line is still accepted.",
  },
} as const satisfies Record<IssueCode, IssueInfo>;

export interface Issue {
  code: IssueCode;
  message: string;
  /** IR id the issue is about, when there is one. */
  id?: string;
  /** 1-based line number in the stream, filled in by the parser. */
  line?: number;
  path?: (string | number)[];
}
