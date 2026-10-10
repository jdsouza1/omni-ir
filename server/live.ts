// Live screens (Step 22, SPEC.md [10.36]-[10.40]): the screens this server keeps current, their
// numbered updates, and the people following them. Shared by the Express app and the in-browser API;
// imports nothing from Node.
//
// A screen is followed only when the app has something to say about it (a LiveFeed follows it). Every
// update is the app's own text, checked against the server's copy of the screen before it is sent
// ([10.38]); one that doesn't apply is logged and never sent.
import { boundKey, type OmniParser } from "@omni-ir/core";
import type { LiveFeed } from "../app/live";

export interface LiveSink {
  update(seq: number, text: string): void;
  end(): void;
}

export interface LiveScreensOptions {
  feeds: readonly LiveFeed[];
  /** Updates kept per screen for clients that reconnect ([10.39]). */
  keep?: number;
  /** A screen nobody has followed for this long is dropped ([10.40]). */
  idleMs?: number;
  now?: () => number;
  /** Run `fn` after `ms`; returns a function that cancels it. */
  schedule?: (fn: () => void, ms: number) => () => void;
  log?: (entry: Record<string, unknown>) => void;
}

export interface LiveScreens {
  /** Follow this ended screen if a feed has something to say about it: its new id, or null. */
  open(parser: OmniParser, owner: string | null): string | null;
  /**
   * Send `sink` the updates after `after`, then each new one, then `end`. Null when the screen is
   * unknown, dropped or not this person's ([10.37]): the same answer for each.
   */
  follow(screen: string, owner: string | null, after: number, sink: LiveSink): (() => void) | null;
  /** Stop every feed (when the server stops). */
  close(): void;
  readonly size: number;
}

interface Screen {
  parser: OmniParser;
  owner: string | null;
  seq: number;
  history: { seq: number; text: string }[];
  /** The latest line of each id and $key an update assigned, for catching up ([10.39]). */
  latest: Map<string, string>;
  ended: boolean;
  sinks: Set<LiveSink>;
  lastSeen: number;
  cancel: (() => void)[];
}

const defaultSchedule = (fn: () => void, ms: number) => {
  const timer = setTimeout(fn, ms);
  return () => clearTimeout(timer);
};

/** At least 128 random bits ([10.36]). */
function screenId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `scr_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Each assignment line of an update by its id or $key (the update has already applied, so each is valid). */
function assignments(text: string): [string, string][] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line]);
}

export function createLiveScreens({ feeds, keep = 50, idleMs = 60 * 60 * 1000, now = Date.now, schedule = defaultSchedule, log = () => {} }: LiveScreensOptions): LiveScreens {
  const screens = new Map<string, Screen>();

  /** Drop screens nobody follows any more ([10.40]). */
  function sweep() {
    for (const [id, s] of screens) {
      if (s.sinks.size === 0 && now() - s.lastSeen > idleMs) {
        for (const cancel of s.cancel) cancel();
        screens.delete(id);
      }
    }
  }

  function publish(s: Screen, text: string) {
    const result = s.parser.update(text);
    if (!result.applied) {
      // A bug in the app's code: logged for the app, never sent ([10.38]).
      log({ event: "live", outcome: "update_rejected", issues: result.issues.map((i) => i.code) });
      return;
    }
    s.seq++;
    s.history.push({ seq: s.seq, text });
    if (s.history.length > keep) s.history.shift();
    for (const [key, line] of assignments(text)) {
      s.latest.delete(key); // keep them in the order they were last assigned
      s.latest.set(key, line);
    }
    for (const sink of s.sinks) sink.update(s.seq, text);
  }

  function finish(s: Screen) {
    s.ended = true;
    for (const sink of s.sinks) sink.end();
    s.sinks.clear();
    s.lastSeen = now();
  }

  /** One update that brings any earlier version of the screen up to date ([10.39]). */
  function catchUp(s: Screen): string {
    const doc = s.parser.getSnapshot();
    const mutationIds = new Set([...doc.mutations.values()].map((m) => m.id));
    const readByField = new Set([...doc.nodes.values()].flatMap((n) => boundKey(n) ?? []));
    const lines = [...s.latest].filter(([key]) =>
      key.startsWith("$") ? Object.hasOwn(doc.state, key) && !readByField.has(key) : doc.nodes.has(key) || mutationIds.has(key),
    );
    return lines.map(([, line]) => `${line}\n`).join("");
  }

  return {
    open(parser, owner) {
      sweep();
      const doc = parser.getSnapshot();
      const following = feeds.filter((feed) => feed.follows(doc));
      if (following.length === 0) return null;
      const id = screenId();
      const s: Screen = { parser, owner, seq: 0, history: [], latest: new Map(), ended: false, sinks: new Set(), lastSeen: now(), cancel: [] };
      screens.set(id, s);
      let running = following.length;
      for (const feed of following) {
        const steps = feed.steps(doc);
        const next = (n: number) => {
          if (n === steps.length) {
            if (--running === 0) finish(s);
            return;
          }
          s.cancel.push(
            schedule(() => {
              publish(s, steps[n]!.text);
              next(n + 1);
            }, steps[n]!.delayMs),
          );
        };
        next(0);
      }
      return id;
    },

    follow(screen, owner, after, sink) {
      sweep();
      const s = screens.get(screen);
      if (s === undefined || s.owner !== owner) return null;
      s.lastSeen = now();
      if (after < s.seq) {
        const missed = s.history.filter((u) => u.seq > after);
        if (missed[0]?.seq === after + 1) for (const u of missed) sink.update(u.seq, u.text);
        else sink.update(s.seq, catchUp(s));
      }
      if (s.ended) {
        sink.end();
        return () => {};
      }
      s.sinks.add(sink);
      return () => {
        s.sinks.delete(sink);
        s.lastSeen = now();
      };
    },

    close() {
      for (const s of screens.values()) for (const cancel of s.cancel) cancel();
      screens.clear();
    },

    get size() {
      return screens.size;
    },
  };
}
