# Omni-IR — model proficiency check (2FA-style)

Status: **DRAFT 2026-10-07**, for the owner's approval. Free by default: tests and demos use a scripted fake model; a real model is challenged only when `OMNI_MODEL=claude` is set, and its calls count against the daily cap. Nothing here changes the stream format.

## Goal

Before a model writes screens for real people, the server makes it prove, right then, that it writes good Omni-IR, the way two-factor sign-in makes a person prove who they are before they get in. A challenge drawn at random, checked by the real parser; a pass clears that exact setup (model, prompt, catalog and tools), a failure keeps it away from people until it's fixed. If the model's live replies start failing, it is challenged again.

It checks **proficiency, not safety.** The parser and catalog already refuse anything unsafe line by line, whatever the model is; this check catches a setup that would produce broken or poor screens (a swapped model, an edited prompt, a provider's silent update) before the people using the app see them.

## How it fits the roadmap

- **It builds on what exists:** the free model check page (`npm run model-check:page`, nine requests, checked in the browser), the cross-model check of Step 13, and the server's observer parser (`server/app.ts`), which already counts the errors in every reply. Today those are manual, one-off checks; this makes them automatic and continuous.
- **It comes before Step 17** (app-defined components). Once apps add their own components, a model has more to get right, and each app's setup is different, so a check per setup becomes more useful. The challenge pool is built from the schema and the tool registry, so app components can join it in Step 17.
- **It changes no format:** server behaviour and one new transport error code. The fingerprint test from `v0.8.0` stays green.

## Who benefits

- **Developers** learn at start-up, with a report, that a model or prompt change broke their screens, instead of from their users. Switching models becomes a checked step instead of a guess.
- **The people using their apps** don't get a run of broken or half-empty screens after someone changes the model behind the app.
- **Organisations** get a recorded answer to "how do we know the model is fit to write our screens?": which setup passed, when, and with what score, in the audit trail.

## What it doesn't do

- It doesn't make any single screen safer: that is the parser's and catalog's job, and they stay the guarantee.
- A pass doesn't promise every future screen is good: it's a sample, renewed when the setup changes, when it expires, or when live replies start failing.
- It stores no one's requests or screens: only the challenge's own requests, scores and the setup's fingerprint.

## Proposal

1. **A challenge pool:** about 40 requests, each with checks a machine can score. Most are build requests ("a booking form with check-in and check-out dates and a reserve button": needs a date `Input` and a governed action); some are probes (asks for CSS, for a component the catalog lacks, for an action no tool allows). Written by hand, checked against the schema and tool registry by a test, so a request can't ask for something that doesn't exist.
2. **A challenge:** six requests drawn at random (four build, two probes), sent to the model with the server's real system prompt, each reply scored by the real parser.
3. **A score:** safety rules must pass on all six (no parse errors, only catalog components, every backend action inside `McpMutation` with a registered tool, no invented tools, no markup or code); quality rules on at least five of six (the components and actions the request needs are there).
4. **A setup fingerprint:** model id, system prompt, catalog and tool registry, hashed. A pass is kept for that fingerprint for seven days; any change means a new challenge.
5. **What the server does:** with `OMNI_MODEL_CHECK=enforce`, `POST /api/generate` answers `503 model_unverified` (retryable, with `Retry-After`) until the setup passes; `warn` serves anyway and logs; `off` skips it. `GET /api/health` reports the state; every challenge goes into the audit trail.
6. **Live re-check:** the observer parser already counts errors in each reply. If more than 10% of the last 50 replies have errors, the setup is challenged again (at most once an hour); a failure makes it unverified.
7. **Also by hand:** `npm run model:challenge` runs a challenge and prints the report, for trying a model before deploying it.
8. **In the spec:** an optional section for servers ("Model checks", SHOULD rules: what a challenge scores, when to re-check, the `model_unverified` code), so other servers can do the same and clients handle the code.

## Decisions: pros, cons and trade-offs

**1. What a failure does: a setting, `enforce` by default for a real model** (recommended).
- *Pros:* true to the 2FA idea: an unproven setup doesn't reach people; `warn` exists for teams that want to watch first; the mock model is never challenged (it replays fixtures).
- *Cons:* with `enforce`, a failed or slow challenge means no screens until it's fixed; starting a server with a real model now spends six generations.
- *Alternatives:* `warn` by default (never blocks, but people see the broken screens the check found); `enforce` with no setting (simplest, but no way to watch first).
- *Trade-off:* a few seconds' wait and six generations at each setup change, against users seeing a broken setup.

**2. When to challenge: on each setup change, kept seven days** (recommended).
- *Pros:* cost follows changes, not traffic; seven days catches a provider's silent update; restarts with the same setup don't pay again.
- *Cons:* a model that degrades within the seven days is only caught by the live re-check.
- *Alternatives:* every start (simple, but pays on every deploy and restart); every person's session (closest to 2FA, but six extra generations per person: far too costly and slow); once ever (cheap, but blind to drift).
- *Trade-off:* the live re-check covers the gap between challenges for free.

**3. The pool: about 40 hand-written requests, six drawn at random** (recommended).
- *Pros:* a prompt can't be tuned to a fixed list; probes test the rules, not just the happy path; hand-written requests read like real ones.
- *Cons:* 40 requests to write and keep in step with the catalog (a test catches drift); a random draw makes two runs differ a little.
- *Alternatives:* the nine fixed requests of the model check page (no work, but easy to overfit and too few); requests generated from the schema (scales, but reads unlike real requests and tests less).
- *Trade-off:* a day of writing for a check that can't be gamed by tuning to the list.

**4. The pass rule: safety six of six, quality five of six** (recommended).
- *Pros:* a single invented tool or ungoverned action fails the setup outright; one weak screen out of six doesn't.
- *Cons:* "quality" here is only what a machine can check (the right components are there), not whether the screen is pleasant.
- *Alternatives:* six of six on everything (stricter, but flaky: models vary run to run); a percentage score (more nuance, harder to explain).
- *Trade-off:* strict where it matters, tolerant where models naturally vary.

**5. Live re-check from the observer's counts** (recommended).
- *Pros:* free: the numbers are already counted; catches drift between challenges; limited to once an hour, so a bad patch can't spend money in a loop.
- *Cons:* a run of odd requests from people could trigger a challenge the model then passes (six generations spent).
- *Alternative:* challenges on a timer only (predictable cost, slower to notice).
- *Trade-off:* at most one challenge an hour, against noticing a failing model within 50 replies.

**6. In the spec as an optional section** (recommended).
- *Pros:* other servers can offer the same guarantee; clients know `model_unverified` means "try again shortly", not "broken".
- *Cons:* one more section to maintain; the rules must stay general (no named models).
- *Alternative:* reference server only (less to write, but the guarantee is ours alone and clients would see an unknown code).
- *Trade-off:* a short section, so the idea is part of the standard rather than one implementation.

**7. Order: after `v0.8.0`, before Step 17** (recommended).
- *Pros:* small, and builds only on what exists; in place before app components make setups more varied.
- *Cons:* pushes Step 17, the most likely reason a trial ends ("the catalog isn't enough"), back by this step.
- *Alternative:* after Step 17 (app components first, then the check, with app components in the pool from the start).
- *Trade-off:* a few days' delay to Step 17 for a check that makes its larger setups safer to change.

## Cost

Tests, demos and CI use a scripted fake model with good and bad replies: no paid API, ever. With a real model, a challenge is six generations, the same as six people's requests, counted against `OMNI_DAILY_CAP`; at most one per setup change, expiry or hour of failing replies. Running `npm run model:challenge` against a real model needs the owner's go-ahead, like any paid run.

## Task checklist

Work on branch `wip/model-check`. Each part starts with failing tests (constraint 4).

**A. Pool and score** *(tests first)*
- [ ] A.1 The challenge pool (`app/challenges.ts`), with a test that each request names only components and tools that exist
- [ ] A.2 The scorer: safety and quality rules on the real parser, tested on good and bad replies from a scripted fake model

**B. The server** *(tests first)*
- [ ] B.1 The setup fingerprint and the kept result (memory or SQLite, like the other stores)
- [ ] B.2 `OMNI_MODEL_CHECK` (`enforce`, `warn`, `off`), `503 model_unverified` with `Retry-After`, the state in `/api/health`, challenges in the audit trail
- [ ] B.3 The live re-check from the observer's counts, at most once an hour
- [ ] B.4 The web, iOS and Android clients treat `model_unverified` as retryable; a transport case

**C. By hand, spec and docs**
- [ ] C.1 `npm run model:challenge` (fake model by default; a real one only with `OMNI_MODEL=claude`)
- [ ] C.2 SPEC.md: the optional "Model checks" section and the error code; a guide page; CHANGELOG
- [ ] C.3 The decision log: this step's entry and decisions

**D. Review and release** *(checkpoint: you review)*
- [ ] D.1 A short review page: a challenge report from the fake model, passing and failing
- [ ] D.2 Merge with your approval
- [ ] D.3 Release: a separate go-ahead from you

## What I need from you

Approval of the plan, or changes to any of the seven decisions.
