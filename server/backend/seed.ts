// Demo data for the reference server: two people with an order each, so the "where is my order?"
// screen's return works for the demo visitor and is refused for anyone else. Safe to run on every
// start: it only adds what is missing.
import type { Store } from "./types";

/** The one person every request acts as when OMNI_AUTH=demo (the playground and the demo apps). */
export const DEMO_VISITOR_EMAIL = "visitor@example.com";

export async function seedDemo(store: Store): Promise<void> {
  const visitor = await store.users.ensure(DEMO_VISITOR_EMAIL);
  const other = await store.users.ensure("grace@example.com");
  if (!(await store.orders.get("A1B2-7731"))) await store.orders.add({ id: "A1B2-7731", ownerId: visitor.id, item: "Linen shirt", total: 45 });
  if (!(await store.orders.get("C3D4-1188"))) await store.orders.add({ id: "C3D4-1188", ownerId: other.id, item: "Canvas tote", total: 25 });
}
