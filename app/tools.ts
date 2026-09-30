// The tool registry: every backend action the UI is allowed to trigger, with a schema for its params.
// It is application code, shared by the server (/api/mutate), the browser renderer, tests and the demo.
// The stream can only name tools listed here (R6); it can never add one.
import { z } from "zod";
import type { ToolRegistry } from "../engine/schema";

export const TOOLS: ToolRegistry = {
  "payments.confirm": z.strictObject({
    amount: z.number().positive(),
    note: z.string().max(500),
  }),
};
