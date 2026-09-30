# Omni-IR — Step 2: Interactive Playground

Goal: the page behind the landing page's "Try the playground". Type a prompt (or paste Omni-IR), watch the Omni-IR lines stream in next to the live rendered screen, hover a line to see what it builds, click buttons and see what the server did. **Costs nothing:** it runs locally against the mock-model server.

Status: **Tasks A–F APPROVED 2026-09-30** with temporary styling (simple two-panel layout, landing-page indigo accent). **Task G waits for the UX design.** Rendered screens keep the catalog's neutral look for now (D3 decided).

## What stays fixed regardless of the design

### P1. Build and serving
- **Vite** (already installed with Vitest) serves the React page from `playground/`, free and local. The Express app runs **inside** the Vite dev server for `/api/*`: one command, one origin, no CORS, no proxy.
- `npm run playground` starts it (mock model, no API key needed). `npm run playground:build` produces static files that Express can serve from the same origin later.
- The raw-HTML guard and typecheck cover `playground/` too.

### P2. What the page can do
- **Prompt mode:** type a prompt → `generate()` streams from `/api/generate` → parser → `OmniRenderer`. Example prompts as one-click chips, including the `demo:` failure cases.
- **Paste mode:** paste or edit Omni-IR directly and re-render it (the free prompt check from Step 1, in the browser instead of the terminal).
- **Source view:** the Omni-IR text, line by line with line numbers, growing as it streams. Lines with parse errors or warnings are marked, with the message.
- **Hover a line ↔ highlight what it builds** in the preview, and the reverse (hover a component → its line). This needs every catalog component's root element to carry `data-node-id` (today only Button does), a small catalog change.
- **Status:** idle → streaming → done / cut off / error / cancelled, with a Cancel button while streaming and a retry for retryable errors.
- **Actions panel:** governed button clicks go to `/api/mutate` through `createMutationHandler()`; the stub result (receipt id, etc.) or the server's refusal is shown.
- **Event log (collapsible):** parser events (node, pending, resolved, warning, error) with timings, the same stream the demo prints.

### P3. Security (unchanged rules)
- Model text is only ever rendered by `OmniRenderer` (catalog components) or as React text in the source view; no `innerHTML` anywhere, enforced by the guard.
- The playground page's own styling is separate from `catalog/omni.css`. The stream still can't style anything.

### P4. Accessibility
- Keyboard-reachable controls with visible focus; `aria-live` status for streaming progress and errors; the source ↔ preview highlight also works with keyboard focus, not only hover; readable at 400 px width (panels stack).

### P5. Testing (all free, no network)
- Component tests (jsdom) for the playground state machine, source view (line numbers, error markers, streaming growth), the hover/focus mapping, paste mode, the actions panel.
- End-to-end in-process tests like Step 1's: page → Express → MockModel.
- A manual check in the Claude app's built-in browser at desktop and phone widths, plus light and dark.

## Waiting on the design
- **D1. Layout:** panel arrangement (source | preview side by side, as on the landing page's example card?), where the prompt box, chips, status, actions and log go, and the phone layout.
- **D2. Visual style:** colours, fonts, spacing, radii; light/dark.
- **D3. Rendered screens:** decided: keep the catalog's neutral look for now; revisit with the design.
- **D4. Interactions and states:** empty state, streaming animation, error and cut-off states, anything else the design specifies.

## Task checklist (refined once the design arrives)
- [x] A. Vite + React setup, `/api` proxy, `npm run playground`, guard/typecheck coverage
- [ ] B. `data-node-id` on every catalog component root (+ test)
- [ ] C. Playground state (prompt/paste modes, streaming status, cancel/retry) with tests
- [ ] D. Source view with line numbers, streaming growth and error markers, with tests
- [ ] E. Source ↔ preview highlighting (hover and keyboard focus), with tests
- [ ] F. Actions panel and event log, with tests
- [ ] G. Apply the design (layout, styles, phone layout, light/dark)
- [ ] H. End-to-end tests + manual check in the built-in browser; update CLAUDE.md
