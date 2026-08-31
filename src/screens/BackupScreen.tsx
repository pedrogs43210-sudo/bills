import { useState } from "react";
import { useStore } from "../state/StoreProvider";
import { exportTrip, importTrip } from "../lib/storage";
import type { View } from "../App";
import { SplitIcon } from "../components/SplitIcon";

/**
 * Exporting and importing splits, on a screen of their own.
 *
 * It used to be a card on Profile, and it was the reason that page never settled: the export list
 * has one row per split, so it grew without limit. Somebody with a dozen holidays had a dozen rows
 * sitting between "Appearance" and "Help", and the two settings either side of it drifted further
 * apart every time they used the app.
 *
 * Its own screen also lets the explanation be a proper one. On Profile this had to justify itself
 * in a single grey line; here there is room to say plainly that nothing is stored anywhere else,
 * which is the part people need to understand before they think to make a backup at all.
 */
export function BackupScreen({ go }: { go: (v: View) => void }) {
  const { data, dispatch } = useStore();
  const [importError, setImportError] = useState("");

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
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "profile" })}>←</button>
        <h1 className="screen-title">Backup</h1>
      </div>

      <div className="card">
        <p className="label" style={{ marginTop: 0 }}>
          Everything lives on this phone and nowhere else — there is no account and no copy on a
          server, which is what keeps your splits private and also means a lost or reset phone takes
          them with it. Exporting a split writes it to a file you keep.
        </p>
      </div>

      <h2 className="settings-label">Your splits</h2>
      {data.trips.length === 0 ? (
        <div className="settings-list">
          <div className="settings-row">
            <span className="muted" style={{ fontWeight: 500 }}>No splits to export yet.</span>
          </div>
        </div>
      ) : (
        <div className="settings-list">
          {data.trips.map((t) => (
            <div key={t.id} className="settings-row">
              <span className="row" style={{ gap: "var(--s2)", minWidth: 0 }}>
                <SplitIcon emoji={t.emoji} size={18} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
              </span>
              <button className="btn" onClick={() => download(t.id)}>Export</button>
            </div>
          ))}
        </div>
      )}

      <h2 className="settings-label">Bring one back</h2>
      <div className="card">
        <label className="label" htmlFor="import" style={{ display: "block", marginTop: 0 }}>
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
    </div>
  );
}
