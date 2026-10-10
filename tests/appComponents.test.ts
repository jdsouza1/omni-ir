// App-defined components (Step 20, PLAN-APPCOMPONENTS.md A.1–A.3): declaring them, checking their
// lines like the Trusted Catalog's, the state they edit, pictures looked up by name pattern, and how
// they join field checks and screens as text.
import {
  AppComponentError,
  boolean,
  checkField,
  createParser,
  defineComponents,
  describeScreen,
  fieldsReadBy,
  list,
  number,
  oneOf,
  picture,
  picturePattern,
  state,
  text,
  type AppComponents,
  type PicturePattern,
} from "@omni-ir/core";
import { z } from "zod";

const SHOP = defineComponents({
  ProductCard: {
    description: "A product with its picture, name and price; children are its buttons.",
    positional: ["name", "children"],
    props: {
      name: text({ maxLength: 80 }),
      price: number({ minimum: 0 }),
      currency: oneOf(["USD", "EUR", "GBP"], { optional: true }),
      picture: picture({ optional: true }),
      rating: number({ minimum: 0, maximum: 5, optional: true }),
      tags: list("text", { maxItems: 3, optional: true }),
      sale: boolean({ optional: true }),
    },
    children: { max: 3 },
  },
  QuantityPicker: {
    description: "Choose how many, from min to max.",
    positional: ["value"],
    props: { value: state("number"), label: text(), min: number({ integer: true }), max: number({ integer: true }) },
    field: true,
  },
});

const PRODUCTS: PicturePattern[] = [picturePattern("product-{id}", { id: "digits" })];
const tools = { "cart.add": z.strictObject({ productId: z.string(), quantity: z.number() }) };

function parse(lines: string[], components: AppComponents = SHOP, end = true) {
  const parser = createParser({ tools, components, assets: { "cabin-pines": {} }, pictures: PRODUCTS });
  const issues: { code: string; line: number | null; id?: string }[] = [];
  parser.subscribe((e) => {
    if (e.type === "error" || e.type === "warning") issues.push({ code: e.issue.code, line: e.issue.line ?? null, id: e.issue.id });
  });
  parser.write(lines.join("\n") + "\n");
  if (end) parser.end();
  return { doc: parser.getSnapshot(), issues, parser };
}

const STORE = [
  "root = Stack([card, qty])",
  'card = ProductCard("Canvas tote", [add], price=24, currency="USD", picture="product-1042")',
  "$qty = 1",
  'qty = QuantityPicker($qty, label="How many", min=1, max=5)',
  'add = Button("Add to bag", action="addM")',
  'addM = McpMutation(add, tool="cart.add", params={productId: "1042", quantity: $qty})',
];

describe("declaring components", () => {
  it("keeps what the app declared, ready for every parser", () => {
    expect(Object.keys(SHOP)).toEqual(["ProductCard", "QuantityPicker"]);
    expect(SHOP.QuantityPicker!.field).toBe(true);
    // The declaration is plain JSON: the same text the Swift and Kotlin parsers read.
    expect(JSON.parse(JSON.stringify(SHOP.ProductCard!.declaration))).toEqual(SHOP.ProductCard!.declaration);
  });

  it.each([
    ["a lowercase name", { productCard: { description: "x", props: {} } }],
    ["a built-in name", { Card: { description: "x", props: {} } }],
    ["the reserved name App", { App: { description: "x", props: {} } }],
    ["McpMutation", { McpMutation: { description: "x", props: {} } }],
    ["a name with symbols", { "Product-Card": { description: "x", props: {} } }],
    ["no description", { Thing: { description: "", props: {} } }],
    ["a reserved prop name", { Thing: { description: "x", props: { children: text() } } }],
    ["a prop named action", { Thing: { description: "x", props: { action: text() } } }],
    ["a prop named required", { Thing: { description: "x", props: { required: boolean() } } }],
    ["an edited state not named value", { Thing: { description: "x", props: { amount: state("number") } } }],
    ["a field without a value", { Thing: { description: "x", props: { label: text() }, field: true } }],
    ["a positional prop it doesn't have", { Thing: { description: "x", positional: ["nope"], props: { label: text() } } }],
    ["positional children it can't hold", { Thing: { description: "x", positional: ["children"], props: {} } }],
    ["an empty list of choices", { Thing: { description: "x", props: { size: oneOf([]) } } }],
    ["a minimum above the maximum", { Thing: { description: "x", props: { n: number({ minimum: 5, maximum: 1 }) } } }],
    ["too many children", { Thing: { description: "x", props: {}, children: { max: 500 } } }],
  ])("refuses %s, when the app starts rather than in a stream", (_, declarations) => {
    expect(() => defineComponents(declarations as never)).toThrow(AppComponentError);
  });

  it("refuses picture patterns that could make a URL or clash with ordinary names", () => {
    expect(() => picturePattern("https://x/{id}", { id: "digits" })).toThrow(AppComponentError);
    expect(() => picturePattern("product{id}", { id: "digits" })).toThrow(AppComponentError);
    expect(() => picturePattern("Product-{id}", { id: "digits" })).toThrow(AppComponentError);
    expect(picturePattern("avatar-{id}", { id: "letters-digits", maxLength: 12 }).prefix).toBe("avatar-");
  });
});

describe("streams with app components", () => {
  it("are checked line by line, like the catalog's, and become app nodes with their name", () => {
    const { doc, issues } = parse(STORE);
    expect(issues).toEqual([]);
    const card = doc.nodes.get("card")!;
    expect(card).toMatchObject({ type: "App", name: "ProductCard", props: { name: "Canvas tote", price: 24, currency: "USD", picture: "product-1042" }, children: ["add"] });
    expect(doc.nodes.get("qty")).toMatchObject({ type: "App", name: "QuantityPicker", props: { value: { kind: "state", key: "$qty" } } });
  });

  it("refuses wrong props, unknown props and too many arguments, like any component", () => {
    const { issues } = parse([
      "root = Stack([a, b, c, d])",
      'a = ProductCard("Tote", price=-1)',
      'b = ProductCard("Tote", price=3, colour="red")',
      'c = ProductCard("Tote", [], "extra", price=3)',
      'd = ProductCard("Tote", price=3, currency="JPY")',
    ]);
    expect(issues.filter((i) => i.code === "invalid_props").map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("doesn't know a component the app didn't declare", () => {
    const { issues } = parse(["root = Stack([m])", 'm = SeatMap("A")']);
    expect(issues).toContainEqual(expect.objectContaining({ code: "unknown_component", id: "m" }));
    // And without any app components, ProductCard is unknown too.
    const plain = parse(['root = ProductCard("Tote", price=3)'], defineComponents({}));
    expect(plain.issues).toContainEqual(expect.objectContaining({ code: "unknown_component", id: "root" }));
  });

  it("holds only as many children as declared, and never nested calls", () => {
    const tooMany = parse(['root = ProductCard("Tote", [a, b, c, d], price=3)']);
    expect(tooMany.issues).toContainEqual(expect.objectContaining({ code: "invalid_props", id: "root" }));
    const leaf = parse(['root = QuantityPicker($q, [a], label="n", min=1, max=2)']);
    expect(leaf.issues).toContainEqual(expect.objectContaining({ code: "invalid_props", id: "root" }));
    const nested = parse(['root = ProductCard("Tote", [Button("Add")], price=3)']);
    expect(nested.issues).toContainEqual(expect.objectContaining({ code: "not_flat", id: "root" }));
  });

  it("checks the type of the state it edits, while streaming and at the end", () => {
    const { issues } = parse(['root = QuantityPicker($q, label="How many", min=1, max=5)', '$q = "one"']);
    expect(issues).toContainEqual(expect.objectContaining({ code: "input_state_type", id: "root" }));
  });

  it("keeps the usual tree rules: items stay in their containers, ids in one place", () => {
    const { issues } = parse(['root = ProductCard("Tote", [item], price=3)', 'item = ListItem("x")']);
    expect(issues).toContainEqual(expect.objectContaining({ code: "list_mismatch" }));
  });

  it("can't run an action: only a Button with an McpMutation reaches the backend", () => {
    const { issues } = parse(["root = Stack([card])", 'card = ProductCard("Tote", price=3)', 'm = McpMutation(card, tool="cart.add", params={productId: "1", quantity: 1})']);
    expect(issues).toContainEqual(expect.objectContaining({ code: "mutation_target_not_interactive", id: "m" }));
  });
});

describe("pictures by name pattern", () => {
  it("accept registered names and names matching a declared pattern, in Images too", () => {
    const { issues } = parse([
      "root = Stack([a, b, c])",
      'a = ProductCard("Tote", price=3, picture="product-77")',
      'b = Image("product-1042", alt="A tote")',
      'c = Image("cabin-pines", alt="A cabin")',
    ]);
    expect(issues).toEqual([]);
  });

  it("refuse names that match nothing, and anything like a URL", () => {
    const { issues } = parse([
      "root = Stack([a, b, c])",
      'a = ProductCard("Tote", price=3, picture="product-abc")',
      'b = Image("avatar-12", alt="Someone")',
      'c = ProductCard("Tote", price=3, picture="https://example.com/a.png")',
    ]);
    expect(issues.filter((i) => i.code === "unknown_asset").map((i) => i.id)).toEqual(["a", "b"]);
    expect(issues).toContainEqual(expect.objectContaining({ code: "invalid_props", id: "c" }));
  });
});

describe("app components as fields and as text", () => {
  it("join Step 19's checks: a field gets required, and a press reads it", () => {
    const { doc } = parse([...STORE.slice(0, 3), 'qty = QuantityPicker($qty, label="How many", min=1, max=5, required=true)', ...STORE.slice(4)]);
    const qty = doc.nodes.get("qty")!;
    expect(checkField("App", qty.props, null)).toEqual({ message: "required" });
    expect(checkField("App", qty.props, 2)).toBeNull();
    expect(fieldsReadBy(doc.mutations.get("add")!, doc)).toEqual(["qty"]);
  });

  it("appear in the screen as text by name, with typed values hidden", () => {
    const { doc, parser } = parse(STORE);
    parser.store.setState("$qty", 3);
    expect(describeScreen(doc).split("\n")).toEqual([
      "ProductCard: Canvas tote (price: 24, currency: USD, picture: product-1042)",
      "  Button: Add to bag (action: cart.add)",
      "QuantityPicker: How many (min: 1, max: 5)",
    ]);
    expect(describeScreen(parser.getSnapshot(), { values: true })).toContain("QuantityPicker: How many (min: 1, max: 5) = 3");
  });
});
