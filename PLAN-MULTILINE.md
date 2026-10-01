# Omni-IR — Step 8: multi-line text box

Goal: let a screen ask for longer text, such as a support message or a bio, in a box that shows several lines. Found by the model check of 2026-10-01 (docs/model-check-2026-10-01.md): the support form's "What happened?" field and the settings screen's bio were single-line, so longer text was cut off.

Status: **DONE 2026-10-01** (owner reviewed web, iPhone and Android screenshots, then approved the merge; ships in `v0.2.0`). **APPROVED 2026-10-01** with the recommendations: a `lines` prop on Input (1–10), fixed height with scrolling, released in `v0.2.0` only with the owner's go-ahead.

## Proposal

A new optional prop on Input:

```
message = Input($message, label="What happened?", lines=4)
```

- `lines` is a whole number from 1 to 10, the number of lines the box shows. Without it, or with `lines=1`, the Input stays a single line, exactly as today.
- Longer text scrolls inside the box; the box doesn't grow. A fixed size keeps screens from jumping around while someone types.
- Nothing else changes: the Input still edits one text `$key` (`input_state_type` as before), never calls the backend by itself, and sends its text through McpMutation params. Tools still check the length (for example, `support.createTicket` allows up to 2,000 characters).

## Facts that shape this

- **Every renderer changes together.** The prop is added once in `packages/core/src/schema.ts`; `schema.json`, the generated Swift and Kotlin catalogs, SPEC.md's tables, the catalog conformance cases and the system prompt all follow from it with the existing generators. Then each renderer draws it: React (`<textarea>`), SwiftUI (a vertical `TextField`) and Compose (`OutlinedTextField` with several lines).
- **Older parsers reject the new prop.** The catalog is strict on purpose: an unknown prop is an `invalid_props` error. A screen using `lines` would show a fallback in an app still on `@omni-ir/core` 0.1.0. So a server should only ask a model for `lines` once its apps have the new version. The system prompt is generated from the server's own schema, so a server and its apps simply need to use the same version.
- **Cost: free.** Mock data and the existing tests and CI only.

## Questions for you (with recommendations)

1. **A `lines` prop on Input, or a new TextArea component?** *Recommended:* the prop. It's one optional value on a component models already use well, rather than a 16th component that does almost the same thing.
2. **Fixed height or growing?** *Recommended:* fixed (`lines` lines, then scrolling), as above.
3. **Release:** *recommended* it ships in `v0.2.0` together with the other changes, since 0.1.0 parsers reject it. Nothing is published without your go-ahead.

## Task checklist

**A. Protocol, tests first** *(checkpoint: failing tests)*
- [x] A.1 Failing tests: the schema accepts `lines` 1–10 and rejects 0, 11, 1.5 and text; an Input with `lines` still needs text state
- [x] A.2 Add `lines` to Input in `schema.ts`; regenerate `schema.json`, the catalog conformance cases, SPEC.md, and the Swift and Kotlin catalogs; the prompt snapshot shows the new prop

**B. Renderers**
- [x] B.1 React: `<textarea rows={lines}>` when `lines` > 1, styled like the field; typing updates the state (test)
- [x] B.2 SwiftUI: a vertical `TextField` showing `lines` lines
- [x] B.3 Compose: `OutlinedTextField` with `minLines`/`maxLines` set to `lines`
- [x] B.4 The Swift and Kotlin conformance suites pass with the regenerated catalogs

**C. Prompt, fixtures and docs**
- [x] C.1 A rule in the system prompt: *For longer text, such as a message or a bio, set `lines`*; the support fixture's message uses `lines=4` (and the profile bio `lines=3`)
- [x] C.2 SPEC.md versioning note: a new optional prop is rejected by older parsers, so servers and apps use the same version
- [x] C.3 README component list; CLAUDE.md if needed

**D. Check** *(checkpoint: you review)*
- [x] D.1 Full suite, the iOS and Android demo workflows (the support screen is already in both screenshot sets), and the playground
- [ ] D.2 Optional: re-run the support request (test 6) on the model check page to see the model use `lines`

## What I needed from you
Answered 2026-10-01: "go with the recommendations".
