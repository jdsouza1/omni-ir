// The Store on Node's built-in SQLite (node:sqlite, Node 22.13+ and 24): data survives restarts, with
// no dependency and no database server. One file, one machine; an app running several server
// instances implements the Store on its own database instead.
import { DatabaseSync } from "node:sqlite";
import { KEY_TTL_MS, type KeyState, type Store, type User } from "./types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS links (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS links_sent (email TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, item TEXT NOT NULL, total REAL NOT NULL);
CREATE TABLE IF NOT EXISTS returns (order_id TEXT PRIMARY KEY, id TEXT NOT NULL, owner_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, check_in TEXT NOT NULL, check_out TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, bio TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (user_id TEXT PRIMARY KEY, language TEXT NOT NULL, order_updates INTEGER NOT NULL, promotions INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, amount REAL NOT NULL, note TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS idempotency (scope TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL, at INTEGER NOT NULL, status INTEGER, body TEXT, PRIMARY KEY (scope, key));
CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, user_id TEXT, tool TEXT NOT NULL, outcome TEXT NOT NULL, idempotency_key TEXT);
`;

type Row = Record<string, string | number | null>;

/** A store in the SQLite file at `path` (":memory:" for one that lives as long as the process). */
export function createSqliteStore(path: string): Store {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  const get = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).get(...args) as Row | undefined;
  const run = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).run(...args);
  /** Runs `work` in one transaction, so checks and writes can't interleave with another request's. */
  const atomically = <T>(work: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };
  const user = (row: Row | undefined): User | null => (row ? { id: String(row.id), email: String(row.email) } : null);

  return {
    users: {
      byId: async (id) => user(get("SELECT id, email FROM users WHERE id = ?", id)),
      byEmail: async (email) => user(get("SELECT id, email FROM users WHERE email = ?", email.toLowerCase())),
      ensure: async (email) =>
        atomically(() => {
          const normal = email.toLowerCase();
          const existing = user(get("SELECT id, email FROM users WHERE email = ?", normal));
          if (existing) return existing;
          const id = `usr_${globalThis.crypto.randomUUID().slice(0, 12)}`;
          run("INSERT INTO users (id, email) VALUES (?, ?)", id, normal);
          return { id, email: normal };
        }),
    },
    sessions: {
      create: async (tokenHash, userId, expiresAt) => void run("INSERT INTO sessions VALUES (?, ?, ?)", tokenHash, userId, expiresAt),
      async userOf(tokenHash, now) {
        const row = get("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?", tokenHash, now);
        return row ? String(row.user_id) : null;
      },
      delete: async (tokenHash) => void run("DELETE FROM sessions WHERE token_hash = ?", tokenHash),
    },
    links: {
      async create(tokenHash, email, createdAt, expiresAt) {
        run("INSERT INTO links VALUES (?, ?, ?)", tokenHash, email.toLowerCase(), expiresAt);
        run("INSERT INTO links_sent VALUES (?, ?)", email.toLowerCase(), createdAt);
      },
      take: async (tokenHash, now) =>
        atomically(() => {
          const row = get("SELECT email, expires_at FROM links WHERE token_hash = ?", tokenHash);
          run("DELETE FROM links WHERE token_hash = ?", tokenHash);
          return row && now < Number(row.expires_at) ? String(row.email) : null;
        }),
      countSince: async (email, since) => Number(get("SELECT COUNT(*) AS n FROM links_sent WHERE email = ? AND at > ?", email.toLowerCase(), since)?.n ?? 0),
    },
    orders: {
      async get(id) {
        const row = get("SELECT id, owner_id, item, total FROM orders WHERE id = ?", id);
        return row ? { id: String(row.id), ownerId: String(row.owner_id), item: String(row.item), total: Number(row.total) } : null;
      },
      add: async (order) => void run("INSERT OR REPLACE INTO orders VALUES (?, ?, ?, ?)", order.id, order.ownerId, order.item, order.total),
    },
    returns: {
      request: async (orderId, ownerId, id) =>
        atomically(() => {
          const row = get("SELECT id FROM returns WHERE order_id = ?", orderId);
          if (row) return { id: String(row.id), created: false };
          run("INSERT INTO returns VALUES (?, ?, ?)", orderId, id, ownerId);
          return { id, created: true };
        }),
    },
    tickets: {
      add: async (t) => void run("INSERT INTO tickets VALUES (?, ?, ?, ?)", t.id, t.ownerId, t.subject, t.message),
    },
    bookings: {
      reserve: async (b) =>
        atomically(() => {
          if (get("SELECT 1 FROM bookings WHERE check_in < ? AND ? < check_out", b.checkOut, b.checkIn)) return false;
          run("INSERT INTO bookings VALUES (?, ?, ?, ?)", b.id, b.ownerId, b.checkIn, b.checkOut);
          return true;
        }),
    },
    profiles: {
      put: async (userId, p) => void run("INSERT OR REPLACE INTO profiles VALUES (?, ?, ?)", userId, p.displayName, p.bio),
    },
    settings: {
      put: async (userId, s) => void run("INSERT OR REPLACE INTO settings VALUES (?, ?, ?, ?)", userId, s.language, s.orderUpdates ? 1 : 0, s.promotions ? 1 : 0),
    },
    payments: {
      add: async (p) => void run("INSERT INTO payments VALUES (?, ?, ?, ?, ?)", p.id, p.ownerId, p.amount, p.note, p.at),
    },
    idempotency: {
      claim: async (scope, key, fingerprint, now): Promise<KeyState> =>
        atomically(() => {
          const row = get("SELECT fingerprint, at, status, body FROM idempotency WHERE scope = ? AND key = ?", scope, key);
          if (!row || now - Number(row.at) >= KEY_TTL_MS) {
            run("INSERT OR REPLACE INTO idempotency (scope, key, fingerprint, at) VALUES (?, ?, ?, ?)", scope, key, fingerprint, now);
            return { state: "new" };
          }
          if (row.fingerprint !== fingerprint) return { state: "conflict" };
          return row.status === null ? { state: "pending" } : { state: "done", status: Number(row.status), body: JSON.parse(String(row.body)) as unknown };
        }),
      finish: async (scope, key, status, body) => void run("UPDATE idempotency SET status = ?, body = ? WHERE scope = ? AND key = ?", status, JSON.stringify(body), scope, key),
      release: async (scope, key) => void run("DELETE FROM idempotency WHERE scope = ? AND key = ?", scope, key),
    },
    audit: {
      add: async (e) => void run("INSERT INTO audit (at, user_id, tool, outcome, idempotency_key) VALUES (?, ?, ?, ?, ?)", e.at, e.userId, e.tool, e.outcome, e.idempotencyKey),
      list: async () =>
        (db.prepare("SELECT at, user_id, tool, outcome, idempotency_key FROM audit ORDER BY seq").all() as Row[]).map((r) => ({
          at: Number(r.at),
          userId: r.user_id === null ? null : String(r.user_id),
          tool: String(r.tool),
          outcome: String(r.outcome),
          idempotencyKey: r.idempotency_key === null ? null : String(r.idempotency_key),
        })),
    },
    close: () => db.close(),
  };
}
