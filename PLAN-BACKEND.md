# Omni-IR — Step 15: real backend handlers

Goal: SPEC.md section 9 says a backend that performs real actions MUST check that the signed-in person is **allowed** to perform each one, but the reference server has no signed-in person at all: `/api/mutate` checks that a request is well-formed, then runs a stub that returns made-up results. Anyone copying the reference server copies that gap. This step gives the reference server identity, authorization, persistence and the safety rules real actions need, and proves with tests that one person can never act on, or see, another person's data.

This is the open standard's **reference implementation**: a small, readable example of doing it right, free to run, with no real money, email or third-party accounts. The hosted service, if there is one, belongs in the private repository (open-core rule).

Status: **APPROVED 2026-10-06** with the recommendations (all eight decisions). All work is free: mock model, built-in or in-memory storage, a fake payment ledger and a development mail outbox. Nothing published without a separate go-ahead.

Numbering: this becomes Step 15, so the roadmap's later steps move up by one (themes and languages 16, app-defined components 17, live screens 18).

## What exists today

- `app/tools.ts`: eight tools with Zod schemas for their params. `server/tools/handlers.ts`: one stub per tool, marked `stub: true`, with a TODO for authorization.
- `/api/mutate` checks the tool and the params, then runs the stub. It doesn't know who is asking. Rate limits are per IP address (per proxy-reported address since Step 14).
- The renderer and the three clients post `{tool, params}` and show the result or the refusal. Nothing identifies the person, and nothing stops a double-click from running an action twice.
- The hosted playground runs the same stubs in the browser.

## Proposal

**1. A handler is a schema, a policy and a function.** Each tool gets a definition in one place:

```ts
"orders.requestReturn": defineTool({
  params: z.strictObject({ orderId: z.string().regex(/^[A-Z0-9-]{4,32}$/) }),
  access: "signed-in",                       // or "public" (sign-in link only), nothing else
  async run({ orderId }, { user, store }) {
    const order = await store.orders.get(orderId);
    if (!order || order.ownerId !== user.id) throw notFound();   // same answer for "not yours" and "doesn't exist"
    …
  },
});
```

- **Deny by default:** a tool without an `access` rule doesn't load, and a test checks every tool has one. `public` is allowed only for actions that work without an account (sending a sign-in link).
- **Ownership is checked in the handler**, against the stored data, never against anything in the params or the stream: a model can write any order id.
- **The same answer for "not yours" and "doesn't exist"** (404 `not_found`), so nobody can probe which ids belong to other people.
- The browser's tool registry keeps only the params schemas (it never needs the policies), so nothing about the server's rules is sent to the browser.

**2. Who is asking: a pluggable `authenticate` hook, with a reference sign-in.**

- `createApp({ authenticate })`: a function from the request to a user or nobody. Apps plug in their own (their existing session, an identity provider, a token check).
- **Reference sign-in, for the demo and tests:** `auth.sendMagicLink` (already a tool) emails a one-time link; following it starts a session. No passwords anywhere (the catalog has no password input, by design). The link is single-use, expires in 15 minutes, and is stored only as a hash.
- **Email in development** goes to an outbox the server prints to its log, never to a real mail service. Apps plug in their own sender.

**3. Sessions: an `HttpOnly` cookie for browsers, a bearer token for native apps.**

- Browsers get a `Secure`, `HttpOnly`, `SameSite=Lax` session cookie, which page scripts can't read.
- iOS and Android apps get a token after sign-in and send `Authorization: Bearer …`; `OmniClient` gains a token setting.
- Sessions are stored server-side (only a hash of the token), expire, and can be revoked (sign out ends the session everywhere it's stored).
- **Cross-site requests:** `/api/mutate` already accepts only JSON, which a plain form on another site can't send, and CORS allows only the app's origin. With cookies in play it also checks the `Origin` header itself.

**4. Persistence: a small `Store` interface, with an in-memory store and one on Node's built-in SQLite.**

- `node:sqlite` comes with Node 22.13+ and 24 (both CI versions), so no dependency and no server to run. In-memory for tests and the hosted playground.
- Tables for what the eight demo tools touch: users, sessions, sign-in links, orders (seeded for the demo users), returns, tickets, bookings (no two bookings of the cabin overlap), profiles, settings, and a fake payment ledger.
- Apps with their own database implement the same interface (the docs show the shape).

**5. No action runs twice: idempotency keys.** A double-click, or a retry after a dropped connection, must not pay twice.

- The clients send an `Idempotency-Key` header (a random id per press). The server keeps each key's answer for 24 hours, per user, and returns the same answer for a repeat instead of running the action again. A key reused with different params is refused (`409 idempotency_conflict`).
- SPEC.md [10.14] gains this as an optional header that a server performing real actions SHOULD honour. Backward compatible: servers that ignore it behave as today.

**6. Personal data stays with its owner.** The checks the roadmap listed for this step:

- A handler never returns another person's data, and results contain only what the screen needs (no internal ids, no other users' names).
- Nothing leaks between sessions: two signed-in test users, and every tool is attacked across them (other people's orders, bookings, tickets, profiles; replayed sessions; reused idempotency keys).
- Logs and the audit trail record who did what, when, and the outcome, never param values (email addresses, notes, messages).
- **Nothing personal goes to the model by default.** Screens still show what the model wrote; filling a screen with the person's real data (their actual orders) needs live data, which is Step 18. This step doesn't add personal data to prompts.

**7. Limits and audit.** Rate limits count per signed-in user as well as per address. Every action leaves an audit record (user, tool, time, outcome, idempotency key), readable in tests and the log.

**8. Clients and docs.** `createMutationHandler`, and the Swift and Kotlin `OmniClient`s, send credentials and an idempotency key, and report `401 sign_in_required` and `404 not_found` as clear refusals. A "Running real actions" guide; SPEC.md section 9 and [10.14] updated.

**Not in this step, by design:**
- Real payment, email or identity providers (accounts, money, and they're the app's choice). The adapters are interfaces with free development versions.
- A real `assistant.ask` (it would call a model, which costs money): it stays a stub, clearly labelled.
- Roles and teams (admins, shared accounts). The policy shape leaves room for them.
- **Optional automated red teaming with Promptfoo** (paid model APIs) and **a human red team** (an outside hire): both stay on the roadmap, each only with your go-ahead.

## Decisions: pros, cons and trade-offs

**1. Authorization lives next to each handler, deny by default** (recommended).
- *Pros:* the rule is where the action is, so it can't be forgotten; a tool with no rule doesn't load; ownership is checked against stored data, never against what the model wrote.
- *Cons:* each tool repeats similar "is this yours?" code; a policy spread across handlers is harder to audit at a glance.
- *Alternatives:* one central policy file (easier to read in one place, but easy to drift from the handlers it guards); docs only, leaving authorization to each app (no code to maintain, but the reference keeps teaching the gap). *Trade-off:* the test that every tool has a rule gives most of a central file's auditability without the drift.

**2. Identity: a pluggable `authenticate` hook plus a reference magic-link sign-in** (recommended).
- *Pros:* apps keep their own sign-in; the demo and tests have a complete, free, password-free flow; the hook is a few lines to implement.
- *Cons:* we maintain a small piece of security-sensitive code (link tokens, expiry, single use), and someone may deploy the reference sign-in as is.
- *Alternatives:* the hook only (less to maintain, but the demo can't show a signed-in flow end to end); an auth library such as Auth.js (well reviewed, but a large dependency tied to particular frameworks). *Trade-off:* the reference sign-in is labelled as an example, kept small, and fully tested: hashed single-use tokens, 15-minute expiry, the same answer whether or not an address has an account.

**3. Sessions: `HttpOnly` cookies for browsers, bearer tokens for native apps** (recommended).
- *Pros:* scripts on the page, including anything injected, can't read a browser session; native apps use the normal mobile pattern; sessions can be revoked because they're stored server-side.
- *Cons:* two ways in to test; cookies bring cross-site request risks (handled by JSON-only requests, CORS, `SameSite` and an `Origin` check); a server-side session store is one more table.
- *Alternatives:* bearer tokens everywhere (one mechanism, but a browser has to keep the token where page scripts can read it); signed stateless tokens such as JWTs (no session table, but they can't be revoked before they expire). *Trade-off:* revocation and script-proof browser sessions are worth the second mechanism.

**4. Storage: a `Store` interface with in-memory and built-in SQLite versions** (recommended).
- *Pros:* no dependency and no database server; data survives restarts; tests are fast and isolated; apps swap in their own database.
- *Cons:* SQLite is one machine, so not for several server instances; `node:sqlite` is newer than the long-established drivers (on Node 22 it may print an experimental warning).
- *Alternatives:* PostgreSQL (what most production apps use, but a service to run and a dependency); in-memory only (simplest, but nothing survives a restart, so it can't show persistence). *Trade-off:* the interface keeps the choice open; the reference shows the rules, not the database.

**5. Idempotency keys, optional in the spec** (recommended).
- *Pros:* a double-click or a retried request can't pay or book twice, which matters most for exactly the actions this step makes real; the industry-standard header; backward compatible.
- *Cons:* the server stores each key's answer for 24 hours; one more header for the three clients; a spec change.
- *Alternatives:* the renderer disables a button while its action runs (it already does, but that doesn't cover retries after a dropped connection); the server guesses duplicates from identical params (fragile: two genuine identical payments look the same). *Trade-off:* the storage is small and bounded, and payments are where duplicates hurt most.

**6. "Not yours" and "doesn't exist" give the same answer, 404** (recommended).
- *Pros:* nobody can find out which order ids, bookings or tickets exist by trying them.
- *Cons:* a person who mistypes an id gets the same message as someone probing; support has a little less to go on (the audit trail still records the truth).
- *Alternative:* 403 for "not yours" (clearer, but confirms the id exists). *Trade-off:* the same rule `auth.sendMagicLink` already follows for email addresses.

**7. The hosted playground uses the in-memory store with a pretend signed-in visitor** (recommended).
- *Pros:* visitors see real behaviour (a return can only be requested once, a booking can't overlap) instead of stubs; still nothing leaves their browser.
- *Cons:* the in-browser API grows; "signed in" there is pretend, which must be obvious.
- *Alternative:* keep the stubs in the hosted playground (no change, but it no longer shows how the reference behaves). *Trade-off:* the pretend visitor is labelled in the playground's Actions panel.

**8. Email and payments: interfaces with free development versions** (recommended).
- *Pros:* nothing costs money or needs accounts; tests are deterministic; apps plug in their own providers.
- *Cons:* the demo never sends a real email or moves real money, so those integrations are untested here.
- *Alternative:* real providers in test mode, such as Stripe test keys and a mail API (closer to production, but accounts and keys, and some mail APIs charge). *Trade-off:* those integrations are each app's own choice; the interfaces are what the reference can define well.

## Task checklist

Work on branch `wip/backend`. Each part starts with failing tests (constraint 4).

**A. Handler definitions and authorization** *(tests first)*
- [ ] A.1 `defineTool({ params, access, run })`; the eight tools moved to it; the browser registry built from the params only
- [ ] A.2 Deny by default: a test that every tool has an access rule; `401 sign_in_required` for signed-out calls
- [ ] A.3 Ownership checks in the handlers; `404 not_found` for "not yours" and "doesn't exist"

**B. Identity and sessions** *(tests first)*
- [ ] B.1 The `authenticate` hook; the reference magic-link sign-in (hashed single-use links, 15-minute expiry, development outbox)
- [ ] B.2 Sessions: `HttpOnly` cookie, bearer tokens for native apps, expiry, sign out; the `Origin` check on `/api/mutate`

**C. Storage** *(tests first)*
- [ ] C.1 The `Store` interface; in-memory and `node:sqlite` versions passing the same tests
- [ ] C.2 Real handlers for the eight tools (assistant.ask stays a labelled stub); seeded demo data

**D. Idempotency** *(tests first)*
- [ ] D.1 SPEC.md [10.14]: the optional `Idempotency-Key` header; a server performing real actions SHOULD honour it
- [ ] D.2 The server: one answer per key, per user, for 24 hours; `409 idempotency_conflict` for a reused key with different params
- [ ] D.3 The web, Swift and Kotlin clients send a key per press, and credentials

**E. Personal data and limits** *(tests first)*
- [ ] E.1 Cross-user attack tests for every tool, replayed sessions and reused keys
- [ ] E.2 Results contain only what the screen needs; logs and the audit trail never hold param values; nothing personal in prompts
- [ ] E.3 Rate limits per signed-in user as well as per address

**F. Playground** *(tests first)*
- [ ] F.1 The in-browser API with the in-memory store and a labelled pretend visitor

**G. Docs and review** *(checkpoint: you review)*
- [ ] G.1 SPEC.md section 9; a "Running real actions" guide; CHANGELOG; the roadmap renumbered (themes 16, app-defined components 17, live screens 18)
- [ ] G.2 A review page: the attack tests and their results, a signed-in run end to end
- [ ] G.3 Merge with your approval
- [ ] G.4 `v0.6.0` release: a separate go-ahead from you
