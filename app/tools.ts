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
  // Sign-in is by emailed link: the catalog has no password input, by design.
  "auth.sendMagicLink": z.strictObject({
    email: z.email(),
  }),
  "profile.update": z.strictObject({
    displayName: z.string().trim().min(1).max(60),
    bio: z.string().max(160),
  }),
  "orders.requestReturn": z.strictObject({
    orderId: z.string().regex(/^[A-Z0-9-]{4,32}$/),
  }),
  "support.createTicket": z.strictObject({
    subject: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(2000),
  }),
};
