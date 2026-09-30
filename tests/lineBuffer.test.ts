import { LineBuffer, type LineEvent } from "../engine/lineBuffer";

const texts = (events: LineEvent[]) => events.flatMap((e) => (e.kind === "line" ? [e.text] : []));

describe("LineBuffer (R2)", () => {
  it("holds a line split mid-way until its newline arrives", () => {
    const buf = new LineBuffer();
    expect(buf.push('title = Head')).toEqual([]);
    expect(buf.push('ing("Hi")\n')).toEqual([{ kind: "line", text: 'title = Heading("Hi")', line: 1 }]);
  });

  it("emits several lines from one chunk and keeps the remainder", () => {
    const buf = new LineBuffer();
    expect(texts(buf.push("a = Divider()\nb = Divider()\nc = Div"))).toEqual(["a = Divider()", "b = Divider()"]);
    expect(texts(buf.push("ider()\n"))).toEqual(["c = Divider()"]);
  });

  it("numbers lines from 1, counting blank lines", () => {
    const buf = new LineBuffer();
    const events = buf.push("a\n\nb\n");
    expect(events).toEqual([
      { kind: "line", text: "a", line: 1 },
      { kind: "line", text: "", line: 2 },
      { kind: "line", text: "b", line: 3 },
    ]);
  });

  it("strips \\r from \\r\\n line endings, including when \\r and \\n arrive in different chunks", () => {
    const buf = new LineBuffer();
    expect(texts(buf.push("a = Divider()\r\nb = Divider()\r"))).toEqual(["a = Divider()"]);
    expect(texts(buf.push("\n"))).toEqual(["b = Divider()"]);
  });

  it("decodes a UTF-8 character split across byte chunks", () => {
    const bytes = new TextEncoder().encode('t = Text("Café ☕")\n');
    const buf = new LineBuffer();
    const events: LineEvent[] = [];
    // Split one byte at a time so every multi-byte character is cut.
    for (const byte of bytes) events.push(...buf.push(new Uint8Array([byte])));
    expect(texts(events)).toEqual(['t = Text("Café ☕")']);
  });

  it("flushes a last line with no trailing newline on end()", () => {
    const buf = new LineBuffer();
    expect(buf.push("a = Divider()")).toEqual([]);
    expect(buf.end()).toEqual([{ kind: "line", text: "a = Divider()", line: 1 }]);
  });

  it("emits nothing on end() when the buffer is empty", () => {
    const buf = new LineBuffer();
    buf.push("a = Divider()\n");
    expect(buf.end()).toEqual([]);
  });

  it("drops an over-long line and resumes after the next newline", () => {
    const buf = new LineBuffer({ maxLineLength: 10 });
    const events = [...buf.push("x".repeat(6)), ...buf.push("x".repeat(6)), ...buf.push("yyy\nd = X()\n")];
    expect(events).toEqual([
      { kind: "overflow", line: 1, length: 12 },
      { kind: "line", text: "d = X()", line: 2 },
    ]);
  });

  it("reports an over-long line only once however many chunks it spans", () => {
    const buf = new LineBuffer({ maxLineLength: 4 });
    const events = [...buf.push("aaaaa"), ...buf.push("bbbbb"), ...buf.push("ccccc\n")];
    expect(events.filter((e) => e.kind === "overflow")).toHaveLength(1);
  });

  it("does not keep an over-long line in memory", () => {
    const buf = new LineBuffer({ maxLineLength: 4 });
    buf.push("aaaaaaaaaa");
    buf.push("bbbbbbbbbb");
    expect(buf.end()).toEqual([]);
  });

  it("throws if written to after end()", () => {
    const buf = new LineBuffer();
    buf.end();
    expect(() => buf.push("a\n")).toThrow(/after end/);
  });
});
