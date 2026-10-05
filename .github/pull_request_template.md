## What and why

<!-- What this changes, and the issue or proposal it comes from. -->

## Checklist

- [ ] Tests written first, and `npm run typecheck` and `npm test` pass
- [ ] Generated files are current (`npm run spec`, `schema:export`, `conformance:build`, `swift:schema`, `kotlin:schema`) if the schema changed
- [ ] For a format change: SPEC.md rules updated, conformance cases added in `conformance/build.ts`, and all three parsers pass them
- [ ] No styling, markup or code from the model; data-changing actions governed by McpMutation
- [ ] Nothing calls a paid API by default
