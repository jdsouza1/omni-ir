// Names shared by the server and the view. No imports, so the view's bundle stays free of server code.
export const SCREEN_TOOL = "show_screen";
export const VIEW_URI = "ui://omni-ir/screen";
/** Where the view puts a press's idempotency key in a tools/call's `_meta` ([10.28], [10.14]). */
export const IDEMPOTENCY_META_KEY = "io.omni-ir/idempotency-key";
/** Where the configuration goes in the view's HTML, and the element that holds it. */
export const CONFIG_PLACEHOLDER = "<!--omni-ir-config-->";
export const CONFIG_ELEMENT_ID = "omni-ir-config";
