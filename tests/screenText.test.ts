// Screens as text (PLAN-FORMS.md C.1): describeScreen outlines a screen in plain text for hosts that
// can't draw it, logs and tests. What the person typed stays out unless the app asks for it.
import { readFileSync } from "node:fs";
import { createParser, describeScreen, type ToolRegistry } from "@omni-ir/core";
import { z } from "zod";

const tools: ToolRegistry = {
  "auth.sendMagicLink": z.strictObject({ email: z.string() }),
  "payments.confirm": z.strictObject({ amount: z.number(), note: z.string() }),
};

function parse(text: string, end = true) {
  const parser = createParser({ tools, assets: { "cabin-pines": { src: "x" } } });
  parser.write(text);
  if (end) parser.end();
  return parser;
}

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}.omni`, import.meta.url), "utf8");

describe("describeScreen", () => {
  it("outlines a screen: one line per component, nested by indentation, rows flattened", () => {
    expect(describeScreen(parse(fixture("sign-in")).getSnapshot())).toBe(
      [
        "Card",
        "  Heading: Sign in",
        "  Text: We'll email you a one-time link. No password needed.",
        "  Input: Email address (required, email)",
        "  Button: Email me a link (action: auth.sendMagicLink)",
        "  Text: The link expires after 15 minutes.",
      ].join("\n"),
    );
  });

  it("shows values the stream set, but not what the person typed, unless asked", () => {
    const parser = parse(fixture("payment-confirmation"));
    parser.store.setState("$note", "table 4, Ann Lee");
    const text = describeScreen(parser.getSnapshot());
    expect(text).toContain("Text: 42.5 (currency, USD)");
    expect(text).toContain("Input: Note for merchant (optional)");
    expect(text).not.toContain("Ann Lee");
    expect(describeScreen(parser.getSnapshot(), { values: true })).toContain('Input: Note for merchant (optional) = "table 4, Ann Lee"');
  });

  it("hides a typed value wherever the screen echoes it", () => {
    const parser = parse('root = Stack([f, echo])\n$name = ""\nf = Input($name, label="Name")\necho = Text($name)\n');
    parser.store.setState("$name", "Ann");
    expect(describeScreen(parser.getSnapshot())).toBe("Input: Name\nText: [hidden]");
    expect(describeScreen(parser.getSnapshot(), { values: true })).toBe('Input: Name = "Ann"\nText: Ann');
  });

  it("covers choices, switches, dates, tables, tabs, lists, notices, messages and charts", () => {
    const text = describeScreen(
      parse(
        [
          'root = Tabs([one, two])',
          'one = Tab("Settings", [lang, news, day, notice])',
          '$lang = "French"',
          'lang = Select($lang, label="Language", options=["English", "French"], required=true)',
          '$news = true',
          'news = Switch($news, label="Order updates")',
          '$day = "2026-10-09"',
          'day = DateInput($day, label="Check-in", min="2026-10-01")',
          'notice = Notice("Changes apply at once.", tone="warning", title="Heads up")',
          'two = Tab("Data", [orders, items, chat, sales, share, rate, pic, wait])',
          'orders = Table(["Order", "Total"], [r1])',
          'r1 = TableRow(["A-1", 12])',
          'items = List([i1])',
          'i1 = ListItem("Tote", detail="Canvas", trailing="$20")',
          'chat = Message("Hi there", from="assistant")',
          'sales = BarChart("Sales", ["Jan", "Feb"], [s1])',
          's1 = Series("2026", [3, 4.5])',
          'share = PieChart("Share", [p1])',
          'p1 = Slice("Web", 60)',
          'rate = Rating(4, max=5)',
          'pic = Image("cabin-pines", alt="A cabin")',
          'wait = Skeleton()',
          '',
        ].join("\n"),
      ).getSnapshot(),
      { values: true },
    );
    expect(text.split("\n")).toEqual([
      "Tabs",
      "  Tab: Settings",
      '    Select: Language (required; options: English, French) = "French"',
      "    Switch: Order updates = on",
      '    DateInput: Check-in (from 2026-10-01) = "2026-10-09"',
      "    Notice (warning): Heads up: Changes apply at once.",
      "  Tab: Data",
      "    Table: Order | Total",
      "      Row: A-1 | 12",
      "    List",
      "      Item: Tote · Canvas · $20",
      "    Message from assistant: Hi there",
      "    BarChart: Sales (labels: Jan, Feb)",
      "      Series: 2026: 3, 4.5",
      "    PieChart: Share",
      "      Slice: Web: 60",
      "    Rating: 4 out of 5",
      "    Image: A cabin",
      "    Skeleton",
    ]);
  });

  it("marks parts still loading, and parts that never arrived", () => {
    const streaming = parse('root = Card([title, body], title="Order")\ntitle = Heading("Hi")\n', false);
    expect(describeScreen(streaming.getSnapshot())).toBe("Card: Order\n  Heading: Hi\n  [loading]");
    streaming.end();
    expect(describeScreen(streaming.getSnapshot())).toBe("Card: Order\n  Heading: Hi\n  [missing]");
    expect(describeScreen(parse("").getSnapshot())).toBe("[missing]");
  });

  it("keeps one component per line: stream text can't start a line of its own", () => {
    const text = describeScreen(parse('root = Stack([a])\na = Text("one\\n  Button: Fake (action: payments.confirm)")\n').getSnapshot());
    expect(text.split("\n")).toHaveLength(1);
  });
});
