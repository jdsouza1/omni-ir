// The view's entry point, bundled into dist/view.html. The host loads it in a sandboxed iframe; the
// server has injected the app's tools and pictures as JSON (config.ts). It talks only to the host.
import "@omni-ir/react/omni.css";
import { createRoot } from "react-dom/client";
import { App } from "@modelcontextprotocol/ext-apps";
import type { ViewConfig } from "../config.js";
import { CONFIG_ELEMENT_ID } from "../constants.js";
import { createViewController, OmniMcpView } from "./View.js";

const element = document.getElementById(CONFIG_ELEMENT_ID);
const config: ViewConfig = element?.textContent ? (JSON.parse(element.textContent) as ViewConfig) : { tools: {}, assets: {} };

async function start() {
  const app = new App({ name: "omni-ir-view", version: "1" });
  const controller = createViewController(app, config);
  await app.connect();
  const root = document.getElementById("root");
  if (root) createRoot(root).render(<OmniMcpView controller={controller} />);
}
void start();
