import Anthropic from "@anthropic-ai/sdk";
import type { ServerConfig } from "../config";
import { buildSystemPrompt } from "../prompt";
import { ClaudeModel } from "./claude";
import { MockModel } from "./mock";
import type { Model } from "./types";

/**
 * The model the server uses: the free MockModel unless OMNI_MODEL=claude is set explicitly.
 * Only the Claude branch creates an SDK client, so the default never touches credentials or the network.
 */
export function createModel(config: ServerConfig): Model {
  if (config.model === "claude") {
    return new ClaudeModel({
      // Reads ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile.
      client: new Anthropic(),
      systemPrompt: buildSystemPrompt(),
      effort: config.effort,
      dailyCap: config.dailyCap,
    });
  }
  return new MockModel({ speed: config.mockSpeed });
}
