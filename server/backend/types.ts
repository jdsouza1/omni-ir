// The reference backend's data (PLAN-BACKEND.md): who is signed in, and what the eight demo tools
// read and write. Store is the one interface handlers use; an app with its own database implements
// it. Two versions come with the repo: memoryStore.ts (tests, the hosted playground) and
// sqliteStore.ts (Node's built-in SQLite, for a server whose data survives restarts).
//
// Times are milliseconds since 1970. Secrets (session tokens, sign-in links) are stored only as
// SHA-256 hashes, so a copy of the database can't be used to sign in.

export interface User {
  id: string;
  email: string;
}

export interface Order {
  id: string;
  ownerId: string;
  item: string;
  total: number;
}

export interface Booking {
  id: string;
  ownerId: string;
  checkIn: string;
  checkOut: string;
}

/** One action, as recorded for the audit trail. Never param values. */
export interface AuditEntry {
  at: number;
  userId: string | null;
  tool: string;
  outcome: string;
  idempotencyKey: string | null;
}

/** What an idempotency key already holds ([10.14]). */
export type KeyState =
  | { state: "new" }
  | { state: "pending" }
  | { state: "done"; status: number; body: unknown }
  | { state: "conflict" };

export interface Store {
  users: {
    byId(id: string): Promise<User | null>;
    byEmail(email: string): Promise<User | null>;
    /** The user with this email, created if there is none. */
    ensure(email: string): Promise<User>;
  };
  sessions: {
    create(tokenHash: string, userId: string, expiresAt: number): Promise<void>;
    /** The session's user, or null when unknown or expired. */
    userOf(tokenHash: string, now: number): Promise<string | null>;
    delete(tokenHash: string): Promise<void>;
  };
  links: {
    create(tokenHash: string, email: string, createdAt: number, expiresAt: number): Promise<void>;
    /** Single use: returns the link's email and deletes it, or null when unknown or expired. */
    take(tokenHash: string, now: number): Promise<string | null>;
    /** Links created for this address after `since`, to limit how many anyone can request. */
    countSince(email: string, since: number): Promise<number>;
  };
  orders: {
    get(id: string): Promise<Order | null>;
    add(order: Order): Promise<void>;
  };
  returns: {
    /** The return already requested for this order, or a new one: an order is returned once. */
    request(orderId: string, ownerId: string, id: string): Promise<{ id: string; created: boolean }>;
  };
  tickets: {
    add(ticket: { id: string; ownerId: string; subject: string; message: string }): Promise<void>;
  };
  bookings: {
    /** Books the cabin unless another booking overlaps these nights; atomic. */
    reserve(booking: Booking): Promise<boolean>;
  };
  profiles: {
    put(userId: string, profile: { displayName: string; bio: string }): Promise<void>;
  };
  settings: {
    put(userId: string, settings: { language: string; orderUpdates: boolean; promotions: boolean }): Promise<void>;
  };
  payments: {
    add(payment: { id: string; ownerId: string; amount: number; note: string; at: number }): Promise<void>;
  };
  idempotency: {
    /**
     * Claim a key for a request ([10.14]): "new" claims it; "pending" means the same key is still
     * running; "done" returns the stored answer; "conflict" means the key was used for other params.
     */
    claim(scope: string, key: string, fingerprint: string, now: number): Promise<KeyState>;
    finish(scope: string, key: string, status: number, body: unknown): Promise<void>;
    /** Forget a claim whose action failed unexpectedly, so a retry can run it. */
    release(scope: string, key: string): Promise<void>;
  };
  audit: {
    add(entry: AuditEntry): Promise<void>;
    list(): Promise<AuditEntry[]>;
  };
  /** Release the database, where there is one. */
  close?(): void;
}

/** How long an idempotency key's answer is kept. */
export const KEY_TTL_MS = 24 * 60 * 60 * 1000;
