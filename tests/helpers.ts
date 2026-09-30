import { z } from "zod";
import type { ToolRegistry } from "../engine/schema";
import type { RawStatement, RawValue } from "../engine/types";

export const TOOLS: ToolRegistry = {
  "payments.confirm": z.strictObject({
    amount: z.number().positive(),
    note: z.string().max(500),
  }),
};

// Small builders so raw-statement fixtures read like the syntax they stand for.
export const str = (value: string): RawValue => ({ kind: "string", value });
export const num = (value: number): RawValue => ({ kind: "number", value });
export const bool = (value: boolean): RawValue => ({ kind: "boolean", value });
export const nul: RawValue = { kind: "null" };
export const ref = (name: string): RawValue => ({ kind: "ident", name });
export const st = (key: string): RawValue => ({ kind: "state", key });
export const arr = (...items: RawValue[]): RawValue => ({ kind: "array", items });
export const obj = (entries: Record<string, RawValue>): RawValue => ({ kind: "object", entries: Object.entries(entries) });
export const nested = (callee: string): RawValue => ({ kind: "call", callee });

export function call(
  id: string,
  callee: string,
  args: RawValue[] = [],
  named: Record<string, RawValue> | [string, RawValue][] = {},
): RawStatement {
  return { kind: "call", id, callee, args, named: Array.isArray(named) ? named : Object.entries(named) };
}

export function state(key: string, value: RawValue): RawStatement {
  return { kind: "state", key, value };
}
