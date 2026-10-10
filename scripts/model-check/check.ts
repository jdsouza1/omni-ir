// The browser side of the free model check page (npm run model-check:page): validates a reply with the
// real Omni-IR parser, with the same tool and asset registries as the app, and renders it with the
// React Trusted Catalog. Bundled into the page, so nothing is installed and nothing is sent anywhere.
import { createParser } from "@omni-ir/core";
import { OmniRenderer } from "@omni-ir/react";
import "@omni-ir/react/omni.css";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ASSETS } from "../../app/assets";
import { APP_COMPONENTS, PICTURES } from "../../app/components";
import { LIVE_PARTS } from "../../app/live";
import { TOOLS } from "../../app/tools";
import { APP_VIEWS, resolvePicture } from "../../app/views";

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
  /** The app's live parts the reply used (Step 22), by id or $key: the component it wrote, or "state". */
  live: Record<string, string>;
}

const roots = new WeakMap<Element, Root>();

export function check(text: string, preview?: HTMLElement): CheckResult {
  const parser = createParser({ tools: TOOLS, assets: ASSETS, components: APP_COMPONENTS, pictures: PICTURES });
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
    root.render(createElement(OmniRenderer, { store: parser.store, tools: TOOLS, assets: ASSETS, components: APP_VIEWS, resolvePicture, onMutation: () => {} }));
  }
  const live: Record<string, string> = {};
  for (const part of Object.keys(LIVE_PARTS)) {
    const node = doc.nodes.get(part);
    if (node) live[part] = node.type === "App" ? node.name : node.type;
    else if (Object.hasOwn(doc.state, part)) live[part] = "state";
  }
  return { errors, warnings, components: doc.nodes.size, governed: doc.mutations.size, codeFences: /^\s*```/m.test(text), live };
}
