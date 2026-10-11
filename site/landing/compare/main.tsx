import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@omni-ir/react/omni.css";
import "../landing.css";
import "./compare.css";
import { Compare } from "./Compare";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Compare />
  </StrictMode>,
);
