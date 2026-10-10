// The reference server's handlers: what each tool in app/tools.ts does (PLAN-BACKEND.md A, C). Params
// arrive already checked against the tool's schema by /api/mutate; that proves a request is
// well-formed, not that it is allowed. So every handler declares who may use it (deny by default:
// a tool without a rule doesn't load), and checks ownership against stored data, never against
// anything in the params, which a model can write freely.
//
// Results carry only what a screen needs: no internal ids, no other people's data.
import { sendSignInLink, type Mailer } from "../backend/auth";
import type { Store, User } from "../backend/types";

export interface ToolContext {
  store: Store;
  mailer: Mailer;
  now: number;
  /** Where sign-in links point. */
  publicUrl: string;
}

/** A refusal a handler can give: its HTTP status, code and a message for the person. */
export class ToolError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

/** The same answer for "not yours" and "doesn't exist", so nobody can probe which ids exist. */
export const notFound = () => new ToolError(404, "not_found", "That wasn't found.");

type Params = Record<string, unknown>;
type Result = Record<string, unknown>;

export type ToolHandler =
  | { access: "public"; run(params: Params, ctx: ToolContext & { user: User | null }): Promise<Result> }
  | { access: "signed-in"; run(params: Params, ctx: ToolContext & { user: User }): Promise<Result> };

const id = (prefix: string) => `${prefix}_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

export const HANDLERS: Readonly<Record<string, ToolHandler>> = {
  // The only public tool. Always "sent", whether or not the address has an account or was limited,
  // so the answer can't be used to probe accounts.
  "auth.sendMagicLink": {
    access: "public",
    async run({ email }, { store, mailer, now, publicUrl }) {
      await sendSignInLink(store, mailer, String(email), now, publicUrl);
      return { sent: true };
    },
  },

  // A fake ledger: no real money moves in the reference server.
  "payments.confirm": {
    access: "signed-in",
    async run({ amount, note }, { user, store, now }) {
      const receiptId = id("rcpt");
      await store.payments.add({ id: receiptId, ownerId: user.id, amount: Number(amount), note: String(note), at: now });
      return { receiptId, status: "confirmed", amount };
    },
  },

  "profile.update": {
    access: "signed-in",
    async run({ displayName, bio }, { user, store }) {
      await store.profiles.put(user.id, { displayName: String(displayName), bio: String(bio) });
      return { saved: true };
    },
  },

  "orders.requestReturn": {
    access: "signed-in",
    async run({ orderId }, { user, store }) {
      const order = await store.orders.get(String(orderId));
      if (!order || order.ownerId !== user.id) throw notFound();
      const ret = await store.returns.request(order.id, user.id, id("ret"));
      return { returnId: ret.id, orderId: order.id, status: "requested" };
    },
  },

  "support.createTicket": {
    access: "signed-in",
    async run({ subject, message }, { user, store }) {
      const ticketId = id("tkt");
      await store.tickets.add({ id: ticketId, ownerId: user.id, subject: String(subject), message: String(message) });
      return { ticketId, status: "open" };
    },
  },

  // One cabin: a stay is held only if no other stay overlaps its nights.
  "bookings.reserve": {
    access: "signed-in",
    async run({ checkIn, checkOut }, { user, store }) {
      const bookingId = id("bkg");
      const held = await store.bookings.reserve({ id: bookingId, ownerId: user.id, checkIn: String(checkIn), checkOut: String(checkOut) });
      if (!held) throw new ToolError(409, "unavailable", "Those dates are already taken.");
      return { bookingId, checkIn, checkOut, status: "held" };
    },
  },

  // A real handler would ask a model, which costs money, so the reference server answers without one.
  "assistant.ask": {
    access: "signed-in",
    async run() {
      return { stub: true, answer: "This is a stub answer. Connect a real handler to answer questions." };
    },
  },

  // The demo shop has no stock or prices to check, so the reference server only acknowledges it.
  "cart.add": {
    access: "signed-in",
    async run({ productId, quantity }) {
      return { stub: true, added: { productId, quantity } };
    },
  },

  "settings.update": {
    access: "signed-in",
    async run({ language, orderUpdates, promotions }, { user, store }) {
      await store.settings.put(user.id, { language: String(language), orderUpdates: orderUpdates === true, promotions: promotions === true });
      return { saved: true };
    },
  },
};
