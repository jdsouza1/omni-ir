// @omni-ir/react: the Trusted Catalog and the renderer for React, plus browser helpers for the
// Omni-IR server endpoints. Import the styles once with `import "@omni-ir/react/omni.css"`.
export { OmniRenderer, NodeFallback, type OmniRendererProps, type FallbackReason, type MutationCall, type RendererEvent } from "./renderer/index.js";
export { DEFAULT_CATALOG } from "./catalog/catalog.js";
export type { Catalog, CatalogProps, InteractionProps, Picture, ResolvedProps } from "./catalog/types.js";
export { generate, type GenerateClientOptions, type GenerateOutcome } from "./client/generate.js";
export { createMutationHandler, MutationRejectedError, type MutationClientOptions } from "./client/mutate.js";
export { COLOR_TOKENS, CONTRAST_PAIRS, DARK, LIGHT, SHAPE, contrast, cssVariable, type ColorToken, type Palette } from "./catalog/theme.js";
