import { useState } from "react";
import { useStore } from "../state/StoreProvider";
import { newId } from "../lib/ids";
import type { View } from "../App";
import type { Trip } from "../types";
import { Disc } from "../components/chips";

const EMOJIS = ["🏖️", "⛰️", "🏙️", "🎿", "🏕️", "🎉"];

/**
 * Newest trip first. Trips are stored in the order they were added, so a missing or equal
 * date falls back to that: the last one added still reads as the most recent.
 */
export function newestFirst(trips: Trip[]): Trip[] {
  return trips
    .map((trip, index) => ({ trip, index }))
    .sort((a, b) => (b.trip.createdAt ?? "").localeCompare(a.trip.createdAt ?? "") || b.index - a.index)
    .map(({ trip }) => trip);
}

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

      <div className="card">
        <h3>New trip</h3>
        <input
          placeholder="Trip name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
        <div style={{ margin: "10px 0" }}>
          {EMOJIS.map((e) => (
            <button
              key={e}
              className={`chip chip-emoji${e === emoji ? " selected" : ""}`}
              aria-label={`Use ${e}`}
              aria-pressed={e === emoji}
              onClick={() => setEmoji(e)}
            >
              {e}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={create}>
          Create trip
        </button>
      </div>

      {newestFirst(data.trips).map((t) => (
        <button
          key={t.id}
          className="card tap-card"
          onClick={() => go({ screen: "trip", tripId: t.id })}
        >
          <span className="row" style={{ alignItems: "flex-start" }}>
            <span className="trip-name">
              <span aria-hidden="true" style={{ marginRight: 6 }}>{t.emoji}</span>
              {t.name}
            </span>
            <span className="micro">
              {t.receipts.length} receipt{t.receipts.length === 1 ? "" : "s"}
            </span>
          </span>
          {/* Who is on this trip, as faces. Deliberately no money here: the only honest total
              would have to explain which receipts it leaves out, and there is nowhere to say so
              on a one-line row. The settle screen is where money gets its context. */}
          {t.people.length > 0 ? (
            <span className="row" style={{ marginTop: 8, justifyContent: "flex-start", gap: "var(--s2)" }}>
              <span className="disc-stack">
                {t.people.slice(0, 6).map((p) => (
                  <Disc key={p.id} person={p} small />
                ))}
              </span>
              <span className="label">
                {t.people.length > 6 ? `${t.people.length} people` : t.people.map((p) => p.name).join(", ")}
              </span>
            </span>
          ) : (
            <span className="label" style={{ display: "block", marginTop: 8 }}>
              Nobody added yet — open it to add your friends.
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
