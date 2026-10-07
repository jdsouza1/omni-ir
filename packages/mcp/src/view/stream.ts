// Writing show_screen's argument to the parser as it streams in ([10.26]). Hosts send their best
// guess at the unfinished argument (ui/notifications/tool-input-partial), then the whole of it once
// (tool-input). Only complete lines are written, each once; if a guess doesn't extend what was
// written, the parser starts over, because Omni-IR never rewrites a line ([5.3]).

export interface ParserSink {
  write(text: string): void;
  end(): void;
}

export interface InputWriter {
  /** The argument so far: writes the complete lines not yet written. */
  partial(text: string): void;
  /** The whole argument: writes the rest and ends the parser. Input after it is ignored. */
  complete(text: string): void;
}

/** `open` makes a new parser; it is called again whenever the text has to start over. */
export function createInputWriter(open: () => ParserSink): InputWriter {
  let sink: ParserSink | null = null;
  let written = "";
  let ended = false;

  const extend = (text: string, whole: boolean): ParserSink => {
    if (sink === null || !text.startsWith(written)) {
      sink = open();
      written = "";
    }
    const upTo = whole ? text.length : text.lastIndexOf("\n") + 1;
    if (upTo > written.length) {
      sink.write(text.slice(written.length, upTo));
      written = text.slice(0, upTo);
    }
    return sink;
  };

  return {
    partial(text) {
      if (!ended) extend(text, false);
    },
    complete(text) {
      if (ended) return;
      ended = true;
      extend(text, true).end();
    },
  };
}
