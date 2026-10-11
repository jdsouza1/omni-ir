// The "Use your own AI" tab (PLAN-QUICKSTART.md, Track 1): three numbered steps for someone who has
// never seen Omni-IR. Presentation only; the logic is in ownAi.ts.
import { useId, useState } from "react";
import { CHATS, IDEAS, instructionsFor } from "./ownAi";
import type { LineIssue } from "./usePlayground";

export interface OwnAiProps {
  /** The reply as pasted (a share link fills it in). */
  reply: string;
  onReplyChange: (reply: string) => void;
  onShow: () => void;
  /** Sentences about the screen just shown, or null before one is shown. */
  summary: string[] | null;
  problems: readonly LineIssue[];
  /** Copies a link to the screen shown; resolves false if it couldn't. */
  onShare: () => Promise<boolean>;
  guideLink: { href: string; target?: string; rel?: string };
  busy: boolean;
  /** Opened from someone's share link. */
  shared?: boolean;
}

/** Copies text, or resolves false where the browser refuses (the visitor can still select it). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function OwnAi({ reply, onReplyChange, onShow, summary, problems, onShare, guideLink, busy, shared: fromLink = false }: OwnAiProps) {
  const [request, setRequest] = useState("");
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const [shared, setShared] = useState<"yes" | "no" | null>(null);
  const [problemsCopied, setProblemsCopied] = useState(false);
  const requestId = useId();
  const replyId = useId();
  const instructions = instructionsFor(request);
  const problemsText = `Please fix these problems in your Omni-IR reply, and reply with the whole screen again:\n${problems
    .map((p) => `- ${p.line !== undefined ? `Line ${p.line}: ` : ""}${p.message}`)
    .join("\n")}`;

  return (
    <section className="pg-own" aria-label="Use your own AI">
      <p className="pg-own-intro">
        {fromLink
          ? "Someone shared this screen with you: an AI wrote it in Omni-IR, and it's drawn below. Make your own in three steps, in about three minutes. Nothing to install, and nothing you type is sent to us."
          : "See a screen your own AI writes in Omni-IR, in about three minutes. Nothing to install, and nothing you type is sent to us."}
      </p>
      <ol className="pg-steps">
        <li className="pg-step">
          <h2 className="pg-step-title">
            <label htmlFor={requestId}>What screen do you want?</label>
          </h2>
          <input
            id={requestId}
            className="pg-input"
            value={request}
            maxLength={500}
            placeholder="e.g. a booking form for a salon"
            onChange={(e) => {
              setRequest(e.target.value);
              setCopied(null);
            }}
          />
          <div className="pg-chips" role="group" aria-label="Ideas">
            <span className="pg-chips-label">Ideas</span>
            {IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                className="pg-chip"
                onClick={() => {
                  setRequest(idea);
                  setCopied(null);
                }}
              >
                {idea}
              </button>
            ))}
          </div>
        </li>

        <li className="pg-step">
          <h2 className="pg-step-title">Ask your AI</h2>
          <p className="pg-step-text">
            Copy the instructions, paste them into a new chat with your AI and send. A free account works. Then copy its reply: the copy button on its code block works best.
          </p>
          <div className="pg-row pg-row--wrap">
            <button
              type="button"
              className="pg-button"
              disabled={request.trim() === ""}
              onClick={async () => setCopied((await copyText(instructions)) ? "yes" : "no")}
            >
              Copy instructions
            </button>
            {CHATS.map((chat) => (
              <a key={chat.name} className="pg-button pg-button--secondary" href={chat.href} target="_blank" rel="noopener noreferrer">
                Open {chat.name}
              </a>
            ))}
          </div>
          <p className="pg-step-note" role="status" aria-live="polite">
            {request.trim() === ""
              ? "Write or pick a screen first."
              : copied === "yes"
                ? "Copied. Paste it into your AI's chat and send it."
                : copied === "no"
                  ? "Your browser didn't let us copy. Select all the text below and copy it."
                  : ""}
          </p>
          {copied === "no" && <textarea className="pg-textarea" readOnly rows={6} value={instructions} aria-label="Instructions to copy" onFocus={(e) => e.target.select()} />}
        </li>

        <li className="pg-step">
          <h2 className="pg-step-title">
            <label htmlFor={replyId}>Paste its reply</label>
          </h2>
          <textarea
            id={replyId}
            className="pg-textarea"
            rows={6}
            spellCheck={false}
            value={reply}
            placeholder="Paste your AI's whole reply here."
            onChange={(e) => onReplyChange(e.target.value)}
          />
          <div className="pg-row">
            <button type="button" className="pg-button" disabled={reply.trim() === "" || busy} onClick={onShow}>
              Show my screen
            </button>
          </div>
        </li>
      </ol>

      {summary && (
        <div className="pg-own-result" aria-label="What we checked" role="region">
          {summary.map((sentence) => (
            <p key={sentence}>{sentence}</p>
          ))}
          {problems.length > 0 && (
            <>
              <ul className="pg-own-problems">
                {problems.slice(0, 5).map((p, i) => (
                  <li key={i}>
                    {p.line !== undefined ? `Line ${p.line}: ` : ""}
                    {p.message}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="pg-button pg-button--secondary"
                onClick={async () => setProblemsCopied(await copyText(problemsText))}
              >
                {problemsCopied ? "Copied: paste it to your AI" : "Copy the problems for your AI"}
              </button>
            </>
          )}
          <div className="pg-row pg-row--wrap">
            <button type="button" className="pg-button" onClick={async () => setShared((await onShare()) ? "yes" : "no")}>
              {shared === "yes" ? "Link copied" : "Share this screen"}
            </button>
            <a className="pg-button pg-button--secondary" {...guideLink}>
              Build it into your app
            </a>
          </div>
          {shared === "no" && <p className="pg-step-note">Your browser didn't let us copy. The link is in the address bar now: copy it from there.</p>}
        </div>
      )}
    </section>
  );
}
