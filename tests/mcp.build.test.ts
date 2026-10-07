// Step 18 (PLAN-MCPAPPS.md, A.1): the view as hosts receive it. One HTML file with everything inline,
// nothing fetched (hosts allow no network by default, [10.25]), within a size budget.
import { describe, expect, it } from "vitest";
import { CONFIG_PLACEHOLDER } from "@omni-ir/mcp";
import { buildView } from "../scripts/mcp-view";

describe("the built view (A.1)", () => {
  it("is one self-contained HTML file within its size budget", { timeout: 120_000 }, async () => {
    const html = await buildView();
    expect(html).toContain(CONFIG_PLACEHOLDER);
    expect(html).toContain('<div id="root">');
    // Styles and script inline: no <link>, no <script src>, no stylesheet @import.
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<script[^>]*\bsrc=/i);
    expect(html).not.toMatch(/@import\b/);
    // One script element: any "</script" inside the bundle is escaped, so nothing can end it early.
    expect(html.match(/<\/script>/gi)).toHaveLength(1);
    expect(html).toContain(".omni-root");
    // React, the parser, the catalog, Zod and the MCP Apps SDK: about 550 KB, 170 KB compressed.
    expect(Buffer.byteLength(html)).toBeLessThan(650 * 1024);
  });
});
