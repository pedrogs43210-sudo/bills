import { useEffect, useState } from "react";
import { loadApiKey, saveApiKey } from "../lib/storage";
import { fetchQuota, lastKnownQuota, usingProxy, verifyApiKey, type ScanQuota } from "../lib/scan";
import { PackChooser } from "../components/PackChooser";
import { currencyOptions, defaultCurrency, setDefaultCurrency } from "../lib/currencies";
import { setThemeChoice, themeChoice, type ThemeChoice } from "../lib/theme";
import type { View } from "../App";

type KeyStatus = "idle" | "saved" | "checking" | "ok" | "bad" | "unknown";

const KEY_STATUS_TEXT: Record<KeyStatus, string> = {
  idle: "",
  saved: "Saved ✓",
  checking: "Checking…",
  ok: "Key works ✓",
  bad: "Key rejected — double-check it",
  unknown: "Couldn't check — are you online?",
};

/** The mark of a row that goes somewhere. Drawn rather than typed — "›" lands differently in
 * every font that might load, and decorative punctuation has to be hidden from a screen reader
 * anyway, so there is nothing a glyph buys here. */
function Chevron() {
  return (
    <svg className="settings-chevron" width="8" height="14" viewBox="0 0 8 14" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 1l6 6-6 6" />
    </svg>
  );
}

export function ProfileScreen({ go }: { go: (v: View) => void }) {
  const [key, setKey] = useState(loadApiKey());
  const [keyStatus, setKeyStatus] = useState<KeyStatus>("idle");
  const [theme, setTheme] = useState<ThemeChoice>(themeChoice);
  /* Mirrored in state so the picker moves the moment it is tapped. The stored value is the
     authority — this is only what the control shows between now and the next launch. */
  const [currency, setCurrency] = useState(defaultCurrency);
  const [scanQuota, setScanQuota] = useState<ScanQuota | null>(lastKnownQuota());

  /** Asked of the server, never believed from the phone — before and after anything is bought. */
  const refreshScanQuota = () => void fetchQuota().then((q) => q && setScanQuota(q));
  useEffect(() => {
    if (usingProxy()) refreshScanQuota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function testKey() {
    setKeyStatus("checking");
    try {
      setKeyStatus((await verifyApiKey(key.trim())) ? "ok" : "bad");
    } catch {
      setKeyStatus("unknown");
    }
  }

  return (
    <div>
      {/* No back button: this is a tab root, reached from the bottom bar rather than by
          drilling in, so the tab bar itself is how you leave it. */}
      <div className="topbar">
        <h1 className="screen-title">Profile</h1>
      </div>

      {/* Buying before you need it, rather than only at the wall. Someone packing for a holiday
          knows they are about to scan a fortnight of receipts; making them hit a wall mid-trip to
          discover they could have topped up is a worse experience and a worse conversion. */}
      <ScansSummary quota={scanQuota} />
      {/* Buying below has to move the number above it, or the card and the purchase disagree. */}
      {/* The bonus is real wherever the packs are sold, so it is shown wherever they are. Offering
          it only at the wall would mean somebody who topped up early — the most willing customer
          there is — quietly got less for the same money than somebody who waited to run out. */}
      <PackChooser onBought={refreshScanQuota} firstPack={scanQuota?.firstPack ?? false} />

      <h2 className="settings-label">Settings</h2>
      <div className="settings-list">
        {/* The currency every new split starts in.
            A setting rather than a guess, deliberately. The scanner reads a currency off the photo
            and the app ignores it — see the note in TripScreen, written after a misread "USD"
            turned a Portuguese holiday into dollars. A wrong currency is the worst bug this app
            can have, because the digits still look right and nobody notices until they are
            arguing about money. Set once by the person who knows, instead of guessed every time. */}
        <div className="settings-row">
          <span>
            Currency
            <span className="settings-note">What new splits start in</span>
          </span>
          <span className="settings-value">
            <select
              aria-label="Default currency for new splits"
              value={currency}
              onChange={(e) => {
                setDefaultCurrency(e.target.value);
                setCurrency(e.target.value);
              }}
            >
              {currencyOptions(currency).map((o) => (
                <option key={o.code} value={o.code}>
                  {o.code} — {o.label}
                </option>
              ))}
            </select>
          </span>
        </div>

        {/* Stacked rather than side-by-side: three chips cannot share a 375px row with their own
            label without one of them wrapping, and a segmented control that wraps stops reading as
            one control. "Follow phone" is right most of the time and wrong at a sunny table. */}
        <div className="settings-row settings-row-stacked">
          <span className="settings-row-title">
            Appearance
            <span className="settings-note">Auto follows your phone</span>
          </span>
          {/* "Auto" on the face, "Follow phone" as the accessible name: the short word is what makes
              three chips fit one line, and the long one is what makes the control make sense read
              aloud. The note above says the same thing for anyone looking at it. */}
          <div className="settings-segmented">
            {([
              ["auto", "Auto", "Follow phone"],
              ["light", "☀️ Light", "Light"],
              ["dark", "🌙 Dark", "Dark"],
            ] as const).map(([value, label, name]) => (
              <button
                key={value}
                className={`chip chip-group${theme === value ? " selected" : ""}`}
                aria-label={name}
                aria-pressed={theme === value}
                onClick={() => {
                  setTheme(value);
                  setThemeChoice(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Both of these open a screen rather than expanding here. Backup in particular grew one
            row per split, which is what made this page unable to settle. */}
        <button className="settings-row" onClick={() => go({ screen: "backup" })}>
          <span>
            Backup
            <span className="settings-note">Export a split, or bring one back</span>
          </span>
          <Chevron />
        </button>

        <button className="settings-row" onClick={() => go({ screen: "help" })}>
          <span>
            Help &amp; about
            <span className="settings-note">How splitting works, and what happens to a photo</span>
          </span>
          <Chevron />
        </button>
      </div>

      {/* Hidden entirely once a scan proxy is configured: from then on the app scans on the
          user's behalf and an API key is not a thing they should ever have to know exists. This
          card is the old self-serve arrangement, kept only while that is still how it works. */}
      {!usingProxy() && (
      <div className="card">
        <h3>Scanning</h3>
        <p className="label" style={{ marginTop: 0 }}>
          Receipt scanning uses your own Anthropic API key. Create one at console.anthropic.com → API keys,
          load a few euros of credit, and paste it here. A scan costs a few cents.
        </p>
        {/* The one claim on this screen a stranger has to take on trust, so it gets said
            properly rather than in grey small print at the end of a paragraph. */}
        <div className="note note-good" style={{ marginTop: "var(--s3)" }}>
          <span className="note-dot" aria-hidden="true">✓</span>
          <div>
            <span className="note-head">The key stays on this phone. </span>
            It is stored on the phone itself and sent only to Anthropic when you scan a receipt.
          </div>
        </div>
        <label className="micro" htmlFor="apikey" style={{ display: "block", marginTop: "var(--s3)" }}>
          Anthropic API key
        </label>
        <input
          id="apikey"
          type="password"
          placeholder="sk-ant-…"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setKeyStatus("idle");
          }}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button
            className="btn"
            onClick={() => {
              saveApiKey(key);
              setKeyStatus("saved");
            }}
          >
            Save
          </button>
          <button className="btn" onClick={testKey}>Test key</button>
        </div>
        {keyStatus !== "idle" && <p className="muted">{KEY_STATUS_TEXT[keyStatus]}</p>}
      </div>
      )}

    </div>
  );
}

/**
 * How many scans are left, asked of the server rather than believed from the phone.
 *
 * A headline with a face rather than a label-and-number row: this is the one number on the screen
 * somebody came looking for, and it used to be set in the same small grey type as "Appearance".
 *
 * Deliberately quiet when there is nothing to say: with no proxy configured there is no counter to
 * report, and inventing "unlimited" would be a promise this app cannot keep.
 */
function ScansSummary({ quota }: { quota: ScanQuota | null }) {
  if (!usingProxy()) return null;

  const headline =
    quota === null
      ? "Counting…"
      : quota.left === null
        ? "Scans to spare"
        : `${quota.left} scan${quota.left === 1 ? "" : "s"} left`;

  /* Only worth saying when it adds something. "of your 3 free ones" explains where the number came
     from to somebody who has never bought anything; once they have, the mix is the useful fact. */
  const sub =
    quota === null || quota.left === null
      ? null
      : quota.credits === 0
        ? `of your ${FREE_TRIAL_HINT} free ones`
        : quota.left > quota.credits
          ? `${quota.left - quota.credits} free, ${quota.credits} bought`
          : "Packs never expire";

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "flex-start", gap: "var(--s3)" }}>
        <span className="scans-tile" aria-hidden="true">🎟</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: "var(--brand)", fontWeight: 600, fontSize: "16px" }}>
            {headline}
          </span>
          {sub && <span className="label" style={{ display: "block" }}>{sub}</span>}
        </span>
      </div>
    </div>
  );
}

/**
 * What a new install starts with. Only ever used in the sentence above, which is why it is a
 * display string rather than a number imported from the server — the server owns the real value,
 * and a second source of truth for it would eventually disagree.
 */
const FREE_TRIAL_HINT = 3;
