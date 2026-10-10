// @omni-ir/react: the Trusted Catalog and the renderer for React, plus browser helpers for the
// Omni-IR server endpoints. Import the styles once with `import "@omni-ir/react/omni.css"`.
export { OmniRenderer, NodeFallback, type OmniRendererProps, type FallbackReason, type MutationCall, type RendererEvent, type Confirmation } from "./renderer/index.js";
export { DEFAULT_CATALOG } from "./catalog/catalog.js";
export type { AppViewProps, AppViews, Catalog, CatalogProps, InteractionProps, Picture, ResolvedProps } from "./catalog/types.js";
export { missingViews } from "./renderer/appViews.js";
export { generate, type GenerateClientOptions, type GenerateOutcome } from "./client/generate.js";
export { createMutationHandler, MutationRejectedError, type MutationClientOptions } from "./client/mutate.js";
export { ENGLISH, fillTemplate, resolveStrings, type OmniStrings, type StringKey } from "./catalog/strings.js";
export { COLOR_TOKENS, CONTRAST_PAIRS, DARK, LIGHT, SHAPE, contrast, cssVariable, type ColorToken, type Palette } from "./catalog/theme.js";
