# Omni-IR: a product demo video

Status: **Approved 2026-10-10 with the recommendations; the story restructured as a Golden Circle at the owner's request. In progress.** Free: recorded and edited on GitHub's CI with the free mock
model; no paid API, no paid tools, no music to license. Nothing here is built until you approve it.
This is not a protocol step (no Step 23): it shows what is already built.

## Goal

A short video, about 60–75 seconds, that shows in one story why Omni-IR is different: an AI asks for a
screen, it appears natively on iPhone, Android and the web, the app keeps it current, every action is
checked, and the AI can't do what the app doesn't allow. Anyone who watches it should be able to say
what Omni-IR is.

## How it fits

- **The problem it addresses:** the 2026-10-10 analysis found that almost nobody knows Omni-IR exists
  (3 unique repo visitors in 14 days). Everything a first project needs is built; what's missing is a way
  to show it quickly.
- **It works with the next steps:** a link to it goes in the landing page and README, and it can be shown
  in the interviews (at the end, only if asked, as the script says).
- **It builds on what exists:** the iOS and Android demo workflows already record the simulator and the
  emulator; the live order, the return and the free mock model are all in place.

## Who benefits

- **Developers** see in a minute what would take ten minutes in the playground, and on all three
  platforms at once.
- **People deciding whether to adopt it** (product, security, the five people you'll write to) see the
  trust story, "the AI can ask, your app decides", without reading the spec.
- **You** get a link to share that can be rebuilt automatically whenever the product changes.

## The story, scene by scene (the example walked end to end)

Told as a Golden Circle (owner's request, 2026-10-10): **why** first (what we believe), then **how** (what
makes it work), then **what** (the product). Each scene says what the AI writes, what the app does, and
what the person sees. The AI's part is the free mock model streaming pre-written screens, as the
playground does.

| Ring | # | Time | What the person sees | What happens underneath | Caption (large, plain) |
|---|---|---|---|---|---|
| **Why** | 1 | 0:00–0:09 | Three plain title cards, one after another | — | **AI can now design the screens in your app.** · **But should it be trusted to run your app?** · **We believe the AI should describe. Your app should decide.** |
| **How** | 2 | 0:09–0:13 | A card with the few lines the AI writes, appearing one by one | The order screen's Omni-IR, from the fixture: `order_status = Badge("Shipped")`… | **The AI describes the screen in a few plain lines.** |
| **How** | 3 | 0:13–0:25 | "Where is my order?": the screen streams in on an iPhone, an Android phone and a browser, side by side | Each platform's own renderer checks every line and draws it with native components | **Each platform draws it with its own components.** |
| **How** | 4 | 0:25–0:35 | The status changes on all three: "Out for delivery", then "Delivered" | The server's live feed sends the new status; each client checks it before applying it | **Your app keeps it current. The AI never touches it again.** |
| **How** | 5 | 0:35–0:43 | On the iPhone, "Request a return" is pressed; it becomes "Return requested. We'll email you a label." | The press goes to the app's server, which checks the person, the order and the params first; its result replaces the Button | **Every action is checked by your server first.** |
| **How** | 6 | 0:43–0:51 | "A button that deletes my account": it appears, greyed out; pressing it does nothing | The AI named a tool the app never registered; that line is rejected, so the button has no permission to act | **The AI can ask. Your app decides.** |
| **What** | 7 | 0:51–1:00 | End card | — | **Omni-IR** · **Generative UI you can trust.** · *Open source · iPhone · Android · Web* · the site address |

A small line in the corner throughout the screen scenes: *Demo with pre-written screens; no AI model was called.*

## Decisions: pros, cons and trade-offs

**1. One story, told as a Golden Circle (why, how, what), not a feature tour** (recommended; the Golden Circle was the owner's choice).
- *Pros:* easy to follow and remember; every scene supports one claim (trust and native); it's how good product demos work.
- *Cons:* leaves out charts, forms, app components and `<omni-screen>`.
- *Alternative:* a fast tour of every feature (shows breadth, but nothing sticks).
- *Trade-off:* depth over breadth; the docs and playground cover the rest.

**2. The free mock model, disclosed** (recommended).
- *Pros:* free, the same every time, and honest with the corner note; the cost rule allows nothing else by default.
- *Cons:* not a live AI; a sceptic may want to see a real model.
- *Alternative:* record a real model (costs money, needs your go-ahead, and replies vary between takes); or hide that it's pre-written (misleading: no).
- *Trade-off:* honesty and repeatability now; a real-model take later, with your go-ahead, if interviews ask for it.

**3. Recorded and edited automatically on CI** (recommended).
- *Pros:* free (public repo); rebuilt with one click when the product changes; uses the same simulator and emulator recordings the demo workflows already make; ffmpeg joins the clips and adds the captions.
- *Cons:* plainer than a hand-edited video (no smooth zooms, no music); timing the three platforms takes some tuning.
- *Alternative:* you record your screen and edit by hand (polished, but slow to redo); or a paid editing tool or agency (costs money).
- *Trade-off:* a good, honest, repeatable video now; a human editor can polish these same clips for a launch later.

**4. Captions, no voiceover** (recommended).
- *Pros:* plays silently (most people watch muted); easy to change the words; accessible, with a written transcript beside it.
- *Cons:* less personal than a voice.
- *Alternative:* a synthetic voice (sounds cheap) or your own voice (good, but redone with every change).
- *Trade-off:* clarity and easy updates over warmth; your voice can come later.

**5. Three platforms side by side for scenes 2 and 3, then the iPhone** (recommended).
- *Pros:* shows "one stream, native everywhere" in a single frame, the clearest difference from rivals.
- *Cons:* each phone is smaller on screen.
- *Alternative:* one platform at a time (bigger, but loses the point).
- *Trade-off:* the comparison is the message.

**6. Hosted on the site, with a GIF for the README** (recommended).
- *Pros:* no accounts needed; the landing page plays it from the same site; the README shows a short GIF linking to it.
- *Cons:* not on YouTube or social media, where people search.
- *Alternative:* YouTube, LinkedIn or X (need your accounts; you can upload the same file whenever you like).
- *Trade-off:* ship it where we control it now; you post it on your channels.

## What it needs

- **A new pre-written screen** for scene 5: a settings screen whose delete button names a tool the app
  doesn't have (like the existing "unknown tool" demo), and a mock-model prompt for it ("delete my account").
- **A recording mode in each demo app** that plays the scenes in order on a fixed timeline: the iOS and
  Android demos already read their prompt from launch arguments; they need a way to run several in turn.
- **A web recording** of the same scenes in headless Chrome, using its built-in screencast (no new
  dependency).
- **A `video` workflow** (run by hand from the Actions tab): records on the iPhone simulator, the Android
  emulator and headless Chrome, then joins the clips side by side with ffmpeg and adds the captions and the
  corner note. Uploads the MP4, a 15-second cut and a GIF.
- **The landing page and README:** a demo section with the video (muted, with controls, a poster image,
  and a written transcript), and the GIF in the README.

## Checks (per the working rules)

- **The evidence is checked before it's shown:** I'll look at frames from every scene (each status, the
  greyed-out button, every caption) before anything is published, and you review the video before it
  goes on the site.
- **The tests:** the new screen gets a test that its delete button stays disabled; the phones' UI tests
  already cover the order, the live updates and the return.
- **Accessibility:** captions are burned in, the transcript is on the page, the video never plays sound
  by itself, and people who prefer reduced motion see the poster image first.

## Cost and risk

- **Cost:** free (public-repo CI and the mock model). About a day of work, most of it the recording
  workflow and the timing.
- **Risk: three platforms out of step on screen.** Each recording follows the same fixed timeline from
  launch; scenes are cut to their caption times, so small differences don't show.
- **Risk: looks like a real AI when it isn't.** The corner note says so throughout, and the transcript
  repeats it.

## Checklist

- [ ] A.1 The "delete my account" screen and its mock prompt, with a test that the button stays disabled
- [ ] A.2 A recording mode in the iOS and Android demo apps, and the web recording in headless Chrome
- [ ] B.1 The `video` workflow: record, join side by side, captions and corner note, MP4 + 15-second cut + GIF
- [ ] B.2 I check frames from every scene before showing you
- [ ] C.1 Your review of the video
- [ ] C.2 The landing page demo section and the README GIF, after your approval
- [ ] C.3 Merge with your approval (no release needed: the site deploys from main)
