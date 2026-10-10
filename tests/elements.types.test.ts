// The hand-written types of @omni-ir/elements (packages/elements/src/omni-elements.d.ts) stay in step
// with the element: checked by the type checker (npm run typecheck), both ways where it matters.
import type * as Declared from "../packages/elements/src/omni-elements";
import type { OmniScreenElement, ElementComponent, ToolParams } from "@omni-ir/elements";
import type { GenerateOutcome, MutationCall, Picture, RendererEvent } from "@omni-ir/react";
import type { PicturePattern } from "@omni-ir/core";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const yes = <T extends true>(): T => true as T;

describe("@omni-ir/elements types", () => {
  it("describe what the element really takes and gives", () => {
    yes<Same<Declared.GenerateOutcome, GenerateOutcome>>();
    yes<Same<Declared.MutationCall, MutationCall>>();
    yes<Same<Declared.Picture, Picture>>();
    yes<Same<Declared.PicturePattern, PicturePattern>>();
    // What the declared types promise, the element accepts.
    const element = null as unknown as OmniScreenElement;
    const declared = null as unknown as Declared.OmniScreenElement;
    if (element !== null) {
      element.tools = declared.tools as Readonly<Record<string, ToolParams>>;
      element.components = declared.components as Readonly<Record<string, ElementComponent>>;
      element.pictures = declared.pictures;
      element.confirm = declared.confirm;
      element.onMutation = declared.onMutation;
      const outcome: Promise<Declared.GenerateOutcome> = element.generate("x");
      const text: string = element.describe({ values: true });
      void outcome;
      void text;
    }
    const event = null as unknown as Declared.RendererEvent;
    const real: RendererEvent | null = event as RendererEvent | null;
    expect(real).toBeNull();
  });
});
