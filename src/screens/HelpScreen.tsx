import { installId } from "../lib/installId";
import { usingProxy } from "../lib/scan";
import type { View } from "../App";

/**
 * How the app works, in the words someone would actually ask the question in.
 *
 * Both stores expect a screen like this, but the real reason it exists is the one-cent question:
 * two people split a €5.01 bottle of wine and get €2.51 and €2.50, and without an explanation
 * that looks like a bug in an app whose entire job is being right about money.
 */
export function HelpScreen({ go }: { go: (v: View) => void }) {
  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "profile" })}>←</button>
        <h1 className="screen-title">Help &amp; about</h1>
      </div>

      <div className="card">
        <h3>How the splitting works</h3>
        <p className="label" style={{ marginTop: 0 }}>
          Each item is divided between the people you tapped. Everything is worked out in whole
          cents, never in fractions, so the numbers you see are the numbers that get paid.
        </p>
        <p className="label">
          <b>Why your share can be one cent different from your friend's.</b> A €5.01 bottle split
          two ways is €2.505 each, which does not exist. Rather than round both up and collect
          €5.02, or both down and collect €5.00, the app gives one person €2.51 and the other
          €2.50. The total always matches the receipt exactly, and over the course of a split those
          odd cents land on different people.
        </p>
        <p className="label">
          <b>If the items don't add up to the receipt total,</b> the app says so rather than
          hiding it. You can set the total to the items' sum in one tap, or type the real figure,
          and whatever is left over is carried by whoever paid.
        </p>
      </div>

      <div className="card">
        <h3>Discounts, and the two kinds of receipt</h3>
        <p className="label" style={{ marginTop: 0 }}>
          Shops print discounts in two ways that look identical on paper. Some list an item at
          full price and take the discount off on the line below. Others already show the reduced
          price and print the discount underneath purely as information.
        </p>
        <p className="label">
          Counting the second kind would subtract the same discount twice, so the app works out
          which sort it is from the receipt's own totals and tells you what it decided. If the
          numbers don't fit either pattern it says that too, and changes nothing on its own.
        </p>
      </div>

      <div className="card">
        <h3>What happens to a photo of a receipt</h3>
        <p className="label" style={{ marginTop: 0 }}>
          The photo is shrunk on your phone and sent to Anthropic, which reads the text and sends
          back the list of items. {usingProxy() ? "It passes through this app's own server, which does not keep it." : "It is sent directly from your phone using your own API key."}{" "}
          The photo is not stored on any server, and it is not used to train anything.
        </p>
        <p className="label">
          <b>Everything else stays on this phone.</b> Your splits, who is on them, what they had
          and who owes whom are saved in this app only. There is no account, and nobody — including
          me — can see them. That is also why Profile → Export is worth using: if you lose the
          phone, the data goes with it.
        </p>
      </div>

      <div className="card">
        <h3>A scan got it wrong</h3>
        <p className="label" style={{ marginTop: 0 }}>
          It happens — creased paper, faded ink, an unusual layout. Every line is editable on the
          check screen, and you can add or delete items by hand. If a photo won't read at all, you
          can skip scanning entirely and type the receipt in: that has never had a limit and never
          will.
        </p>
      </div>

      <div className="card">
        <h3>About</h3>
        <p className="label" style={{ marginTop: 0 }}>
          Billy version {__APP_VERSION__}
        </p>
        <p className="label">
          Made by Pedro Santos. Questions, or something wrong with the numbers?{" "}
          {/* Deliberately not a mailto with a guessed address — see docs/legal. */}
          Get in touch at the address in the privacy policy.
        </p>
        {/* A relative path, so the same link works in the web build and inside the phone app, where
            public/ is bundled alongside the app. Google requires a reachable policy, and a person
            who wants to read one should not have to go looking for a website. */}
        <a
          className="btn"
          style={{ width: "100%", marginTop: "var(--s2)" }}
          href="privacy.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy policy
        </a>
        {/* Quoted in a deletion request: it is the only handle the scan counter is stored under,
            so without showing it there is no way for someone to ask for their record to go. */}
        <p className="micro" style={{ marginTop: "var(--s3)" }}>
          Install reference
        </p>
        <p className="label" style={{ margin: 0, overflowWrap: "anywhere", fontFamily: "ui-monospace, monospace" }}>
          {installId()}
        </p>
        <p className="muted">
          A random reference for this copy of the app. It is not linked to your name and is only
          used to count free scans. Quote it if you ever want that count deleted.
        </p>
      </div>
    </div>
  );
}
