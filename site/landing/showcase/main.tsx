import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@omni-ir/react/omni.css";
import "../landing.css";
import "../compare/compare.css";
import "./showcase.css";
import { Showcase } from "./Showcase";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Showcase />
  </StrictMode>,
);
