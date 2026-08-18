import type { ScanFailure } from "../lib/scan";

/**
 * When a scan doesn't work.
 *
 * This was a warning banner with a Try again button, which is fine if you already know how the
 * app works and useless if you don't: retrying a photo the model could not read just fails again,
 * and a stranger has no reason to know that typing the receipt in is free and unlimited.
 *
 * So each reason gets its own words and its own first action, and **every** version of this screen
 * offers the way that always works — type it in yourself.
 */

type Advice = {
  head: string;
  body: string;
  /** The action most likely to help for this particular reason. */
  primary: "retry" | "settings" | "by-hand";
};

function adviceFor(reason: ScanFailure | null, fallback: string): Advice {
  switch (reason) {
    case "network":
      return {
        head: "Couldn't reach the scanning service.",
        body: "Usually the signal. The photo is still here, so trying again costs nothing — and everything except scanning works offline anyway.",
        primary: "retry",
      };
    case "refused":
    case "unparseable":
      return {
        head: "That photo couldn't be read.",
        body: "Creased paper, low light or an unusual layout will do it. A straighter, brighter photo of the whole receipt often works — or type the items in, which always does.",
        primary: "by-hand",
      };
    case "too-fast":
      return {
        head: "One at a time.",
        body: "Billy only reads one receipt every couple of seconds — a guard against runaway scanning, not against you. Wait a moment and try the same photo again; nothing has been used up.",
        primary: "retry",
      };
    case "busy":
      return {
        head: "Billy is having a busy day.",
        body: "Scanning is paused until tomorrow — a limit on our side, not on yours, and nothing you can do about it from here. Typing the items in works exactly as well and is always available.",
        primary: "by-hand",
      };
    case "bad-key":
      return {
        head: "The API key was rejected.",
        body: "Check it in Settings — keys can be deleted or run out of credit. Nothing else about the app is affected.",
        primary: "settings",
      };
    case "no-key":
      return {
        head: "No API key saved.",
        body: "Scanning needs one in this version of the app. Splitting a receipt you type in yourself needs nothing at all.",
        primary: "settings",
      };
    default:
      // An unexpected failure still has to say something true and offer a way on.
      return {
        head: "Something went wrong reading the photo.",
        body: fallback,
        primary: "by-hand",
      };
  }
}

export function ScanFailedScreen({
  reason,
  message,
  canRetry,
  onRetry,
  onAddByHand,
  onSettings,
  onBack,
}: {
  reason: ScanFailure | null;
  message: string;
  canRetry: boolean;
  onRetry: () => void;
  onAddByHand: () => void;
  onSettings: () => void;
  onBack: () => void;
}) {
  const advice = adviceFor(reason, message);
  const retry = canRetry && advice.primary === "retry";

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={onBack}>←</button>
        <h1 className="screen-title">That didn't work</h1>
      </div>

      <div className="note" role="status">
        <span className="note-dot" aria-hidden="true">!</span>
        <div>
          <span className="note-head">{advice.head} </span>
          {advice.body}
        </div>
      </div>

      {/* The way that always works, stated as an offer rather than a consolation. */}
      <div className="card">
        <h3>Type the receipt in</h3>
        <p className="label" style={{ marginTop: 0 }}>
          The splitting, the groups and the arithmetic are all the same — the camera is the only
          part that can fail. This has no limit, and never will.
        </p>
        <button
          className={advice.primary === "by-hand" ? "btn btn-primary" : "btn"}
          style={{ width: "100%" }}
          onClick={onAddByHand}
        >
          ✍️ Add items by hand
        </button>
      </div>

      <div className="row" style={{ gap: "var(--s2)" }}>
        {canRetry && (
          <button className={retry ? "btn btn-primary" : "btn"} style={{ flex: 1 }} onClick={onRetry}>
            Try again
          </button>
        )}
        {(advice.primary === "settings" || reason === "bad-key" || reason === "no-key") && (
          <button
            className={advice.primary === "settings" ? "btn btn-primary" : "btn"}
            style={{ flex: 1 }}
            onClick={onSettings}
          >
            Open Settings
          </button>
        )}
      </div>

      {/* The raw message, kept for a reason worth naming: when someone asks me what went wrong,
          this is the sentence that tells me which branch they hit. */}
      {message && advice.body !== message && (
        <p className="muted" style={{ marginTop: "var(--s4)" }}>
          {message}
        </p>
      )}
    </div>
  );
}
