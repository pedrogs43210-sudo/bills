import { useState } from "react";
import { useStore } from "../state/StoreProvider";
import { newId } from "../lib/ids";
import type { View } from "../App";

const EMOJIS = ["🏖️", "⛰️", "🏙️", "🎿", "🏕️", "🎉"];

export function TripListScreen({ go }: { go: (v: View) => void }) {
  const { data, dispatch } = useStore();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = newId();
    dispatch({ type: "createTrip", id, name: trimmed, emoji });
    setName("");
    go({ screen: "trip", tripId: id });
  }

  return (
    <div>
      <div className="topbar">
        <h1 className="screen-title">Bills 🧾</h1>
        <button className="btn btn-ghost" aria-label="Settings" onClick={() => go({ screen: "settings" })}>
          ⚙️
        </button>
      </div>

      {data.trips.map((t) => (
        <button
          key={t.id}
          className="card row"
          style={{ width: "100%", border: "none", cursor: "pointer", textAlign: "left" }}
          onClick={() => go({ screen: "trip", tripId: t.id })}
        >
          <span style={{ fontSize: 18 }}>
            {t.emoji} <b>{t.name}</b>
          </span>
          <span className="muted">
            {t.people.length} 👥 · {t.receipts.length} 🧾
          </span>
        </button>
      ))}

      <div className="card">
        <h3>New trip</h3>
        <input placeholder="Trip name" value={name} onChange={(e) => setName(e.target.value)} />
        <div style={{ margin: "10px 0" }}>
          {EMOJIS.map((e) => (
            <button key={e} className={`chip ${e === emoji ? "selected" : ""}`} onClick={() => setEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={create}>
          Create trip
        </button>
      </div>
    </div>
  );
}
