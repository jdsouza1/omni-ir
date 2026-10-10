// The docs site (Step 12, C). `npm run docs:build` assembles the pages into .docs/ (scripts/docs.ts:
// the hand-written pages in site/docs plus pages generated from SPEC.md and the READMEs) and builds
// them into dist/site/docs. The site is served from OMNI_SITE_BASE (GitHub Pages: /omni-ir/).
import { resolve } from "node:path";
import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

const site = process.env.OMNI_SITE_BASE ?? "/omni-ir/";

export default withMermaid(
  defineConfig({
    title: "Omni-IR",
    description: "An open standard for generative UI: models write flat lines of intent, apps render them with trusted components.",
    base: `${site}docs/`,
    outDir: resolve("dist/site/docs"),
    cleanUrls: false,
    // Local addresses in setup instructions (the playground on :5173) are not pages.
    ignoreDeadLinks: "localhostLinks",
    lastUpdated: false,
    head: [["meta", { name: "theme-color", content: "#4f46e5" }]],
    themeConfig: {
      nav: [
        { text: "Guide", link: "/guide/getting-started" },
        { text: "Spec", link: "/spec" },
        { text: "Components", link: "/reference/components" },
        { text: "Playground", link: `${site}playground/`, target: "_self" },
      ],
      sidebar: [
        {
          text: "Guide",
          items: [
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "How it works", link: "/guide/how-it-works" },
            { text: "Web (React)", link: "/guide/react" },
            { text: "The core package", link: "/guide/core" },
            { text: "iPhone, iPad and Mac", link: "/guide/swift" },
            { text: "Android", link: "/guide/android" },
            { text: "Servers and transports", link: "/guide/transport" },
            { text: "Use with AG-UI", link: "/guide/ag-ui" },
            { text: "In Claude and ChatGPT (MCP Apps)", link: "/guide/mcp" },
            { text: "Running real actions", link: "/guide/actions" },
            { text: "Forms and confirmations", link: "/guide/forms" },
            { text: "Your own components", link: "/guide/app-components" },
            { text: "Themes and wording", link: "/guide/themes" },
            { text: "Checking the model", link: "/guide/model-check" },
          ],
        },
        {
          text: "Reference",
          items: [
            { text: "Specification", link: "/spec" },
            { text: "Components", link: "/reference/components" },
            { text: "Conformance suite", link: "/conformance" },
            { text: "Changelog", link: "/changelog" },
          ],
        },
        {
          text: "Project",
          items: [
            { text: "Roadmap", link: "/project/roadmap" },
            { text: "Comparison with other formats", link: "/project/comparison" },
            { text: "Contributing", link: "/project/contributing" },
            { text: "Governance", link: "/project/governance" },
            { text: "Code of conduct", link: "/project/code-of-conduct" },
            { text: "Security", link: "/project/security" },
          ],
        },
      ],
      socialLinks: [{ icon: "github", link: "https://github.com/jdsouza1/omni-ir" }],
      search: { provider: "local" },
      editLink: { pattern: "https://github.com/jdsouza1/omni-ir/edit/main/:path", text: "Edit this page on GitHub" },
      footer: { message: "Released under the Apache-2.0 licence.", copyright: "Omni-IR contributors" },
    },
  }),
);
