import type { OmniStrings } from "./strings.js";
import type { ComponentType as ReactComponentType, ReactNode } from "react";
import type { ComponentProps, ComponentType, Primitive, StateRef } from "@omni-ir/core";

/** A prop as the component sees it: state references are replaced by their current value. */
type Resolve<V> = V extends StateRef ? Primitive : V;

export type ResolvedProps<K extends ComponentType> = {
  [P in keyof ComponentProps[K]]: Resolve<ComponentProps[K][P]>;
};

/** A picture from the app's asset registry, as the renderer resolves it. */
export interface Picture {
  src: string;
  width: number;
  height: number;
}

/**
 * What a form field shows about its own checks (SPEC.md [8.1]–[8.5]). Optional, so an app's own
 * catalog that ignores them still compiles; the press is blocked by the renderer either way ([8.6]).
 */
export interface FieldFeedback {
  /** The renderer's own sentence for the field's problem, once it should be shown. */
  error?: string | undefined;
  /** The id to give the message, for the field's aria-describedby. */
  errorId?: string | undefined;
  /** Call when the person leaves the field: its message may show from then on. */
  onBlur?: (() => void) | undefined;
}

/**
 * What an app's own view receives (Step 20): checked props with `$state` read, its children as
 * slots, pictures by name, and for a component that edits a `$state` its value, how to change it,
 * and the field's message ([8.5]). The view is the app's code; the stream only chose the values.
 */
export interface AppViewProps {
  id: string;
  /** The component's name, such as "ProductCard". */
  name: string;
  props: Readonly<Record<string, unknown>>;
  children: ReactNode;
  locale: string;
  strings: OmniStrings;
  /** A picture by name: the app's registered ones, then its lookup. Undefined when there is none. */
  picture: (name: string | undefined) => Picture | undefined;
  /** For a component that edits a `$state`: its value and how to change it, plus its field message. */
  field?: ({ value: Primitive; onChange: (value: Primitive) => void } & FieldFeedback) | undefined;
}

/** The app's views for its own components, by name. */
export type AppViews = Readonly<Record<string, ReactComponentType<AppViewProps>>>;

/** Extra props the renderer supplies to interactive components and pictures. */
export interface InteractionProps {
  Input: { value: string; onChange: (value: string) => void } & FieldFeedback;
  DateInput: { value: string; onChange: (value: string) => void } & FieldFeedback;
  Select: { value: string; onChange: (value: string) => void } & FieldFeedback;
  Switch: { value: boolean; onChange: (value: boolean) => void } & FieldFeedback;
  /** Each Tab child's label, in order; undefined while that Tab's line hasn't arrived. */
  Tabs: { tabs: readonly { id: string; label: string | undefined }[] };
  /** Each Series child's data, in order; undefined while that Series' line hasn't arrived. */
  BarChart: { series: readonly ({ id: string; name: string; values: readonly number[] } | undefined)[] };
  LineChart: { series: readonly ({ id: string; name: string; values: readonly number[] } | undefined)[] };
  /** Each Slice child's data, in order; undefined while that Slice's line hasn't arrived. */
  PieChart: { slices: readonly ({ id: string; name: string; value: number } | undefined)[] };
  /** Undefined when the renderer's asset registry doesn't have the named image. */
  Image: { picture: Picture | undefined };
  ListItem: { picture: Picture | undefined };
  Button: {
    /** Undefined when pressing does nothing (disabled, or no handler). */
    onPress: (() => void) | undefined;
    disabled: boolean;
    /** Set when an McpMutation was blocked or cannot run (R6). */
    error: string | undefined;
    /** The governing tool, rendered as data-mcp-tool. */
    mcpTool: string | undefined;
  };
}

/** How a chart writes its values (its `format` and `currency` props). */
export interface ChartFormatProps {
  format?: "number" | "currency" | "percent" | undefined;
  currency?: string | undefined;
}

export type CatalogProps<K extends ComponentType> = {
  id: string;
  props: ResolvedProps<K>;
  children: ReactNode;
  locale: string;
  /** The renderer's own words (strings.ts): the app's, or English. */
  strings: OmniStrings;
} & (K extends keyof InteractionProps ? InteractionProps[K] : unknown);

/**
 * The Trusted Catalog: one React component per protocol component type.
 * The mapped type makes a missing entry a compile error (Task 4.2).
 */
export type Catalog = { [K in ComponentType]: ReactComponentType<CatalogProps<K>> };
