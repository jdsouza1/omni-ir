// Generates the Kotlin catalog (android/omni-ir-core/.../Schema.generated.kt) from
// conformance/schema.json, the language-neutral export of packages/core/src/schema.ts. The Kotlin
// parser validates props by interpreting these specs, so it can never drift from the TypeScript
// schema: a test fails if this file is stale.
//
//   npm run kotlin:schema               write the file
//   npm run kotlin:schema -- --check    exit 1 if it is out of date (used by the tests)
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const KOTLIN_SCHEMA_PATH = "android/omni-ir-core/src/main/kotlin/dev/omniir/core/Schema.generated.kt";

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
  formatVersion: string;
  rootId: string;
  limits: Record<string, number>;
  reservedWords: string[];
  components: Record<string, Shape>;
  mcpMutation: Shape;
  issueCodes: Record<string, { severity: string; stage: string; meaning: string }>;
}

/** A Kotlin string literal: JSON's escaping, plus `$`, which starts a template in Kotlin. */
const lit = (s: string) => JSON.stringify(s).replace(/\$/g, "\\$");
const int = (n: number | undefined) => (n === undefined ? "null" : String(n));
const double = (n: number | undefined) => (n === undefined ? "null" : Number.isInteger(n) ? `${n}.0` : String(n));
const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();

/** One JSON Schema definition as a Kotlin `ValueSpec` expression. */
function valueSpec(d: Def): string {
  if (d.anyOf) return `ValueSpec.AnyOf(listOf(${d.anyOf.map(valueSpec).join(", ")}))`;
  if (d.const !== undefined) {
    return typeof d.const === "number" ? `ValueSpec.NumberConstant(${double(d.const)})` : `ValueSpec.TextConstant(${lit(String(d.const))})`;
  }
  if (d.enum) return `ValueSpec.OneOf(listOf(${(d.enum as string[]).map(lit).join(", ")}))`;
  if (d.type === "object" && d.properties?.kind?.const === "state") return "ValueSpec.State";
  if (d.type === "object" && d.properties?.kind?.const === "ref") return "ValueSpec.Ref";
  if (d.type === "array" && d.items?.properties?.kind?.const === "ref") return `ValueSpec.RefList(maxItems = ${int(d.maxItems)})`;
  if (d.type === "array" && d.items) return `ValueSpec.ListOf(item = ${valueSpec(d.items)}, minItems = ${int(d.minItems)}, maxItems = ${int(d.maxItems)})`;
  if (d.type === "object" && d.propertyNames && typeof d.additionalProperties === "object") {
    return `ValueSpec.Record(key = ${valueSpec(d.propertyNames)}, value = ${valueSpec(d.additionalProperties)})`;
  }
  switch (d.type) {
    case "string":
      return `ValueSpec.TextValue(minLength = ${int(d.minLength)}, maxLength = ${int(d.maxLength)}, pattern = ${d.pattern === undefined ? "null" : lit(d.pattern)})`;
    case "number":
    case "integer":
      return `ValueSpec.NumberValue(minimum = ${double(d.minimum)}, maximum = ${double(d.maximum)}, integer = ${d.type === "integer"})`;
    case "boolean":
      return "ValueSpec.BooleanValue";
    case "null":
      return "ValueSpec.NullValue";
  }
  throw new Error(`kotlin-schema: unsupported schema ${JSON.stringify(d)}`);
}

function componentSpec(shape: Shape, indent: string): string {
  const required = new Set(shape.props.required ?? []);
  const props = Object.entries(shape.props.properties ?? {}).map(
    ([name, d]) => `${indent}    PropSpec(${lit(name)}, required = ${required.has(name)}, value = ${valueSpec(d)}),`,
  );
  return [
    `ComponentSpec(`,
    `${indent}  positional = listOf(${shape.positional.map(lit).join(", ")}),`,
    `${indent}  props = listOf(`,
    ...props,
    `${indent}  ),`,
    `${indent})`,
  ].join("\n");
}

export function renderKotlinSchema(schemaPath = "conformance/schema.json"): string {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as SchemaJson;
  const types = Object.keys(schema.components);
  const codes = Object.entries(schema.issueCodes);
  return `// Generated from conformance/schema.json by \`npm run kotlin:schema\`; do not edit.
// The single authority is packages/core/src/schema.ts (TypeScript), exported with \`npm run schema:export\`.
package dev.omniir.core

/** The package release this catalog was exported from. */
public const val OMNI_IR_VERSION: String = ${lit(schema.version)}

/** The stream format's version: what the version marker, requests and version checks carry. */
public const val FORMAT_VERSION: String = ${lit(schema.formatVersion)}

/** The components in the Trusted Catalog, and APP for the app's own (Step 20). */
public enum class ComponentType(public val wireName: String) {
${types.map((t) => `  ${snake(t)}(${lit(t)}),`).join("\n")}

  /** One of the app's own components (Step 20): its name is the node's appName. A stream never writes "App". */
  APP("App"),
  ;

  public companion object {
    /** The catalog component a stream names, or null if it isn't in the catalog. */
    public fun fromWireName(name: String): ComponentType? = entries.firstOrNull { it.wireName == name && it != APP }
  }
}

/** Every error and warning a parser reports. */
public enum class IssueCode(
  public val wireName: String,
  public val severity: IssueSeverity,
  public val stage: IssueStage,
  /** What the issue means, in one sentence. */
  public val meaning: String,
) {
${codes.map(([code, info]) => `  ${code.toUpperCase()}(${lit(code)}, IssueSeverity.${info.severity.toUpperCase()}, IssueStage.${info.stage.toUpperCase()}, ${lit(info.meaning)}),`).join("\n")}
}

/** Size limits of the protocol. */
public object Limits {
${Object.entries(schema.limits)
  .map(([k, v]) => `  public const val ${snake(k)}: Int = ${v}`)
  .join("\n")}
}

internal object Catalog {
  const val ROOT_ID: String = ${lit(schema.rootId)}
  val reservedWords: Set<String> = setOf(${schema.reservedWords.map(lit).join(", ")})

  val components: Map<ComponentType, ComponentSpec> = mapOf(
${types.map((t) => `    ComponentType.${snake(t)} to ${componentSpec(schema.components[t]!, "    ")},`).join("\n")}
  )

  val mcpMutation: ComponentSpec = ${componentSpec(schema.mcpMutation, "  ")}
}
`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const text = renderKotlinSchema();
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(KOTLIN_SCHEMA_PATH, "utf8");
    } catch {}
    if (current !== text) {
      console.error(`${KOTLIN_SCHEMA_PATH} is out of date: run npm run kotlin:schema`);
      process.exit(1);
    }
    console.log(`${KOTLIN_SCHEMA_PATH} is up to date.`);
  } else {
    writeFileSync(KOTLIN_SCHEMA_PATH, text);
    console.log(`wrote ${KOTLIN_SCHEMA_PATH}`);
  }
}
