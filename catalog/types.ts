import type { ComponentType as ReactComponentType, ReactNode } from "react";
import type { ComponentProps, ComponentType, Primitive, StateRef } from "../engine/schema";

/** A prop as the component sees it: state references are replaced by their current value. */
type Resolve<V> = V extends StateRef ? Primitive : V;

export type ResolvedProps<K extends ComponentType> = {
  [P in keyof ComponentProps[K]]: Resolve<ComponentProps[K][P]>;
};

/** Extra props the renderer supplies to interactive components. */
export interface InteractionProps {
  Input: { value: string; onChange: (value: string) => void };
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

export type CatalogProps<K extends ComponentType> = {
  id: string;
  props: ResolvedProps<K>;
  children: ReactNode;
  locale: string;
} & (K extends keyof InteractionProps ? InteractionProps[K] : unknown);

/**
 * The Trusted Catalog: one React component per protocol component type.
 * The mapped type makes a missing entry a compile error (Task 4.2).
 */
export type Catalog = { [K in ComponentType]: ReactComponentType<CatalogProps<K>> };
