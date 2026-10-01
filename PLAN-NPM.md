# Omni-IR — Step 5: npm packages

Goal: let other projects install Omni-IR: the protocol core (parser and schema) and the React catalog. These are the roadmap's "Publish Zod Validation Schemas" and "Launch React Catalog SDK". Publishing public packages on npm is free.

Status: **DRAFT, awaiting decisions** (questions at the end). Nothing is published without your explicit go-ahead.

## Proposed packages

| Package | Contents | Depends on |
|---|---|---|
| `@omni-ir/core` | Line buffer, tokenizer, parser, schema, store, issue codes, `describe` helpers. No React. | `zod` |
| `@omni-ir/react` | Trusted Catalog components, `omni.css`, `OmniRenderer`, McpMutationBoundary, browser helpers. | `@omni-ir/core`; `react` and `react-dom` as peer dependencies |

The server, playground, fixtures and tests stay in the repo and aren't published. Both packages start at **0.1.0**, matching the spec.

## Facts that shape this
- **Name check (2026-10-01):** `@omni-ir/core`, `@omni-ir/react`, `omni-ir` and `omni-ir-react` are all unused on npm, and the `omni-ir` organisation appears to be free. Only creating it confirms that.
- **You're not signed in to npm on this machine.** Publishing needs an npm account with two-factor authentication.
- **Publishing is effectively permanent:** a version number can never be reused, and unpublishing is only allowed for 72 hours.

## Task checklist
- [ ] **A. Workspaces:** move `engine/` into `packages/core` and `catalog/`, `renderer/` and `client/` into `packages/react`, using npm workspaces. Update imports; all tests stay green.
- [ ] **B. Build:** compile each package to ES modules with type definitions; an `exports` map; `omni.css` exported for import; `files` lists only the build output, README and LICENSE.
- [ ] **C. Package READMEs:** install, a minimal example, and links to SPEC.md.
- [ ] **D. Contents check:** `npm pack --dry-run` in CI, failing if tests, fixtures or source maps with local paths would be published.
- [ ] **E. Install test:** install the packed tarballs into a fresh Vite + React project and render a screen, in CI.
- [ ] **F. Release workflow:** a GitHub Actions workflow that publishes when you push a version tag, using npm **trusted publishing**, so no npm token is stored anywhere.
- [ ] **G. First release, only with your go-ahead:** tag `v0.1.0` and publish.

## What I need from you
1. **Names:** `@omni-ir/core` and `@omni-ir/react` (recommended: a scoped organisation keeps future packages such as `@omni-ir/swift-tools` together), or unscoped `omni-ir` and `omni-ir-react`?
2. **An npm account**, with the `omni-ir` organisation created (free for public packages). When the workflow exists, you'd add GitHub `jdsouza1/omni-ir` as a trusted publisher in the npm settings; I'll give exact steps.
3. **When to publish:** now as 0.1.0 with the current components, or after Step 4 so the first release includes the new components? *(Recommended: after Step 4, but create the organisation now to reserve the name.)*
