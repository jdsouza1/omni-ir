# Omni-IR — Step 3: Specification (SPEC.md)

Goal: one document that someone could use to build a compatible parser or renderer (for example the planned iOS and Android renderers) without reading this repo's code. It is what the landing page's "Read the spec" button will point to. Costs nothing: it's writing plus local tests.

Status: **APPROVED 2026-09-30.** Decided: (1) MUST / SHOULD / MAY with short plain sentences; (2) conformance suite included; (3) transport section is informative.

## Principles
- **The code stays the authority, and the spec can't drift from it.** Parts that already exist as data (component props and allowed values, issue codes, size limits) are **generated from the schema** into SPEC.md. A test fails if SPEC.md is out of date, the same way the system prompt works today.
- **The spec only states what is implemented and tested.** No aspirations. Planned features go in a short "Not yet specified" section.
- **Plain, precise language.** Short sentences, one rule per bullet, and MUST / SHOULD / MAY for requirements (see Q1).
- **Every rule is checkable.** Each normative rule links to a conformance case (Task F) that any implementation can run.

## Proposed outline of SPEC.md
1. **Introduction:** what Omni-IR is, the trust model (the model is untrusted; the renderer is trusted), status "v0.1 draft".
2. **Terms:** stream, line, statement, component, state, reference, catalog, tool registry, renderer.
3. **The stream:** UTF-8, lines ending in `\n` or `\r\n`, 16 KB line limit, comments and blank lines, end of stream.
4. **Grammar:** a formal grammar (EBNF) for statements, arguments, values, strings and escapes (including lenient unknown escapes and the `C:\new` limitation), numbers, identifiers and reserved names.
5. **Meaning of a document:** ids and `root`, children and forward references, one parent per node, no cycles, state declarations, Input bindings, McpMutation and governance.
6. **Component catalog v0.1** *(generated)*: each component's positional arguments, props, types, allowed values and required fields.
7. **Validation and errors:** line-level versus end-of-stream checks, skip-and-continue, which line each issue is reported on, and the issue codes *(generated table)*.
8. **Renderer requirements:** runtime rules R1–R7 restated as requirements. Placeholders while pending, fallbacks when missing, stable identity, crash isolation, text always rendered as text, styling owned by the renderer, disabled until governed.
9. **Actions:** the tool registry, param resolution from state, the three checks (parser, client, server), and the authorization requirement for real backends.
10. **Transport (informative):** the reference server's SSE events (`chunk`, `done`, `error`) and `/api/mutate`. Omni-IR itself is the text format, not the transport.
11. **Security considerations:** what the design prevents, and what it leaves to the app (authorization, rate limits, prompt injection in text content).
12. **Versioning and limits** *(generated limits)*: v0.1 rules for compatible changes.
13. **Appendix: examples:** taken from `fixtures/` and validated.

## Task checklist

### Task A: Generator and freshness test
- [x] A.1 `scripts/spec.ts` fills generated sections of SPEC.md between `<!-- generated:name -->` markers: component tables, issue codes (with their severity and level), and limits (line length, text length, identifier length, children per node)
- [x] A.2 `npm run spec` writes it; `npm run spec -- --check` exits non-zero if SPEC.md is stale
- [x] A.3 Test: SPEC.md is up to date, every component and every issue code appears, and hand-written text outside the markers is left untouched
- **Checkpoint:** changing a component's allowed values in the schema makes the test fail until `npm run spec` is run

### Task B: Stream, grammar and document meaning (sections 1–5)
- [x] B.1 Sections 1–3 (introduction, terms, stream)
- [x] B.2 Section 4: the grammar in EBNF, checked line by line against `engine/tokenizer.ts`, with examples of valid and invalid lines
- [x] B.3 Section 5: document rules, each with the issue code a violation produces
- **Checkpoint:** every rule in sections 3–5 names its conformance case or existing test

### Task C: Validation and errors (section 7)
- [x] C.1 Prose for line-level versus end-of-stream checks, and which line each issue is reported on
- [x] C.2 Generated issue-code table with a one-line meaning for each code (descriptions kept next to the codes in `engine/types.ts`, so they're generated too)
- **Checkpoint:** a test fails if an issue code has no description

### Task D: Renderer, actions, security (sections 8, 9, 11)
- [x] D.1 Renderer requirements from R1–R7
- [x] D.2 Actions: registry, params, the three checks, and the authorization requirement
- [x] D.3 Security considerations
- **Checkpoint:** each requirement links to the test that proves the reference renderer meets it

### Task E: Transport, versioning, examples (sections 10, 12, 13)
- [x] E.1 SSE event format and `/api/mutate`, marked informative
- [x] E.2 Versioning rules and generated limits
- [x] E.3 Examples appendix, generated from fixtures (payment, sign-in, a failure case with its expected issues)
- **Checkpoint:** every example in SPEC.md is validated by the test in A.3

### Task F: Conformance suite (see Q2)
- [ ] F.1 `conformance/cases/*.json`: about 40 language-neutral cases, each with an input stream and the expected result (accepted nodes, state, issues with codes and lines). Covers the stream, grammar, document rules and end-of-stream checks.
- [ ] F.2 A runner test showing this repo's TypeScript implementation passes every case
- [ ] F.3 `conformance/README.md`: how another implementation (Swift, Kotlin) uses the cases
- **Checkpoint:** all cases pass; each normative rule in sections 3–7 references at least one case

### Task G: Wire-up
- [ ] G.1 README links to SPEC.md; CLAUDE.md lists `npm run spec` and the conformance suite
- [ ] G.2 Mark the spec "v0.1 draft" and record decisions in this plan
- **Checkpoint:** `npm test`, typecheck and `npm run spec -- --check` all pass

## Not in this step
- New components, and changing any protocol behaviour. The spec describes what exists. If writing it reveals a rule that should change, I'll list it for your decision rather than change it.
- Hosting the spec as a web page. Once the repo is on GitHub, "Read the spec" can link to SPEC.md there.

## Open questions
1. **Tone:** formal requirement words (MUST / SHOULD / MAY, as in internet standards) with short plain sentences? *(Recommended: yes. Other implementers need to know exactly what's required.)*
2. **Conformance suite (Task F):** include it now? *(Recommended: yes. It's the most useful piece for the iOS and Android renderers, and it turns the spec's rules into something testable.)*
3. **Transport:** keep the SSE and `/api/mutate` section informative rather than required? *(Recommended: informative. Other apps may use WebSockets or anything else; the Omni-IR text is what must be compatible.)*

## Review findings (B–E, 2026-09-30)
Checked every rule in sections 3–10 against the code and by running the parser:
- Fixed in the spec: McpMutation `tool` is named-only (was listed as positional); finite numbers only ([4.9]); invalid UTF-8 becomes U+FFFD ([3.1]); spaces allowed at line start/end ([4.2]).
- Fixed in the code (test-first): the line-length limit now excludes the `\r` of `\r\n`, as the spec says.
- Fixed a flaky test: the mock model's realistic-speed test timed out under full-suite load.
- **Open decision:** `root = McpMutation(…)` produces no error (listed under "Known gaps" in SPEC.md). Option: report a new `root_not_component` error at end of stream.
