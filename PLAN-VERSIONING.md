# Omni-IR — format versioning (for `v0.8.0`)

Status: **APPROVED 2026-10-07** with the recommendations (all six decisions). Free: no paid API. Released as `v0.8.0` only with a separate go-ahead. From the retrospective in the decision log (lesson 1); the owner chose to release `v0.7.0` first and fix this in `v0.8.0`.

## Goal

Apps and servers on different package versions keep working together whenever the stream format is the same. The format's version changes only when the grammar, the catalog or the document rules change; package releases for anything else (a new server feature, themes, a client fix) no longer cause a false "update the app" notice or a refused request.

## How it fits the roadmap

- **It corrects Step 14.** The version marker (`# omni-ir 0.7`) and the server's version check use the package version. Since the format last changed in `0.5`, every release since then has made older apps show "this screen needs an update" and be refused by newer servers, with nothing actually incompatible.
- **It comes first,** before Step 17 (app-defined components), which will change the format. The new rule needs to be in place before that change, so it's the first format bump done the right way.
- **It's small:** one constant and its rules on three platforms, plus tests. No change to what models write.

## Who benefits

- **Developers** can update their server and their apps separately, in any order, as long as the format is the same. Today they must update both together, every release.
- **The people using their apps** stop seeing "This screen was made for a newer version of the app" when nothing is wrong, and stop getting a refused screen after a server update.
- **Organisations** with several apps and teams on different release schedules can upgrade one piece at a time.

## Where versions are used today

| Where | Uses |
|---|---|
| The stream's first line (`# omni-ir 0.7`), written by the server | the package version |
| A parser's `newer_version` check (TypeScript, Swift, Kotlin) | its own package version |
| A client's request (`?version=0.7`) and the server's check | the package version, which must match exactly |
| AG-UI snapshots (`content.version`) | the package version |
| `conformance/schema.json` `version`, and Swift and Kotlin `OMNI_IR_VERSION` | the package version |

Apps already shipped: `0.5`, `0.6` and `0.7` read the marker and send a version; earlier apps ignore both.

## Proposal

1. **A format version of its own: `0.5`**, the last version whose release changed the format. A new constant, `FORMAT_VERSION`, in `@omni-ir/core`, exported to `conformance/schema.json` as `formatVersion` and generated into Swift and Kotlin. Package versions carry on as before (`0.8.0` next).
2. **The marker, the `newer_version` check, requests, the server's check and AG-UI all use the format version.**
3. **Old numbers are understood.** Releases `0.6` and `0.7` didn't change the format, so a parser treats a marker of `0.6` or `0.7` as format `0.5`, and a server treats a request for `0.6` or `0.7` the same way.
4. **A server serves any client that can read its format.** It refuses a request only when it writes a newer format than the client asked for. This relies on a rule written into the spec: within `0.x`, a new format version only adds (new components, props, issue codes), so a newer parser reads older streams.
5. **The next format change goes straight to `0.8`,** above every number a shipped app has used, so `0.5`–`0.7` apps correctly show the update notice when the format really does change.
6. **A test catches a forgotten bump.** It fingerprints the parts of `conformance/schema.json` that define the format (components, props, limits, issue codes, reserved words). If they change and `FORMAT_VERSION` doesn't, the test fails with a message saying to bump it.
7. **Clients retry once without a version** when a server answers `unsupported_version`. That happens with `0.6` and `0.7` servers, which compare versions exactly; the retry gets the stream, and the parser's marker check decides whether to show the notice.

## How each shipped version behaves after `v0.8.0`

| | 0.8 server | 0.6 or 0.7 server | 0.5 server |
|---|---|---|---|
| **0.8 app** | works | refused, then works on the retry | works |
| **0.6 or 0.7 app** | works, no notice (today: refused) | as today | as today |
| **0.5 app** | works, no notice | as today | works |

## Decisions: pros, cons and trade-offs

**1. Which number the format carries now: `0.5`** (recommended).
- *Pros:* every shipped app (`0.5`–`0.7`) reads a `0.5` marker as current: no false notice anywhere, from the first `0.8.0` server; it's honest about when the format last changed.
- *Cons:* the format and package numbers differ (format `0.5`, packages `0.8.0`), which needs explaining once in the docs.
- *Alternatives:* `0.8` (matches the next release, but `0.7` apps would show the notice for a format they can read); `1.0` (a fresh start, but every shipped app would show the notice, and 1.0 should mean stable).
- *Trade-off:* compatibility with what's shipped matters more than matching numbers.

**2. Understand the old numbers `0.6` and `0.7` as format `0.5`** (recommended).
- *Pros:* `0.8` apps work with `0.6` and `0.7` servers' markers without a false notice.
- *Cons:* a small table of history in three parsers and the server, kept forever.
- *Alternative:* no table (simpler, but a `0.8` app reading a `0.7` server's marker would show the notice).
- *Trade-off:* two entries of history, tested, buy compatibility in both directions.

**3. Additive changes only within `0.x`, so servers serve any client that can read their format** (recommended).
- *Pros:* updating a server never breaks older apps unless the format really changed; one rule ("serve if my format ≤ yours").
- *Cons:* commits us not to remove or change the meaning of a component, prop or rule before `1.0` without bumping in a way older apps can't read (they'd show the notice).
- *Alternative:* keep "any minor may be incompatible" and exact matching (keeps freedom to break, but keeps today's problem).
- *Trade-off:* the catalog has only grown so far; stability is worth more to adopters than the freedom to break.

**4. A fingerprint test for forgotten bumps** (recommended).
- *Pros:* a format change can't ship under the old number by accident.
- *Cons:* changes the test can't see (the grammar in the tokenizer) still rely on review; one more test to update on purpose.
- *Alternative:* rely on review alone (the mistake this plan exists to avoid).
- *Trade-off:* catches the common case (catalog and rules) automatically.

**5. Clients retry once without a version on `unsupported_version`** (recommended).
- *Pros:* `0.8` apps work with `0.6` and `0.7` servers; for a genuinely newer server, the person sees "update the app" instead of an error.
- *Cons:* one extra request against those servers; a server's refusal becomes advice rather than final.
- *Alternative:* no retry, and documentation saying to update servers first.
- *Trade-off:* the marker check already protects the person, so the refusal doesn't need to be final.

**6. The spec names both:** "Stream format 0.5 · specification edition 0.8" (recommended).
- *Pros:* the transport and renderer rules (sections 8–10) can improve with each release without touching the format number.
- *Cons:* two numbers on one document.
- *Alternative:* one number for the whole spec (simpler to say, but every rendering or transport change would look like a format change).
- *Trade-off:* the two kinds of change really do move at different speeds.

## Task checklist

Work on branch `wip/versioning`. Each part starts with failing tests (constraint 4).

**A. The format version** *(tests first)*
- [x] A.1 `FORMAT_VERSION = "0.5"` and the old-number table in `@omni-ir/core`; `formatVersion` in `conformance/schema.json`; generated into Swift and Kotlin
- [x] A.2 The fingerprint test

**B. Using it** *(tests first)*
- [x] B.1 The marker, the `newer_version` check (old numbers understood) and AG-UI on all three platforms; conformance cases for markers `0.6` and `0.7`
- [x] B.2 Requests and the server's check ("serve if my format ≤ yours"); the in-browser API too
- [x] B.3 One retry without a version on `unsupported_version`, on all three clients; transport cases

**C. Spec and docs**
- [x] C.1 SPEC.md: the two numbers, rule [3.9], section 10's version rules, section 12 (additive changes within `0.x`, the next format version is `0.8`); the transport guide; CHANGELOG with the table above
- [x] C.2 The decision log: this step's entry and decisions

**D. Review and release** *(checkpoint: you review)*
- [x] D.1 A short review page: the compatibility table, checked against real `0.6` and `0.7` behaviour in tests
- [ ] D.2 Merge with your approval
- [ ] D.3 `v0.8.0` release: a separate go-ahead from you
