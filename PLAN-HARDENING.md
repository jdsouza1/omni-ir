# Omni-IR — Step 13: proof and hardening

Goal: back up three claims with evidence before more people rely on them, all for free:

1. **"Works with any model."** So far only Claude has been checked.
2. **"A bad stream can't break the app."** The parsers are tested with hand-written cases, never with large amounts of random, broken input.
3. **"Fast enough for real screens."** Nobody has measured a large screen.

Status: **APPROVED 2026-10-05** with the recommendations; **extended the same day** at the owner's request with adversarial boundary tests (2b, B.5). The owner chose ask-chat.ai (a paid reseller, 7-day trial) for the first model check, with me driving Chrome; results from it are labelled as such, and published claims are confirmed on the official apps.

## Proposal

**1. Model check on other models.** The same nine requests as the first model check (docs/model-check-2026-10-01.md), plus the chart and Step 10 requests, sent with the generated system prompt to:

- **Gemini**, in gemini.google.com
- **ChatGPT**, in chatgpt.com
- **An open model**, for example Llama or Qwen in HuggingChat (huggingface.co/chat)

Every reply is checked by the real parser (`npm run validate`, or the model check page) and scored the same way as before: valid on the first try, the right components, governance respected (no invented tools, the risky delete request left unwired), and no styling smuggled in. The results go into a dated model-check document and the comparison, whatever they show. A model that does badly is a finding, not a failure: prompt rules can fix the common slips, as they did for Claude.

**2. Fuzz testing the parsers.**

- **No crashes, ever:** random and mutated streams (cut lines, stray quotes and brackets, huge numbers, deep lists, invalid UTF-8, mixed line endings, real fixtures with random edits) fed to the TypeScript parser in thousands of runs with [fast-check](https://github.com/dubzzz/fast-check) (free, MIT). It must never throw, and every issue must have a known code and a line.
- **Chunking never matters:** the same stream split at random points gives the same result ([3.3] in the spec, today tested at three chunk sizes).
- **All three parsers agree:** a fixed corpus of a few thousand generated streams is run through the TypeScript, Swift and Kotlin parsers, and their results must match exactly. This is a *differential* test, separate from the conformance suite: conformance cases are written from the spec, while the corpus only checks that the three implementations agree. Any disagreement is settled by the spec, and becomes a new conformance case.
- **Swift and Kotlin get their own no-crash runs** with a seeded generator, since a crash there takes down the app (no error boundaries in SwiftUI or Compose).
- CI runs a fixed seed on every push, and a longer random run once a week (free on a public repo), saving any failing stream as a test case.

**2b. Adversarial boundary tests** *(added 2026-10-05 at the owner's request, from a red-teaming proposal)*

Omni-IR's security doesn't depend on a model resisting jailbreaks: the spec treats everything a model writes as untrusted, possibly hostile. So the question these tests answer is not "can a model be tricked?" (often it can) but "when a tricked or malicious model sends the worst output it can, does the boundary still hold?" That is the same for every model, so one set of tests covers Gemini, ChatGPT, open models and any future model. All free and deterministic, in CI.

- **Tool-name spoofing:** look-alike tool names must never reach a handler. Homoglyphs (`pаyments.confirm` with a Cyrillic а), zero-width and invisible characters, full-width letters, case changes (`Payments.confirm`), typosquats (`payment.confirm`, `payments.confirm2`, `payments..confirm`), trailing spaces and dots. Checked at all three layers: the parser, the browser's mutation handler and the server's `/api/mutate`.
- **A hostile-output corpus:** streams a jailbroken or injected model might write, each with the expected outcome. Script and markup in every text prop, URLs and `javascript:` in picture names, `__proto__` and `constructor` in params and ids, a mutation that governs a different button than it claims, two mutations for one button, `$state` names that collide with built-ins, a million-component stream, instructions aimed at the user ("type your password below"). Run through the TypeScript, Swift and Kotlin parsers, with the expected result written from the spec.
- **Coordinated multi-input attacks:** several fields working together, the way real attacks do. For example, injected instructions in one Input's default text plus a governed button whose params send that field to a tool, or a forged `/api/mutate` request that combines a valid tool with params lifted from another tool. Checked end to end through the in-browser API and the Express server.
- **Model-written attacks, recorded:** the replies already collected from Gemini, GPT and Llama that tried unsafe things (Llama's `+` concatenation, `settings.update` with foreign params) become permanent test cases.

**Not in this step, by design** (added to the roadmap instead):
- **Automated LLM red teaming with Promptfoo** (OWASP LLM Top 10 plugins, attacker models generating jailbreaks and indirect injections against each target model). Promptfoo is free and open source, but it generates attacks and calls the target models through paid APIs, so it can't run in CI under the cost rule. Planned as an optional, capped manual run with the owner's go-ahead, after the boundary tests, to measure how often each model *tries* something unsafe.
- **Personal-data exposure audits.** Omni-IR keeps no user data today; this belongs with real tool handlers and persistence.
- **A human red team** for chained attacks (a series of harmless-looking actions that add up to a breach). Most valuable once real tool handlers with authorization exist, and it is an outside hire, so the owner decides when.

**3. Performance on large screens.**

- **Measure:** time to parse and to render screens of 50, 200, 1,000 and 5,000 components, line by line, on web, Swift and Kotlin.
- **Known risk:** each new line re-checks the whole document so far (`validateDocument` in the parser), so the total work grows with the square of the screen's size. Fine at UI sizes, untested beyond them.
- **Fix if the numbers call for it:** check each new line only against what it touches (its parent, its children, its state keys), with the whole-document check kept for the end of the stream. The conformance suite and the differential corpus prove the results don't change.
- **A limit on screen size:** the format has no maximum number of components, so a hostile or runaway stream could make a client do unbounded work. Add one (question 4).
- Performance tests run in CI with generous time budgets, so a large slowdown fails the build without making CI flaky.

## Facts that shape this

- **Accounts:** the model check needs you to be signed in to each chat app; I can't create accounts or enter passwords. Free tiers are enough. As before, I can drive your Chrome to send the requests (with your permission for each run), or you paste them yourself from the model check page.
- **Cost: free.** No API calls: the chat apps' free tiers, fast-check (a free dev dependency), and CI on a public repo.
- **Spec changes:** a component limit is a format change, so it gets a SPEC.md rule, an issue code, conformance cases and all three parsers, in the next release (`v0.4.0`, only with your go-ahead). Everything else here changes no behaviour.
- **Tests first:** the fuzz properties and the performance budgets are written before any fix.

## Questions for you (with recommendations)

1. **Which models?**
   - *Recommended:* Gemini, ChatGPT, and one open model through HuggingChat (no download needed). Each in its default free model, named in the results.
   - Optional later: a small model run on your own PC (for example with Ollama), to see how far down the format still works.
2. **Who runs the model check?**
   - *Recommended:* I drive your Chrome as before, one run per app, after you've signed in to each one.
   - Or you paste the requests yourself from a model check page and paste the replies back.
3. **Fuzzing depth in CI:**
   - *Recommended:* about 1,000 runs per property on every push (well under a minute), and 100,000 in a weekly scheduled run.
4. **A limit on screen size:**
   - *Recommended:* at most 1,000 components and 1,000 state keys per stream, with a new issue code `document_too_large`; lines beyond the limit are rejected and the screen keeps what it has. Generous for any real screen; decided after the measurements, so the number can be adjusted.
5. **If the measurements show a problem:**
   - *Recommended:* fix it in this step (incremental checks), since it's the same code the fuzz tests cover.

## Task checklist

**A. Model check on other models** *(needs you signed in)*
- [x] A.1 A model check page with all the requests (the first nine, the Step 10 and Step 11 ones), the system prompt, and the real parser to check pasted replies
- [x] A.2 Gemini, ChatGPT and the open model, each in a fresh chat, replies saved
- [x] A.3 Results document and comparison updated; prompt rules added for any repeated slip, with the prompt test updated

**B. Fuzz testing** *(tests first)*
- [x] B.1 fast-check properties for the TypeScript parser: never throws, issues well-formed, chunking never matters, valid fixtures survive random splits
- [x] B.2 The differential corpus (`fuzz/`): generated streams with the TypeScript results; Swift and Kotlin tests that must match them
- [ ] B.3 Seeded no-crash runs in Swift and Kotlin
- [ ] B.4 A weekly workflow with a long random run, saving any failure as a case
- [ ] B.5 Adversarial boundary tests: tool-name spoofing at all three layers; a hostile-output corpus run through all three parsers; coordinated multi-input attacks end to end; the unsafe model replies from the model check kept as cases

**C. Performance** *(tests first)*
- [ ] C.1 Measurements at 50 to 5,000 components on all three platforms, written up
- [ ] C.2 Incremental checks if needed, with the corpus and conformance proving nothing changed
- [ ] C.3 Performance budgets in CI

**D. Screen size limit** *(only if you approve question 4)*
- [ ] D.1 Failing tests, then the limit in the schema, SPEC.md rule and issue code, conformance cases, and the Swift and Kotlin parsers

**E. Review and release** *(checkpoint: you review)*
- [ ] E.1 A review page: the model results, what fuzzing found and fixed, the performance numbers
- [ ] E.2 Merge; README and the site's claims updated with the evidence
- [ ] E.3 `v0.4.0` release if anything changed in the packages: a separate go-ahead from you

**Progress (2026-10-05):** A done via ask-chat.ai: [docs/model-check-2026-10-05-models.md](docs/model-check-2026-10-05-models.md). Run 1 (original prompt): Gemini 3.1 Pro 17/19, GPT-6.1 Sol 11/19, Llama 4 Maverick 14/19, every safety probe passed. Two prompt problems found and fixed (signatures now show named props, `Image(asset, alt=…, [ratio=…])`; the McpMutation is never a child). Run 2 (fixed prompt, earlier failures plus probes): 6/6, 12/12, 6/8. Still to do for A: a short confirmation on the providers' own apps before any claim goes on the website.

## What I need from you

Your answers to questions 1–5 (or "go with the recommendations"), and to be signed in to Gemini, ChatGPT and HuggingChat in Chrome before the model check.
