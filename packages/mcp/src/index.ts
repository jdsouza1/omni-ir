// @omni-ir/mcp: Omni-IR screens in MCP Apps hosts (Claude, ChatGPT, VS Code, Cursor and others).
// createOmniMcpServer gives an MCP server whose show_screen tool takes Omni-IR from the host's model,
// a view that draws it with the Trusted Catalog, and the app's tools as actions only that view can
// call, each checked here again. See SPEC.md [10.25]–[10.28].
export { BUTTON_META_KEY, CONFIG_ELEMENT_ID, CONFIG_PLACEHOLDER, IDEMPOTENCY_META_KEY, SCREEN_TOOL, VIEW_URI } from "./constants.js";
export {
  createOmniMcpServer,
  MAX_SCREEN_CHARS,
  type ActionCall,
  type ActionResult,
  type OmniMcpEvent,
  type OmniMcpOptions,
} from "./server.js";
export { buildGuide, GUIDE_EXAMPLE, type Picture } from "./guide.js";
export { injectConfig, viewConfig, type ViewConfig } from "./config.js";
