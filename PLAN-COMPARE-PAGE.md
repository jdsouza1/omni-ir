# Omni-IR: an interactive comparison page

Status: **Approved 2026-10-11 with the recommendations.** Not a protocol step: nothing in the format changes.
Free: offline measurements (`npm run bench`), public documentation, no paid API.

## Goal

A visitor who clicks **Compare** on the landing page sees, in about a minute and without reading a
table, how Omni-IR differs from the other ways an AI can describe a screen: how big the same screen is
in each format, when each can start drawing, what each lets the AI do, and what happened when a model
was asked for something the app doesn't allow. Every number and claim is current, sourced, and
regenerated from the benchmark, so the page can't drift.

**Written for someone who has never seen code** (the owner's requirement, 2026-10-11). Every section
opens with one plain sentence saying what it shows and why it matters, before any number or code.
Format names are introduced in a few words each ("A2UI: Google's format, written as JSON"). Code is
only ever shown on request, behind a tap. "Tokens" is explained once, in everyday terms (roughly, how
much the AI has to write: fewer means faster and cheaper). Table answers are short sentences, not
jargon; technical detail and sources sit behind a tap. Before review I read the page as that visitor
would and rewrite anything that needs a developer to understand it.

## Why now

- The owner's request (2026-10-11): an interactive, visual comparison with all the new features,
  linked from the landing page.
- `docs/COMPARISON.md` was measured on 2026-10-01 to 2026-10-05 (Step 9) and is a long Markdown page.
  Several of its Omni-IR facts are now out of date: "a fixed catalog of 27 components" (apps add their
  own since Step 20), "85 conformance cases" (more now), and nothing about field checks, confirmations
  the AI can't skip, screens the app updates after they arrive, `<omni-screen>`, or screens inside
  Claude and ChatGPT. The other projects have moved on too, so their cells need checking again.
- Visitors from the LinkedIn post and Get started will ask "why not A2UI or OpenUI?". The landing page
  answers with three numbers; this page shows the rest.

## How it fits

- Distribution work, not a new protocol step (cost-benefit item 1 still holds).
- Reuses what's built: the benchmark's converters, committed outputs and `results.json`, the
  capabilities table with a source for every cell, the 2026-10-04 reliability replies, and the real
  parser and catalog to draw Omni-IR's version of each screen.

## Who benefits

- **Developers and technical buyers** choosing a format: a fair, sourced picture, including where
  Omni-IR loses (OpenUI Lang is 4–10% smaller and has a larger built-in catalog).
- **Non-technical visitors:** the size bars, the streaming race and the account-deletion story say it
  without code.
- **The project:** a link to share when someone asks how Omni-IR compares.

## The page, walked end to end

Sam clicks **Compare interactively** under the landing page's "Small, streaming and governed." section.

1. **Same screen, every format.** The page opens on the booking screen from the model check. A row of
   bars shows its size in tokens: Omni-IR 273, OpenUI Lang 260, React JSX 341, A2UI 436, HTML with
   Tailwind 541, json-render 609. Tapping a bar shows that format's actual text (on a phone, one format
   at a time with tabs). Omni-IR's version is also drawn by the real renderer beside it. A picker
   switches between the 16 screens (9 from the model check, 7 from OpenUI's own benchmark).
2. **When can it start drawing?** **Play** streams every format at the same speed. Omni-IR and OpenUI
   Lang light up "can draw" after about 30–40 tokens; json-render and per-message A2UI after about
   three times as many; A2UI in one message and React JSX only at the end. Omni-IR's screen fills in as
   its lines arrive. Labelled as a replay of measured token counts, not a live model.
3. **What each format lets the AI do.** The capabilities table as rows of short answers, with
   Omni-IR's column first; each cell shows its source when tapped. A switch shows only the rows where
   the formats differ. New rows for what has been built since Step 9 (see decision 3).
4. **Same request, two formats.** The 2026-10-04 reliability run, side by side: asked for an
   account-deletion button with no tool for it, Omni-IR left it off and said deletion isn't available;
   OpenUI Lang wired "Permanently delete my account" to an invented action. Both replies as written,
   with the date and model.
5. **Where Omni-IR loses**, said plainly: OpenUI Lang is smaller; OpenUI's library is larger and draws
   two of its own scenarios Omni-IR can't (accordion, image gallery, radio buttons, Markdown); A2UI and
   json-render have more renderers on the web. Then links to the full write-up and the benchmark.

What the AI writes doesn't change. What the page sends anywhere: nothing (static, data built in). What
Sam sees: bars, a race, a table and a story, each with its source.

No phone test: a web page only. It's checked at phone width in the browser.

## Decisions: pros, cons and trade-offs

### 1. Where it lives

- **Option A (recommended): its own page, `/compare/`,** built with the landing page's Vite setup and
  design, linked from the landing page's comparison section ("Compare interactively") and the top bar.
  *Pros:* the landing page stays light; a link to share; the same look. *Cons:* one more page to build.
- **Option B:** a bigger section on the landing page. *Cons:* the landing page gets long and heavy
  (every format's text for 16 screens).
- **Option C:** inside the docs (VitePress). *Cons:* the docs use Vue; the renderer is React; it would
  look like documentation, which the owner wants to move away from for visitors.

### 2. The data: generated, never typed

- **Recommended:** `npm run bench` also writes the page's data (sizes, first-draw points, every
  format's text, capabilities, reliability excerpts) into one JSON file; a test fails if it's stale,
  as it does for `docs/COMPARISON.md` today. *Pros:* the page and the write-up can't disagree.
  *Cons:* the page's data file is a few hundred KB (16 screens in 7 formats); loaded only on this page.

### 3. Bringing the facts up to date

- **Omni-IR's cells** from the repository as it is now: app-defined components (Step 20), field checks
  before anything is sent and confirmations the stream can't skip (Step 19), updates after the stream
  (Step 22), `<omni-screen>` for any web framework (Step 21), screens inside Claude, ChatGPT and other
  MCP hosts (Step 18), the model check (Step 17), and conformance case counts taken from the files.
- **New rows**, each answered for every format: *the app's own components*, *field checks before
  sending*, *confirmations*, *changing a screen after it arrives*, *native iPhone and Android*, *inside
  AI chat apps (MCP Apps)*.
- **The other formats' cells** re-checked against their current public documentation. The pinned
  copies in `benchmarks/sources/` are from 2026-10-01; I'd fetch the current versions of the same
  documents (A2UI's protocol and catalog, OpenUI Lang's spec and prompt, json-render's README; public
  text files, each well under 1 MB) with your go-ahead, pin them with their commit, and mark every
  cell that changed. Where a project has a feature we didn't know about, the cell says so.
- **Sizes are re-measured** with today's converters and catalog (offline). The reliability run isn't
  repeated: it stays dated 2026-10-04, with the model named.
- *Trade-off:* an hour or two of careful reading, but a comparison that's wrong about someone else's
  project would cost more trust than it earns.

### 4. The streaming race

- **Recommended: a replay of measured token counts at one fixed speed**, labelled as such. *Pros:*
  honest, repeatable, free. *Cons:* not a real model's timing (real models vary). *Alternative:* real
  timings from a model: needs paid API calls, so no.

### 5. Drawing the other formats

- **Recommended: only Omni-IR's screen is drawn;** the others show their text and their "can draw"
  point. *Pros:* we don't misrepresent another renderer's look. *Cons:* less visual for the others.
  *Alternative:* screenshots from each project's own renderer: more work, and they'd need updating.

## Checks (per the working rules)

- Tests first: the page's data is regenerated by `npm run bench` and a test fails if stale; every
  capabilities cell has a source; the numbers on the landing page match the data.
- I read every sentence and look at every screen of the page at desktop and phone width, light and
  dark, before showing you.
- No claim about another project without a source in `benchmarks/sources/` or a dated link.

## Cost and risk

- Free: offline measurements, public documents, no paid API.
- **Risk: unfair to another project.** Sources on every cell, a "where Omni-IR loses" section, and the
  same converters for every format.
- **Risk: stale again.** Generated data and the staleness test; the page shows the date measured.

## Checklist

- [ ] A.1 Your go-ahead to fetch and pin the current public docs of A2UI, OpenUI and json-render
- [ ] A.2 Capabilities brought up to date: Omni-IR's cells from the repo, new rows, other formats re-checked with sources; `docs/COMPARISON.md` regenerated
- [ ] A.3 `npm run bench` writes the page's data, tests first
- [ ] A.4 The page: sizes, the race, capabilities, the account-deletion story, where Omni-IR loses
- [ ] A.5 Links from the landing page's comparison section and top bar
- [ ] B.1 I check every screen and sentence at desktop and phone width, light and dark
- [ ] B.2 Your review, then merge with your approval (no release: the site deploys from main)
