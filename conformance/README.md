# Omni-IR conformance suite

Language-neutral test cases for any Omni-IR parser, such as a Swift or Kotlin implementation. Each case is a stream and its expected result, written by hand from [SPEC.md](../SPEC.md). An implementation conforms to sections 3–7 of the spec when it passes every case.

- `cases/stream.json`, `cases/grammar.json`, `cases/document.json`: the cases, written by hand. **Read these.**
- `cases/catalog.json`: one case per component, generated from `schema.json`, checking every prop's accepted and rejected values.
- `schema.json`: the catalog as language-neutral data (components, positional arguments, props as JSON Schema, limits, reserved words, rules across props, issue codes), exported from the TypeScript schema with `npm run schema:export`. Generate your implementation's catalog from it.
- `build.ts`: the source the JSON files are generated from (`npm run conformance:build`). Edit cases here, not in the JSON.
- This repo's TypeScript parser runs the suite in `tests/conformance.test.ts`.

## Case format

```json
{
  "id": "duplicate-ids",
  "rules": ["5.3"],
  "description": "A second assignment is rejected and the first stays.",
  "input": "root = Text(\"first\")\nroot = Text(\"second\")\n$x = 1\n$x = 2\n",
  "expect": {
    "issues": [{ "line": 2, "code": "duplicate_id" }, { "line": 4, "code": "duplicate_id" }],
    "nodes": { "root": { "type": "Text", "props": { "text": "first" }, "children": [] } },
    "state": { "$x": 1 }
  }
}
```

- **`input`**: the stream, as a string or as a list of parts joined in order. A part `{"repeat": "x", "times": 17000}` stands for that text repeated, so long lines don't bloat the files.
- **`tools`**: the names in the tool registry. When absent, the registry is `["payments.confirm"]`. Param schemas don't matter: the parser checks only that a tool exists ([5.14]).
- **`assets`**: the picture names in the asset registry. When absent, the registry is empty. Only the names matter to the parser ([5.17]).
- **`rules`**: the SPEC.md rules the case checks.

## Running a case

1. Create a parser with the case's tool registry and asset registry.
2. Feed it `input`, then end the stream.
3. Collect every **error and warning** as `{line, code}`, where `line` is `null` for issues without a line (such as `missing_root`), and drop duplicate pairs: an implementation may report one problem with several messages (for example, a value that breaks two constraints). Messages aren't compared.
4. Build the result in the canonical form below and compare:
   - `issues` is **always** compared, as a set of distinct `{line, code}` pairs.
   - `nodes`, `state`, `mutations` and `missing` are compared **only when the case includes them**, and then exactly.
5. Run every case again with the input fed as UTF-8 bytes in chunks of 1, 5 and 13 bytes. The result MUST be identical each time ([3.3]).

## Canonical result

| Field | Content |
|---|---|
| `nodes` | Every accepted component by id: `{ "type", "props", "children" }`. `props` excludes children; a `$key` reference is written `{ "state": "$key" }`; literals are plain JSON values. |
| `state` | Declared state at end of stream, by `$key` (the stream's values; there's no user input in a test). |
| `mutations` | Accepted McpMutations, keyed by the id of the Button they govern: `{ "id", "tool", "params" }`, with `$key` references written as above. |
| `missing` | References (component ids and `$keys`) still pending at end of stream, sorted. McpMutation targets aren't included; a missing target is reported as `dangling_ref`. |

## Not covered here

Renderer behaviour (section 8) and actions (section 9) depend on the platform's UI toolkit, so they're tested by each renderer's own tests. In this repo, see the test files listed in those sections of SPEC.md.
