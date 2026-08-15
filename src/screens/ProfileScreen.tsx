import { useEffect, useState } from "react";
import { useStore } from "../state/StoreProvider";
import { exportTrip, importTrip, loadApiKey, saveApiKey } from "../lib/storage";
import { fetchQuota, lastKnownQuota, usingProxy, verifyApiKey, type ScanQuota } from "../lib/scan";
import { PackChooser } from "../components/PackChooser";
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

export function ProfileScreen({ go }: { go: (v: View) => void }) {
  const { data, dispatch } = useStore();
  const [key, setKey] = useState(loadApiKey());
  const [keyStatus, setKeyStatus] = useState<KeyStatus>("idle");
  const [importError, setImportError] = useState("");
  const [theme, setTheme] = useState<ThemeChoice>(themeChoice);
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

  function download(tripId: string) {
    const trip = data.trips.find((t) => t.id === tripId);
    if (!trip) return;
    const blob = new Blob([exportTrip(trip)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${trip.name.replace(/\W+/g, "-") || "split"}.bills.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleImport(file: File) {
    try {
      dispatch({ type: "importTrip", trip: importTrip(await file.text()) });
      setImportError("");
    } catch {
      setImportError("That file isn't a Billy split export.");
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
      <div className="card">
        <h3>Scans</h3>
        <ScansSummary quota={scanQuota} />
      </div>
      {/* Buying below has to move the number above it, or the card and the purchase disagree. */}
      <PackChooser onBought={refreshScanQuota} />

      {/* Light and dark both exist; this is the choice between them. "Auto" follows the phone,
          which is right most of the time and wrong at a sunny kitchen table. */}
      <div className="card">
        <h3>Appearance</h3>
        <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          {([
            ["auto", "Follow phone"],
            ["light", "☀️ Light"],
            ["dark", "🌙 Dark"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              className={`chip chip-group${theme === value ? " selected" : ""}`}
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

      <div className="card">
        <h3>Backup</h3>
        <p className="label" style={{ marginTop: 0 }}>
          Everything lives on this phone, so a backup is the only way it survives a lost or reset
          phone. Export each split you care about.
        </p>
        {data.trips.length === 0 && <p className="muted">No splits to export yet.</p>}
        {data.trips.map((t) => (
          <div key={t.id} className="row" style={{ padding: "var(--s1) 0" }}>
            <span className="row" style={{ gap: "var(--s2)", minWidth: 0 }}>
              <span aria-hidden="true">{t.emoji}</span>
              <span>{t.name}</span>
            </span>
            <button className="btn" onClick={() => download(t.id)}>Export</button>
          </div>
        ))}
        <label className="micro" htmlFor="import" style={{ display: "block", marginTop: "var(--s4)" }}>
          Import split
        </label>
        <input
          id="import"
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImport(f);
            e.target.value = "";
          }}
        />
        {importError && <div className="banner-warn">{importError}</div>}
      </div>

      <div className="card">
        <h3>Help &amp; about</h3>
        <p className="label" style={{ marginTop: 0 }}>
          How the splitting works, why a share can be a cent different, and what happens to a
          photo of a receipt.
        </p>
        <button className="btn" style={{ width: "100%" }} onClick={() => go({ screen: "help" })}>
          Open help
        </button>
      </div>
    </div>
  );
}

/**
 * How many scans are left, asked of the server rather than believed from the phone.
 *
 * Deliberately quiet when there is nothing to say: with no proxy configured there is no counter to
 * report, and inventing "unlimited" would be a promise this app cannot keep.
 */
function ScansSummary({ quota }: { quota: ScanQuota | null }) {
  if (!usingProxy()) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        This version scans with your own API key, so there is nothing to count.
      </p>
    );
  }
  if (quota === null) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Counting…
      </p>
    );
  }
  if (quota.left === null) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        You have scans to spare.
      </p>
    );
  }
  return (
    <>
      <div className="row">
        <span className="micro">Scans left</span>
        <span className="money-1">{quota.left}</span>
      </div>
      {/* Only worth breaking down when both kinds exist. "3 free" on its own is just the number
          again, and "20 bought" on its own is not news to whoever bought them. */}
      {quota.credits > 0 && quota.left > quota.credits && (
        <p className="muted" style={{ margin: "var(--s1) 0 0" }}>
          {quota.left - quota.credits} free, {quota.credits} bought
        </p>
      )}
    </>
  );
}
