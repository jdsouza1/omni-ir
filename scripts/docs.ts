// Assembles the docs site's pages into .docs/ (git-ignored) for VitePress: the hand-written pages
// in site/docs, plus pages generated from the repository's own Markdown, so the spec, the READMEs
// and the changelog are written once. Links between those files are rewritten to their docs pages;
// links to anything else in the repo point at GitHub.
//
//   npx tsx scripts/docs.ts      (run by npm run docs:build and docs:dev)
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const OUT = ".docs";
const REPO = "https://github.com/jdsouza1/omni-ir";

/** Repository Markdown and the docs page it becomes. */
export const PAGES: Record<string, string> = {
  "SPEC.md": "spec.md",
  "docs/ARCHITECTURE.md": "guide/how-it-works.md",
  "packages/react/README.md": "guide/react.md",
  "packages/core/README.md": "guide/core.md",
  "packages/mcp/README.md": "guide/mcp.md",
  "swift/README.md": "guide/swift.md",
  "android/README.md": "guide/android.md",
  "conformance/README.md": "conformance.md",
  "CHANGELOG.md": "changelog.md",
  "docs/ROADMAP.md": "project/roadmap.md",
  "docs/COMPARISON.md": "project/comparison.md",
  "CONTRIBUTING.md": "project/contributing.md",
  "GOVERNANCE.md": "project/governance.md",
  "CODE_OF_CONDUCT.md": "project/code-of-conduct.md",
  "SECURITY.md": "project/security.md",
};

/** A page's links: to a docs page when the target is one, otherwise to GitHub. */
export function rewriteLinks(markdown: string, source: string, dest: string): string {
  const pageBySource = new Map(Object.entries(PAGES));
  return markdown.replace(/\]\(([^)\s]+)\)/g, (whole, href: string) => {
    if (/^[a-z]+:|^#|^\//i.test(href)) return whole;
    const [path, anchor] = href.split("#", 2) as [string, string | undefined];
    const target = posix.normalize(posix.join(posix.dirname(source), path)).replace(/\/$/, "");
    const hash = anchor === undefined ? "" : `#${anchor}`;
    const page = pageBySource.get(target);
    if (page !== undefined) {
      let rel = posix.relative(posix.dirname(dest), page);
      if (!rel.startsWith(".")) rel = `./${rel}`;
      return `](${rel}${hash})`;
    }
    const kind = existsSync(target) && statSync(target).isDirectory() ? "tree" : "blob";
    return `](${REPO}/${kind}/main/${target}${hash})`;
  });
}

/** The Components page: SPEC.md section 6, the catalog generated from the schema. */
export function componentsPage(spec: string): string {
  const start = spec.indexOf("## 6. Component catalog");
  const end = spec.indexOf("\n## 7.", start);
  if (start < 0 || end < 0) throw new Error("SPEC.md section 6 not found");
  const section = spec.slice(start, end).replace(/^## 6\. Component catalog[^\n]*\n/, "");
  return `# Components\n\nEvery component a stream may use, with its arguments and the values each prop accepts. This page is section 6 of the [specification](../spec.md), generated from the schema.\n${section}`;
}

export function buildDocs(): void {
  rmSync(OUT, { recursive: true, force: true });
  cpSync("site/docs", OUT, { recursive: true });
  for (const [source, dest] of Object.entries(PAGES)) {
    write(dest, rewriteLinks(readFileSync(source, "utf8"), source, dest));
  }
  write("reference/components.md", rewriteLinks(componentsPage(readFileSync("SPEC.md", "utf8")), "SPEC.md", "reference/components.md"));
}

function write(dest: string, text: string): void {
  const path = resolve(OUT, dest);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  buildDocs();
  console.log(`wrote ${OUT}/ (${Object.keys(PAGES).length + 1} generated pages)`);
}
