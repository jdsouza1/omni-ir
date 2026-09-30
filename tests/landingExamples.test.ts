import { loadLandingTabs, openBundle, replaceExamples } from "../scripts/landing-examples";

/** A minimal page in the same bundled format as the real landing page. */
function bundle(template: string): string {
  const encoded = JSON.stringify(template).split("</").join("<\\u002F");
  return `<html><body><script type="__bundler/template">\n${encoded}\n  </script></body></html>`;
}

const TEMPLATE = [
  "<article style=\"box-shadow:{{ r_root }}\"><h3 style=\"box-shadow:{{ r_title }}\">x</h3></article>",
  "<script>",
  "// Generated from the repo's fixtures/landing/*.omni (validated by the Omni-IR parser).",
  "const EXAMPLES = { old: { label: 'Old', lines: [] } };",
  "const PARTS = [\"root\"];",
  "const RING = 'ring';",
  "</script>",
].join("\n");

describe("landing examples", () => {
  it("loads all three tabs from the fixtures, each line split and explained", () => {
    const tabs = loadLandingTabs(".");
    expect(tabs.map((t) => [t.label, t.lines.length])).toEqual([
      ["Booking", 7],
      ["Checkout", 7],
      ["Assistant", 8],
    ]);
    expect(tabs[0]!.lines[0]).toMatchObject({ kw: "root", name: "Card", rest: "([title, place, dates, reserve])", part: "root" });
    expect(tabs[0]!.lines[3]).toMatchObject({ kw: "$dates", name: "", rest: '"Oct 14 – Oct 17"' });
    for (const tab of tabs) for (const line of tab.lines) expect(line.explain.length).toBeGreaterThan(10);
  });

  it("round-trips the bundle encoding, including </ inside the template", () => {
    const html = bundle(TEMPLATE);
    const page = openBundle(html);
    expect(page.template).toBe(TEMPLATE);
    expect(page.rebuild(page.template)).toBe(html);
    // The template contains its own </script>; only the bundle's real closing tag may appear unescaped.
    expect(page.rebuild(page.template).match(/<\/script>/g)).toHaveLength(1);
  });

  it("replaces only the EXAMPLES block, keeping what follows", () => {
    const tabs = [{ key: "t", label: "T", lines: [{ kw: "title", name: "Heading", rest: '("Hi")', part: "title", explain: "A heading." }] }];
    const out = replaceExamples(TEMPLATE, tabs);
    expect(out).toContain('t: { label: "T", lines: [');
    expect(out).toContain('const PARTS = ["title"];');
    expect(out).toContain("const RING = 'ring';");
    expect(out).not.toContain("Old");
  });

  it("refuses a card part the page has no element for", () => {
    const tabs = [{ key: "t", label: "T", lines: [{ kw: "x", name: "Text", rest: '("x")', part: "photo", explain: "?" }] }];
    expect(() => replaceExamples(TEMPLATE, tabs)).toThrow(/no element for card part "photo"/);
  });
});
