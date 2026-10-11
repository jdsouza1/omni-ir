// The comparison page (PLAN-COMPARE-PAGE.md), written for someone who has never seen code: every
// section opens with a plain sentence, code only appears on request, and every claim has a source.
// All numbers come from data.json, written by `npm run bench`.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createParser, type OmniParser } from "@omni-ir/core";
import { OmniRenderer } from "@omni-ir/react";
import { ASSETS } from "../../../app/assets";
import { APP_COMPONENTS, PICTURES } from "../../../app/components";
import { CONFIRMATIONS, TOOLS } from "../../../app/tools";
import { APP_VIEWS, resolvePicture } from "../../../app/views";
import data from "./data.json";

// Relative, so the page works wherever the site is served (it lives at compare/).
const LINKS = {
  home: "../",
  ownAi: "../playground/#own-ai",
  writeUp: "../docs/project/comparison.html",
  benchmark: "https://github.com/jdsouza1/omni-ir/tree/main/benchmarks",
  github: "https://github.com/jdsouza1/omni-ir",
};

type Screen = (typeof data.screens)[number];
type FormatId = keyof Screen["tokens"];

/** How fast the replay streams, in tokens a second (OpenUI's comparison uses the same speed). */
export const REPLAY_SPEED = 60;

const fmt = (n: number) => n.toLocaleString("en-US");
const formatName = (id: string) => data.formats.find((f) => f.id === id)?.name ?? id;
const formatsOf = (screen: Screen) => data.formats.filter((f) => screen.tokens[f.id as FormatId] !== undefined);

export function Compare() {
  const [screenName, setScreenName] = useState("booking");
  const screen = data.screens.find((s) => s.name === screenName) ?? data.screens[0]!;
  return (
    <div className="page compare">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="wrap header">
        <a className="brand" href={LINKS.home} aria-label="Omni-IR home">
          <span className="brand-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
              <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
              <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
            </svg>
          </span>
          <span className="brand-name">Omni-IR</span>
        </a>
        <nav className="nav" aria-label="Primary">
          <a href={LINKS.home}>Home</a>
          <a href={LINKS.ownAi}>Get started</a>
          <a href={LINKS.writeUp}>Full write-up</a>
        </nav>
      </header>

      <main id="main">
        <section className="wrap hero cmp-hero" aria-labelledby="cmp-hero-title">
          <h1 id="cmp-hero-title">How Omni-IR compares</h1>
          <p>
            There are a few ways an AI can describe a screen for an app to show. We wrote the same screens in each of them and measured. Here's how
            they differ, in plain words.
          </p>
          <p className="cmp-dates">
            Sizes measured on {data.measured}; the rest updated on {data.updated} from each project's own documentation. Every answer below has a
            source.
          </p>
        </section>

        <Formats />
        <Sizes screen={screen} onScreen={setScreenName} />
        <Race screen={screen} />
        <Capabilities />
        <Story />
        <Loses />
      </main>

      <footer className="footer">
        <div className="wrap footer-row">
          <span>Omni-IR · Open standard, Apache 2.0</span>
          <nav aria-label="Footer">
            <a href={LINKS.writeUp}>Full write-up</a>
            <a href={LINKS.benchmark} target="_blank" rel="noopener noreferrer">
              The benchmark
            </a>
            <a href={LINKS.github} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Formats() {
  return (
    <section className="wrap section cmp-section" aria-labelledby="cmp-formats-title">
      <h2 id="cmp-formats-title" className="section-title">
        The six ways compared
      </h2>
      <p className="section-lede">Each is a way for an AI to describe a screen. The app then turns that description into what people see.</p>
      <ul className="cmp-formats">
        {data.capabilities.formats.map((name, i) => (
          <li key={name} className="cmp-format" data-ours={i === 0 ? "true" : undefined}>
            <strong>{name}</strong>
            <span>{data.capabilities.intros[i]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScreenPicker({ screen, onScreen }: { screen: Screen; onScreen: (name: string) => void }) {
  const id = useId();
  return (
    <div className="cmp-picker">
      <label htmlFor={id}>Screen</label>
      <select id={id} value={screen.name} onChange={(e) => onScreen(e.target.value)}>
        <optgroup label="Written by an AI in our model check">
          {data.screens
            .filter((s) => s.set === "omni")
            .map((s) => (
              <option key={s.name} value={s.name}>
                {s.title}
              </option>
            ))}
        </optgroup>
        <optgroup label="OpenUI's own examples">
          {data.screens
            .filter((s) => s.set === "openui")
            .map((s) => (
              <option key={s.name} value={s.name}>
                {s.title}
              </option>
            ))}
        </optgroup>
      </select>
    </div>
  );
}

function Sizes({ screen, onScreen }: { screen: Screen; onScreen: (name: string) => void }) {
  const formats = formatsOf(screen);
  const max = Math.max(...formats.map((f) => screen.tokens[f.id as FormatId] ?? 0));
  const [shown, setShown] = useState<string | null>(null);
  const totals = data.totals.omni as Record<string, number>;
  const less = (id: string) => Math.round((1 - totals["omni-ir"]! / totals[id]!) * 100);
  return (
    <section className="wrap section cmp-section" aria-labelledby="cmp-size-title">
      <h2 id="cmp-size-title" className="section-title">
        How much does the AI have to write?
      </h2>
      <p className="section-lede">
        AIs write in small pieces called tokens, each roughly three-quarters of a word. Fewer tokens means the screen arrives sooner and costs less to
        make. Here is the same screen, written in each format.
      </p>
      <div className="cmp-card">
        <ScreenPicker screen={screen} onScreen={onScreen} />
        <ul className="cmp-bars" aria-label={`Tokens for “${screen.title}”`}>
          {formats.map((f) => {
            const n = screen.tokens[f.id as FormatId] ?? 0;
            return (
              <li key={f.id} className="cmp-bar" data-ours={f.id === "omni-ir" ? "true" : undefined}>
                <span className="cmp-bar-name">{f.name}</span>
                <span className="cmp-bar-track">
                  <span className="cmp-bar-fill" style={{ width: `${(n / max) * 100}%` }} />
                </span>
                <span className="cmp-bar-value">{fmt(n)}</span>
              </li>
            );
          })}
        </ul>
        <p className="cmp-note">
          Across all nine screens from our model check, Omni-IR is {less("a2ui")}% smaller than A2UI and {less("json-render")}% smaller than json-render,
          and OpenUI Lang is {Math.round((1 - totals["openui-lang"]! / totals["omni-ir"]!) * 100)}% smaller than Omni-IR.
        </p>

        <div className="cmp-split">
          <div className="cmp-split-text">
            <h3 className="cmp-h3">See what each one wrote</h3>
            <div className="cmp-chips" role="group" aria-label="Show a format's text">
              {formats.map((f) => (
                <button key={f.id} type="button" className="cmp-chip" aria-pressed={shown === f.id} onClick={() => setShown(shown === f.id ? null : f.id)}>
                  {f.name}
                </button>
              ))}
            </div>
            {shown ? (
              <>
                <p className="cmp-small">{data.formats.find((f) => f.id === shown)?.intro}</p>
                <pre className="cmp-code" tabIndex={0} aria-label={`${formatName(shown)} text`}>
                  {screen.texts[shown as FormatId]}
                </pre>
              </>
            ) : (
              <p className="cmp-small">Pick one to see the actual text. You don't need to read it: the bars above say what matters.</p>
            )}
          </div>
          <div className="cmp-split-screen">
            <h3 className="cmp-h3">What people see</h3>
            {screen.drawable ? (
              <Drawn key={screen.name} text={screen.texts["omni-ir"]} />
            ) : (
              <p className="cmp-small">
                This is one of OpenUI's own examples. It's written with OpenUI's building blocks in every format, so only the way of writing changes.
                Our demo app doesn't have those blocks, so we don't draw it here.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Omni-IR text drawn by the real renderer with the demo app's components and pictures. */
function Drawn({ text, parser: given }: { text?: string; parser?: OmniParser }) {
  const parser = useMemo(() => {
    if (given) return given;
    const p = createParser({ tools: TOOLS, assets: ASSETS, components: APP_COMPONENTS, pictures: PICTURES });
    p.write((text ?? "") + "\n");
    p.end();
    return p;
  }, [text, given]);
  return (
    <div className="cmp-drawn">
      <OmniRenderer
        store={parser.store}
        tools={TOOLS}
        assets={ASSETS}
        components={APP_VIEWS}
        resolvePicture={resolvePicture}
        confirm={CONFIRMATIONS}
        onMutation={() => {}}
        theme="light"
      />
    </div>
  );
}

function Race({ screen }: { screen: Screen }) {
  const formats = formatsOf(screen);
  const total = Math.max(...formats.map((f) => screen.tokens[f.id as FormatId] ?? 0));
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [parser, setParser] = useState<OmniParser | null>(null);
  const written = useRef(0);
  const omniText = screen.texts["omni-ir"] ?? "";
  const omniTokens = screen.tokens["omni-ir"] ?? 1;

  // A new screen starts the race over.
  useEffect(() => {
    setProgress(0);
    setPlaying(false);
    setParser(null);
  }, [screen.name]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const step = ((now - last) / 1000) * REPLAY_SPEED;
      last = now;
      setProgress((p) => {
        const next = Math.min(total, p + step);
        if (next >= total) setPlaying(false);
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, total]);

  // Omni-IR's screen is drawn from the part of its text that would have arrived by now.
  useEffect(() => {
    if (!parser) return;
    const upTo = Math.floor(omniText.length * Math.min(1, progress / omniTokens));
    if (upTo > written.current) {
      parser.write(omniText.slice(written.current, upTo));
      written.current = upTo;
      if (upTo >= omniText.length) parser.end();
    }
  }, [progress, parser, omniText, omniTokens]);

  const play = () => {
    written.current = 0;
    setParser(screen.drawable ? createParser({ tools: TOOLS, assets: ASSETS, components: APP_COMPONENTS, pictures: PICTURES }) : null);
    setProgress(0);
    setPlaying(true);
  };

  const seconds = (tokens: number) => `${(tokens / REPLAY_SPEED).toFixed(1)} s`;
  return (
    <section className="wrap section cmp-section" aria-labelledby="cmp-race-title">
      <h2 id="cmp-race-title" className="section-title">
        When can people start seeing it?
      </h2>
      <p className="section-lede">
        An AI writes its answer a little at a time. Some formats can show the screen as the first parts arrive; others have to wait for the whole
        answer. Press play to watch the same screen arrive in each.
      </p>
      <div className="cmp-card">
        <div className="cmp-race-head">
          <p className="cmp-small">
            Screen: <strong>{screen.title}</strong> (change it above)
          </p>
          <button type="button" className="btn btn-brand" onClick={play} disabled={playing}>
            {progress > 0 && !playing ? "Play again" : playing ? "Playing…" : "Play"}
          </button>
        </div>
        <ul className="cmp-race" aria-label="Each format arriving">
          {formats.map((f) => {
            const size = screen.tokens[f.id as FormatId] ?? 0;
            const first = screen.firstTokens[f.id as FormatId] ?? size;
            const seen = progress >= first;
            return (
              <li key={f.id} className="cmp-lane" data-ours={f.id === "omni-ir" ? "true" : undefined}>
                <span className="cmp-bar-name">{f.name}</span>
                <span className="cmp-lane-track" style={{ width: `${(size / total) * 100}%` }}>
                  <span className="cmp-lane-fill" style={{ width: `${Math.min(100, (progress / size) * 100)}%` }} />
                  <span className="cmp-lane-mark" style={{ left: `${(first / size) * 100}%` }} aria-hidden="true" />
                </span>
                <span className="cmp-lane-status" data-seen={seen ? "true" : undefined}>
                  {seen ? `Showing after ${seconds(first)}` : progress > 0 ? "Waiting…" : `First shows after ${seconds(first)}`}
                </span>
              </li>
            );
          })}
        </ul>
        {screen.drawable && (
          <div className="cmp-race-screen">
            <h3 className="cmp-h3">Omni-IR's screen as it arrives</h3>
            {parser ? <Drawn parser={parser} /> : <p className="cmp-small">Press play to watch it fill in.</p>}
          </div>
        )}
        <p className="cmp-note">
          A replay at {REPLAY_SPEED} tokens a second, from the measured sizes, not a live AI. The line on each bar marks the moment that format can first
          show something.
        </p>
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <section className="wrap section cmp-section" aria-labelledby="cmp-caps-title">
      <h2 id="cmp-caps-title" className="section-title">
        What each one lets the AI do
      </h2>
      <p className="section-lede">
        The biggest differences aren't size: they're what the AI is allowed to do, and who stays in control. Tap any answer for the details and where
        it comes from.
      </p>
      <div className="cmp-rows">
        {data.capabilities.rows.map((row) => (
          <article key={row.question} className="cmp-row">
            <h3 className="cmp-row-q">{row.plain}</h3>
            <p className="cmp-row-why">{row.why}</p>
            <ul className="cmp-answers">
              {row.cells.map((cell, i) => (
                <li key={i} className="cmp-answer" data-ours={i === 0 ? "true" : undefined}>
                  <details>
                    <summary>
                      <span className="cmp-answer-name">{data.capabilities.formats[i]}</span>
                      <span className="cmp-answer-plain">{cell.plain}</span>
                    </summary>
                    <p className="cmp-answer-detail">{cell.text}</p>
                    {"source" in cell && cell.source && <p className="cmp-answer-source">Source: {cell.source}</p>}
                  </details>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function Story() {
  const [showOther, setShowOther] = useState(false);
  const openuiLines = data.story.openui.split("\n");
  const deletion = openuiLines.filter((l) => /delete/i.test(l));
  return (
    <section className="wrap section cmp-section" aria-labelledby="cmp-story-title">
      <h2 id="cmp-story-title" className="section-title">
        Same request, two formats
      </h2>
      <p className="section-lede">
        We asked an AI for a settings screen “with a button that permanently deletes my account”. The app had no way to delete accounts. Here's what it
        wrote in each format.
      </p>
      <div className="cmp-story">
        <div className="cmp-card">
          <h3 className="cmp-h3">With Omni-IR</h3>
          <p className="cmp-small">
            The AI could only use actions the app lists. There was no delete action, so it made the button do nothing, and said so on the screen.
          </p>
          <Drawn text={data.story.omni} />
        </div>
        <div className="cmp-card">
          <h3 className="cmp-h3">With OpenUI Lang</h3>
          <p className="cmp-small">
            With the instructions OpenUI publishes, any action name was accepted. The AI connected a “Permanently delete my account” button to an action
            that doesn't exist, so the screen looked like it worked.
          </p>
          <pre className="cmp-code" tabIndex={0} aria-label="The lines about deleting the account">
            {deletion.join("\n")}
          </pre>
          <button type="button" className="cmp-link" onClick={() => setShowOther(!showOther)}>
            {showOther ? "Hide the whole reply" : "Show the whole reply"}
          </button>
          {showOther && (
            <pre className="cmp-code" tabIndex={0} aria-label="OpenUI Lang's whole reply">
              {data.story.openui}
            </pre>
          )}
        </div>
      </div>
      <p className="cmp-note">
        {data.story.model}, on {data.story.date}. Both replies were valid in their own format. OpenUI can be set up with an app's own actions, which would
        narrow this gap; its published instructions don't do that.
      </p>
    </section>
  );
}

function Loses() {
  return (
    <section className="wrap section cmp-section" aria-labelledby="cmp-loses-title">
      <h2 id="cmp-loses-title" className="section-title">
        Where Omni-IR loses
      </h2>
      <p className="section-lede">No format is best at everything. Here's where others are ahead.</p>
      <ul className="cmp-loses">
        <li>
          <strong>OpenUI Lang is a little smaller.</strong> It writes 4–10% less than Omni-IR for the same screen, because it packs more into each line.
        </li>
        <li>
          <strong>OpenUI has more building blocks out of the box.</strong> It can draw two of its own examples that Omni-IR can't (with an accordion, a
          picture gallery and radio buttons). Omni-IR apps can add their own blocks instead.
        </li>
        <li>
          <strong>Others are more flexible.</strong> OpenUI Lang, A2UI and json-render let the AI write formulas and conditions. Omni-IR leaves that out
          on purpose, so every screen is predictable and checkable.
        </li>
        <li>
          <strong>json-render reaches more places.</strong> It also makes PDFs, emails and videos, and runs on phones through React Native.
        </li>
      </ul>
      <div className="buttons cmp-cta">
        <a className="btn btn-dark" href={LINKS.ownAi}>
          Try Omni-IR with your own AI
        </a>
        <a className="btn btn-light" href={LINKS.writeUp}>
          Read the full write-up
        </a>
      </div>
    </section>
  );
}
