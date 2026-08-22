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
    case "bad-photo":
      /* Judged on the phone, before anything was uploaded. The wording is careful: it says what the
         picture looked like, never that the receipt was unreadable, because that is a claim about
         the paper the app has not earned. The measurement can be wrong, and the way out is one tap
         below. */
      return {
        head: "That one might not read well.",
        body: fallback,
        primary: "retry",
      };
    case "illegible":
      /* The model looked at it and said it could not read the prices — so the fix really is
         another photograph, and this is the one failure where retrying is the right first button
         rather than the polite one. The specific problem it named is carried in `message` and
         printed below, because "the bottom of the receipt is cut off" is worth more than any
         sentence written here in advance. No scan was used, and saying so is what stops somebody
         being afraid to try again. */
      return {
        head: "Let's try that photo again.",
        body: "No scan was used. Lay the receipt flat, get the whole of it in frame, and give it as much light as you can — that fixes almost every one of these.",
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
  quality,
  onRetry,
  onUseAnyway,
  onAddByHand,
  onSettings,
  onBack,
}: {
  reason: ScanFailure | null;
  message: string;
  canRetry: boolean;
  /** The measurements behind a "bad-photo" verdict, shown so a bad call can be reported. */
  quality?: { sharpness: number; paper: number; contrast: number };
  onRetry: () => void;
  /** Scan the photo anyway, overruling the quality check. Only offered for "bad-photo". */
  onUseAnyway?: () => void;
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
        {/* A photo we stopped is not a failure — nothing was tried and nothing was spent. Calling
            it one made the app sound broken at the moment it was being careful. */}
        <h1 className="screen-title">{reason === "bad-photo" ? "Before we scan that" : "That didn't work"}</h1>
      </div>

      <div className="note" role="status">
        <span className="note-dot" aria-hidden="true">!</span>
        <div>
          <span className="note-head">{advice.head} </span>
          {advice.body}
        </div>
      </div>

      {/* Overruling the check, in the same breath as the check itself.
          These thresholds are starting values rather than measurements, so some readable receipts
          will be stopped — and an app that will not scan a receipt you can plainly read is worse
          than one that wastes a scan. The numbers are printed because they are how a wrong call
          gets reported as figures rather than as "it keeps refusing my photos". */}
      {reason === "bad-photo" && onUseAnyway && (
        <div className="card">
          <h3>Looks fine to you?</h3>
          <p className="label" style={{ marginTop: 0 }}>
            This is a guess from the pixels, not a verdict on the receipt. If you can read the
            prices on it, Billy probably can too — nothing has been used up either way.
          </p>
          <button className="btn" style={{ width: "100%" }} onClick={onUseAnyway}>
            Scan it anyway
          </button>
          {quality && (
            <p className="micro" style={{ margin: "var(--s2) 0 0", textAlign: "center" }}>
              sharpness {Math.round(quality.sharpness)} · light {Math.round(quality.paper)} ·
              contrast {Math.round(quality.contrast)}
            </p>
          )}
        </div>
      )}

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
