// The demo app's live parts (Step 22, SPEC.md [10.29]-[10.40]): parts of a screen the app keeps up to
// date while it is open, and the code that does it. Shared by the server, the in-browser API and tests.
//
// The model only learns the names (the system prompt lists them, server/prompt.ts), so a screen it
// writes uses the id or $key the app will update. Every update is written here, by the app; a model
// never writes one. The demo's updates come on a timer, standing in for a real app's own events (a
// courier's scan, a sale), and cost nothing.
import type { OmniDocument, OmniNode } from "@omni-ir/core";

/** The ids and $keys the app keeps current, each with what it is, for the model. */
export const LIVE_PARTS: Readonly<Record<string, string>> = {
  order_status: "an order's delivery status, as a Badge",
  sales_today: "today's orders by hour, as a LineChart",
};

/** Something the app keeps current on a screen that shows one of its parts. */
export interface LiveFeed {
  /** The part it keeps current. */
  part: keyof typeof LIVE_PARTS & string;
  /** Whether this screen shows the part as the feed expects. */
  follows(doc: OmniDocument): boolean;
  /** The updates, each `delayMs` after the one before; after the last, the screen won't change again. */
  steps(doc: OmniDocument): { delayMs: number; text: string }[];
}

/** Text as an Omni-IR string ([4.6]). */
export function omniString(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

const node = (doc: OmniDocument, id: string): OmniNode | undefined => doc.nodes.get(id);

/** The order moves on: out for delivery, then delivered. */
export const ORDER_FEED: LiveFeed = {
  part: "order_status",
  follows: (doc) => node(doc, "order_status")?.type === "Badge",
  steps: () => [
    { delayMs: 4000, text: 'order_status = Badge("Out for delivery")\n' },
    { delayMs: 5000, text: 'order_status = Badge("Delivered", tone="success")\n' },
  ],
};

/** Today's orders by hour, one more hour at each step. The app owns this chart: it writes all of it. */
export const SALES_HOURS = ["9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm"];
export const SALES_ORDERS = [14, 22, 19, 31, 27, 24, 29];

export function salesChart(hours: number): string {
  const labels = SALES_HOURS.slice(0, hours).map(omniString).join(", ");
  const values = SALES_ORDERS.slice(0, hours).join(", ");
  return `sales_today = LineChart("Orders today", [${labels}], [sales_today_orders])\nsales_today_orders = Series("Orders", [${values}])\n`;
}

export const SALES_FEED: LiveFeed = {
  part: "sales_today",
  follows: (doc) => {
    const chart = node(doc, "sales_today");
    return chart?.type === "LineChart" || chart?.type === "BarChart";
  },
  steps: (doc) => {
    const chart = node(doc, "sales_today");
    const shown = chart?.type === "LineChart" || chart?.type === "BarChart" ? chart.props.labels.length : 0;
    const from = Math.min(Math.max(shown, 3), SALES_HOURS.length - 1);
    return SALES_HOURS.slice(from).map((_, n) => ({ delayMs: 3000, text: salesChart(from + n + 1) }));
  },
};

export const LIVE_FEEDS: readonly LiveFeed[] = [ORDER_FEED, SALES_FEED];

/**
 * The update an action's result carries ([10.35]), by tool: written from the result and the pressed
 * Button's id, so the Button can say what happened in its own place. A Button replaced by a Notice
 * loses its McpMutation with it ([10.31]).
 */
export const ACTION_UPDATES: Readonly<Record<string, (result: Record<string, unknown>, button: string) => string>> = {
  "orders.requestReturn": (_result, button) => `${button} = Notice("Return requested. We'll email you a label.", tone="success")\n`,
  "cart.add": (_result, button) => `${button} = Button("Added to cart", variant="secondary")\n`,
};
