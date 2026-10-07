// Builds the publishable packages into packages/*/dist: core first, because react's and mcp's type
// definitions import it. Each build starts from an empty dist/ so no stale files are published.
// mcp's view is bundled separately into dist/view.html (scripts/mcp-view.ts).
import { execSync } from "node:child_process";
import { copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";

for (const pkg of ["core", "react", "mcp"]) {
  const dir = join("packages", pkg);
  rmSync(join(dir, "dist"), { recursive: true, force: true });
  execSync(`npx tsc -p "${join(dir, "tsconfig.build.json")}"`, { stdio: "inherit" });
}
copyFileSync(join("packages", "react", "src", "catalog", "omni.css"), join("packages", "react", "dist", "omni.css"));
execSync("npx tsx scripts/mcp-view.ts", { stdio: "inherit" });
console.log("built packages/core/dist, packages/react/dist and packages/mcp/dist");
