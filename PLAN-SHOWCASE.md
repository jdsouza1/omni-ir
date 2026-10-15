# Omni-IR: a "Built with Omni-IR" showcase page

Status: **Approved 2026-10-15 with the recommendations (all five decisions).** Not a protocol step: nothing in the format changes.
Free: committed screenshots and streams, no paid API, no model called.

## Goal

A visitor who clicks **Showcase** on the landing page sees real apps built with Omni-IR, on the
devices they run on, and in a minute understands what the format is good for: one stream, drawn
natively on the web, iPhone and Android. Each app shows what it is, where it runs, a few of the lines
the model wrote, and which parts of Omni-IR it uses, so a developer can tell whether their own app
would fit.

**Written for someone who has never seen code,** like the comparison page: each entry opens with a
plain sentence about what the app does; the stream is shown on request, behind a tap.

## Why now

- The owner's request (2026-10-15): a page that shows what has been built with Omni-IR, starting with
  what exists, and that grows as more apps are made.
- The landing page shows single screens in its example tabs. Nothing yet shows a whole app on all
  three platforms, which is the format's main promise.
- The material exists: the iOS and Android demo apps (screenshots from their UI tests), the
  playground, `<omni-screen>` in four frameworks, the MCP view in Claude desktop, and the demo video.

## How it fits

- Distribution work, like the comparison page (PLAN-COMPARE-PAGE.md) and the demo video
  (PLAN-VIDEO.md).
- Lives beside the comparison page: `site/landing/showcase/`, a third Vite input, linked from the
  landing page's navigation and footer.
- Entries are data, not page code: `site/landing/showcase/apps.json`, one entry per app, so adding an
  app is one entry and a few images.

## Who benefits

- **Developers deciding whether to try Omni-IR:** a quick answer to "what can I build with it?",
  including what each app needed beyond the catalog.
- **Non-technical visitors:** pictures of real apps on real phones, not code.
- **People who build with Omni-IR:** a place to be listed (by opening a Discussion), which is also how
  the project learns what people make.

## The page, walked end to end

Sam clicks **Showcase** on the landing page.

1. **The opening line:** "Apps built with Omni-IR. Each one is a single stream from the model, drawn
   natively on every platform it runs on." Below it, a row of filters: Web, iPhone, Android, Inside an
   AI chat.
2. **The first entry: the demo shop.** A plain sentence: "A small shop with a product page, a cart,
   order tracking, a sales dashboard and a support form." Three screenshots side by side (web,
   iPhone, Android; on a phone, one at a time with tabs) of the same product screen. Under them, chips
   for what the app uses across its screens: *Catalog: Card, Heading, Button, Table, BarChart · App
   components: ProductCard, QuantityPicker · Live updates · McpMutation for every action*.
3. **"See what the model wrote"** opens the lines behind the product screen, from
   `fixtures/product.omni`:
   ```
   root = Card([title, card, qty])
   title = Heading("Canvas tote", level=1)
   card = ProductCard("Canvas tote", [add, later], price=24, currency="USD", picture="product-1042", rating=4.5, badges=["Organic cotton"])
   $qty = 1
   qty = QuantityPicker($qty, label="How many", min=1, max=5, required=true)
   add = Button("Add to bag", action="addToBag")
   addToBag = McpMutation(add, tool="cart.add", params={productId: "1042", quantity: $qty})
   later = Button("Save for later", variant="secondary")
   ```
   and the real renderer draws them beside the text, as the comparison page does.
4. **Further entries,** each in the same shape: the playground (web), `<omni-screen>` in plain HTML,
   Vue, Svelte and Angular (web), and the MCP view inside Claude desktop (inside an AI chat). The demo
   video sits at the top as an optional "Watch it run" link.
5. **"Built something with Omni-IR?"** at the end links to a Discussion category for showcase
   submissions, with what to include (a name, a sentence, screenshots, and permission to show them).

What the AI writes doesn't change. What the page sends anywhere: nothing (static, data built in).
What Sam sees: apps on devices, what each uses, and the stream on request.

## Rules for entries

- **Every stream on the page is checked at build time** with the real parser, with the registries the
  app declares (tools, assets, components, pictures), as the landing page's example tabs are. A stream
  that doesn't parse fails the build.
- **Screenshots come from automated runs,** not hand-edited images: the iOS and Android demo UI tests
  (`ios-demo.yml`, `android-demo.yml`) and headless Chrome for the web, the same sources as the video.
  Each image is resized and compressed; the page's images stay under a budget (decision 4).
- **An entry from anyone else is added only with their written permission,** given in the Discussion,
  and says only what the app is and what it uses. No prices, timelines or engagement details: those
  are never written in this repository (CLAUDE.md, Open core).
- **The words are checked before review:** every sentence on the page is read as a visitor would, and
  every screenshot is looked at, per the working rules.

## Decisions: pros, cons and trade-offs

### 1. Where it lives
- **A. A page beside the comparison page, `site/landing/showcase/` (recommended).** Same build, same
  styles, same layout check. Con: one more page to keep current.
- B. A section on the landing page. Shorter path for visitors, but the landing page is already long,
  and a growing list doesn't belong there.
- C. A docs page in VitePress. Easy to write, but the docs look like docs, and screenshots side by side
  need the landing page's layout.

### 2. What the first version shows
- **A. Only what exists today: the demo shop on three platforms, the playground, the four framework
  examples, and the MCP view (recommended).** Honest, and enough to launch.
- B. Wait until there are outside apps. Nothing to show for a while, and the page is most useful now.

### 3. How screenshots are made
- **A. From the existing UI tests and headless Chrome, committed as images, refreshed by a script
  (recommended).** Repeatable; the images match the apps. Con: phone screenshots need a CI run (the
  workflows already upload them), then a commit.
- B. Taken by hand. Faster once, but they drift from the apps and can't be checked.

### 4. Image budget
- **A. WebP, 720 px wide for phones and 1200 px for the web, at most 1.5 MB for the whole page
  (recommended),** checked by a test.
- B. No budget. Simpler, but a slow page on phones, where most visitors read it.

### 5. Submissions from others
- **A. A Discussion category, "Showcase", with a template; the owner adds accepted entries by hand
  (recommended).** Permission is written down where everyone can see it.
- B. Pull requests to `apps.json`. Faster for developers, but permission and images are harder to
  check in a PR.

## Checklist

1. `site/landing/showcase/` (index.html, main.tsx, Showcase.tsx, showcase.css) and the third Vite
   input; Showcase in the landing page's navigation and footer.
2. `site/landing/showcase/apps.json` and its type; a build-time check that parses every stream with
   the app's registries (as `fixtures/landing/` is checked).
3. `scripts/showcase-shots.ts`: take the web screenshots in headless Chrome or Edge and convert the
   phone screenshots from the `ios-review` and `android-review` artifacts; images into
   `site/landing/public/showcase/`.
4. The demo UI tests already capture the shop's screens; add any screen the page shows that they
   don't (the **phone test** for this step: the iOS and Android demo UI tests must produce every phone
   screenshot the page uses).
5. Tests: `apps.json` entries are complete, every image exists and the page's images are within
   budget, every stream parses; `npm run layout:check` covers the new page at 360, 412, 768 and 1280 px.
6. The Showcase Discussion category and its template (the owner creates the category).
7. Review page for the owner: the page at phone and desktop widths, light and dark, every screenshot
   looked at and every sentence read before it's shown.
8. On a `wip/**` branch; merged at the owner's go-ahead; deployed by `site.yml`.
