# Examples: `<omni-screen>` in any web framework

Each folder is a small app that draws an Omni-IR screen with `@omni-ir/elements` and runs a governed action:

| Folder | Shows |
|---|---|
| `html/` | Plain HTML and one module script; an app component as a plain custom element |
| `vue/` | Vue 3, with an app component written in Vue (`defineCustomElement`) |
| `svelte/` | Svelte 5 |
| `angular/` | Angular 22 (zoneless, `CUSTOM_ELEMENTS_SCHEMA`) |

Run one with `npm install && npm run dev` inside its folder (Angular: `npm start`).

`npm run examples:test` (from the repository root, after `npm run build:packages`) installs the packed element into a copy of each, builds it, and opens it in headless Chrome or Edge with `?check`: the page draws its screen, presses its button and reports back. CI runs it on every push.
