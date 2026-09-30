import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const guard = resolve("scripts/guard.mjs");

function runGuard(dir: string): { ok: boolean; output: string } {
  try {
    const output = execFileSync(process.execPath, [guard, dir], { encoding: "utf8", stdio: "pipe" });
    return { ok: true, output };
  } catch (err) {
    const e = err as { stderr?: string };
    return { ok: false, output: e.stderr ?? "" };
  }
}

describe("guard script", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "omni-guard-"));
    mkdirSync(join(dir, "src"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("passes clean source", () => {
    writeFileSync(join(dir, "src", "ok.tsx"), "export const A = () => <p>{'hi'}</p>;\n");
    expect(runGuard(dir).ok).toBe(true);
  });

  it.each([
    ["el.innerHTML = s;", "innerHTML"],
    ["<div dangerouslySetInnerHTML={{ __html: s }} />", "dangerouslySetInnerHTML"],
    ["eval(s);", "eval"],
    ["new Function(s)();", "new Function"],
  ])("catches a planted %s", (line, name) => {
    writeFileSync(join(dir, "src", "bad.tsx"), `export {};\n${line}\n`);
    const result = runGuard(dir);
    expect(result.ok).toBe(false);
    expect(result.output).toContain(name);
    expect(result.output).toContain("bad.tsx:2");
  });
});
