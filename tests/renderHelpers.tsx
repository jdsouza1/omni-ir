import { act, render } from "@testing-library/react";
import { useEffect, type ComponentType } from "react";
import { DEFAULT_CATALOG } from "../catalog/catalog";
import type { Catalog } from "../catalog/types";
import { createParser, type OmniParser } from "../engine/parser";
import type { ToolRegistry } from "../engine/schema";
import { OmniRenderer } from "../renderer";
import type { MutationCall, RendererEvent } from "../renderer/context";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";

export interface Harness {
  parser: OmniParser;
  onMutation: ReturnType<typeof vi.fn<(call: MutationCall) => void>>;
  events: RendererEvent[];
  errors: () => string[];
  /** Write lines to the parser inside act(), so React flushes the resulting updates. */
  stream: (...lines: string[]) => void;
  end: () => void;
  container: HTMLElement;
}

export function renderOmni(
  options: {
    lines?: string[];
    catalog?: Catalog;
    tools?: ToolRegistry;
    parser?: OmniParser;
    /** Real onMutation implementation (e.g. the client's /api/mutate handler); still wrapped in a spy. */
    onMutation?: (call: MutationCall) => void | Promise<void>;
  } = {},
): Harness {
  const tools = options.tools ?? TOOLS;
  const parser = options.parser ?? createParser({ tools, assets: ASSETS });
  const onMutation = options.onMutation
    ? (vi.fn(options.onMutation) as unknown as Harness["onMutation"])
    : vi.fn<(call: MutationCall) => void>();
  const events: RendererEvent[] = [];
  const onEvent = (e: RendererEvent) => events.push(e);
  if (options.lines) parser.write(options.lines.join("\n") + "\n");

  const { container } = render(
    <OmniRenderer
      store={parser.store}
      tools={tools}
      assets={ASSETS}
      onMutation={onMutation}
      onEvent={onEvent}
      {...(options.catalog ? { catalog: options.catalog } : {})}
    />,
  );

  return {
    parser,
    onMutation,
    events,
    errors: () => events.flatMap((e) => (e.type === "error" ? [e.issue.code] : [])),
    stream: (...lines) => act(() => parser.write(lines.join("\n") + "\n")),
    end: () => act(() => void parser.end()),
    container,
  };
}

/** A catalog that counts how many times each IR id mounts (for the R3 no-remount check). */
export function countingCatalog(mounts: Map<string, number>): Catalog {
  const wrap = <P extends { id: string }>(Inner: ComponentType<P>): ComponentType<P> =>
    function Counted(props: P) {
      useEffect(() => {
        mounts.set(props.id, (mounts.get(props.id) ?? 0) + 1);
      }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return <Inner {...props} />;
    };
  const entries = Object.entries(DEFAULT_CATALOG).map(([type, component]) => [type, wrap(component as ComponentType<{ id: string }>)]);
  return Object.fromEntries(entries) as Catalog;
}
