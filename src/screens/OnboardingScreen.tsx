import { useState } from "react";
import { Footerbar } from "../components/Footerbar";
import { setOnboarded } from "../lib/onboarding";

/**
 * The first thing a stranger sees.
 *
 * Three panels, skippable from the first tap, and never shown twice. It explains one idea —
 * photograph a receipt, tap who each thing was for, see who owes whom — and then gets out of
 * the way.
 *
 * It deliberately says nothing about money, asks for no account, and requests no permissions.
 * The camera permission is asked for by the camera, at the moment it is used, which is when a
 * person can actually tell why it is wanted.
 */

const STEPS = [
  {
    art: "📸",
    title: "Photograph the receipt",
    body: "The items come out as a list — names, quantities and prices — ready to check.",
  },
  {
    art: "👆",
    title: "Tap who got what",
    body: "One person, a few of you, or everyone. Save the sets of people you split with often and assign them in one tap.",
  },
  {
    art: "💸",
    title: "See who owes whom",
    body: "The app does the arithmetic, to the cent, and gives you a summary to send to the group.",
  },
];

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const current = STEPS[step];

  function finish() {
    setOnboarded();
    onDone();
  }

  return (
    <div>
      <div className="topbar">
        <h1 className="screen-title">Bills 🧾</h1>
        {/* Available from the very first panel: someone who already knows what this is should
            never have to tap through three screens to get started. */}
        <button className="btn btn-ghost" onClick={finish}>
          Skip
        </button>
      </div>

      <div className="card" style={{ textAlign: "center", paddingTop: "var(--s6)", paddingBottom: "var(--s6)" }}>
        <div aria-hidden="true" style={{ fontSize: 56, lineHeight: 1.1, marginBottom: "var(--s4)" }}>
          {current.art}
        </div>
        <h2 style={{ fontSize: 21 }}>{current.title}</h2>
        <p className="label" style={{ maxWidth: 300, margin: "0 auto", textWrap: "pretty" }}>
          {current.body}
        </p>
      </div>

      {last && (
        <div className="note note-good" role="status">
          <span className="note-dot" aria-hidden="true">✓</span>
          <div>
            <span className="note-head">No account, no sign-up. </span>
            Your trips stay on this phone, and splitting up a bill works with no signal at all.
          </div>
        </div>
      )}

      <Footerbar>
        {/* The dots are decoration: the button already says where you are. */}
        <div aria-hidden="true" style={{ display: "flex", gap: "var(--s2)", justifyContent: "center", marginBottom: "var(--s3)" }}>
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              style={{
                width: i === step ? 22 : 7,
                height: 7,
                borderRadius: 999,
                background: i === step ? "var(--accent)" : "var(--line-strong)",
                transition: "width .18s ease",
              }}
            />
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => (last ? finish() : setStep(step + 1))}>
          {last ? "Start splitting" : "Next"}
        </button>
      </Footerbar>
    </div>
  );
}
