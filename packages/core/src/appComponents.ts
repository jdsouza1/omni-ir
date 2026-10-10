// App-defined components (Step 20, PLAN-APPCOMPONENTS.md, SPEC.md "App-defined components"): an app
// declares its own components with the same kinds of value the Trusted Catalog uses, and every line
// that uses one is checked like a built-in component. The declaration is plain JSON, so the Swift
// and Kotlin parsers read exactly the same thing and check it the same way. An app component can
// show values, edit one $state and hold children; it can never run an action, carry styling or code,
// or load a URL.
import { z } from "zod";
import { ASSET_NAME, COMPONENTS, LIMITS, MAX_TEXT, NodeRef, RESERVED_WORDS, StateRef } from "./schema.js";

/** A thrown declaration problem: found when the app starts, never while a stream is read. */
export class AppComponentError extends Error {
  override name = "AppComponentError";
}

interface Optional {
  /** The prop may be left out. */
  optional?: boolean;
}

/** One prop of an app component, as plain JSON (the language-neutral declaration). */
export type AppProp =
  | ({ kind: "text"; minLength?: number; maxLength?: number; state?: boolean } & Optional)
  | ({ kind: "number"; minimum?: number; maximum?: number; integer?: boolean; state?: boolean } & Optional)
  | ({ kind: "boolean" } & Optional)
  | ({ kind: "oneOf"; values: string[] } & Optional)
  | ({ kind: "state"; holds: StateHolds } & Optional)
  | ({ kind: "picture" } & Optional)
  | ({ kind: "list"; item: "text" | "number"; maxItems?: number } & Optional);

/** What kind of value an edited `$state` holds. */
export type StateHolds = "text" | "number" | "boolean";

export interface AppComponentDeclaration {
  /** What it is, in one sentence, for the model (and for people reviewing streams). */
  description: string;
  /** Props that may be written without their names, in order; `children` may be among them. */
  positional?: string[];
  props: Record<string, AppProp>;
  /** Present when it holds other components: at most `max` of them. */
  children?: { max: number };
  /** It edits a `$state` (its `value` prop) the person fills in, and accepts `required` (SPEC.md [8.2]). */
  field?: boolean;
}

export type AppComponentDeclarations = Readonly<Record<string, AppComponentDeclaration>>;

/** A declared component, ready for the parser. */
export interface AppComponent {
  readonly name: string;
  readonly declaration: AppComponentDeclaration;
  readonly positional: readonly string[];
  /** Checks a line's props (children as references, as the catalog's do). */
  readonly schema: z.ZodType;
  readonly field: boolean;
  /** What the `$state` it edits holds, when it edits one. */
  readonly holds: StateHolds | undefined;
}

export type AppComponents = Readonly<Record<string, AppComponent>>;

// ---------------------------------------------------------------------------
// Value helpers: each returns the plain JSON for one prop.
// ---------------------------------------------------------------------------

/** Text, or a `$state` whose current value is shown (unless `state: false`). */
export const text = (o: Omit<Extract<AppProp, { kind: "text" }>, "kind"> = {}): AppProp => ({ kind: "text", ...o });
/** A number, or a `$state` whose current value is shown (unless `state: false`). */
export const number = (o: Omit<Extract<AppProp, { kind: "number" }>, "kind"> = {}): AppProp => ({ kind: "number", ...o });
export const boolean = (o: Optional = {}): AppProp => ({ kind: "boolean", ...o });
/** One of the listed text values. */
export const oneOf = (values: string[], o: Optional = {}): AppProp => ({ kind: "oneOf", values, ...o });
/** The `$state` the component edits; the prop must be called `value`. */
export const state = (holds: StateHolds, o: Optional = {}): AppProp => ({ kind: "state", holds, ...o });
/** A picture name: registered with the app, or matching one of its picture patterns. Never a URL. */
export const picture = (o: Optional = {}): AppProp => ({ kind: "picture", ...o });
/** A list of plain text or numbers. */
export const list = (item: "text" | "number", o: Optional & { maxItems?: number } = {}): AppProp => ({ kind: "list", item, ...o });

// ---------------------------------------------------------------------------
// Declaring
// ---------------------------------------------------------------------------

const NAME = /^[A-Z][A-Za-z0-9]{0,63}$/;
const PROP_NAME = /^[a-z][A-Za-z0-9]{0,63}$/;
/** Prop names with a meaning of their own: children, actions (Buttons only) and field checks. */
const reservedProps = () => new Set(["children", "action", "required", "kind", ...RESERVED_WORDS]);
/** Names a component can't take: the catalog's, McpMutation, and App (the kind app nodes have). */
const takenNames = () => new Set([...Object.keys(COMPONENTS), "McpMutation", "App"]);
export const APP_LIMITS = { props: 24, description: 300, listItems: 50 } as const;

function refuse(name: string, why: string): never {
  throw new AppComponentError(`app component "${name}": ${why}`);
}

const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);

function propSchema(component: string, prop: string, p: AppProp): z.ZodType {
  const bad: (why: string) => never = (why) => refuse(component, `prop "${prop}" ${why}`);
  let schema: z.ZodType;
  switch (p.kind) {
    case "text": {
      if ((p.minLength !== undefined && !(Number.isInteger(p.minLength) && p.minLength >= 0)) || (p.maxLength !== undefined && !(Number.isInteger(p.maxLength) && p.maxLength >= 1 && p.maxLength <= MAX_TEXT))) bad(`needs whole-number lengths up to ${MAX_TEXT}`);
      if (p.minLength !== undefined && p.maxLength !== undefined && p.minLength > p.maxLength) bad("has minLength above maxLength");
      let s = z.string().max(p.maxLength ?? MAX_TEXT);
      if (p.minLength !== undefined) s = s.min(p.minLength);
      schema = p.state === false ? s : z.union([s, StateRef]);
      break;
    }
    case "number": {
      if ((p.minimum !== undefined && !finite(p.minimum)) || (p.maximum !== undefined && !finite(p.maximum))) bad("needs finite limits");
      if (p.minimum !== undefined && p.maximum !== undefined && p.minimum > p.maximum) bad("has a minimum above its maximum");
      let n = z.number().finite();
      if (p.integer === true) n = n.int();
      if (p.minimum !== undefined) n = n.min(p.minimum);
      if (p.maximum !== undefined) n = n.max(p.maximum);
      schema = p.state === false ? n : z.union([n, StateRef]);
      break;
    }
    case "boolean":
      schema = z.boolean();
      break;
    case "oneOf":
      if (!Array.isArray(p.values) || p.values.length === 0 || p.values.length > APP_LIMITS.listItems || !p.values.every((v) => typeof v === "string" && v.length > 0 && v.length <= 200)) bad("needs 1 to 50 text choices");
      schema = z.enum(p.values as [string, ...string[]]);
      break;
    case "state":
      if (prop !== "value") bad('edits a $state, so it must be called "value"');
      if (!["text", "number", "boolean"].includes(p.holds)) bad('needs holds: "text", "number" or "boolean"');
      schema = StateRef;
      break;
    case "picture":
      schema = z.string().max(64).regex(ASSET_NAME, "pictures are named, never a URL");
      break;
    case "list": {
      if (p.item !== "text" && p.item !== "number") bad('needs item: "text" or "number"');
      const max = p.maxItems ?? APP_LIMITS.listItems;
      if (!(Number.isInteger(max) && max >= 1 && max <= APP_LIMITS.listItems)) bad(`needs maxItems from 1 to ${APP_LIMITS.listItems}`);
      schema = z.array(p.item === "text" ? z.string().max(MAX_TEXT) : z.number().finite()).max(max);
      break;
    }
    default:
      return bad("has an unknown kind");
  }
  return p.optional === true ? schema.optional() : schema;
}

function compile(name: string, declaration: AppComponentDeclaration): AppComponent {
  if (!NAME.test(name)) refuse(name, "names start with a capital letter and use only letters and digits");
  if (takenNames().has(name)) refuse(name, "this name is taken by the Trusted Catalog");
  const d = declaration;
  if (typeof d.description !== "string" || d.description.trim() === "" || d.description.length > APP_LIMITS.description) refuse(name, `needs a description of 1 to ${APP_LIMITS.description} characters`);
  const entries = Object.entries(d.props ?? {});
  if (entries.length > APP_LIMITS.props) refuse(name, `has more than ${APP_LIMITS.props} props`);
  const shape: Record<string, z.ZodType> = {};
  let holds: StateHolds | undefined;
  for (const [prop, p] of entries) {
    if (!PROP_NAME.test(prop) || reservedProps().has(prop)) refuse(name, `"${prop}" can't be a prop name`);
    shape[prop] = propSchema(name, prop, p);
    if (p.kind === "state") holds = p.holds;
  }
  if (d.field === true) {
    if (holds === undefined) refuse(name, 'a field edits a $state: give it a "value" prop made with state()');
    shape.required = z.boolean().optional();
  }
  if (d.children !== undefined) {
    const max = d.children.max;
    if (!(Number.isInteger(max) && max >= 1 && max <= LIMITS.children)) refuse(name, `children.max must be from 1 to ${LIMITS.children}`);
    shape.children = z.array(NodeRef).max(max).optional();
  }
  const positional = d.positional ?? [];
  for (const p of positional) {
    if (!Object.hasOwn(shape, p) || p === "required") refuse(name, `positional "${p}" isn't one of its props`);
  }
  if (new Set(positional).size !== positional.length) refuse(name, "lists a positional prop twice");
  return Object.freeze({ name, declaration: structuredClone(d), positional: Object.freeze([...positional]), schema: z.strictObject(shape), field: d.field === true, holds });
}

/**
 * Declare the app's components. Throws an AppComponentError for any problem, so a bad declaration
 * stops the app at startup (and in its tests) instead of rejecting lines later.
 */
export function defineComponents(declarations: AppComponentDeclarations): AppComponents {
  const out: Record<string, AppComponent> = Object.create(null);
  for (const [name, declaration] of Object.entries(declarations)) out[name] = compile(name, declaration);
  return Object.freeze(out);
}

/** The declarations as plain JSON, for the Swift and Kotlin apps and the conformance cases. */
export function componentDeclarations(components: AppComponents): Record<string, AppComponentDeclaration> {
  return Object.fromEntries(Object.values(components).map((c) => [c.name, c.declaration]));
}

// ---------------------------------------------------------------------------
// Pictures looked up when drawn
// ---------------------------------------------------------------------------

/** A family of picture names the app looks up when a screen is drawn, such as `product-{id}`. */
export interface PicturePattern {
  /** The fixed start, such as `product-`. */
  readonly prefix: string;
  /** `digits`: 0-9; `letters-digits`: a-z and 0-9. */
  readonly id: "digits" | "letters-digits";
  /** Longest id. */
  readonly maxLength: number;
}

const PATTERN = /^([a-z0-9][a-z0-9-]*-)\{id\}$/;

export function picturePattern(pattern: string, options: { id: PicturePattern["id"]; maxLength?: number }): PicturePattern {
  const m = PATTERN.exec(pattern);
  if (m === null) throw new AppComponentError(`picture pattern "${pattern}": write a lowercase prefix ending in "-", then {id}, such as "product-{id}"`);
  const prefix = m[1]!;
  const maxLength = options.maxLength ?? 32;
  if (options.id !== "digits" && options.id !== "letters-digits") throw new AppComponentError(`picture pattern "${pattern}": id is "digits" or "letters-digits"`);
  if (!(Number.isInteger(maxLength) && maxLength >= 1 && prefix.length + maxLength <= 64)) throw new AppComponentError(`picture pattern "${pattern}": names are at most 64 characters`);
  return Object.freeze({ prefix, id: options.id, maxLength });
}

/** True when a picture name matches one of the app's patterns. */
export function matchesPicturePattern(name: string, patterns: readonly PicturePattern[]): boolean {
  return patterns.some((p) => {
    if (!name.startsWith(p.prefix)) return false;
    const id = name.slice(p.prefix.length);
    return id.length >= 1 && id.length <= p.maxLength && (p.id === "digits" ? /^[0-9]+$/ : /^[a-z0-9]+$/).test(id);
  });
}
