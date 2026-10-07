// The Store in memory: for tests and the hosted playground, where nothing should outlive the page.
// Imports nothing from Node, so it also runs in the browser.
import { KEY_TTL_MS, type AuditEntry, type Booking, type KeyState, type ModelCheckRecord, type Order, type Store, type User } from "./types";

/** Nights overlap when each stay starts before the other ends (dates are YYYY-MM-DD, so they compare as text). */
export const overlaps = (a: { checkIn: string; checkOut: string }, b: { checkIn: string; checkOut: string }) =>
  a.checkIn < b.checkOut && b.checkIn < a.checkOut;

export function createMemoryStore(): Store {
  const users = new Map<string, User>();
  const usersByEmail = new Map<string, User>();
  const sessions = new Map<string, { userId: string; expiresAt: number }>();
  const links = new Map<string, { email: string; expiresAt: number }>();
  const linksSent: { email: string; at: number }[] = [];
  const orders = new Map<string, Order>();
  const returns = new Map<string, string>();
  const bookings: Booking[] = [];
  const keys = new Map<string, { fingerprint: string; at: number; answer: { status: number; body: unknown } | null }>();
  const audit: AuditEntry[] = [];
  const modelChecks: ModelCheckRecord[] = [];
  let nextUser = 1;

  return {
    users: {
      byId: async (id) => users.get(id) ?? null,
      byEmail: async (email) => usersByEmail.get(email.toLowerCase()) ?? null,
      async ensure(email) {
        const normal = email.toLowerCase();
        const existing = usersByEmail.get(normal);
        if (existing) return existing;
        const user = { id: `usr_${nextUser++}`, email: normal };
        users.set(user.id, user);
        usersByEmail.set(normal, user);
        return user;
      },
    },
    sessions: {
      create: async (tokenHash, userId, expiresAt) => void sessions.set(tokenHash, { userId, expiresAt }),
      async userOf(tokenHash, now) {
        const session = sessions.get(tokenHash);
        return session && now < session.expiresAt ? session.userId : null;
      },
      delete: async (tokenHash) => void sessions.delete(tokenHash),
    },
    links: {
      async create(tokenHash, email, createdAt, expiresAt) {
        links.set(tokenHash, { email: email.toLowerCase(), expiresAt });
        linksSent.push({ email: email.toLowerCase(), at: createdAt });
      },
      async take(tokenHash, now) {
        const link = links.get(tokenHash);
        links.delete(tokenHash);
        return link && now < link.expiresAt ? link.email : null;
      },
      countSince: async (email, since) => linksSent.filter((l) => l.email === email.toLowerCase() && l.at > since).length,
    },
    orders: {
      get: async (id) => orders.get(id) ?? null,
      add: async (order) => void orders.set(order.id, order),
    },
    returns: {
      async request(orderId, _ownerId, id) {
        const existing = returns.get(orderId);
        if (existing) return { id: existing, created: false };
        returns.set(orderId, id);
        return { id, created: true };
      },
    },
    tickets: { add: async () => {} },
    bookings: {
      async reserve(booking) {
        if (bookings.some((b) => overlaps(b, booking))) return false;
        bookings.push(booking);
        return true;
      },
    },
    profiles: { put: async () => {} },
    settings: { put: async () => {} },
    payments: { add: async () => {} },
    idempotency: {
      async claim(scope, key, fingerprint, now): Promise<KeyState> {
        const id = `${scope}\u0000${key}`;
        const held = keys.get(id);
        if (!held || now - held.at >= KEY_TTL_MS) {
          keys.set(id, { fingerprint, at: now, answer: null });
          return { state: "new" };
        }
        if (held.fingerprint !== fingerprint) return { state: "conflict" };
        return held.answer ? { state: "done", ...held.answer } : { state: "pending" };
      },
      async finish(scope, key, status, body) {
        const held = keys.get(`${scope}\u0000${key}`);
        if (held) held.answer = { status, body };
      },
      release: async (scope, key) => void keys.delete(`${scope}\u0000${key}`),
    },
    audit: {
      add: async (entry) => void audit.push(entry),
      list: async () => [...audit],
    },
    modelChecks: {
      add: async (record) => void modelChecks.push({ ...record, requests: [...record.requests] }),
      latestPass: async (fingerprint, since) =>
        [...modelChecks].reverse().find((r) => r.fingerprint === fingerprint && r.passed && r.at >= since) ?? null,
      list: async () => modelChecks.map((r) => ({ ...r, requests: [...r.requests] })),
    },
  };
}
