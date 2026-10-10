/// <reference types="vite/client" />
// The landing page (approved design, v6). Its example tabs are fixtures/landing/*.omni with the
// explanations in landing.json, checked by the real parser when the site is built (vite.config.ts).
// Links are relative, so the page works wherever the site is served.
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { LandingTab } from "../../scripts/landing-examples";
import cabin from "./images/cabin.svg";
import shirt from "./images/shirt.svg";
import tote from "./images/tote.svg";

declare const __LANDING_TABS__: LandingTab[];
const TABS = __LANDING_TABS__;

const LINKS = {
  docs: "docs/",
  getStarted: "docs/guide/getting-started.html",
  spec: "docs/spec.html",
  governance: "docs/project/governance.html",
  mcp: "docs/guide/mcp.html",
  comparison: "docs/project/comparison.html",
  playground: "playground/",
  community: "https://github.com/jdsouza1/omni-ir/discussions",
  github: "https://github.com/jdsouza1/omni-ir",
};

const RING = "0 0 0 2px #6366f1, 0 0 0 6px rgba(99,102,241,.18)";
const NO_RING = "0 0 0 0 transparent";
const CARD_SHADOW = "0 1px 2px rgba(15,23,42,.06), 0 16px 40px -12px rgba(15,23,42,.18)";

const Arrow = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

export function Landing() {
  return (
    <div className="page">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="wrap header">
        <a className="brand" href="./" aria-label="Omni-IR home">
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
          <a href="#how">How it works</a>
          <a href="#principles">Principles</a>
          <a href={LINKS.docs}>Docs</a>
          <a className="star" href={LINKS.github} target="_blank" rel="noopener noreferrer">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Star on GitHub
          </a>
        </nav>
      </header>

      <main id="main">
        <section className="wrap hero" aria-labelledby="hero-title">
          <span className="pill">
            <span className="pill-dot" aria-hidden="true" />
            An open standard · v0.10 preview
          </span>
          <h1 id="hero-title">AI writes the screen. Your app draws it.</h1>
          <p>
            Omni-IR is an open format for AI-generated screens. The model writes a few plain lines; your own components draw them on the web,
            iPhone and Android, and inside Claude and ChatGPT. Every action goes through your server’s checks.
          </p>
          <div className="buttons">
            <a className="btn btn-dark" href={LINKS.playground}>
              Try the playground
              <Arrow />
            </a>
            <a className="btn btn-light" href={LINKS.spec}>
              Read the spec
            </a>
          </div>
        </section>

        <Examples />

        <section id="how" className="wrap section" aria-labelledby="how-title">
          <h2 id="how-title" className="section-title">
            Describe it. Read it. Build it.
          </h2>
          <ol className="tiles">
            <Step n="01" title="An AI writes the blueprint">
              Any model can describe screens, data and actions in a few plain lines.
            </Step>
            <Step n="02" title="People can read it">
              No code to decode. Review, tweak or approve before anything ships.
            </Step>
            <Step n="03" title="Any tool builds it">
              Web, iOS and Android renderers read the same blueprint today, and all three pass the same conformance tests.
            </Step>
          </ol>
        </section>

        <section id="compare" className="wrap section" aria-labelledby="cmp-title">
          <h2 id="cmp-title" className="section-title">
            Small, streaming and governed.
          </h2>
          <p className="section-lede">The same screens written in each format and counted with the tokenizer OpenUI's benchmark uses.</p>
          <ul className="tiles numbers">
            <Figure big="39%" title="Fewer tokens than A2UI">
              And 55% fewer than json-render, 50% fewer than HTML with Tailwind.
            </Figure>
            <Figure big="~30" title="Tokens before the first content">
              Each line can be drawn as soon as it arrives. A2UI in one message and React code wait for the whole reply.
            </Figure>
            <Figure big="3×" title="Checks on every action">
              Buttons that change data name a tool from your app, and its params are checked by the parser, the browser and the server.
            </Figure>
          </ul>
          <p className="footnote">
            OpenUI Lang is 4–10% smaller still, and its catalog is larger. Omni-IR trades a little size for no logic in the stream, pictures only from
            your app and governed actions. <a href={LINKS.comparison}>Read the full comparison</a>
          </p>
        </section>

        <section id="principles" className="wrap section" aria-labelledby="pr-title">
          <div className="principles">
            <div className="principle">
              <h2 id="pr-title">Built in the open, for everyone.</h2>
            </div>
            <div className="principle">
              <span className="icon indigo" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                  <path d="M2 12h20" />
                </svg>
              </span>
              <h3>Vendor-neutral</h3>
              <p>Not tied to any model, framework or company. Screens stream over plain HTTP, AG-UI or MCP, the protocols agent frameworks and AI assistants speak.</p>
            </div>
            <div className="principle">
              <span className="icon green" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </span>
              <h3>Accessible building blocks</h3>
              <p>Every input needs a label. Focus and contrast are set by the app’s own components, never by the model.</p>
            </div>
            <div className="principle">
              <span className="icon indigo" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                  <path d="M8 12h.01M12 12h.01M16 12h.01" />
                </svg>
              </span>
              <h3>Inside AI assistants</h3>
              <p>
                In Claude, ChatGPT, VS Code and Cursor, the assistant writes the screen and your components draw it, through MCP Apps. Every button
                still goes to your server’s checks. <a href={LINKS.mcp}>See how</a>
              </p>
            </div>
          </div>
        </section>

        <section className="wrap section cta" aria-labelledby="cta-title">
          <h2 id="cta-title" className="section-title">
            Start building with Omni-IR.
          </h2>
          <div className="buttons">
            <a className="btn btn-brand" href={LINKS.getStarted}>
              Get started
              <Arrow />
            </a>
            <a className="btn btn-light" href={LINKS.community}>
              Join the community
            </a>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer-row">
          <span>Omni-IR · Open standard, Apache 2.0</span>
          <nav aria-label="Footer">
            <a href={LINKS.spec}>Spec</a>
            <a href={LINKS.github} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href={LINKS.governance}>Governance</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <li className="tile">
      <span className="tile-step">{n}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </li>
  );
}

function Figure({ big, title, children }: { big: string; title: string; children: ReactNode }) {
  return (
    <li className="tile">
      <span className="big">{big}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </li>
  );
}

/** The example tabs: hover or focus a line to see what it builds on the card beside it. */
function Examples() {
  const [key, setKey] = useState(TABS[0]!.key);
  const [line, setLine] = useState(1);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tab = TABS.find((t) => t.key === key) ?? TABS[0]!;
  const active = tab.lines[line]?.part;
  const ring = (part: string): CSSProperties => ({ boxShadow: active === part ? RING : NO_RING });
  const root: CSSProperties = { boxShadow: `${CARD_SHADOW}, ${active === "root" ? RING : NO_RING}` };

  const copy = () => {
    const text = tab.lines.map((l) => `${l.kw} = ${l.name}${l.rest}`).join("\n");
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section id="playground" className="wrap examples" aria-labelledby="pg-title">
      <h2 id="pg-title" className="visually-hidden">
        Examples
      </h2>
      <div className="panel">
        <div className="panel-bar">
          <div className="tabs" role="tablist" aria-label="Example blueprints">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                className="tab"
                aria-selected={t.key === key}
                onClick={() => {
                  setKey(t.key);
                  setLine(1);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="panel-hint">
            Hover a line to see what it builds
            <a href={LINKS.playground}>Open the full playground →</a>
          </span>
        </div>

        <div className="panel-body">
          <div className="source">
            <div className="source-head">
              <span className="label">Blueprint</span>
              <button type="button" className="copy" onClick={copy} aria-label="Copy blueprint">
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="14" height="14" x="8" y="8" rx="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="code">
              {tab.lines.map((l, i) => (
                <div key={i} className="code-line" tabIndex={0} data-active={i === line} onMouseEnter={() => setLine(i)} onFocus={() => setLine(i)}>
                  <span className="code-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="code-text">
                    <span className="code-kw">{l.kw}</span>
                    <span className="code-eq"> = </span>
                    <span className="code-name">{l.name}</span>
                    <span className="code-rest">{l.rest}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="explain" aria-live="polite">
              <span className="explain-num" aria-hidden="true">
                {line + 1}
              </span>
              <p>{tab.lines[line]?.explain}</p>
            </div>
          </div>

          <div className="stage">
            {key === "stay" && (
              <article className="card" aria-label="Rendered booking card" style={root}>
                <img className="photo part" src={cabin} alt="A wooden cabin among pine trees" style={ring("photo")} />
                <div className="part part-text card-title" style={ring("title")}>
                  Cabin in the Pines
                </div>
                <div className="meta">
                  <span className="part part-text stars" role="img" aria-label="Rated 4.96 out of 5" style={ring("stars")}>
                    <span className="stars-glyphs" aria-hidden="true">
                      ★★★★★
                    </span>{" "}
                    4.96
                  </span>
                  <span className="part part-text place" style={ring("place")}>
                    Big Sur, California
                  </span>
                </div>
                <div className="part dates" style={ring("dates")}>
                  <Field label="Check-in" value="Oct 14, 2026" style={ring("checkIn")} />
                  <Field label="Check-out" value="Oct 17, 2026" style={ring("checkOut")} />
                </div>
                <button type="button" className="part card-button brand" style={ring("reserve")}>
                  Reserve · $642
                </button>
              </article>
            )}
            {key === "checkout" && (
              <article className="card" aria-label="Rendered checkout card" style={root}>
                <div className="part part-text card-title" style={ring("title")}>
                  Your bag
                </div>
                <div className="part items" role="list" style={ring("items")}>
                  <Item image={shirt} title="Linen overshirt" detail="Sand · M" price="$128.00" style={ring("shirt")} />
                  <Item image={tote} title="Canvas tote" detail="Natural" price="$86.00" style={ring("tote")} />
                </div>
                <div className="part part-text total" style={ring("total")}>
                  $214.00
                </div>
                <button type="button" className="part card-button dark" style={ring("pay")}>
                  Pay securely
                </button>
              </article>
            )}
            {key === "chat" && (
              <article className="card" aria-label="Rendered assistant card" style={root}>
                <div className="part part-text card-title" style={ring("title")}>
                  Trip helper
                </div>
                <div className="part chat" style={ring("chat")}>
                  <div className="part bubble user" style={ring("asked")}>
                    Any quiet beaches near Lisbon?
                  </div>
                  <div className="part bubble assistant" style={ring("answer")}>
                    Try Praia da Ursa. A short hike keeps the crowds away.
                  </div>
                </div>
                <Field label="Ask a question" value="Ask anything…" placeholder style={ring("question")} />
                <button type="button" className="part card-button dark" style={ring("send")}>
                  Send
                </button>
              </article>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, value, placeholder = false, style }: { label: string; value: string; placeholder?: boolean; style: CSSProperties }) {
  return (
    <div className="part field" style={style}>
      <span className="field-label">{label}</span>
      <span className={placeholder ? "field-box placeholder" : "field-box"}>{value}</span>
    </div>
  );
}

function Item({ image, title, detail, price, style }: { image: string; title: string; detail: string; price: string; style: CSSProperties }) {
  return (
    <div className="part item" role="listitem" style={style}>
      <img src={image} alt="" />
      <span className="item-text">
        <span className="item-title">{title}</span>
        <span className="item-detail">{detail}</span>
      </span>
      <span className="item-price">{price}</span>
    </div>
  );
}
