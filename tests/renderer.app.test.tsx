// @vitest-environment jsdom
// App-defined components in the React renderer (Step 20, PLAN-APPCOMPONENTS.md B.1): the app's own
// views get checked props with $state read, their children as slots, pictures by name, and field
// feedback; a component without a view shows the renderer's fallback; Buttons inside stay governed.
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { createParser } from "@omni-ir/core";
import { missingViews, type AppViewProps, type AppViews } from "@omni-ir/react";
import { ASSETS } from "../app/assets";
import { APP_COMPONENTS, PICTURES } from "../app/components";
import { TOOLS } from "../app/tools";
import { renderOmni } from "./renderHelpers";

afterEach(cleanup);

function Card({ id, props, children, picture }: AppViewProps) {
  const pic = picture(props.picture as string | undefined);
  return (
    <section data-node-id={id} aria-label={String(props.name)}>
      <h3>{String(props.name)}</h3>
      <p>Price: {String(props.price)}</p>
      {pic && <img src={pic.src} alt="" />}
      {children}
    </section>
  );
}

function Picker({ id, props, field }: AppViewProps) {
  const value = Number(field?.value ?? 0);
  return (
    <div data-node-id={id}>
      <span id={`${id}-label`}>{String(props.label)}</span>
      <button type="button" aria-label="More" onClick={() => field?.onChange(value + 1)}>+</button>
      <output aria-labelledby={`${id}-label`}>{value}</output>
      {field?.error && <span role="alert">{field.error}</span>}
    </div>
  );
}

const VIEWS: AppViews = { ProductCard: Card, QuantityPicker: Picker };

const SHOP = [
  "root = Stack([card, qty])",
  'card = ProductCard("Canvas tote", [add], price=24, currency="USD", picture="product-1042")',
  "$qty = null",
  'qty = QuantityPicker($qty, label="How many", min=0, max=5, required=true)',
  'add = Button("Add to bag", action="addM")',
  'addM = McpMutation(add, tool="cart.add", params={productId: "1042", quantity: $qty})',
];

function shop(views: AppViews = VIEWS) {
  const parser = createParser({ tools: TOOLS, assets: ASSETS, components: APP_COMPONENTS, pictures: PICTURES });
  return renderOmni({
    parser,
    lines: SHOP,
    rendererProps: { components: views, resolvePicture: (name) => (name === "product-1042" ? ASSETS.tote : undefined) },
  });
}

describe("app components [Step 20]", () => {
  it("are drawn by the app's own view, with checked props and their children as slots", () => {
    shop();
    const card = screen.getByRole("region", { name: "Canvas tote" });
    expect(card.textContent).toContain("Price: 24");
    // The picture comes from the app's lookup, by name; the stream never wrote a URL.
    expect(card.querySelector("img")?.getAttribute("src")).toBe(ASSETS.tote!.src);
    expect(screen.getByRole("button", { name: "Add to bag" })).toBeTruthy();
  });

  it("edit their $state through the renderer, and join the field checks before a press", async () => {
    const h = shop();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add to bag" }));
    expect(h.onMutation).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("This is required.");
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(h.parser.getSnapshot().state.$qty).toBe(1);
    await user.click(screen.getByRole("button", { name: "Add to bag" }));
    expect(h.onMutation).toHaveBeenCalledWith(expect.objectContaining({ tool: "cart.add", params: { productId: "1042", quantity: 1 } }));
  });

  it("show the renderer's fallback where the app gave no view, and the rest of the screen still works", () => {
    const h = shop({ ProductCard: Card });
    const fallback = h.container.querySelector('[data-fallback-reason="unsupported"]');
    expect(fallback?.getAttribute("data-node-id")).toBe("qty");
    expect(fallback?.textContent).toBe("This part of the screen can't be shown here.");
    expect(screen.getByRole("region", { name: "Canvas tote" })).toBeTruthy();
  });

  it("give views values, never $state references", () => {
    const seen: unknown[] = [];
    const Spy = (p: AppViewProps) => {
      seen.push(p.props.label, p.field?.value);
      return null;
    };
    shop({ ProductCard: Card, QuantityPicker: Spy });
    expect(seen.slice(0, 2)).toEqual(["How many", null]);
  });

  it("follow the stream: a later line updates the view", () => {
    const h = shop();
    act(() => h.parser.store.setState("$qty", 4));
    expect(screen.getByRole("status", { name: "How many" }).textContent).toBe("4");
  });

  it("can be checked for missing views before release", () => {
    expect(missingViews(APP_COMPONENTS, VIEWS)).toEqual([]);
    expect(missingViews(APP_COMPONENTS, { ProductCard: Card })).toEqual(["QuantityPicker"]);
  });
});

describe("pictures looked up when drawn [Step 20]", () => {
  it("serve built-in Images too, and a name with no picture shows the picture fallback", () => {
    const parser = createParser({ tools: TOOLS, assets: ASSETS, pictures: PICTURES });
    const h = renderOmni({
      parser,
      lines: ["root = Stack([a, b])", 'a = Image("product-1042", alt="A tote")', 'b = Image("product-9", alt="Nothing here")'],
      rendererProps: { resolvePicture: (name) => (name === "product-1042" ? ASSETS.tote : undefined) },
    });
    expect(screen.getByRole("img", { name: "A tote" }).getAttribute("src")).toBe(ASSETS.tote!.src);
    expect(h.container.querySelector('[data-node-id="b"]')).toBeTruthy();
    expect(h.errors()).toEqual([]);
  });
});
