# Running real actions

A model can only *choose* actions your app registered, and every press is checked three times: by the parser, by the renderer and by your server. Those checks prove a request is well-formed. They don't prove it is **allowed**: anyone can send `/api/mutate` a request naming somebody else's order. So a server that performs real actions also needs to know who is asking, and to check that the action is theirs to take ([section 9](../spec#_9-actions)).

The reference server in this repository does all of this, as a small example to copy from. It is free to run: no real money moves, no email is sent, and no third-party account is needed.

## Each tool says who may use it

A handler pairs an access rule with the work:

```ts
"orders.requestReturn": {
  access: "signed-in",
  async run({ orderId }, { user, store }) {
    const order = await store.orders.get(String(orderId));
    if (!order || order.ownerId !== user.id) throw notFound();
    const ret = await store.returns.request(order.id, user.id, newId("ret"));
    return { returnId: ret.id, orderId: order.id, status: "requested" };
  },
},
```

- **Deny by default.** Every tool needs an `access` rule, `"signed-in"` or `"public"`, and a test fails if one is missing. Only sending a sign-in link is public.
- **Check ownership against your data, never the params.** A model can write any order id, and so can anyone posting to your server.
- **"Not yours" looks like "doesn't exist".** Both answer `404 not_found`, so nobody can find out which ids exist by trying them.
- **Return only what the screen needs.** No internal ids, no other people's data.
- **The params schemas stay where they were** (`app/tools.ts`), shared with the browser. The access rules live only on the server.

## Who is asking

The reference server signs people in with a one-time link sent by email: no passwords anywhere (the catalog has no password field, by design).

1. A screen's button calls `auth.sendMagicLink` with an email address. The answer is always "sent", whether or not the address has an account, and at most five links an hour go to one address.
2. The link is valid once, for 15 minutes. Only a hash of it is stored.
3. Following it in a browser sets a session cookie (`HttpOnly`, `SameSite=Lax`) that page scripts can't read, valid for 30 days. A native app that catches the link trades it for a bearer token at `POST /api/auth/session` and sends `Authorization: Bearer …`.
4. `POST /api/auth/signout` ends the session on the server. `GET /api/auth/me` says who is signed in.

In development the email goes to an outbox that prints the link to the server's log; nothing is sent. To use your own sign-in instead, pass `authenticate`:

```ts
createApp({ config, model, authenticate: async (req) => myUserFromSession(req) /* or null */ });
```

Browsers send cookies even on requests another site starts, so the server refuses a cookie-authenticated action whose `Origin` isn't your app's (`403 bad_origin`).

## No action runs twice

A double-click, or a retry after a dropped connection, must not pay twice. `createMutationHandler`, and `OmniClient` on iOS and Android, send an `Idempotency-Key` with every press and keep the same key for their one automatic retry. For 24 hours the server answers a repeated key from the same person with the answer it already gave, and refuses the key for different params (`409 idempotency_conflict`). Keys are kept per person, so nobody can fetch another person's answer with their key.

## What the person sees

| Answer | Code | When |
|---|---|---|
| 401 | `sign_in_required` | The tool is for signed-in people. |
| 404 | `not_found` | It doesn't exist, or it isn't theirs. |
| 409 | `unavailable` | For example, those nights are already booked. |
| 409 | `idempotency_conflict` | A key was reused for a different action. |

A refusal reaches your app as a `handler_failed` event with the server's message, for you to show where it fits (the renderer itself shows a plain sentence only when it blocks a press before sending). Every outcome is also recorded in an audit trail (who, which tool, when, the outcome), without param values, which may be personal.

## Where data lives

Handlers use one small `Store` interface (`server/backend/types.ts`). Two versions come with the repository:

- **Memory**, for tests and the hosted playground. The default for `npm run server`, so data is gone when it stops.
- **SQLite**, on Node's built-in `node:sqlite` (Node 22.13 and later, no package to install): set `OMNI_DB=./data/omni.sqlite` and data survives restarts. One file on one machine.

An app with its own database implements the same interface.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `OMNI_AUTH` | `magic-link` | `magic-link` signs people in by email link. `demo` treats every request as one demo visitor, `visitor@example.com`: for the playground and the demo apps only, never for real data. |
| `OMNI_PUBLIC_URL` | `http://localhost:5173` | Your app's address: where sign-in links point, and the origin actions must come from. Use `https://` in production, which also marks the cookie `Secure`. |
| `OMNI_DB` | unset (memory) | A SQLite file for the server's data. |
| `OMNI_MODEL_CHECK` | `enforce` with Claude, `off` with the mock | Whether the model must pass a challenge before it writes screens ([Checking the model](./model-check)). |
| `OMNI_TRUST_PROXY` | `false` | Which proxies may report a client's address ([Servers and transports](./transport)). |

Requests are limited per address, and per signed-in person wherever their requests come from.

## What stays yours

- **Payments and email providers.** The reference keeps a fake ledger and a development outbox; plug in your own behind the same functions.
- **Your people's real data in screens.** A screen shows what the model wrote. The reference server never adds anything about the signed-in person to the prompt, so nothing personal goes to the model. Showing someone their actual orders needs live screens, which are on the roadmap.
- **Roles and teams.** The access rule leaves room for them; the reference has only "signed in" and "public".
