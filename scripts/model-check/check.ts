// The browser side of the free model check page (npm run model-check:page): validates a reply with the
// real Omni-IR parser, with the same tool and asset registries as the app, and renders it with the
// React Trusted Catalog. Bundled into the page, so nothing is installed and nothing is sent anywhere.
import { createParser } from "@omni-ir/core";
import { OmniRenderer } from "@omni-ir/react";
import "@omni-ir/react/omni.css";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ASSETS } from "../../app/assets";
import { TOOLS } from "../../app/tools";

export interface Finding {
  line: number | null;
  code: string;
  message: string;
}

export interface CheckResult {
  errors: Finding[];
  warnings: Finding[];
  components: number;
  governed: number;
  codeFences: boolean;
}

const roots = new WeakMap<Element, Root>();

export function check(text: string, preview?: HTMLElement): CheckResult {
  const parser = createParser({ tools: TOOLS, assets: ASSETS });
  const errors: Finding[] = [];
  const warnings: Finding[] = [];
  parser.subscribe((e) => {
    if (e.type === "error" || e.type === "warning") {
      (e.type === "error" ? errors : warnings).push({ line: e.issue.line ?? null, code: e.issue.code, message: e.issue.message });
    }
  });
  parser.write(text);
  parser.end();
  const doc = parser.getSnapshot();
  if (preview) {
    const root = roots.get(preview) ?? createRoot(preview);
    roots.set(preview, root);
    root.render(createElement(OmniRenderer, { store: parser.store, tools: TOOLS, assets: ASSETS, onMutation: () => {} }));
  }
  return { errors, warnings, components: doc.nodes.size, governed: doc.mutations.size, codeFences: /^\s*```/m.test(text) };
}
