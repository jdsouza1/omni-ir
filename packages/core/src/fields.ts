// Form field checks (SPEC.md section 8, Fields, [8.1]–[8.6]): what a renderer says about a field's
// current value. Every renderer implements the same rules; conformance/fields holds the shared cases.
// The checks only read the props the stream declared and the person's value: there is no logic in
// the stream, and the server still checks every action's params against the tool's own schema.
import type { OmniDocument } from "./store.js";
import type { MutationStatement, OmniNode, Primitive } from "./schema.js";

/** The renderer's own words for a field problem (keys of its strings, SPEC.md section 8). */
export const FIELD_MESSAGES = [
  "required",
  "chooseOption",
  "turnOn",
  "invalidEmail",
  "invalidNumber",
  "invalidPhone",
  "invalidUrl",
  "tooShort",
  "tooLong",
  "dateTooEarly",
  "dateTooLate",
] as const;
export type FieldMessage = (typeof FIELD_MESSAGES)[number];

export interface FieldProblem {
  message: FieldMessage;
  /** Filled into the message's placeholders, such as {min} and {max}. */
  values?: Record<string, string | number>;
}

export const FIELD_TYPES = ["Input", "DateInput", "Select", "Switch"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

const FORMATS = {
  // Text, @, then a host with at least one dot; no spaces and one @ only.
  email: { pattern: /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/, message: "invalidEmail" },
  // An optional sign, digits, and an optional decimal part with "." or ",".
  number: { pattern: /^[+-]?\d+([.,]\d+)?$/, message: "invalidNumber" },
  // Digits, spaces, brackets, dashes and dots, with an optional leading +; 7 to 15 digits (below).
  phone: { pattern: /^\+?[0-9 ().-]+$/, message: "invalidPhone" },
  // http:// or https://, then a host with a dot, and an optional path; no spaces.
  url: { pattern: /^https?:\/\/[^\s/?#.]+(\.[^\s/?#.]+)+([/?#]\S*)?$/i, message: "invalidUrl" },
} as const satisfies Record<string, { pattern: RegExp; message: FieldMessage }>;

/** Length in Unicode code points, as people count characters. */
const codePoints = (text: string) => [...text].length;

/**
 * The first problem with a field's value, or null when it passes ([8.2]–[8.4]). `props` are the
 * field's props as the stream declared them; `value` is its state's current value.
 */
export function checkField(type: FieldType, props: Readonly<Record<string, unknown>>, value: Primitive | undefined): FieldProblem | null {
  const required = props.required === true;
  switch (type) {
    case "Switch":
      return required && value !== true ? { message: "turnOn" } : null;
    case "Select": {
      const options = Array.isArray(props.options) ? props.options : [];
      return required && !(typeof value === "string" && options.includes(value)) ? { message: "chooseOption" } : null;
    }
    case "DateInput": {
      const date = typeof value === "string" ? value.trim() : "";
      if (date === "") return required ? { message: "required" } : null;
      if (typeof props.min === "string" && date < props.min) return { message: "dateTooEarly", values: { min: props.min } };
      if (typeof props.max === "string" && date > props.max) return { message: "dateTooLate", values: { max: props.max } };
      return null;
    }
    case "Input": {
      const text = typeof value === "string" ? value.trim() : "";
      if (text === "") return required ? { message: "required" } : null;
      const format = typeof props.format === "string" && Object.hasOwn(FORMATS, props.format) ? FORMATS[props.format as keyof typeof FORMATS] : null;
      if (format && !format.pattern.test(text)) return { message: format.message };
      if (props.format === "phone") {
        const digits = text.replace(/\D/g, "").length;
        if (digits < 7 || digits > 15) return { message: "invalidPhone" };
      }
      const length = codePoints(text);
      if (typeof props.minLength === "number" && length < props.minLength) return { message: "tooShort", values: { min: props.minLength } };
      if (typeof props.maxLength === "number" && length > props.maxLength) return { message: "tooLong", values: { max: props.maxLength } };
      return null;
    }
  }
}

/** True for the components that edit a value the checks apply to. */
export function isField(node: OmniNode): node is Extract<OmniNode, { type: FieldType }> {
  return (FIELD_TYPES as readonly string[]).includes(node.type);
}

/** The `$key` a field edits. */
export function fieldKey(node: Extract<OmniNode, { type: FieldType }>): string {
  return node.props.value.key;
}

/**
 * The fields a governed Button's press checks ([8.6]): those whose `$key` its McpMutation's params
 * read, in the order their lines arrived.
 */
export function fieldsReadBy(mutation: MutationStatement, document: Pick<OmniDocument, "nodes">): string[] {
  const keys = new Set<string>();
  for (const value of Object.values(mutation.params)) {
    if (typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "state") keys.add((value as { key: string }).key);
  }
  const ids: string[] = [];
  for (const node of document.nodes.values()) if (isField(node) && keys.has(fieldKey(node))) ids.push(node.id);
  return ids;
}
