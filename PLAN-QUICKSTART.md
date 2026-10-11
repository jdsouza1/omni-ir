# Omni-IR: getting started without friction

Status: **Approved 2026-10-11 with the recommendations (second draft). A.1–A.5 built; review next.** Rewritten after the owner's review:
"think of a non-technical user going through this and click the button". Not a protocol step: the
stream format doesn't change. Free: nothing here calls a paid API; visitors use their own AI chat.

## Goal

Anyone who clicks **Get started**, with no code, no install and no account with us, sees a screen their
own AI wrote, drawn by Omni-IR, within about three minutes, on a phone or a computer. Developers get
a second path: the same result inside their own app in about ten minutes.

## Why now

- The owner's review (2026-10-11): "Get started" leads to a docs page that reads like documentation,
  and the hero's other button leads to the spec. Neither lets a visitor *do* anything.
- The LinkedIn post went out today. Many of its readers aren't developers, and most read LinkedIn on
  a phone. Installing Node, cloning a repository or reading code loses them at the first step.
- What they already have is an AI chat (ChatGPT, Claude or Gemini, free plans included). What we
  already have is a playground that draws pasted Omni-IR in the browser. Nothing joins the two.
- A gap behind the developer path: the system prompt that teaches a model Omni-IR is built by
  `server/prompt.ts`, which reads files from disk and isn't published. Neither the browser nor a
  developer's app can get it today.

## How it fits

- Distribution work, not a new protocol step, so it fits the pause on new steps (cost-benefit item 1).
- Reuses what is built: the playground, its paste mode, its phone layout, the real parser and catalog,
  and the prompt generator. The free model check page already proved the "paste into your own chat"
  idea with the owner.

## Who benefits

- **Non-technical visitors** (product managers, founders, designers, the post's readers): they see
  what Omni-IR does with their own idea and their own AI, and can pass it to a developer.
- **Developers:** a numbered guide that ends with a working screen in their app.
- **The project:** visitors who make something are far more likely to share it, star it or come back.

## Track 1, no code: the example walked end to end

Sam, a product manager, taps **Get started** in the LinkedIn post's link, on their phone.

1. **The playground opens on a new tab, "Use your own AI",** with three numbered steps and nothing
   else to read. Step 1: *"What screen do you want?"* Sam types "a booking form for a dog-grooming
   salon", or taps one of four ideas.
2. **Step 2: "Ask your AI."** One button, **Copy instructions**, copies the Omni-IR instructions with
   Sam's request at the end. Three links open ChatGPT, Claude or Gemini in a new tab (plain links,
   nothing sent with them). Sam pastes, sends, and copies the AI's whole reply. The page says in one
   line that a free account works and that nothing is sent to us.
3. **Step 3: "Paste the reply."** Sam pastes it and taps **Show my screen**. The page drops anything
   that isn't Omni-IR (a "Here's your screen" sentence, code fences) and says so. The screen draws
   line by line, as it would while streaming, with a web or phone frame to switch between.
   Under it, in plain sentences: *"All 16 lines were checked. The Book button is off: this demo app
   has no booking action. In your app, you choose which actions the AI may use."*
4. **Next:** **Share this screen** copies a link that opens the same screen for anyone (the lines
   travel in the link itself; nothing is stored on a server). **Build it into your app** opens the
   developer guide.

What the AI writes is ordinary Omni-IR (`root = Card([...])`, `book = Button("Book", action="book")`).
What the page sends anywhere: nothing; the copy and paste are Sam's. What Sam sees: the screen, and why
the button is off.

## Track 2, developers: the guide

The docs' "Getting started" page, rewritten as numbered steps for a React app, each ending with what
you should see: install; render a ready-made reply with no model (the button is off); register a tool
(the button turns on and calls your code); connect your own model with `buildSystemPrompt({ tools })`
(the screen streams in); check the action on your server; next steps for other web frameworks,
iPhone and Android. Step 4 needs the new export, so it goes live with release 0.15.0.

No phone test for this plan: the iOS and Android apps don't change. Track 1 is checked at phone width
in the browser.

## Decisions: pros, cons and trade-offs

### 1. Where the no-code path lives

- **Option A (recommended): a third tab in the playground, "Use your own AI",** which "Get started"
  opens directly. *Pros:* the renderer, the checks, the phone frame and the phone layout already
  work there; one click from the landing page to step 1. *Cons:* the playground's other tabs and
  panels sit around it; on this tab they're hidden until a screen is shown.
- **Option B:** a new page on the landing site. *Pros:* designed from scratch for beginners. *Cons:* a
  second copy of the renderer setup and the checks to keep in step.
- **Option C:** a guided wizard over the landing page. *Cons:* the most new code; the landing page gets
  heavy.

### 2. What the visitor copies

- **Recommended: the full system prompt plus their request,** generated from the schema with the
  demo app's tools, so the AI can only describe what the playground can draw. About 10,000 characters
  (2,600 tokens): fine for free ChatGPT, Claude and Gemini. *Cons:* a long paste on a phone; one
  button makes it a single tap.
- **Alternative:** the short MCP guide (under 1,500 tokens). *Pros:* shorter. *Cons:* tuned for an MCP
  host's tool call, not a whole reply; more mistakes from the AI.

### 3. Tidying the AI's reply

- **Recommended: the playground drops lines that aren't statements** (prose, code fences) before
  checking, and says how many it dropped. *Pros:* chat apps wrap replies in fences and a friendly
  sentence; without this, many first tries would fail on something that isn't the format's fault.
  *Cons:* it's kinder than the spec; it lives in the playground only, never in the parser, and the
  page says what it removed.

### 4. Which AI chats we point to

- ChatGPT, Claude and Gemini, the three most used. Claude (the owner's chat) and the Gemini app (5 of 5
  in Step 13) are checked; **ChatGPT's own app isn't** (GPT was checked through a reseller).
- **Recommended:** before launch, the owner runs the free model check page once in ChatGPT's free
  plan (about 10 minutes, no cost). If it does poorly, the page lists ChatGPT last with a note.

### 5. Sharing a screen

- **Recommended: a "Share this screen" link** with the lines in the link's fragment (after `#`, which
  browsers never send to a server). *Pros:* "look what I made" is how this spreads; no storage, no
  accounts, no cost. *Cons:* long links (a typical screen is 1–2 KB, fine for chat apps); a shared link
  shows whatever the sender pasted, so the page renders it like any pasted reply (same checks, no
  actions run, every button off unless its tool is in the demo registry, which only logs).

### 6. The landing page's buttons

- Hero: **Get started** (primary, opens the no-code tab) and **Try the playground** (as today). "Read
  the spec" moves out of the hero; it stays in the top bar and footer. The Pricing card's "Get started"
  opens the developer guide; the closing section's opens the no-code tab.
- *Pros:* every button leads somewhere a visitor can act. *Cons:* the spec is less prominent for
  people writing a parser; they're few, and it's one click away.

### 7. Publishing the prompt builder in `@omni-ir/core`

- Move `buildSystemPrompt` out of `server/prompt.ts` into `@omni-ir/core`, with no file access and no
  demo defaults: the caller passes its tools, pictures, components, live parts and examples. The
  server and the playground call it with the demo app's registries.
- *Pros:* the browser can build the prompt (Track 1 needs this; the site uses the source, so no
  release is needed for Track 1); developers can connect any model (Track 2); one source for all.
- *Cons:* a new public function to keep stable; Track 2's step 4 waits for release 0.15.0 (your
  separate go-ahead).
- **The demo server's prompt stays byte-for-byte the same** (a test checks it), so no model check
  page run is due for the move itself.

## Checks (per the working rules)

- Tests first: the reply tidying (fences, prose, nothing else changed), the share link (round trip,
  size, hostile content treated like any paste), the prompt builder (same output as today).
- A test walks Track 1: copy instructions contain the request, a pasted reply with prose and fences
  draws the screen, the plain-sentence summary is right.
- The developer guide's code runs in a test with a fake model client.
- I go through Track 1 myself in the browser at phone and desktop width, read every sentence a
  visitor sees, and look at every screenshot before showing you.

## Cost and risk

- Free: no paid API, no new dependency, nothing stored.
- **Risk: a visitor's AI writes something poor.** The checks say what went wrong in plain sentences,
  and the page suggests trying again or another AI.
- **Risk: copy and paste on phones.** One-tap copy buttons; the paste box is large; tested at phone width.

## Checklist

- [x] A.1 `buildSystemPrompt` in `@omni-ir/core`, tests first; the server and playground use it, prompt unchanged
- [x] A.2 The "Use your own AI" tab: three steps, reply tidying, plain-sentence summary, phone layout
- [x] A.3 Share links
- [x] A.4 Landing page buttons
- [x] A.5 The developer guide rewritten as steps, its code tested
- [ ] B.1 Owner: one free model check run in ChatGPT's free plan
- [ ] B.2 I go through both tracks in the browser and check every screen and sentence
- [ ] B.3 Your review, then merge with your approval (Track 1 goes live with the site)
- [ ] B.4 Release 0.15.0 with your separate go-ahead (Track 2's step 4)
