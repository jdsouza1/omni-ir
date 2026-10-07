// Checks what `npm publish` would upload for each package, without uploading anything
// (`npm pack --dry-run`). Fails if anything but the build output, README, LICENSE and
// package.json would be published, if a source map or a local file path would leak, or if an
// `exports` target is missing. Run `npm run build:packages` first.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGES = ["core", "react", "mcp"];
const ALLOWED = [/^package\.json$/, /^README\.md$/, /^LICENSE$/, /^dist\/.+\.(js|d\.ts)$/, /^dist\/omni\.css$/, /^dist\/view\.html$/];
// Absolute paths from a developer machine or CI runner, plain or as file URLs (file:///…). A bare
// "file://" is fine: the MCP SDK's schemas check that a root's URI starts with it.
const LOCAL_PATH = /[A-Za-z]:[\\/](Users|home)[\\/]|\/(Users|home|runner)\/[\w.-]+\/|file:\/\/\/\w/;

const problems = [];
const manifests = {};

for (const pkg of PACKAGES) {
  const dir = join("packages", pkg);
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  manifests[pkg] = manifest;
  const [report] = JSON.parse(execSync(`npm pack --dry-run --json --workspace ${dir}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const files = report.files.map((f) => f.path.replaceAll("\\", "/"));
  const where = `${manifest.name}`;

  if (!files.some((f) => f.startsWith("dist/"))) problems.push(`${where}: no dist/ files; run npm run build:packages first`);
  for (const file of files) {
    if (!ALLOWED.some((re) => re.test(file))) problems.push(`${where}: would publish ${file}`);
    if (/\.(js|d\.ts|css|html)$/.test(file) && LOCAL_PATH.test(readFileSync(join(dir, file), "utf8"))) {
      problems.push(`${where}: ${file} contains a local file path`);
    }
  }
  for (const required of ["README.md", "LICENSE", "package.json"]) {
    if (!files.includes(required)) problems.push(`${where}: ${required} would not be published`);
  }
  for (const target of exportTargets(manifest.exports)) {
    if (!files.includes(target.replace(/^\.\//, ""))) problems.push(`${where}: exports target ${target} would not be published`);
  }
  if (manifest.private) problems.push(`${where}: marked private`);
  if (manifest.repository?.url !== "git+https://github.com/jdsouza1/omni-ir.git") {
    problems.push(`${where}: repository.url must match the GitHub repo for trusted publishing`);
  }
  for (const [dep, range] of Object.entries({ ...manifest.dependencies, ...manifest.peerDependencies })) {
    if (/^(file|link|workspace):/.test(range)) problems.push(`${where}: dependency ${dep} uses a local range (${range})`);
  }
  console.log(`${where}@${manifest.version}: ${files.length} files, ${report.size} bytes packed`);
}

// The packages are released together with the same version, and react and mcp depend on that version.
const { core } = manifests;
for (const pkg of ["react", "mcp"]) {
  const manifest = manifests[pkg];
  if (core.version !== manifest.version) problems.push(`versions differ: core ${core.version}, ${pkg} ${manifest.version}`);
  if (manifest.dependencies?.["@omni-ir/core"] !== `^${core.version}`) {
    problems.push(`${manifest.name} should depend on @omni-ir/core ^${core.version}, not ${manifest.dependencies?.["@omni-ir/core"]}`);
  }
}

if (problems.length) {
  console.error(`pack check failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("pack check: ok");

function exportTargets(exports) {
  if (typeof exports === "string") return [exports];
  if (!exports || typeof exports !== "object") return [];
  return Object.values(exports).flatMap(exportTargets);
}
