import type { ServerConfig } from "../config";
import { MockModel } from "./mock";
import type { Model } from "./types";

/** The model the server uses. Mock unless OMNI_MODEL=claude is set explicitly. */
export function createModel(config: ServerConfig): Model {
  if (config.model === "claude") {
    // ClaudeModel arrives in Task F.2 (PLAN-SERVER.md); until then there is nothing to opt into.
    throw new Error("OMNI_MODEL=claude is not available yet; unset it to use the free mock model.");
  }
  return new MockModel({ speed: config.mockSpeed });
}
