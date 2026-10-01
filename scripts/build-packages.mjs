// Builds the publishable packages into packages/*/dist: core first, because react's type
// definitions import it. Each build starts from an empty dist/ so no stale files are published.
import { execSync } from "node:child_process";
import { copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";

for (const pkg of ["core", "react"]) {
  const dir = join("packages", pkg);
  rmSync(join(dir, "dist"), { recursive: true, force: true });
  execSync(`npx tsc -p "${join(dir, "tsconfig.build.json")}"`, { stdio: "inherit" });
}
copyFileSync(join("packages", "react", "src", "catalog", "omni.css"), join("packages", "react", "dist", "omni.css"));
console.log("built packages/core/dist and packages/react/dist");
