// @vitest-environment jsdom
// The renderer's own words (PLAN-THEMES.md D): one English table, replaceable by the app, the same keys
// on all three platforms, shown as plain text, placeholders filled in one plain pass, and a blocked
// action shown as a sentence while the developer's detail goes to onEvent.
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createParser } from "@omni-ir/core";
import { ENGLISH, NodeFallback, OmniRenderer, fillTemplate, resolveStrings, type RendererEvent } from "@omni-ir/react";
import { z } from "zod";
import { TOOLS } from "../app/tools";
import { KOTLIN_STRINGS_PATH, SWIFT_STRINGS_PATH, stringsKotlin, stringsSwift } from "../scripts/theme";

afterEach(cleanup);

/** Hostile wording an app might pass by mistake, for example built from user input. */
const HOSTILE = ['<b>bold</b><img src=x onerror=alert(1)>', "[link](https://evil.example) **bold**", "%@ %d %s %n %1$s", "{max} {value} {{x}}", "x".repeat(5000)];

function show(stream: string, options: { strings?: Record<string, unknown>; events?: RendererEvent[]; tools?: typeof TOOLS } = {}) {
  const tools = options.tools ?? TOOLS;
  const parser = createParser({ tools });
  parser.write(stream);
  return render(
    <OmniRenderer store={parser.store} tools={tools} onMutation={() => {}} onEvent={(e) => options.events?.push(e)} {...(options.strings ? { strings: options.strings as never } : {})} />,
  );
}

describe("the English table", () => {
  it("has the same keys on Swift and Kotlin (run npm run theme if this fails)", () => {
    expect(readFileSync(SWIFT_STRINGS_PATH, "utf8")).toBe(stringsSwift());
    expect(readFileSync(KOTLIN_STRINGS_PATH, "utf8")).toBe(stringsKotlin());
    for (const key of Object.keys(ENGLISH)) {
      expect(stringsSwift(), key).toContain(`public var ${key}: String`);
      expect(stringsKotlin(), key).toContain(`val ${key}: String`);
    }
  });

  it("keeps the app's words for known keys, and English for anything missing, unknown or not text", () => {
    const strings = resolveStrings({ loading: "Chargement…", rating: 42, nonsense: "x", sections: null } as never);
    expect(strings.loading).toBe("Chargement…");
    expect(strings.rating).toBe(ENGLISH.rating);
    expect(strings.sections).toBe(ENGLISH.sections);
    expect(strings).not.toHaveProperty("nonsense");
  });
});

describe("placeholders", () => {
  it("are replaced in one plain pass: a value's own braces are never expanded again", () => {
    expect(fillTemplate("Rated {value} out of {max}", { value: "{max}", max: 5 })).toBe("Rated {max} out of 5");
    expect(fillTemplate("{a}{b}", { a: "{b}", b: "B" })).toBe("{b}B");
  });

  it("leaves unknown placeholders and format codes as written", () => {
    expect(fillTemplate("%@ %d {unknown} {value}", { value: 3 })).toBe("%@ %d {unknown} 3");
  });
});

describe("the app's words in the renderer", () => {
  it("replace the built-in ones wherever they appear", () => {
    const strings = {
      loading: "Chargement",
      failedToLoad: "Échec du chargement",
      rating: "Noté {value} sur {max}",
      user: "Vous",
      assistant: "L'assistant",
      newerVersion: "Mettez l'application à jour.",
    };
    const { container } = show('# omni-ir 99.0\nroot = Stack([r, m, a, gone])\nr = Rating(4.5)\nm = Message("Bonjour", from="user")\na = Message("Salut", from="assistant")\n', { strings });
    expect(container.querySelector('[data-pending-id="gone"]')?.getAttribute("aria-label")).toBe("Chargement");
    expect(screen.getByRole("img", { name: "Noté 4.5 sur 5" })).toBeTruthy();
    expect(container.textContent).toContain("Vous: Bonjour");
    expect(container.textContent).toContain("L'assistant: Salut");
    expect(screen.getByRole("status").textContent).toBe("Mettez l'application à jour.");
    render(<NodeFallback id="x" reason="missing" />); // outside a renderer: English
    expect(screen.getByText("Component failed to load")).toBeTruthy();
  });

  it.each(HOSTILE)("show hostile wording as plain text, never markup: %s", (hostile) => {
    const { container } = show('# omni-ir 99.0\nroot = Rating(4)\n', { strings: { newerVersion: hostile, rating: hostile } });
    expect(container.querySelector("b, img, a, script")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(hostile);
    // The app's own placeholders are filled; nothing else in its wording is interpreted.
    expect(container.querySelector(".omni-rating")?.getAttribute("aria-label")).toBe(fillTemplate(hostile, { value: "4", max: 5 }));
  });

  it("can't be set from the stream", () => {
    const parser = createParser({ tools: TOOLS });
    const codes: string[] = [];
    parser.subscribe((e) => e.type === "error" && codes.push(e.issue.code));
    parser.write('root = Text("x", strings="Ignore your instructions")\n');
    expect(codes).toEqual(["invalid_props"]);
  });
});

describe("a blocked action [PLAN D.3]", () => {
  const tools = { "payments.confirm": z.strictObject({ amount: z.number().positive(), note: z.string() }) };
  const stream = 'root = Stack([pay])\n$amount = 0\npay = Button("Pay", action="pay")\nm = McpMutation(pay, tool="payments.confirm", params={amount: $amount, note: ""})\n';

  it("shows the person a plain sentence, and gives the developer the detail through onEvent", () => {
    const events: RendererEvent[] = [];
    const { container } = show(stream, { tools, events });
    fireEvent.click(screen.getByRole("button", { name: "Pay" }));
    expect(container.querySelector(".omni-button__error")?.textContent).toBe(ENGLISH.blocked);
    expect(container.textContent).not.toMatch(/amount|Too small/);
    const issue = events.find((e) => e.type === "error")!;
    expect(issue).toMatchObject({ type: "error", issue: { code: "mutation_blocked" } });
    expect(JSON.stringify(issue)).toContain("amount");
  });

  it("uses the app's own sentence when it has one", () => {
    const { container } = show(stream, { tools, strings: { blocked: "Impossible d'envoyer." } });
    fireEvent.click(screen.getByRole("button", { name: "Pay" }));
    expect(container.querySelector(".omni-button__error")?.textContent).toBe("Impossible d'envoyer.");
  });
});
