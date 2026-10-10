// @omni-ir/elements: <omni-screen>, Omni-IR in any web framework or none (Step 21, PLAN-ELEMENTS.md).
// The React renderer, built on Preact (decision 1), drawn into the element's shadow root with the
// catalog's styles (decision 2). What only the app may set are properties; plain settings are
// attributes; notices are events (decision 3). Tool params may be JSON Schema or Zod (decision 4).
// App components are the app's own custom elements, by tag name (decision 5).
import { createElement, useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { z } from "zod";
import {
  createParser,
  defineComponents,
  describeScreen,
  type AppComponentDeclaration,
  type DescribeScreenOptions,
  type OmniParser,
  type PicturePattern,
  type ToolRegistry,
} from "@omni-ir/core";
import {
  createMutationHandler,
  generate,
  OmniRenderer,
  type AppViewProps,
  type AppViews,
  type Confirmation,
  type GenerateOutcome,
  type MutationCall,
  type Picture,
  type RendererEvent,
  type StringKey,
} from "@omni-ir/react";
import css from "../../react/src/catalog/omni.css?inline";

/** A tool's params: a Zod schema, or JSON Schema (no build step needed). */
export type ToolParams = z.ZodType | Readonly<Record<string, unknown>>;

/** An app component: its plain-JSON declaration and the tag of the app's custom element that draws it. */
export type ElementComponent = AppComponentDeclaration & { tag?: string };

/**
 * The catalog's styles for a shadow root: the design tokens' defaults move from `.omni-root` to the
 * host, so a page's `omni-screen { --omni-accent: … }` wins over them, as on React.
 */
export const ELEMENT_CSS = `:host { display: block; }\n${css
  // Quotes are optional: a minifier drops them.
  .replace(/:where\(\.omni-root\[data-theme="?dark"?\]\)/g, ':host([theme="dark"])')
  .replace(/:where\(\.omni-root\[data-theme="?system"?\]\)/g, ':host([theme="system"])')
  .replace(/:where\(\.omni-root\)/g, ":host")}`;

const isZod = (schema: ToolParams): schema is z.ZodType => typeof (schema as { safeParse?: unknown }).safeParse === "function";

function toolRegistry(tools: Readonly<Record<string, ToolParams>>): ToolRegistry {
  return Object.fromEntries(
    Object.entries(tools).map(([name, schema]) => [name, isZod(schema) ? schema : z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0])]),
  );
}

/** The app's custom element for one component: checked props, its field and pictures as properties; children inside. */
function customElementView(tag: string): ComponentType<AppViewProps> {
  return function AppCustomElement({ props, children, picture, field, name }: AppViewProps) {
    const ref = useRef<HTMLElement & Record<string, unknown>>(null);
    useEffect(() => {
      const el = ref.current;
      if (el === null) return;
      el.props = props;
      el.picture = picture;
      el.field = field;
      el.componentName = name;
    });
    return createElement(tag, { ref }, children as ReactNode);
  };
}

const THEMES = new Set(["light", "dark", "system"]);

export class OmniScreenElement extends HTMLElement {
  static readonly observedAttributes = ["theme", "locale", "endpoint"];

  #tools: ToolRegistry = {};
  #assets: Readonly<Record<string, Picture>> = {};
  #components: Readonly<Record<string, ElementComponent>> = {};
  #appComponents = defineComponents({});
  #views: AppViews = {};
  #pictures: readonly PicturePattern[] = [];
  #confirm: Readonly<Record<string, Confirmation>> = {};
  #strings: Partial<Record<StringKey, string>> | undefined;
  #parser: OmniParser | null = null;
  #root: Root | null = null;
  #controller: AbortController | null = null;

  /** Runs a governed action after its params passed the tool's schema. Without it, actions go to `endpoint`'s /api/mutate. */
  onMutation: ((call: MutationCall) => void | Promise<void>) | undefined;
  /** Pictures the app looks up when drawn, for names matching `pictures` (Step 20). */
  resolvePicture: ((name: string) => Picture | undefined) | undefined;
  /** The fetch used by generate() and the default actions; defaults to the page's. */
  fetch: typeof globalThis.fetch | undefined;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = ELEMENT_CSS;
    const mount = document.createElement("div");
    shadow.append(style, mount);
    this.#root = createRoot(mount);
  }

  // MARK: Properties only the app sets

  /** The backend actions screens may call, each with its params as Zod or JSON Schema. */
  get tools(): ToolRegistry {
    return this.#tools;
  }
  set tools(tools: Readonly<Record<string, ToolParams>>) {
    this.#tools = toolRegistry(tools);
    this.reset();
  }

  /** The pictures screens may name. */
  get assets(): Readonly<Record<string, Picture>> {
    return this.#assets;
  }
  set assets(assets: Readonly<Record<string, Picture>>) {
    this.#assets = assets;
    this.reset();
  }

  /** The app's own components: declarations, each with the tag of the custom element that draws it. Throws for a bad declaration. */
  get components(): Readonly<Record<string, ElementComponent>> {
    return this.#components;
  }
  set components(components: Readonly<Record<string, ElementComponent>>) {
    const declarations: Record<string, AppComponentDeclaration> = {};
    const views: Record<string, ComponentType<AppViewProps>> = {};
    for (const [name, { tag, ...declaration }] of Object.entries(components)) {
      declarations[name] = declaration;
      if (tag !== undefined) views[name] = customElementView(tag);
    }
    this.#appComponents = defineComponents(declarations);
    this.#components = components;
    this.#views = views;
    this.reset();
  }

  /** Families of picture names looked up when drawn, such as `product-{id}` (Step 20). */
  get pictures(): readonly PicturePattern[] {
    return this.#pictures;
  }
  set pictures(pictures: readonly PicturePattern[]) {
    this.#pictures = pictures;
    this.reset();
  }

  /** Tools whose actions need the person's confirmation, with the app's sentence or function for each. */
  get confirm(): Readonly<Record<string, Confirmation>> {
    return this.#confirm;
  }
  set confirm(confirm: Readonly<Record<string, Confirmation>>) {
    this.#confirm = confirm;
    this.#draw();
  }

  /** The renderer's own words, replacing the English ones key by key. */
  get strings(): Partial<Record<StringKey, string>> | undefined {
    return this.#strings;
  }
  set strings(strings: Partial<Record<StringKey, string>> | undefined) {
    this.#strings = strings;
    this.#draw();
  }

  // MARK: Feeding a screen

  /** Write Omni-IR text as it arrives; it may end anywhere, even in the middle of a line. */
  write(text: string | Uint8Array): void {
    this.#ensureParser().write(text);
  }

  /** End of stream: parts that never arrived become fallbacks. */
  end(): void {
    this.#ensureParser().end();
  }

  /** Start a new, empty screen (registries changed, or the app wants a fresh one). */
  reset(): void {
    this.#controller?.abort();
    this.#controller = null;
    this.#parser = null;
    this.#ensureParser();
  }

  /** Ask an Omni-IR server (the `endpoint` attribute, or this page's origin) for a screen, streaming it in. */
  async generate(prompt: string): Promise<GenerateOutcome> {
    this.reset();
    const controller = new AbortController();
    this.#controller = controller;
    const outcome = await generate(prompt, {
      parser: this.#ensureParser(),
      signal: controller.signal,
      baseUrl: this.getAttribute("endpoint") ?? "",
      ...(this.fetch ? { fetch: this.fetch } : {}),
    });
    this.dispatchEvent(new CustomEvent("omni-done", { detail: outcome }));
    return outcome;
  }

  /** The screen as plain text, one component per line; what the person typed stays out unless asked. */
  describe(options?: DescribeScreenOptions): string {
    return describeScreen(this.#ensureParser().getSnapshot(), options);
  }

  // MARK: Lifecycle

  attributeChangedCallback(): void {
    this.#draw();
  }

  disconnectedCallback(): void {
    this.#controller?.abort();
  }

  #ensureParser(): OmniParser {
    if (this.#parser === null) {
      this.#parser = createParser({ tools: this.#tools, assets: this.#assets, components: this.#appComponents, pictures: this.#pictures });
      this.#draw();
    }
    return this.#parser;
  }

  #draw(): void {
    const parser = this.#parser;
    if (parser === null || this.#root === null) return;
    const theme = this.getAttribute("theme");
    const endpoint = this.getAttribute("endpoint") ?? "";
    const onMutation =
      this.onMutation ?? createMutationHandler({ baseUrl: endpoint, ...(this.fetch ? { fetch: this.fetch } : {}) });
    this.#root.render(
      createElement(OmniRenderer, {
        // A new screen mounts a fresh renderer (new field and confirmation state).
        key: this.#generation(parser),
        store: parser.store,
        tools: this.#tools,
        assets: this.#assets,
        components: this.#views,
        confirm: this.#confirm,
        locale: this.getAttribute("locale") ?? navigator.language ?? "en-US",
        theme: theme !== null && THEMES.has(theme) ? (theme as "light" | "dark" | "system") : "light",
        onMutation: (call: MutationCall) => (this.onMutation ?? onMutation)(call),
        onEvent: (event: RendererEvent) => this.dispatchEvent(new CustomEvent("omni-event", { detail: event })),
        ...(this.resolvePicture ? { resolvePicture: (name: string) => this.resolvePicture?.(name) } : {}),
        ...(this.#strings ? { strings: this.#strings } : {}),
      }),
    );
  }

  /** A new number per parser, so a new screen mounts a fresh renderer. */
  #generations = new WeakMap<OmniParser, number>();
  #next = 0;
  #generation(parser: OmniParser): number {
    let n = this.#generations.get(parser);
    if (n === undefined) {
      n = ++this.#next;
      this.#generations.set(parser, n);
    }
    return n;
  }
}

if (typeof customElements !== "undefined" && customElements.get("omni-screen") === undefined) {
  customElements.define("omni-screen", OmniScreenElement);
}

declare global {
  interface HTMLElementTagNameMap {
    "omni-screen": OmniScreenElement;
  }
}
