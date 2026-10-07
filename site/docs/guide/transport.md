# Servers and transports

The text format says what a screen is. The transport says how it gets from your server to your app: which request asks for a screen, which events carry it, and what happens when something goes wrong. Both are in the specification ([section 10](../spec#_10-transport)), so any client works with any server that follows it. The reference server in this repository, `generate()` in `@omni-ir/react`, and `OmniClient` on iOS and Android all do.

## Asking for a screen

```http
POST /api/generate?version=0.5
Content-Type: application/json
Accept: text/event-stream

{"prompt": "a payment confirmation for $42.50"}
```

`version` is optional. It is the **stream format** the client's parser reads, currently `0.5`; it changes only when the format does, not with every release (see [Versions](#versions) below). A server answers `400` with the code `unsupported_version` only when it writes a newer format than the client reads. It is in the query, not the body, so older servers simply ignore it.

## The stream

The answer is [Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html):

```
event: chunk
data: {"text":"# omni-ir 0.5\n"}

event: chunk
data: {"text":"root = Card([title, amount])\ntitle = Heading(\"Confirm"}

event: chunk
data: {"text":" payment\")\n"}

: ping

event: done
data: {"stopReason":"end_turn","model":"claude-opus-5-5","ms":1840}
```

- **`chunk`** carries the next piece of text. Pieces end anywhere, even inside a line; the client writes them to its parser exactly as they arrive.
- **`done`** or **`error`** ends the stream. Only the first one counts; anything after it is ignored.
- **`: ping`** comes at least every 15 seconds while nothing else does. A client that hears nothing at all for 45 seconds treats the connection as lost.
- **The first line** is the version marker, `# omni-ir 0.5`: the stream format, written by the server, not the model. Older parsers read it as a comment. A parser that gets a stream in a newer format reports `newer_version`, and the renderer tells the person the app needs an update, while still showing everything it understands.

When the connection drops before `done` or `error`, the client ends its parser, so whatever never arrived shows as a fallback rather than loading forever, and reports `connection_lost`, which may be retried. Streams can't be resumed: retrying means asking again.

## Versions

Two numbers are involved, and they move separately:

- The **stream format** (`0.5` today) is what a model writes and a parser reads: the grammar, the catalog and the rules. It changes only when one of those does, and formats only add, so a parser reads its own format and every older one.
- The **package release** (`@omni-ir/core` 0.8.0, for example) changes with every release, including ones that only improve the server, the renderer or the clients.

So a server and its apps keep working together across releases, as long as the app reads the server's format. Releases 0.6 and 0.7 wrote their release number into the marker; parsers understand those numbers as format 0.5. When an older server (0.6 or 0.7) refuses the format number a newer client asks for, the client asks once more without a number.

## Errors before the stream

A request the server can't start is answered with an HTTP status and one JSON body, the same everywhere:

```json
{"error": {"code": "rate_limited", "message": "Too many requests; try again shortly.", "retryable": true}}
```

| Status | Code | When |
|---|---|---|
| 400 | `invalid_request` | The body isn't a valid request. |
| 400 | `unsupported_version` | The server writes a newer format than the client reads. |
| 429 | `rate_limited` | Too many requests. `Retry-After` gives the seconds to wait. |
| 503 | `model_unverified` | The server's model hasn't passed its [model check](./model-check) yet; retryable, with `Retry-After`. |
| 500 | `server_error` | Anything else. |

## Actions

A governed button sends `POST /api/mutate` with `{"tool": "payments.confirm", "params": {…}}`. The server checks the tool and the params again before running anything, because anyone can send that request. The full list of answers is in [the specification](../spec#_10-transport).

## Running the reference server behind a proxy

The reference server limits requests per client address. Behind a load balancer or reverse proxy, every request arrives from the proxy, so tell the server which proxies to trust, and it will read the client's address from the `X-Forwarded-For` header they add:

| `OMNI_TRUST_PROXY` | Meaning |
|---|---|
| unset or `false` | Trust no proxy (the default). `X-Forwarded-For` is ignored. |
| a number, such as `1` | Trust that many proxies in front of the server. |
| addresses, such as `loopback, 10.0.0.0/8` | Trust proxies at those addresses or subnets. |

Set it only when the server really is behind those proxies: anyone can write `X-Forwarded-For`, so trusting it on a server that can be reached directly lets a client choose its own address and dodge the limit. `true` is refused for that reason. Each server instance counts on its own; several instances behind one proxy each allow the full rate.

## WebSockets

The specification maps the same events onto WebSocket messages (`{"type": "chunk", "text": "…"}`), for apps that already use WebSockets. The reference server doesn't provide that endpoint. If you build one, check the `Origin` header of every connection yourself: browsers don't apply CORS to WebSockets.

## AG-UI

Agent frameworks that speak AG-UI can carry Omni-IR screens too: see [Use with AG-UI](./ag-ui).
