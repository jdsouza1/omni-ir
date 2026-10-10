// A check for apps (Step 20): every component the app declared has a view on the web. Call it in a
// test, so a missing view fails before release instead of showing a fallback to people.
import type { AppComponents } from "@omni-ir/core";
import type { AppViews } from "../catalog/types.js";

/** The names of declared components that have no view, in declaration order. */
export function missingViews(components: AppComponents, views: AppViews): string[] {
  return Object.keys(components).filter((name) => !Object.hasOwn(views, name));
}
