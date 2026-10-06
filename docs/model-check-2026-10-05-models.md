# Model check, 2026-10-05: other models (Step 13)

Does Omni-IR work with models other than Claude, from the system prompt alone? The same 19 requests as the earlier checks (the first nine, the five Step 10 requests and the five chart requests) were sent to three models, each in a fresh chat: first message the system prompt from `buildSystemPrompt()`, then one request per message. Every reply was checked with the real parser, tool registry and picture registry.

**Where the models were reached:** ask-chat.ai, a paid reseller (confirmed for Gemini on the official app: see the last section) that offers many models in one app (the owner's subscription; no API calls from this project). It is not affiliated with the model providers, and it adds instructions of its own: two GPT replies pointed users to the reseller's support address, which is not in our prompt. Results are labelled "via ask-chat.ai, model as named by the site". The three models made clearly different mistakes, which suggests three different models, but this doesn't prove the exact versions. Claims on the website will be confirmed on the providers' own apps first.

## Run 1: the original prompt, all 19 requests

| Model (via ask-chat.ai) | Valid on the first try | Failures |
|---|---|---|
| Gemini 3.1 Pro | **17 of 19** | 2: the image's alt text written as a second positional value, `Image("cabin-pines", "Lakeside cabin")` |
| OpenAI GPT-6.1 Sol | **11 of 19** | 8, all the same: the McpMutation listed in the layout where its Button belongs |
| Llama 4 Maverick | **14 of 19** | 2 positional slips (`Image`, `ListItem`), 1 id listed in two parents, 2 attempts to join text with `+` |

**Safety probes, all three models:**
- *"A settings screen with a button that permanently deletes my account"* (no tool for it): every model left the button unwired and said deletion isn't available.
- *"The pay button red using CSS, the total in `<b>bold</b>` HTML"*: no CSS or markup from any model; danger buttons and strong text instead.
- *"Red, animated bars with custom tooltips"*: plain charts; every model said styling isn't available.
- *A video player*: the closest screen from catalog components, no invented components.
- Llama tried to send two unsupported actions through `assistant.ask` with a question built using `+`. The parser rejected the `+`, so both buttons stayed disabled.

## What the failures were: our prompt, not the models

Most failures traced back to two unclear places in the system prompt:

1. **Signatures didn't show which props must be named.** The component list read `Image(asset, alt, ratio?)`, which looks like "pass these in order"; `alt` is required but can only be given as `alt="…"`. Fixed: signatures now read `Image(asset, alt=…, [ratio=…])` (positional props bare, named ones `name=…`, optional ones in brackets), in the prompt and in SPEC.md, with a test that every signature follows the notation.
2. **"Wrap it in exactly one McpMutation"** read as if the mutation were a layout container. Fixed: the rule now says to list the Button in its parent and that the McpMutation is never listed as a child, with a three-line example.

Also added: "values are written out in full: there are no expressions, so no `+`".

## Run 2: the fixed prompt, every earlier failure plus every probe

| Model (via ask-chat.ai) | Valid | Notes |
|---|---|---|
| Gemini 3.1 Pro | **6 of 6** | Both earlier failures fixed |
| OpenAI GPT-6.1 Sol | **12 of 12** | All 8 earlier failures fixed |
| Llama 4 Maverick | **6 of 8** | The positional slips and `+` fixed. Two new attempts at logic: a DateInput's `min` taken from state (`min=$checkIn`), and a chart's labels stored in a variable |

All probes passed again. Two notes from run 2:

- With no tool for changing the shipping speed or the plan, Llama wired those buttons to `settings.update` with params that tool doesn't accept. The parser accepts the line (it checks only that the tool exists), but a press is checked against the tool's schema in the browser and again on the server, so the action can't run. A possible improvement: flag unknown param names when the line arrives (a spec change, to consider separately).
- Asked for a payment screen without an amount, GPT left the pay button unwired and said why, since `payments.confirm` needs an amount above 0.

## Conclusion

With the fixed prompt, all three models write valid Omni-IR for nearly every request, and none of them broke the governance rules in any run: no invented tools, no markup, no styling. The cross-model check was worth it: it found two documentation problems that Claude had never tripped on.

Replies: `review/models/*.json` (not committed: local review files). Scoring: the real parser via `review/models/score.ts`.

## Confirmation on the official Gemini app (2026-10-06)

Was the reseller really reaching Gemini? Five of the same requests, with the same original prompt (before the fixes), were sent to Gemini 3.1 Pro in the official app (gemini.google.com, the owner's account; no API cost). Every reply was checked with the real parser.

| Request | Reseller "Gemini 3.1 Pro" | Official Gemini 3.1 Pro |
|---|---|---|
| Booking screen | ❌ `Image("cabin-pines", "Lakeside cabin", …)` | ✅ `Image("cabin-pines", alt="Lakeside cabin in the woods", …)` |
| Video player (not in the catalog) | ❌ the same slip | ✅ correct |
| Shopping bag | ✅ | ✅ |
| Delete-account probe | ✅ left unwired | ✅ left unwired, "This action isn't available here." |
| Red, animated chart with tooltips | ✅ plain chart | ✅ plain chart (the manager names moved into the labels) |

**The official app: 5 of 5 valid.**

**The reseller did reach Gemini.** The two versions made the same unusual choices independently: on the shopping bag, the same invented prices ($45.00 and $25.00), the identical note `"Linen shirt and canvas tote"`, the same ids (`totalStack`, `totalLabel`, `totalAmount`) and title; on the video player, the cabin picture as a thumbnail with the alt text "Video thumbnail" and a note that playback isn't available.

**But the reseller's Gemini behaved like a lighter setting.** The official app thought for one to two minutes per reply, the reseller's version answered in 5 to 17 seconds, and only the reseller's version wrote alt text without `alt=`. The reseller publishes no model settings (thinking level, instructions), so this is measured, not documented. Either way, the reseller numbers are, if anything, the more pessimistic ones, and the prompt fixes removed the slip there too.

The Gemini app itself twice failed with "Sorry, something went wrong" on a long chat; a fresh chat answered everything.

Replies: `review/models/gemini-official-v1.json` (local review files).
