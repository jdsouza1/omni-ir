// Writes app/components.json: the demo app's own components and picture families (Step 20) as plain
// JSON, the declarations the Swift and Kotlin demo apps and tests read, so all three platforms use the
// same ones. `npm run components:export -- --check` fails if the file is out of date (a test runs it).
import { readFileSync, writeFileSync } from "node:fs";
import { componentDeclarations } from "@omni-ir/core";
import { APP_COMPONENTS, PICTURES, PRODUCT_PICTURES } from "../app/components";

export const COMPONENTS_FILE = "app/components.json";

export function renderComponentsJson(): string {
  const file = {
    $comment: "Generated from app/components.ts by npm run components:export. Do not edit: a test fails if it is stale.",
    components: componentDeclarations(APP_COMPONENTS),
    pictures: PICTURES,
    productPictures: PRODUCT_PICTURES,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/components-export.ts")) {
  const text = renderComponentsJson();
  if (process.argv.includes("--check")) {
    if (readFileSync(COMPONENTS_FILE, "utf8") !== text) {
      console.error(`${COMPONENTS_FILE} is out of date: run npm run components:export`);
      process.exit(1);
    }
    console.log(`${COMPONENTS_FILE} is up to date`);
  } else {
    writeFileSync(COMPONENTS_FILE, text);
    console.log(`wrote ${COMPONENTS_FILE}`);
  }
}
