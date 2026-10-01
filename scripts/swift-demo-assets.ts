// Writes the iOS demo app's asset catalog (swift/Demo/Assets.xcassets) from the web app's asset
// registry (app/assets.ts), so both show the same pictures under the same names. The pictures are
// SVG, kept as vectors in the catalog.
//
//   npm run swift:assets               write the catalog
//   npm run swift:assets -- --check    exit 1 if it is out of date (used by the tests)
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ASSETS } from "../app/assets";

export const CATALOG_DIR = "swift/Demo/Assets.xcassets";
const PREFIX = "data:image/svg+xml,";
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

/** Every file in the catalog, by path relative to it. */
export function renderAssetCatalog(): Record<string, string> {
  const files: Record<string, string> = { "Contents.json": json({ info: { author: "omni-ir", version: 1 } }) };
  for (const [name, asset] of Object.entries(ASSETS)) {
    if (!asset.src.startsWith(PREFIX)) throw new Error(`asset ${name} is not an SVG data URI`);
    files[`${name}.imageset/${name}.svg`] = decodeURIComponent(asset.src.slice(PREFIX.length)) + "\n";
    files[`${name}.imageset/Contents.json`] = json({
      images: [{ filename: `${name}.svg`, idiom: "universal" }],
      info: { author: "omni-ir", version: 1 },
      properties: { "preserves-vector-representation": true },
    });
  }
  return files;
}

function readCatalog(dir: string, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  let entries: string[] = [];
  try {
    entries = readdirSync(join(dir, prefix));
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (entry.endsWith(".imageset")) Object.assign(out, readCatalog(dir, rel));
    else out[rel] = readFileSync(join(dir, rel), "utf8");
  }
  return out;
}

/** True when two catalogs hold the same files with the same contents. */
export function sameFiles(a: Record<string, string>, b: Record<string, string>): boolean {
  const sorted = (files: Record<string, string>) => JSON.stringify(Object.entries(files).sort(([x], [y]) => x.localeCompare(y)));
  return sorted(a) === sorted(b);
}

export function readCatalogFiles(): Record<string, string> {
  return readCatalog(CATALOG_DIR);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const files = renderAssetCatalog();
  if (process.argv.includes("--check")) {
    if (sameFiles(readCatalog(CATALOG_DIR), files) === false) {
      console.error(`${CATALOG_DIR} is out of date: run npm run swift:assets`);
      process.exit(1);
    }
    console.log(`${CATALOG_DIR} is up to date.`);
  } else {
    rmSync(CATALOG_DIR, { recursive: true, force: true });
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(CATALOG_DIR, path, ".."), { recursive: true });
      writeFileSync(join(CATALOG_DIR, path), text);
    }
    console.log(`wrote ${CATALOG_DIR} (${Object.keys(ASSETS).length} pictures)`);
  }
}
