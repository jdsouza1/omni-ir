# Omni-IR — Step 12: open to outsiders

Goal: let someone who has never heard of Omni-IR find it, try it in a browser in under a minute, read how to use it, and know how to contribute. Today the playground runs only on a developer's machine, there is no docs site, the landing page is a private-by-default artifact whose Docs, Get started, Join the community and Governance links lead nowhere, and the repository has no contributor or governance documents. Everything in this step is free.

Status: **APPROVED 2026-10-05** with the recommendations: GitHub Pages at `jdsouza1.github.io/omni-ir`; VitePress; GitHub Discussions; the owner as maintainer with public spec proposals; security and conduct reports through private GitHub channels; the hosted playground on the mock model only; the landing page artifact kept until the site is live; the repository description, homepage and topics updated when going public.

## Proposal

One public website, built from this repository by a GitHub Actions workflow and served free by GitHub Pages:

| Path | What | Built from |
|---|---|---|
| `/` | The landing page | the approved landing page (v6), moved into the repo as `site/` |
| `/playground/` | The Interactive Playground | `playground/`, with the mock model running in the browser |
| `/docs/` | The docs site | SPEC.md, the READMEs, a new getting-started guide, the catalog reference generated from the schema |

**The playground without a server.** The playground already takes its `fetch` as a dependency (`usePlayground.ts`). The hosted build passes one that answers `/api/generate` and `/api/mutate` in the browser with the same mock model routes, fixtures and tool checks the Express server uses. No API key, no server, no cost, and the same `demo: …` failure cases. The local `npm run playground` is unchanged.

**Contributor and governance documents:** CONTRIBUTING.md (setup, the test-first rule, how conformance cases and plans work), GOVERNANCE.md (how the spec changes and who decides), CODE_OF_CONDUCT.md, SECURITY.md (how to report a vulnerability privately), and issue and pull request templates (bug, spec proposal, new component).

**Nothing goes public until you approve it.** The site is built on every push as a downloadable CI artifact and reviewed on a preview; GitHub Pages and Discussions are switched on only after your review and go-ahead.

## Facts that shape this

- **GitHub Pages is free for public repositories** and needs no new account: the site would be at `https://jdsouza1.github.io/omni-ir/`. A custom domain can be added later (it costs a yearly fee, so only with your go-ahead).
- **The landing page lives only as an artifact** today. Its HTML and its example tabs (`npm run landing:examples`) come into the repo so the site is built and tested like everything else.
- **Placeholder links:** you asked to leave the landing page's Docs, Get started, Join the community and Governance links alone. This step changes them, and only once their pages exist and you've approved this plan.
- **No business material:** the site, docs and templates describe the open standard only (open-core rule in CLAUDE.md).
- **Contact addresses:** a code of conduct and a security policy need a way to reach the maintainer privately. Your personal email must not be published (question 5).
- **Tests:** the in-browser API gets the same route and mutation tests as the server; the site build, its internal links and the hosted playground (no requests leave the page) are checked in CI.
- **Cost: free.** GitHub Pages, GitHub Actions on a public repo, the mock model.

## Questions for you (with recommendations)

1. **Hosting:**
   - *Recommended:* GitHub Pages at `jdsouza1.github.io/omni-ir`. Free, deployed by a workflow from `main`.
   - A custom domain (for example `omni-ir.dev`) can be added later; it costs a yearly fee.
2. **Docs tool:**
   - *Recommended:* VitePress. It turns the existing Markdown into a searchable site, uses Vite (already in the repo), and is free and widely used.
   - The alternative is a small page generator written here: no new dependency, but no search and more upkeep.
3. **Community:**
   - *Recommended:* GitHub Discussions on the repository. Free, no new account, and conversations stay next to the code and the spec. A Discord can come later if people ask for chat.
4. **Governance:**
   - *Recommended:* the owner is the maintainer and decides; spec changes are proposed in public as issues using a "spec proposal" template, with the reasoning recorded. The document says how this grows into a group of maintainers once there are regular contributors.
   - The alternative is a steering group now, which needs people who don't exist yet.
5. **Private contact for conduct and security reports:**
   - *Recommended:* security reports through GitHub's private vulnerability reporting (free, no email shown). Conduct reports also through a private GitHub channel for now, with a project email address added later if you create one.
   - Or you give me a project email address to publish (not your personal one).
6. **The hosted playground:**
   - *Recommended:* the mock model only. It can never call a paid API, and it shows the format, streaming, errors and governance as well as a real model does for a demo.
7. **The landing page artifact after the move:**
   - *Recommended:* keep it, with its links pointing to the public site, until the site is live; then it can be retired.
8. **Repository details** (when going public): the description still says "v0.1 draft".
   - *Recommended:* "An open standard for generative UI: AI models write flat Omni-IR lines, apps render them with their own trusted components (v0.3 draft)", the homepage set to the site, and topics such as `generative-ui`, `llm`, `react`, `swiftui`, `jetpack-compose`, `mcp`.

## Task checklist

**A. Contributor and governance documents**
- [x] A.1 CONTRIBUTING.md, GOVERNANCE.md, CODE_OF_CONDUCT.md (Contributor Covenant) and SECURITY.md
- [x] A.2 Issue templates (bug, spec proposal, new component) and a pull request template that asks for tests and, for spec changes, conformance cases
- [x] A.3 README links to all of them

**B. The playground in the browser** *(tests first)*
- [ ] B.1 Failing tests: the in-browser API answers generate and mutate like the server (routes, `demo: …` variants, tool checks, rejected mutations)
- [ ] B.2 The in-browser API, sharing the server's mock routes, fixtures and tool checks rather than copying them
- [ ] B.3 `npm run playground:static`: the playground built for `/playground/`, with a check that no request leaves the page

**C. Docs site**
- [ ] C.1 VitePress in `site/docs`: Getting started (web, iOS, Android), the spec, the catalog reference generated from the schema, conformance, the comparison, the roadmap and the changelog
- [ ] C.2 A test that the docs build, their internal links work, and the generated pages are current

**D. Landing page**
- [ ] D.1 The approved landing page moved into `site/` with its example tabs generated from `fixtures/landing/`
- [ ] D.2 Its Docs, Get started, Join the community and Governance links pointed at the new pages, and a link to try the playground

**E. Build and review** *(checkpoint: you review)*
- [ ] E.1 A `site.yml` workflow that builds the whole site on every push and uploads it as a CI artifact (no deploy yet)
- [ ] E.2 A review of the built site in a preview: every page on desktop and phone, light and dark, the playground working end to end

**F. Going public, only with your go-ahead**
- [ ] F.1 Switch on GitHub Pages (deploy from `site.yml` on `main`) and GitHub Discussions; you click the settings, or approve me doing so
- [ ] F.2 Repository description, homepage and topics; private vulnerability reporting on
- [ ] F.3 The landing page artifact's links pointed at the live site; roadmap and README updated

## What I need from you

Answered 2026-10-05: "go with the recommendations for step 12".
