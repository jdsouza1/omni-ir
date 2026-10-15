// The showcase page (PLAN-SHOWCASE.md): apps built with Omni-IR, on the devices they run on. Written
// for someone who has never seen code: each entry opens with a plain sentence, and the stream is shown
// only on request. Entries come from apps.json through scripts/showcase.ts, which checks every stream
// with the real parser and works out which parts each one uses.
import { useMemo, useState } from "react";
import { createParser } from "@omni-ir/core";
import { OmniRenderer } from "@omni-ir/react";
import { ASSETS } from "../../../app/assets";
import { APP_COMPONENTS, PICTURES } from "../../../app/components";
import { CONFIRMATIONS, TOOLS } from "../../../app/tools";
import { APP_VIEWS, resolvePicture } from "../../../app/views";
import type { Platform, ShowcaseApp } from "../../../scripts/showcase";

declare const __SHOWCASE__: ShowcaseApp[];

// Relative, so the page works wherever the site is served (it lives at showcase/).
export const LINKS = {
  home: "../",
  compare: "../compare/",
  ownAi: "../playground/#own-ai",
  demo: "../#demo",
  submit: "https://github.com/jdsouza1/omni-ir/discussions/new?category=showcase",
  github: "https://github.com/jdsouza1/omni-ir",
};

export const PLATFORM_NAMES: Record<Platform, string> = { web: "Web", ios: "iPhone", android: "Android", chat: "Inside an AI chat" };
const FILTERS: (Platform | "all")[] = ["all", "web", "ios", "android", "chat"];

export function Showcase() {
  const apps = __SHOWCASE__;
  const [filter, setFilter] = useState<Platform | "all">("all");
  const shown = apps.filter((a) => filter === "all" || a.platforms.includes(filter));
  return (
    <div className="page showcase">
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
          <a href={LINKS.compare}>Compare</a>
          <a href={LINKS.ownAi}>Get started</a>
        </nav>
      </header>

      <main id="main">
        <section className="wrap hero sc-hero" aria-labelledby="sc-title">
          <h1 id="sc-title">Built with Omni-IR</h1>
          <p>
            Apps made with Omni-IR. Each screen is one stream from the AI, drawn natively on every platform it runs on, by the app's own code. Tap
            “See what the AI wrote” under any app for the lines behind it.
          </p>
          <p className="sc-video">
            <a href={LINKS.demo}>Watch the two-minute demo</a>
          </p>
        </section>

        <section className="wrap sc-list" aria-label="Apps">
          <div className="sc-filters" role="group" aria-label="Show apps that run">
            {FILTERS.map((f) => (
              <button key={f} type="button" className="cmp-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? "Everywhere" : PLATFORM_NAMES[f]}
              </button>
            ))}
          </div>
          <p className="sc-count" aria-live="polite">
            {shown.length === apps.length ? `${apps.length} apps` : `${shown.length} of ${apps.length} apps`}
          </p>
          {shown.map((app) => (
            <App key={app.id} app={app} />
          ))}
        </section>

        <section className="wrap section sc-submit" aria-labelledby="sc-submit-title">
          <h2 id="sc-submit-title" className="section-title">
            Built something with Omni-IR?
          </h2>
          <p className="section-lede">
            Tell us in a Discussion: its name, a sentence about what it does, a screenshot from each platform it runs on, and that we may show them
            here. We add apps by hand, and only with their makers' permission.
          </p>
          <div className="buttons sc-cta">
            <a className="btn btn-dark" href={LINKS.submit}>
              Add your app
            </a>
            <a className="btn btn-light" href={LINKS.ownAi}>
              Try Omni-IR with your own AI
            </a>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer-row">
          <span>Omni-IR · Open standard, Apache 2.0</span>
          <nav aria-label="Footer">
            <a href={LINKS.home}>Home</a>
            <a href={LINKS.github} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function App({ app }: { app: ShowcaseApp }) {
  const [current, setCurrent] = useState<Platform>(app.platforms[0]!);
  const [open, setOpen] = useState(false);
  const titleId = `sc-${app.id}`;
  const phones = app.platforms.filter((p) => p === "ios" || p === "android").length;
  return (
    <article className="sc-app" aria-labelledby={titleId}>
      <div className="sc-head">
        <h2 id={titleId} className="sc-name">
          {app.name}
        </h2>
        <ul className="sc-platforms" aria-label="Runs on">
          {app.platforms.map((p) => (
            <li key={p}>{PLATFORM_NAMES[p]}</li>
          ))}
        </ul>
      </div>
      <p className="sc-summary">{app.summary}</p>

      {app.platforms.length > 1 && (
        <div className="sc-tabs" role="tablist" aria-label={`${app.name}: choose a platform`}>
          {app.platforms.map((p) => (
            <button key={p} type="button" role="tab" className="cmp-chip" aria-selected={p === current} onClick={() => setCurrent(p)}>
              {PLATFORM_NAMES[p]}
            </button>
          ))}
        </div>
      )}
      <div className="sc-shots" data-count={app.platforms.length} data-phones={phones}>
        {app.platforms.map((p) => (
          <figure key={p} className="sc-shot" data-platform={p} data-current={p === current || undefined}>
            <img src={app.shots[p]} alt={`${app.screen}, as drawn ${p === "chat" ? "inside an AI chat" : `on ${PLATFORM_NAMES[p]}`}`} loading="lazy" decoding="async" />
            <figcaption>{PLATFORM_NAMES[p]}</figcaption>
          </figure>
        ))}
      </div>

      <dl className="sc-uses">
        <div>
          <dt>From the catalog</dt>
          <dd>{app.catalog.join(", ")}</dd>
        </div>
        {app.components.length > 0 && (
          <div>
            <dt>The app's own components</dt>
            <dd>{app.components.join(", ")}</dd>
          </div>
        )}
        <div>
          <dt>Shows off</dt>
          <dd>{app.features.join(" · ")}</dd>
        </div>
      </dl>

      <div className="sc-actions">
        <button type="button" className="cmp-link" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Hide what the AI wrote" : "See what the AI wrote"}
        </button>
        {app.link && <a href={app.link.href}>{app.link.label}</a>}
        <a href={app.source} target="_blank" rel="noopener noreferrer">
          The code
        </a>
      </div>
      {open && (
        <div className="sc-stream">
          <div className="sc-stream-text">
            <p className="cmp-note">
              The {app.lines.length} lines behind “{app.screen}”. Each line names one part of the screen.
            </p>
            <pre className="cmp-code" tabIndex={0} aria-label={`What the AI wrote for ${app.screen}`}>
              {app.lines.join("\n")}
            </pre>
          </div>
          <div className="sc-stream-screen">
            <p className="cmp-note">The same lines, drawn here by the web renderer:</p>
            <Drawn text={app.lines.join("\n")} />
          </div>
        </div>
      )}
    </article>
  );
}

/** Omni-IR text drawn by the real renderer with the demo app's components and pictures. */
function Drawn({ text }: { text: string }) {
  const parser = useMemo(() => {
    const p = createParser({ tools: TOOLS, assets: ASSETS, components: APP_COMPONENTS, pictures: PICTURES });
    p.write(text + "\n");
    p.end();
    return p;
  }, [text]);
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
