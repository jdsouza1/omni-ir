// Types for @omni-ir/elements (Step 21). Self-contained, so an app gets them without React's or
// Zod's types; tests/elements.types.test.ts keeps them in step with the element.

/** A state value: text, a number, true or false, or null. */
export type Primitive = string | number | boolean | null;

/** A picture the app provides. */
export interface Picture {
  src: string;
  width: number;
  height: number;
}

/** A tool's params: JSON Schema, or a Zod schema (anything with `safeParse`). */
export type ToolParams = Readonly<Record<string, unknown>> | { safeParse(value: unknown): unknown };

/** A governed action, ready to send: params with `$state` read, already checked by the tool's schema. */
export interface MutationCall {
  id: string;
  target: string;
  tool: string;
  params: Record<string, unknown>;
}

/** A blocked action, a failed handler, or a press of a Button without an action. */
export type RendererEvent =
  | { type: "error"; issue: { code: string; message: string; id?: string; line?: number } }
  | { type: "press"; id: string };

/** Whether an update applied (all or nothing, SPEC.md [10.33]), with its issues; lines count from 1 in the update. */
export interface UpdateResult {
  applied: boolean;
  issues: { code: string; message: string; id?: string; line?: number }[];
}

/** The app's confirmation for a tool: a sentence with `{param}` placeholders, or a function of the params. */
export type Confirmation = string | ((params: Readonly<Record<string, unknown>>) => string);

/** How a generate() ended. */
export type GenerateOutcome =
  /** `screen`: the server keeps this screen current, and the element follows it. */
  | { status: "done"; stopReason: "end_turn" | "max_tokens" | "refusal"; model: string; ms: number; screen?: string }
  | { status: "aborted" }
  | { status: "error"; code: string; message: string; retryable: boolean };

/** One prop of an app component, in the plain-JSON declaration (SPEC.md [5.28]). */
export type AppProp =
  | { kind: "text"; minLength?: number; maxLength?: number; state?: boolean; optional?: boolean }
  | { kind: "number"; minimum?: number; maximum?: number; integer?: boolean; state?: boolean; optional?: boolean }
  | { kind: "boolean"; optional?: boolean }
  | { kind: "oneOf"; values: string[]; optional?: boolean }
  | { kind: "state"; holds: "text" | "number" | "boolean"; optional?: boolean }
  | { kind: "picture"; optional?: boolean }
  | { kind: "list"; item: "text" | "number"; maxItems?: number; optional?: boolean };

/** An app component: its declaration (SPEC.md [5.27]) and the tag of the app's custom element that draws it. */
export interface ElementComponent {
  description: string;
  positional?: string[];
  props: Record<string, AppProp>;
  children?: { max: number };
  field?: boolean;
  /** The app's custom element, such as "shop-product-card". Without one, the renderer shows its fallback. */
  tag?: string;
}

/** A family of picture names looked up when drawn, such as `product-{id}` (SPEC.md [5.30]). */
export interface PicturePattern {
  prefix: string;
  id: "digits" | "letters-digits";
  maxLength: number;
}

/**
 * What the renderer sets on an app component's custom element: its checked props (each `$state`
 * read), a picture lookup and, for a component that edits a `$state`, its field. Children arrive as
 * the element's own children: give it a <slot>.
 */
export interface AppComponentElement extends HTMLElement {
  props: Readonly<Record<string, unknown>>;
  picture: (name: string | undefined) => Picture | undefined;
  field:
    | {
        value: Primitive;
        onChange(value: Primitive): void;
        /** The renderer's message once it should show ([8.5]). */
        error?: string;
        errorId?: string;
        /** Call when the person has finished with the control. */
        onBlur?(): void;
      }
    | undefined;
  componentName: string;
}

export interface DescribeScreenOptions {
  /** Include what the person typed. Default false. */
  values?: boolean;
}

/** <omni-screen>: Omni-IR screens with the Trusted Catalog, in any web framework or none. */
export declare class OmniScreenElement extends HTMLElement {
  static readonly observedAttributes: string[];
  /** The backend actions screens may call, each with its params as JSON Schema or Zod. Setting it starts a new screen. */
  tools: Readonly<Record<string, ToolParams>>;
  /** The pictures screens may name. */
  assets: Readonly<Record<string, Picture>>;
  /** The app's own components and the custom elements that draw them. Throws for a bad declaration. */
  components: Readonly<Record<string, ElementComponent>>;
  /** Families of picture names looked up when drawn. */
  pictures: readonly PicturePattern[];
  /** Tools whose actions need the person's confirmation. */
  confirm: Readonly<Record<string, Confirmation>>;
  /** The renderer's own words, replacing the English ones key by key. */
  strings: Readonly<Record<string, string>> | undefined;
  /** Runs a governed action. Without it, actions go to the `endpoint` attribute's /api/mutate. */
  onMutation: ((call: MutationCall) => void | Promise<void>) | undefined;
  /** Pictures for names matching `pictures`, looked up when drawn. */
  resolvePicture: ((name: string) => Picture | undefined) | undefined;
  /** The fetch for generate() and the default actions. */
  fetch: typeof globalThis.fetch | undefined;

  /** Write Omni-IR text as it arrives. */
  write(text: string | Uint8Array): void;
  /** End of stream. */
  end(): void;
  /** Start a new, empty screen. */
  reset(): void;
  /** Ask an Omni-IR server for a screen and stream it in; dispatches `omni-done`, then follows the screen if the server keeps it current. */
  generate(prompt: string): Promise<GenerateOutcome>;
  /** Apply an update from the app's own code to the ended screen; dispatches `omni-update`. Never pass text a model wrote. */
  update(text: string): UpdateResult;
  /** The screen as plain text. */
  describe(options?: DescribeScreenOptions): string;
}

/** The catalog's styles as used in the element's shadow root. */
export declare const ELEMENT_CSS: string;

declare global {
  interface HTMLElementTagNameMap {
    "omni-screen": OmniScreenElement;
  }
  interface HTMLElementEventMap {
    "omni-event": CustomEvent<RendererEvent>;
    "omni-done": CustomEvent<GenerateOutcome>;
    /** Each update applied or rejected; a rejected one is a bug in the app's code. */
    "omni-update": CustomEvent<UpdateResult>;
  }
}
