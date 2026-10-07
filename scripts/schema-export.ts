// Exports the protocol schema as language-neutral JSON (conformance/schema.json), so renderers in
// other languages (Swift, Kotlin) can generate their catalog from the same authority:
// packages/core/src/schema.ts. Props are JSON Schema (draft 2020-12), as Zod exports them.
//
//   npm run schema:export               write conformance/schema.json
//   npm run schema:export -- --check    exit 1 if it is out of date (used by the tests)
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  FORMAT_VERSION,
  COMPONENTS,
  COMPONENT_TYPES,
  CROSS_PROP_RULES,
  ISSUE_CODES,
  LIMITS,
  MCP_MUTATION,
  RESERVED_WORDS,
  ROOT_ID,
} from "@omni-ir/core";

export const SCHEMA_JSON_PATH = "conformance/schema.json";

const shape = (positional: readonly string[], props: z.ZodType) => ({
  positional: [...positional],
  props: z.toJSONSchema(props, { target: "draft-2020-12" }),
});

export function renderSchemaJson(): string {
  const { version } = JSON.parse(readFileSync("packages/core/package.json", "utf8")) as { version: string };
  const schema = {
    $comment:
      "Generated from packages/core/src/schema.ts by `npm run schema:export`; do not edit. " +
      "In props, a value written `$key` is {kind: \"state\", key: \"$key\"}, a bare identifier is {kind: \"ref\", id}, " +
      "and a children list is an array of refs. See conformance/README.md.",
    version,
    // The stream format's own version (PLAN-VERSIONING.md): changes only when the format does.
    formatVersion: FORMAT_VERSION,
    rootId: ROOT_ID,
    limits: LIMITS,
    reservedWords: [...RESERVED_WORDS],
    components: Object.fromEntries(COMPONENT_TYPES.map((type) => [type, shape(COMPONENTS[type].positional, COMPONENTS[type].props)])),
    mcpMutation: shape(MCP_MUTATION.positional, MCP_MUTATION.props),
    crossPropRules: CROSS_PROP_RULES,
    issueCodes: ISSUE_CODES,
  };
  return JSON.stringify(schema, null, 2) + "\n";
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const text = renderSchemaJson();
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(SCHEMA_JSON_PATH, "utf8");
    } catch {}
    if (current !== text) {
      console.error(`${SCHEMA_JSON_PATH} is out of date: run npm run schema:export`);
      process.exit(1);
    }
    console.log(`${SCHEMA_JSON_PATH} is up to date.`);
  } else {
    writeFileSync(SCHEMA_JSON_PATH, text);
    console.log(`wrote ${SCHEMA_JSON_PATH}`);
  }
}
