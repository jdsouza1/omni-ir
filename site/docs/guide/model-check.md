# Checking the model

Before a model writes screens for the people using your app, the reference server can make it prove, right then, that it writes good Omni-IR. It works like a second sign-in factor, except that it tests proficiency instead of identity. The server sends the model a short challenge drawn at random and scores each reply with the real parser. A pass clears that exact setup, and a failure keeps the setup away from people until it's fixed.

The check is about **proficiency, not safety**. Whatever any model writes, the parser and the catalog still check every line of every screen. The check catches a setup that would produce broken or half-empty screens, for example after someone swaps the model, edits the system prompt, or the provider quietly updates the model, before the people using your app see it.

## How a challenge works

1. The server draws six requests from `app/challenges.ts`: four ordinary screens ("a booking screen with check-in and check-out dates and a reserve button") and two that push against the rules ("make the pay button red using CSS", "show the picture at https://…", "a button that deletes my account" when there is no tool for it).
2. It sends each one to the model with the same system prompt people's requests get.
3. It parses each reply with the same tool and picture registries your apps use, and scores it:
   - **Safety:** no parse error at all, so no invented component or tool, no action outside an `McpMutation`, no URL, code or prose. All six replies must pass.
   - **Quality:** the reply has what the request needed (the components, the tool, or a real screen rather than a refusal). Five of the six must pass, because models vary a little from run to run.

Only the request ids and the scores are recorded. No reply, and nothing from anyone's own requests, is kept.

## When the model is challenged

| When | Why |
|---|---|
| The server starts with a setup it hasn't checked | A pass belongs to one setup: the model, its system prompt and settings, the catalog, your tools and your pictures. Change any of them and the setup is new. |
| A pass is seven days old | Providers can change a model without changing its name. |
| More than 10% of the last 50 live replies have errors | The server already parses every reply to log how well the model follows the format; once at least 10 replies are in, those counts trigger a new challenge, at most once an hour. |
| A failed setup has waited an hour | It's tried again, in case the problem was temporary. |

A restart with the same setup doesn't pay again: passes are kept in the server's store (in memory, or in SQLite with `OMNI_DB`).

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `OMNI_MODEL_CHECK` | `enforce` with `OMNI_MODEL=claude`, `off` with the mock | `enforce` refuses screens until the setup passes; `warn` serves anyway and logs the result; `off` skips the check. |

While a setup is unverified and the check is enforced, `POST /api/generate` and `POST /api/ag-ui` answer `503` with the code `model_unverified`, retryable, and a `Retry-After` header ([Servers and transports](./transport)). The web, iOS and Android clients report it like any other retryable error. `GET /api/health` shows the check's state:

```json
{ "ok": true, "model": "claude", "auth": "magic-link",
  "modelCheck": { "mode": "enforce", "state": "passed", "fingerprint": "…", "checkedAt": "…", "expiresAt": "…" } }
```

Every challenge is logged as a `model_check` entry: the setup, the reason, the scores, and for each failing reply its error codes and what it lacked.

## Cost

A challenge is six generations, the same as six people's requests, and they count against the daily cap (`OMNI_DAILY_CAP`). There's at most one challenge per setup change, per expiry and per hour of failing replies. The mock model is never challenged unless you ask, and tests use scripted fake models.

## Try a model before you deploy it

```bash
npm run model:challenge
```

This runs one challenge against the configured model and prints how each reply scored. Add `-- --seed 42` to repeat a draw. With the default mock model it costs nothing, and its result shows how the check works rather than how well a model writes. With `OMNI_MODEL=claude` it spends six generations.

## Your own requests

`app/challenges.ts` is app code, like the tool registry. If your app has its own tools, write requests that use them, so the challenge tests what your people will actually ask for. A test checks that every request names only components and tools that exist.
