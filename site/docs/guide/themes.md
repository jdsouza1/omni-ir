# Themes and wording

The model says *what* a screen is. Your app decides how it looks and how the renderer itself speaks. Nothing here can be reached from the stream: there is no syntax for colours, fonts or the renderer's own words.

## Your brand: design tokens

The catalog draws with one short list of named settings: about 30 colours, a font and a corner radius, with light and dark defaults. On the web they are CSS variables. Set the ones you want on `.omni-root`:

```css
.omni-root {
  --omni-accent: #e5195f;       /* primary buttons, focus rings, an open tab, a switch that's on */
  --omni-on-accent: #ffffff;    /* text on the accent */
  --omni-font: "Inter", system-ui, sans-serif;
  --omni-radius: 6px;           /* controls; cards use 1.5×, pictures and notices 1.25× */
}
```

The full list, with both sets of defaults, is in `conformance/theme.json`. Among them:

| Token | What it colours |
|---|---|
| `surface`, `text`, `muted-text`, `label-text` | Cards and inputs, body text, secondary text, field labels |
| `border`, `input-border`, `divider` | Card edges, the edges of fields and switches, separators |
| `accent`, `on-accent`, `accent-soft` | Primary actions and their text; info notices |
| `success`, `warning`, `danger` (each with `-soft` and `-text`) | Notices, badges, danger buttons, rating stars |
| `chart1` … `chart8` | Chart series and slices, in order |

Your page's own background shows behind the screen; the catalog paints only its cards and controls.

**Keep it readable.** The defaults pass the accessibility contrast rules (WCAG AA: 4.5:1 for text, 3:1 for the edges of controls), and a test checks every pair. Your own colours are yours to check: `contrast(a, b)` and the list of pairs that matter, `CONTRAST_PAIRS`, are exported from `@omni-ir/react`.

## Dark mode on the web

```tsx
<OmniRenderer theme="system" … />   // "light" (the default), "dark", or follow the device
```

Light is the default so that nothing changes for apps already shipping. Choose `"system"` when your own page follows the device too, or `"dark"` on a dark page. Override dark values the same way, on `.omni-root[data-theme="dark"]`.

## iPhone and Android

The native catalogs look native: SwiftUI follows the system's light or dark mode and your app's accent colour (`.tint`), and Compose takes its colours from your app's `MaterialTheme`. Their few fixed colours (charts, notices, badges, rating stars) come from the same shared defaults as the web (`OmniPalette`), so the three platforms match. A theming setting of their own is planned for when apps ask for it.

## The renderer's own words

The renderer writes a few things itself: "Loading" for screen readers, "Component failed to load", "Rated 4.5 out of 5", "Choose a date", the notice that the app needs an update, and the sentence under a button whose action couldn't be sent. They're in English; replace any of them with your own:

```tsx
<OmniRenderer strings={{ loading: "Chargement", rating: "Noté {value} sur {max}" }} … />
```

```swift
OmniView(store: store, onMutation: send)
  .omniStrings(OmniStrings(loading: "Chargement", rating: "Noté {value} sur {max}"))
```

```kotlin
OmniView(store, onMutation = send, strings = OmniStrings(loading = "Chargement", rating = "Noté {value} sur {max}"))
```

Anything you leave out stays English. The keys are the same on all three platforms (`ENGLISH` in `@omni-ir/react` lists them).

**They're always plain text.** Markup isn't rendered, Markdown isn't formatted, and `{value}`-style placeholders are filled in one plain pass: no formatting function ever sees your wording, so a stray `%d` can't crash an app, and a value containing `{max}` isn't filled again. They're never sent to the model or the server.

## Blocked actions

When a press can't be sent, because its details fail the tool's checks, the person sees one plain sentence (your `blocked` wording, or "This can't be sent. Check the details and try again."). What exactly was wrong goes to your `onEvent` as `mutation_blocked`, for your logs or your own field-level help.
