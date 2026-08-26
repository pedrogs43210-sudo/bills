import { useEffect, useState } from "react";
import { MARK_GEOMETRY } from "./Mark";

/**
 * The mark assembling itself, once, on the very first launch.
 *
 * One bar arrives, then splits — the top staying long, the bottom pulling in short. It is the whole
 * argument of the product in 1.4 seconds, and it is the same motion the scan screen uses when a
 * split resolves. Nothing spins and nothing bounces.
 *
 * ONCE PER INSTALL, not once per launch. The sheet asks for a 1.4s hold, and 1.4s of brand before
 * every single open would be 1.4s stolen from somebody standing at a restaurant table — which is
 * the one thing Billy competes on. On a first launch it costs nothing: they have not come to scan
 * yet, and three onboarding panels are about to follow anyway.
 */
const SPLASH_KEY = "bills.splashSeen.v1";

/** How long the animation runs, and therefore how long the overlay holds. From the sheet. */
export const SPLASH_MS = 1400;
/** Reduced motion still gets the mark, just not the assembling. Long enough to register, no more. */
export const SPLASH_STILL_MS = 700;

/**
 * Whether this launch should play it.
 *
 * Read and *written* in the same breath, deliberately: a launch that is killed halfway through
 * onboarding has still seen the splash, and showing it again would make it feel like a loop rather
 * than an introduction. Storage that cannot be read says "already seen" — the same bias as
 * lib/onboarding.ts, for the same reason.
 */
export function claimFirstLaunch(): boolean {
  try {
    if (localStorage.getItem(SPLASH_KEY) === "1") return false;
    localStorage.setItem(SPLASH_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

const EASE = "cubic-bezier(.2,.8,.25,1)";

/**
 * `size` is the mark's width. The regular drawing, always — this is the largest the mark ever gets
 * rendered in the product, nowhere near the compact threshold.
 */
export function SplashAnimation({ onDone }: { onDone: () => void }) {
  const [still] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const t = setTimeout(onDone, still ? SPLASH_STILL_MS : SPLASH_MS);
    return () => clearTimeout(t);
  }, [onDone, still]);

  const g = MARK_GEOMETRY.regular;
  const width = 168;

  return (
    <div className="splash" data-still={still ? "" : undefined}>
      <svg
        width={width}
        height={width * g.ratio}
        viewBox={g.viewBox}
        aria-hidden="true"
        focusable="false"
      >
        {/* Both bars start stacked on y27.5 — long translated down 7.5, short up 7.5 — so at frame
            one they occupy exactly the same 9 units and read as a single bar. The short one also
            starts at 44 wide (scaleX 44/26 = 1.6923) and pulls in from its own left edge, because
            the short bar hangs from the left and must never appear to slide. */}
        <rect
          className="splash-long"
          x={g.long.x}
          y={g.long.y}
          width={g.long.w}
          height={g.long.h}
          rx={g.long.h / 2}
        />
        <rect
          className="splash-short"
          x={g.short.x}
          y={g.short.y}
          width={g.short.w}
          height={g.short.h}
          rx={g.short.h / 2}
        />
      </svg>
      <p className="splash-word">Billy</p>
    </div>
  );
}

export const SPLASH_EASE = EASE;
