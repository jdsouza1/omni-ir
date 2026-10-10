// The demo app's own components (Step 20, PLAN-APPCOMPONENTS.md): declared once, shared by the server
// (system prompt, model check), the browser, tests and the native demo apps (as JSON). Like the tool
// registry, this is application code: a stream can use these names, never add one.
import { defineComponents, list, number, oneOf, picture, picturePattern, state, text, type PicturePattern } from "@omni-ir/core";

export const APP_COMPONENTS = defineComponents({
  ProductCard: {
    description: "A product with its picture, name and price. Its children are the product's buttons.",
    positional: ["name", "children"],
    props: {
      name: text({ maxLength: 80 }),
      price: number({ minimum: 0 }),
      currency: oneOf(["USD", "EUR", "GBP"], { optional: true }),
      picture: picture({ optional: true }),
      rating: number({ minimum: 0, maximum: 5, optional: true }),
      badges: list("text", { maxItems: 3, optional: true }),
    },
    children: { max: 3 },
  },
  QuantityPicker: {
    description: "Choose how many, from min to max, with minus and plus buttons. Edits a number $state.",
    positional: ["value"],
    props: {
      value: state("number"),
      label: text({ maxLength: 80 }),
      min: number({ integer: true, minimum: 0, state: false }),
      max: number({ integer: true, minimum: 1, maximum: 99, state: false }),
    },
    field: true,
  },
});

/** Product pictures the demo looks up when a screen is drawn: `product-1042` and so on. */
export const PICTURES: PicturePattern[] = [picturePattern("product-{id}", { id: "digits", maxLength: 8 })];

/** Which registered picture each demo product shows (the demo's stand-in for a product catalogue). */
export const PRODUCT_PICTURES: Readonly<Record<string, string>> = { "product-1042": "tote", "product-1043": "shirt" };
