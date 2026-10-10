// Field-check conformance cases (SPEC.md section 8, "Fields", [8.1]–[8.6]): what a renderer must say
// about a form field's value. Written by hand from the spec, never copied from an implementation's
// output. `npm run conformance:build` writes them to conformance/fields/fields.json, which the web,
// Swift and Kotlin renderers all check against.

export type FieldType = "Input" | "DateInput" | "Select" | "Switch";

/** A message key from the renderer's own words, and the values filled into it. */
export interface FieldProblem {
  message: "required" | "chooseOption" | "turnOn" | "invalidEmail" | "invalidNumber" | "invalidPhone" | "invalidUrl" | "tooShort" | "tooLong" | "dateTooEarly" | "dateTooLate";
  values?: Record<string, string | number>;
}

export interface FieldCase {
  id: string;
  /** SPEC.md rule ids this case checks. */
  rules: string[];
  description: string;
  component: FieldType;
  /** The field's props as the stream gave them, except `value` (a $state) and `label`. */
  props: Record<string, unknown>;
  /** The state's current value. */
  value: string | number | boolean | null;
  /** null: the field passes. */
  expect: FieldProblem | null;
}

const input = (id: string, rules: string[], description: string, props: Record<string, unknown>, value: FieldCase["value"], expect: FieldProblem | null): FieldCase => ({
  id,
  rules,
  description,
  component: "Input",
  props,
  value,
  expect,
});
const email = { format: "email" };

export const FIELD_CASES: FieldCase[] = [
  // [8.1]: no constraint, no check.
  input("input-no-constraints", ["8.1"], "An Input that declares no constraint passes whatever it holds.", {}, "", null),
  { id: "switch-no-constraints", rules: ["8.1"], description: "A Switch without required passes when off.", component: "Switch", props: {}, value: false, expect: null },

  // [8.2] required
  input("input-required-empty", ["8.2"], "A required Input that is empty fails.", { required: true }, "", { message: "required" }),
  input("input-required-spaces", ["8.2"], "White space alone counts as empty.", { required: true }, "   \t", { message: "required" }),
  input("input-required-filled", ["8.2"], "A required Input with text passes.", { required: true }, "Ada", null),
  input("input-required-not-text", ["8.2"], "A state that doesn't hold text counts as empty.", { required: true }, null, { message: "required" }),
  { id: "date-required-empty", rules: ["8.2"], description: "A required DateInput with no date fails.", component: "DateInput", props: { required: true }, value: "", expect: { message: "required" } },
  { id: "date-required-filled", rules: ["8.2"], description: "A required DateInput with a date passes.", component: "DateInput", props: { required: true }, value: "2026-10-14", expect: null },
  { id: "select-required-none", rules: ["8.2"], description: "A required Select with nothing chosen fails with chooseOption.", component: "Select", props: { options: ["S", "M"], required: true }, value: "", expect: { message: "chooseOption" } },
  { id: "select-required-not-an-option", rules: ["8.2"], description: "A value that isn't one of the options counts as nothing chosen.", component: "Select", props: { options: ["S", "M"], required: true }, value: "XL", expect: { message: "chooseOption" } },
  { id: "select-required-chosen", rules: ["8.2"], description: "A required Select with an option chosen passes.", component: "Select", props: { options: ["S", "M"], required: true }, value: "M", expect: null },
  { id: "switch-required-off", rules: ["8.2"], description: "A required Switch that is off fails with turnOn.", component: "Switch", props: { required: true }, value: false, expect: { message: "turnOn" } },
  { id: "switch-required-not-bool", rules: ["8.2"], description: "Only true counts as on.", component: "Switch", props: { required: true }, value: "true", expect: { message: "turnOn" } },
  { id: "switch-required-on", rules: ["8.2"], description: "A required Switch that is on passes.", component: "Switch", props: { required: true }, value: true, expect: null },

  // [8.3] format, minLength, maxLength
  input("optional-empty-skips-checks", ["8.3"], "An empty Input that isn't required passes every other check.", { format: "email", minLength: 5 }, "  ", null),
  input("email-valid", ["8.3"], "An email address with a dot after @ passes.", email, "ada@example.com", null),
  input("email-trimmed", ["8.3"], "Checks use the value without surrounding white space.", email, "  ada@example.co.uk ", null),
  input("email-no-at", ["8.3"], "No @ fails.", email, "ada.example.com", { message: "invalidEmail" }),
  input("email-no-dot", ["8.3"], "No dot after @ fails.", email, "ada@localhost", { message: "invalidEmail" }),
  input("email-space", ["8.3"], "A space inside fails.", email, "ada lovelace@example.com", { message: "invalidEmail" }),
  input("email-two-at", ["8.3"], "Two @ fail.", email, "ada@@example.com", { message: "invalidEmail" }),
  input("number-valid", ["8.3"], "Digits with a sign and a decimal part pass, with . or ,.", { format: "number" }, "-12.50", null),
  input("number-comma", ["8.3"], "A decimal comma passes.", { format: "number" }, "3,5", null),
  input("number-letters", ["8.3"], "Letters fail.", { format: "number" }, "12a", { message: "invalidNumber" }),
  input("number-grouping", ["8.3"], "Thousands separators fail: one decimal mark only.", { format: "number" }, "1,234.5", { message: "invalidNumber" }),
  input("phone-valid", ["8.3"], "Digits, spaces, brackets, dashes and a leading + pass.", { format: "phone" }, "+1 (415) 555-0123", null),
  input("phone-too-few-digits", ["8.3"], "Fewer than 7 digits fail.", { format: "phone" }, "555-012", { message: "invalidPhone" }),
  input("phone-too-many-digits", ["8.3"], "More than 15 digits fail.", { format: "phone" }, "+1234567890123456", { message: "invalidPhone" }),
  input("phone-plus-inside", ["8.3"], "A + anywhere but the start fails.", { format: "phone" }, "415+5550123", { message: "invalidPhone" }),
  input("phone-letters", ["8.3"], "Letters fail.", { format: "phone" }, "415 555 CALL", { message: "invalidPhone" }),
  input("url-valid", ["8.3"], "https:// with a host containing a dot passes, with a path.", { format: "url" }, "https://example.com/path?q=1", null),
  input("url-http", ["8.3"], "http:// passes too.", { format: "url" }, "http://shop.example.org", null),
  input("url-no-scheme", ["8.3"], "Without http:// or https:// fails.", { format: "url" }, "example.com", { message: "invalidUrl" }),
  input("url-other-scheme", ["8.3"], "Another scheme fails.", { format: "url" }, "javascript:alert(1)", { message: "invalidUrl" }),
  input("url-no-dot", ["8.3"], "A host without a dot fails.", { format: "url" }, "https://localhost", { message: "invalidUrl" }),
  input("url-space", ["8.3"], "A space fails.", { format: "url" }, "https://exa mple.com", { message: "invalidUrl" }),
  input("too-short", ["8.3"], "Fewer code points than minLength fails, with {min}.", { minLength: 3 }, "ab", { message: "tooShort", values: { min: 3 } }),
  input("too-long", ["8.3"], "More code points than maxLength fails, with {max}.", { maxLength: 5 }, "abcdef", { message: "tooLong", values: { max: 5 } }),
  input("length-exact", ["8.3"], "Exactly minLength and maxLength pass.", { minLength: 3, maxLength: 3 }, "abc", null),
  input("length-code-points", ["8.3"], "Lengths count code points: an emoji is one.", { maxLength: 3 }, "a😀b", null),
  input("length-trimmed", ["8.3"], "Lengths count the value without surrounding white space.", { maxLength: 3 }, "  abc  ", null),
  input("format-before-length", ["8.3"], "Checks stop at the first failure, format before length.", { format: "email", minLength: 50 }, "ada", { message: "invalidEmail" }),
  input("min-before-max", ["8.3"], "minLength is checked before maxLength.", { minLength: 4, maxLength: 10 }, "ab", { message: "tooShort", values: { min: 4 } }),
  input("required-before-format", ["8.2", "8.3"], "required comes first.", { required: true, format: "email" }, "", { message: "required" }),

  // [8.4] DateInput min and max
  { id: "date-too-early", rules: ["8.4"], description: "A date before min fails, with {min}.", component: "DateInput", props: { min: "2026-10-14" }, value: "2026-10-13", expect: { message: "dateTooEarly", values: { min: "2026-10-14" } } },
  { id: "date-too-late", rules: ["8.4"], description: "A date after max fails, with {max}.", component: "DateInput", props: { max: "2026-10-31" }, value: "2026-11-01", expect: { message: "dateTooLate", values: { max: "2026-10-31" } } },
  { id: "date-on-bounds", rules: ["8.4"], description: "min and max themselves pass.", component: "DateInput", props: { min: "2026-10-14", max: "2026-10-14" }, value: "2026-10-14", expect: null },
  { id: "date-empty-not-required", rules: ["8.4"], description: "An empty DateInput that isn't required passes, whatever min says.", component: "DateInput", props: { min: "2026-10-14" }, value: "", expect: null },
];

export function renderFieldFiles(): Record<string, string> {
  return {
    "fields.json": `${JSON.stringify({ area: "fields", description: "What a renderer says about a form field's value (SPEC.md section 8, Fields). Generated by npm run conformance:build from conformance/fields.ts.", cases: FIELD_CASES }, null, 2)}\n`,
  };
}
