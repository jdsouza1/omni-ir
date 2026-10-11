# Omni-IR: a step-by-step quickstart

Status: **For the owner's approval (2026-10-11).** Not a protocol step: the stream format doesn't change.
Free: no paid API in the guide's tests (a fake model client), and nothing here calls a model.

## Goal

Someone who clicks **Get started** on the landing page has a working Omni-IR screen in their own app
within about 10 minutes, by following numbered steps, each ending with something they can see.

## Why now

- The owner's review (2026-10-11): "Get started" leads to a page that reads like the documentation. It
  explains the format, then shows fragments for three platforms; nothing walks from nothing to a
  working screen. The hero's second button, "Read the spec", is for people writing a parser, not for
  people building an app.
- A gap behind it: **a developer can't connect their own model with our npm packages.** The system
  prompt that teaches a model Omni-IR is built by `server/prompt.ts`, which isn't published. Today
  they'd have to clone the repository or copy a prompt by hand.
- The LinkedIn post went out today: new visitors should find a path that works.

## How it fits

- Distribution work, not a new protocol step, so it fits the pause on new steps (cost-benefit item 1).
- It's the "migration path, not a rewrite" idea: add one AI screen to an app you already have.
- Reuses what is built: the parser, the React renderer, the tool registry, the prompt generator.

## Who benefits

- **Developers** arriving from the post or the landing page: a working screen, not a reading list.
- **The project:** a visitor who gets something running is far more likely to star, ask or come back.

## The example, walked end to end

A developer has a React app and wants an AI-written order screen with a "Request a return" button.

1. **Install:** `npm install @omni-ir/core @omni-ir/react zod`.
2. **See a screen without a model** (2 minutes): paste the guide's ready-made reply into
   `parser.write(...)` and render `<OmniRenderer>`. *They see:* an order card with a disabled "Request
   a return" button, and the guide says why it's disabled (no tool registered yet).
3. **Allow the action:** register `orders.requestReturn` with a schema for its params. *They see:* the
   button is enabled; clicking it calls their `onMutation`, which logs the tool and params.
4. **Connect a model:** on their server, `buildSystemPrompt({ tools })` from `@omni-ir/core` (new),
   send it with the user's request to their own model (Claude, OpenAI or any other; their key, their
   bill), and stream the reply text to the browser. *They see:* "Where is my order?" becomes a screen
   that draws line by line as it streams.
5. **Check the action on the server:** the same tool schema checks the params again, and their handler
   checks the person may do it. *They see:* a returned result message on the screen.
6. **Next steps:** links to other platforms (any web framework, iPhone, Android), their own components,
   live screens and themes.

What the model writes in step 4 is ordinary Omni-IR (`root = Card([...])`, `ret = Button("Request a
return", action="return")`, `retM = McpMutation(ret, tool="orders.requestReturn", params={...})`); what
the app sends to the model is the generated prompt plus the request; what the person sees is the card.

No phone test: this changes the web guide and a core export. iPhone and Android get the same prompt
through their own servers; their guides are linked, not rewritten.

## Decisions: pros, cons and trade-offs

### 1. Publish the prompt builder in `@omni-ir/core`

Move `buildSystemPrompt` from `server/prompt.ts` into `@omni-ir/core` with no file access and no demo
defaults: the app passes its own tools, pictures, components and live parts. The reference server
calls it with the demo app's registries.

- **Pros:** anyone can connect any model in a few lines; the prompt can never describe something the
  parser rejects, because it's built from the same schema; one source for server, guide and docs.
- **Cons:** a new public function to keep stable; needs a release (0.15.0), so the guide's step 4 only
  works after it (with the owner's separate go-ahead to release).
- **Alternatives:** a static `prompt.txt` on the site (no release, but it can't include the app's own
  tools, which is the point of step 3); or `buildGuide` from `@omni-ir/mcp` (a short guide for MCP
  hosts, not tuned for a model writing whole screens).
- **Trade-off:** a release for a much shorter path. The demo server's prompt must stay byte-for-byte
  the same (a test checks it), so no model check is needed: the prompt doesn't change.
- **Recommendation:** publish it.

### 2. Where the guide lives

- **Option A (recommended):** rewrite `site/docs/guide/getting-started.md` as the numbered steps above,
  and move today's "format in one minute" and per-platform fragments to "How it works" and the
  platform pages. *Pros:* same link, no new navigation, the docs' search and sidebar. *Cons:* still on
  the docs site, which the owner described as documentation; the page's style must make the steps
  obvious (numbered, short, a "you should see" line after each).
- **Option B:** a separate quickstart page on the landing site. *Pros:* designed like the landing page.
  *Cons:* a second place to keep code in step with the docs; no search.
- **Recommendation:** A, with a clear step layout.

### 3. The landing page's buttons

- Hero: **Try the playground** and **Get started** (replacing "Read the spec"; the spec stays in the
  top bar and footer). The two lower "Get started" buttons go to the new guide.
- **Pros:** both hero buttons lead somewhere a builder can act. **Cons:** the spec is less prominent
  for people writing their own parser; they're few, and it's one click away.
- **Recommendation:** change it.

### 4. React only, or every platform

- React first (the largest group), with one short section for `<omni-screen>` (any web framework)
  and links for iPhone and Android.
- **Pros:** one path that's fully tested; done in a day. **Cons:** native developers get links, not
  steps. **Recommendation:** React first; native steps later if people ask.

## Checks (per the working rules)

- The guide's code is tested: a test runs steps 2–5 with a fake model client and checks what a person
  would see (the card, the enabled button, the call to `onMutation`, the server's check).
- The demo server's system prompt is unchanged (snapshot test), so no model-check page run is due.
- I read every sentence of the guide and look at it in the browser at desktop and phone width before
  showing you.
- `npm run pack:check` and `npm run install:test` with the new export.

## Cost and risk

- Free: no paid API, no new dependency.
- **Risk: the guide drifts from the packages.** The tested snippet catches it.
- **Risk: step 4 before the release.** The guide goes live with the release, not before.

## Checklist

- [ ] A.1 `buildSystemPrompt` in `@omni-ir/core`, tests first; the server uses it, prompt unchanged
- [ ] A.2 The guide rewritten as steps 1–6, its code tested with a fake model
- [ ] A.3 Landing page buttons: "Get started" in the hero
- [ ] B.1 I check the guide and the landing page in the browser before showing you
- [ ] B.2 Your review, then merge with your approval
- [ ] B.3 Release 0.15.0 with your separate go-ahead (the guide's step 4 needs it)
