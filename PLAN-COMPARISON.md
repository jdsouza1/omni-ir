# Omni-IR — Step 9: comparison with similar formats

Goal: honest, reproducible numbers on how Omni-IR compares with other ways a model can describe a UI, covering size, streaming and reliability, plus a sourced table of what each format allows. The owner asked for this on 2026-10-01; nothing goes on the landing page without the owner's review.

Status: **APPROVED 2026-10-01** as a thorough comparison with the recommendations: OpenUI Lang, A2UI and json-render measured, HTML and React as baselines; reliability runs for both Omni-IR (current prompt) and OpenUI Lang; results in `benchmarks/` and `docs/COMPARISON.md` with a visual review page; landing wording only after review. The paid 46-brief run stays out unless the owner asks.

## The landscape (researched 2026-10-01)

| Format | What it is | How it streams | Who |
|---|---|---|---|
| **OpenUI Lang** | A line-oriented language for models: `id = Component(args)` lines, `root` first, positional arguments, nested calls allowed. The closest relative of Omni-IR. | Line by line | Thesys, MIT licence, about 10,000 GitHub stars |
| **A2UI** (v0.9; v1.0 in release candidate) | JSON Lines: messages such as `createSurface`, `updateComponents` and `updateDataModel`; components in a flat list that refer to children by id; data binding by JSON Pointer | Message by message | Google; used in Gemini Enterprise and Flutter GenUI |
| **json-render** | A JSON spec (or a stream of JSON Patch operations) limited to a catalog defined with Zod schemas | Patch by patch | Vercel Labs, Apache-2.0 |
| **HTML with Tailwind** | Raw markup and classes | As HTML | Common baseline |
| **React JSX** | Generated component code | Not until it compiles | Common baseline |
| MCP-UI, Open-JSON-UI | MCP-UI ships HTML, URLs or remote-DOM scripts in sandboxed frames; Open-JSON-UI is OpenAI's JSON format | | Compared in the table only, not measured |

What this means for Omni-IR's story:
- **Being line-oriented is not unique.** OpenUI Lang made the same choice, and its own benchmark reports 47–53% fewer tokens than JSON formats. Omni-IR should claim what actually differs. The candidates are: governance (McpMutation, a tool registry checked three times, params checked against the tool's schema), strictly flat lines, explicit `$state`, pictures only from an app registry, a written spec with a 63-case conformance suite, and three native renderers (web, iOS, Android) passing it.
- **OpenUI already published a method we can reuse:** seven scenarios, all formats generated from one model output, tokens counted offline with `tiktoken` (GPT-5 encoder), sample files in their repo. One caveat: converting one output into every format measures size, not how reliably a model writes each format.

## Existing benchmarks (checked 2026-10-01)

None found that compares generative-UI formats against each other on size, streaming, reliability and safety together. (Not finding one isn't proof that none exists, so any public claim should be worded with care.)

| Benchmark | Measures | Gap |
|---|---|---|
| OpenUI token benchmark | Tokens for 7 screens: OpenUI Lang vs YAML, json-render, Thesys C1 JSON | Size only; no A2UI, HTML or React; one model output converted into every format, so no reliability |
| Thesys Generative UI Benchmark | Structural validity of a model's output, 46 briefs × 4 runs | Compares models in one format (OpenUI Lang), not formats |
| Thesys Generative UI Arena | Human preference between models' screens | Model quality, not formats |
| StructEval (ICLR 2026) | Model output in 18 formats, including JSON, YAML, HTML, React | No UI protocols; useful context for the HTML and React baselines |
| SchemaGUI (Aug 2026) | Layout accuracy for schema-driven screens | Geometry, not formats |

So this plan **extends OpenUI's published benchmark** (same seven scenarios, same tokenizer, same conversion method) with Omni-IR and A2UI columns, so its numbers line up with their table instead of introducing a competing method. Running Omni-IR on Thesys's 46 briefs would test reliability at scale, but needs 184 model runs, too many to do by hand and paid through an API, so only with the owner's go-ahead.

## What would be measured

1. **Size:** tokens and characters for the same screens in each format, counted offline with the same tokenizer as OpenUI's benchmark, so the numbers line up with theirs. Claude's own tokenizer differs a little; counting with it needs an API key, so it stays out unless you say otherwise.
2. **Streaming:** how much of each reply must arrive before the first component can be drawn, and whether the screen is drawable after every line. Measured with each format's own framing rules.
3. **Reliability:** the share of replies a real model writes validly on the first try. Omni-IR already has 9/9 from the first model check; the comparison would run the same nine requests in OpenUI Lang (using its published system prompt and its own parser) on your Claude.ai account.
4. **What each format allows:** a sourced table. Can the model send markup or scripts? Styles? Image URLs? Are actions governed by an allow-list, and are their params checked? Is there a spec and a conformance suite? Which platforms render natively?

## Fairness rules

- Every format uses its own documented idioms and its latest stable version, cited with a link.
- Screens come from two sets: our nine model-check requests, and OpenUI's seven published scenarios, so Omni-IR is also measured on someone else's examples.
- Where a screen needs a component Omni-IR doesn't have (OpenUI's scenarios include tables, charts and dropdowns), it's reported as **not expressible**, not approximated.
- The other formats are converted mechanically by scripts from the same structure, as OpenUI does, rather than written by hand, so the results don't depend on who writes them. Every input and output is committed, and one command reproduces the numbers offline.

## Facts that shape this

- **Cost: free.** The tokenizer runs offline, the converters are local scripts, and the reliability runs use your own Claude.ai chat. No API is called.
- **Your time:** about 10 minutes for the OpenUI Lang reliability run, the same as the first model check.

## Questions for you (with recommendations)

1. **Formats:** *recommended* OpenUI Lang, A2UI v0.9 and json-render measured, plus HTML with Tailwind and React JSX as baselines; MCP-UI and Open-JSON-UI in the table only.
2. **Reliability runs:** *recommended* OpenUI Lang only, besides Omni-IR's existing 9/9: one extra run of about 10 minutes. The JSON formats would each need their own prompt and validator for a fair run.
3. **Where results go:** *recommended* `benchmarks/` (inputs, converters, `npm run bench`) and `docs/COMPARISON.md` (results, sources, caveats), plus a review page for you. Landing page wording only after your review, worded to match what was measured.

## Task checklist

**A. Set-up**
- [ ] A.1 `benchmarks/` with the offline tokenizer, the screen list and a `npm run bench` script; a test that the script runs and its outputs are committed
- [ ] A.2 Sources pinned: OpenUI's published samples and system prompt, the A2UI v0.9 spec and basic catalog, json-render's spec format, each with its link and version

**B. Screens and converters**
- [ ] B.1 The nine model-check screens as Omni-IR (the replies already recorded), plus OpenUI's seven scenarios written in Omni-IR where the catalog can express them
- [ ] B.2 Converters from one parsed screen to A2UI v0.9 JSONL, json-render (spec and patch stream), HTML with Tailwind and React JSX; checked by validating the A2UI and json-render output against their published schemas where available
- [ ] B.3 A converter to OpenUI Lang for our nine screens, using the component library in OpenUI's published `schema.json`, so it is generated like the others rather than written by hand

**C. Measurements**
- [ ] C.1 Size: tokens and characters per screen and format, with totals
- [ ] C.2 Streaming: share of the reply needed before the first component and before the whole first card
- [ ] C.3 Reliability: the nine requests in both Omni-IR (current prompt) and OpenUI Lang, in fresh Claude.ai chats on your account, each checked with its own parser
- [ ] C.4 The capability table, every cell sourced

**D. Write-up** *(checkpoint: you review)*
- [ ] D.1 `docs/COMPARISON.md`: method, results, caveats and sources; a review page
- [ ] D.2 Only after your review: landing page and README wording

## What I needed from you
Answered 2026-10-01: "a thorough comparison", with a visual.

## Sources
- OpenUI and its benchmark: https://github.com/thesysdev/openui (benchmarks/README.md); https://themenonlab.blog/blog/openui-generative-ui-framework-token-efficient
- OUI-1 and the Generative UI Benchmark: https://rits.shanghai.nyu.edu/ai/oui-1-diffusion-model-generative-ui/
- A2UI: https://a2ui.org/ and https://a2ui.org/specification/v0.9-a2ui/
- json-render: https://infoq.com/news/2026/03/vercel-json-render and https://blog.logrocket.com/vercel-json-render-dynamic-ui/
- MCP-UI: https://workos.com/blog/mcp-ui-a-technical-deep-dive-into-interactive-agent-interfaces
- Open-JSON-UI and the wider landscape: https://docs.copilotkit.ai/generative-ui-specs/open-json-ui
