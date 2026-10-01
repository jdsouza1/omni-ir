# Omni-IR — Step 5: npm packages

Goal: let other projects install Omni-IR: the protocol core (parser and schema) and the React catalog. These are the roadmap's "Publish Zod Validation Schemas" and "Launch React Catalog SDK". Publishing public packages on npm is free.

Status: **A–F DONE 2026-09-30; G (first release) waits for the owner's go-ahead.** The owner's npm account (`jdsouza1`, two-factor authentication on) and the free `omni-ir` organisation exist. Decided: names `@omni-ir/core` and `@omni-ir/react`; publish after Step 4 (new components); the owner creates the `omni-ir` npm organisation now to reserve the name. Nothing is published without the owner's explicit go-ahead.

## Proposed packages

| Package | Contents | Depends on |
|---|---|---|
| `@omni-ir/core` | Line buffer, tokenizer, parser, schema, store, issue codes, `describe` helpers. No React. | `zod` |
| `@omni-ir/react` | Trusted Catalog components, `omni.css`, `OmniRenderer`, McpMutationBoundary, browser helpers. | `@omni-ir/core`; `react` as a peer dependency |

The server, playground, fixtures and tests stay in the repo and aren't published. Both packages start at **0.1.0**, matching the spec.

## Facts that shape this
- **Name check (2026-09-30):** `@omni-ir/core`, `@omni-ir/react`, `omni-ir` and `omni-ir-react` are all unused on npm, and the `omni-ir` organisation appears to be free. Only creating it confirms that.
- **You're not signed in to npm on this machine.** Publishing needs an npm account with two-factor authentication.
- **Publishing is effectively permanent:** a version number can never be reused, and unpublishing is only allowed for 72 hours.

## Task checklist
- [x] **A. Workspaces:** move `engine/` into `packages/core` and `catalog/`, `renderer/` and `client/` into `packages/react`, using npm workspaces. Update imports; all tests stay green.
- [x] **B. Build:** compile each package to ES modules with type definitions; an `exports` map; `omni.css` exported for import; `files` lists only the build output, README and LICENSE.
- [x] **C. Package READMEs:** install, a minimal example, and links to SPEC.md.
- [x] **D. Contents check:** `npm pack --dry-run` in CI, failing if tests, fixtures or source maps with local paths would be published.
- [x] **E. Install test:** install the packed tarballs into a fresh Vite + React project and render a screen, in CI.
- [x] **F. Release workflow:** a GitHub Actions workflow that publishes when you push a version tag, using npm **trusted publishing**, so no npm token is stored anywhere.
- [ ] **G. First release, only with your go-ahead:** tag `v0.1.0` and publish.

## Decisions made while building (2026-09-30)
- **`react-dom` is not a peer dependency.** The package never imports it (rendering to the page is the app's job), so requiring it would only get in the way of other React renderers.
- **The first version of each package is published by hand.** npm trusted publishing can only be set up for a package that already exists, so the release workflow handles every release after the first.
- **Releases wait for an approval.** The workflow runs in a GitHub environment, `npm-publish`; with you as its required reviewer, nothing is published until you click Approve.
- **Dev needs no build.** Inside the repo, `@omni-ir/core` and `@omni-ir/react` resolve to the TypeScript source; only the published files come from `dist/`.
- **Checked as a user gets them:** the install test packs the tarballs, installs them in a fresh project, renders a screen in Node, type-checks the README example with TypeScript 5 (`nodenext` and `bundler`), and bundles with Vite. Packed sizes: core about 23 KB, react about 17 KB.

## G. First release: steps (only with your go-ahead)
1. Decide whether the npm account's email may be public (npm shows it in package metadata), and change it first if not.
2. On your machine: `npm login`, then `npm run build:packages && npm run pack:check`, then `npm publish --workspace packages/core` and `npm publish --workspace packages/react` (each asks for your security key).
3. On npmjs.com, for each package: Settings → Trusted Publisher → GitHub Actions: user `jdsouza1`, repository `omni-ir`, workflow `release.yml`, environment `npm-publish`. Then set "Publishing access" to require two-factor authentication and disallow tokens.
4. On GitHub: Settings → Environments → `npm-publish` → add yourself as a required reviewer.
5. Later releases: bump both versions, commit, push a `v<version>` tag, approve the run.

## What I needed from you (answered)
1. **Names:** `@omni-ir/core` and `@omni-ir/react` (recommended: a scoped organisation keeps future packages such as `@omni-ir/swift-tools` together), or unscoped `omni-ir` and `omni-ir-react`?
2. **An npm account**, with the `omni-ir` organisation created (free for public packages). When the workflow exists, you'd add GitHub `jdsouza1/omni-ir` as a trusted publisher in the npm settings; I'll give exact steps.
3. **When to publish:** now as 0.1.0 with the current components, or after Step 4 so the first release includes the new components? *(Recommended: after Step 4, but create the organisation now to reserve the name.)*
