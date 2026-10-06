// Sign-in for the reference server (PLAN-BACKEND.md B): a one-time link sent by email, then a session.
// A browser keeps its session in an HttpOnly cookie; a native app gets a bearer token. Secrets are
// random 256-bit tokens, stored only as SHA-256 hashes. Uses Web Crypto, not node:crypto, so the
// same code runs in the hosted playground.
//
// This is an example to learn from and test against. An app with its own sign-in plugs it in
// through createApp's `authenticate` option instead.
import type { Store, User } from "./types";

export const SESSION_COOKIE = "omni_session";
export const LINK_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** At most this many links per address per hour; more requests get the same answer but no email. */
export const LINKS_PER_HOUR = 5;

/** Sends sign-in links. Apps plug in their own mail service. */
export interface Mailer {
  send(message: { to: string; subject: string; text: string; link: string }): Promise<void>;
}

/** Development mail: keeps every message in `sent` (for tests) and optionally prints the link. Never sends anything. */
export function createDevMailer(print?: (line: string) => void): Mailer & { sent: { to: string; subject: string; text: string; link: string }[] } {
  const sent: { to: string; subject: string; text: string; link: string }[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
      print?.(`[dev mail] sign-in link: ${message.link}`);
    },
  };
}

/** A random token: 32 bytes, base64url (43 characters). */
export function newToken(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 as hex: how tokens are stored. */
export async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Email a sign-in link, unless this address has had too many in the last hour. The caller answers
 * the same either way, so nobody can tell whether an address has an account or was limited.
 */
export async function sendSignInLink(store: Store, mailer: Mailer, email: string, now: number, publicUrl: string): Promise<void> {
  if ((await store.links.countSince(email, now - 60 * 60 * 1000)) >= LINKS_PER_HOUR) return;
  const token = newToken();
  await store.links.create(await sha256(token), email, now, now + LINK_TTL_MS);
  const link = `${publicUrl.replace(/\/$/, "")}/api/auth/callback?token=${token}`;
  await mailer.send({ to: email.toLowerCase(), subject: "Your sign-in link", text: `Sign in within 15 minutes: ${link}\nIf you didn't ask for this, ignore this email.`, link });
}

/** Use a link once: the person it was sent to, created on first sign-in, with a new session token. */
export async function redeemLink(store: Store, token: string, now: number): Promise<{ user: User; session: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const email = await store.links.take(await sha256(token), now);
  if (email === null) return null;
  const user = await store.users.ensure(email);
  const session = newToken();
  await store.sessions.create(await sha256(session), user.id, now + SESSION_TTL_MS);
  return { user, session };
}

/** The user a session token belongs to, or null. */
export async function userOfSession(store: Store, token: string, now: number): Promise<User | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const userId = await store.sessions.userOf(await sha256(token), now);
  return userId === null ? null : store.users.byId(userId);
}

export async function endSession(store: Store, token: string): Promise<void> {
  if (/^[A-Za-z0-9_-]{43}$/.test(token)) await store.sessions.delete(await sha256(token));
}

/** The session cookie for a browser: script-proof (HttpOnly), not sent on cross-site requests (SameSite=Lax). */
export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure ? "; Secure" : ""}`;
}

export function clearedCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}

/** Where a request's credentials came from: a cookie (needs an Origin check), a bearer token, or none. */
export interface Credentials {
  token: string | null;
  via: "cookie" | "bearer" | null;
}

/** Read the session token from `Authorization: Bearer …` or the session cookie. */
export function credentialsOf(headers: { authorization?: string | undefined; cookie?: string | undefined }): Credentials {
  const bearer = /^Bearer ([A-Za-z0-9_-]+)$/.exec(headers.authorization ?? "");
  if (bearer) return { token: bearer[1]!, via: "bearer" };
  for (const part of (headers.cookie ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE && value.join("=") !== "") return { token: value.join("="), via: "cookie" };
  }
  return { token: null, via: null };
}
