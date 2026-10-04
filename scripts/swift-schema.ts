// Generates the Swift catalog (swift/Sources/OmniIRCore/Schema.generated.swift) from
// conformance/schema.json, the language-neutral export of packages/core/src/schema.ts. The Swift
// parser validates props by interpreting these specs, so it can never drift from the TypeScript
// schema: a test fails if this file is stale.
//
//   npm run swift:schema               write the file
//   npm run swift:schema -- --check    exit 1 if it is out of date (used by the tests)
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SWIFT_SCHEMA_PATH = "swift/Sources/OmniIRCore/Schema.generated.swift";

interface Def {
  type?: string;
  enum?: unknown[];
  const?: unknown;
  anyOf?: Def[];
  properties?: Record<string, Def>;
  required?: string[];
  items?: Def;
  propertyNames?: Def;
  additionalProperties?: Def | boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
}
interface Shape {
  positional: string[];
  props: Def;
}
interface SchemaJson {
  version: string;
  rootId: string;
  limits: Record<string, number>;
  reservedWords: string[];
  components: Record<string, Shape>;
  mcpMutation: Shape;
  issueCodes: Record<string, { severity: string; stage: string; meaning: string }>;
}

const lit = (s: string) => JSON.stringify(s); // a JSON string is a valid Swift string literal for this data
const opt = (n: number | undefined) => (n === undefined ? "nil" : String(n));
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const lowerFirst = (s: string) => s[0]!.toLowerCase() + s.slice(1);
/** A component's enum case name; a Swift keyword (such as `switch`) is escaped where it is declared. */
const SWIFT_KEYWORDS = new Set(["switch", "case", "default", "if", "else", "for", "while", "return", "class", "struct", "enum"]);
const caseDecl = (t: string) => (SWIFT_KEYWORDS.has(lowerFirst(t)) ? `\`${lowerFirst(t)}\`` : lowerFirst(t));

/** One JSON Schema definition as a Swift `ValueSpec` expression. */
function valueSpec(d: Def): string {
  if (d.anyOf) return `.anyOf([${d.anyOf.map(valueSpec).join(", ")}])`;
  if (d.const !== undefined) {
    return typeof d.const === "number" ? `.numberConstant(${d.const})` : `.textConstant(${lit(String(d.const))})`;
  }
  if (d.enum) return `.oneOf([${(d.enum as string[]).map(lit).join(", ")}])`;
  if (d.type === "object" && d.properties?.kind?.const === "state") return ".state";
  if (d.type === "object" && d.properties?.kind?.const === "ref") return ".ref";
  if (d.type === "array" && d.items?.properties?.kind?.const === "ref") return `.refList(maxItems: ${opt(d.maxItems)})`;
  if (d.type === "array" && d.items) return `.list(item: ${valueSpec(d.items)}, minItems: ${opt(d.minItems)}, maxItems: ${opt(d.maxItems)})`;
  if (d.type === "object" && d.propertyNames && typeof d.additionalProperties === "object") {
    return `.record(key: ${valueSpec(d.propertyNames)}, value: ${valueSpec(d.additionalProperties)})`;
  }
  switch (d.type) {
    case "string":
      return `.text(minLength: ${opt(d.minLength)}, maxLength: ${opt(d.maxLength)}, pattern: ${d.pattern === undefined ? "nil" : lit(d.pattern)})`;
    case "number":
    case "integer":
      return `.number(minimum: ${opt(d.minimum)}, maximum: ${opt(d.maximum)}, integer: ${d.type === "integer"})`;
    case "boolean":
      return ".boolean";
    case "null":
      return ".null";
  }
  throw new Error(`swift-schema: unsupported schema ${JSON.stringify(d)}`);
}

function componentSpec(shape: Shape, indent: string): string {
  const required = new Set(shape.props.required ?? []);
  const props = Object.entries(shape.props.properties ?? {}).map(
    ([name, d]) => `${indent}    PropSpec(name: ${lit(name)}, required: ${required.has(name)}, value: ${valueSpec(d)}),`,
  );
  return [
    `ComponentSpec(`,
    `${indent}  positional: [${shape.positional.map(lit).join(", ")}],`,
    `${indent}  props: [`,
    ...props,
    `${indent}  ]`,
    `${indent})`,
  ].join("\n");
}

export function renderSwiftSchema(schemaPath = "conformance/schema.json"): string {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as SchemaJson;
  const types = Object.keys(schema.components);
  const codes = Object.entries(schema.issueCodes);
  const l = schema.limits;
  return `// Generated from conformance/schema.json by \`npm run swift:schema\`; do not edit.
// The single authority is packages/core/src/schema.ts (TypeScript), exported with \`npm run schema:export\`.

/// The Omni-IR version this catalog describes.
public let omniIRVersion = ${lit(schema.version)}

/// The components in the Trusted Catalog.
public enum ComponentType: String, Sendable, CaseIterable, Hashable {
${types.map((t) => `  case ${caseDecl(t)} = ${lit(t)}`).join("\n")}
}

/// Every error and warning a parser reports.
public enum IssueCode: String, Sendable, CaseIterable, Hashable {
${codes.map(([code]) => `  case ${camel(code)} = ${lit(code)}`).join("\n")}

  public var severity: IssueSeverity {
    switch self {
${codes.map(([code, info]) => `    case .${camel(code)}: .${info.severity}`).join("\n")}
    }
  }

  public var stage: IssueStage {
    switch self {
${codes.map(([code, info]) => `    case .${camel(code)}: .${info.stage}`).join("\n")}
    }
  }

  /// What the issue means, in one sentence.
  public var meaning: String {
    switch self {
${codes.map(([code, info]) => `    case .${camel(code)}: ${lit(info.meaning)}`).join("\n")}
    }
  }
}

/// Size limits of the protocol.
public enum Limits {
${Object.entries(l)
  .map(([k, v]) => `  public static let ${k} = ${v}`)
  .join("\n")}
}

enum Catalog {
  static let rootId = ${lit(schema.rootId)}
  static let reservedWords: Set<String> = [${schema.reservedWords.map(lit).join(", ")}]

  static let components: [ComponentType: ComponentSpec] = [
${types.map((t) => `    .${lowerFirst(t)}: ${componentSpec(schema.components[t]!, "    ")},`).join("\n")}
  ]

  static let mcpMutation = ${componentSpec(schema.mcpMutation, "  ")}
}
`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const text = renderSwiftSchema();
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(SWIFT_SCHEMA_PATH, "utf8");
    } catch {}
    if (current !== text) {
      console.error(`${SWIFT_SCHEMA_PATH} is out of date: run npm run swift:schema`);
      process.exit(1);
    }
    console.log(`${SWIFT_SCHEMA_PATH} is up to date.`);
  } else {
    writeFileSync(SWIFT_SCHEMA_PATH, text);
    console.log(`wrote ${SWIFT_SCHEMA_PATH}`);
  }
}
