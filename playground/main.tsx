import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@omni-ir/react/omni.css";
import "./playground.css";
import { Playground } from "./Playground";
import type { PlaygroundDeps } from "./usePlayground";

// The static build (`npm run playground:static`, the hosted playground) answers the API in the
// browser; every other build talks to the Express app.
const deps: PlaygroundDeps =
  import.meta.env.MODE === "static" ? { fetch: (await import("./inBrowserApi")).inBrowserFetch } : {};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Playground {...deps} />
  </StrictMode>,
);
