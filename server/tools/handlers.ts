// Stub handlers for the tool registry. They return fake results (marked `stub: true`) so the whole
// flow can be shown without a real backend. Params arrive already validated against the tool's
// schema by POST /api/mutate.
//
// TODO(real backend): replace each stub with a real call, and add authorization: check that the
// signed-in user may perform this action on this resource (e.g. owns order A1B2-7731). Schema
// validation says the request is well-formed, not that it is allowed.
import { randomUUID } from "node:crypto";

export type ToolHandler = (params: Record<string, unknown>) => Promise<Record<string, unknown>>;

const id = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

export const STUB_HANDLERS: Readonly<Record<string, ToolHandler>> = {
  "payments.confirm": async ({ amount }) => ({ stub: true, receiptId: id("rcpt"), status: "confirmed", amount }),
  // Always "sent", whether or not the address has an account, so the response can't be used to probe accounts.
  "auth.sendMagicLink": async () => ({ stub: true, sent: true }),
  "profile.update": async ({ displayName, bio }) => ({ stub: true, saved: true, profile: { displayName, bio } }),
  "orders.requestReturn": async ({ orderId }) => ({ stub: true, returnId: id("ret"), orderId, status: "requested" }),
  "support.createTicket": async () => ({ stub: true, ticketId: id("tkt"), status: "open" }),
  "bookings.reserve": async ({ dates }) => ({ stub: true, bookingId: id("bkg"), dates, status: "held" }),
  // A real handler would ask a model; the stub answers without one, so it costs nothing.
  "assistant.ask": async () => ({ stub: true, answer: "This is a stub answer. Connect a real handler to answer questions." }),
};
