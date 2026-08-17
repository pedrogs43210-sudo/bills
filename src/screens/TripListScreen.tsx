import { useState } from "react";
import { useStore } from "../state/StoreProvider";
import { newId } from "../lib/ids";
import type { View } from "../App";
import type { Trip } from "../types";
import { Disc } from "../components/chips";
import { Mark } from "../components/Mark";

const EMOJIS = ["🧾", "🏖️", "⛰️", "🏙️", "🎿", "🏕️", "🎉"];

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
  /* The form used to sit above the trips, so opening the app meant looking at an empty field
     before your own holidays. It lives behind the ＋ now — and opens by itself for someone with
     no trips, who has nothing else to look at and one obvious thing to do. */
  const [adding, setAdding] = useState(data.trips.length === 0);

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = newId();
    dispatch({ type: "createTrip", id, name: trimmed, emoji });
    setName("");
    setAdding(false);
    go({ screen: "trip", tripId: id });
  }

  return (
    <div>
      {/* The app's own name and mark, and the one thing the header is for now: start a split.
          Settings moved to the Profile tab, so the corner that used to open it opens this instead.
          The same file the phone uses as the app icon, so there is one mark. */}
      <div className="topbar">
        {/* The mark flat and untiled, in the accent, at 24px — drawing B. It used to be the tiled
            icon.svg: a gradient badge of the app, inside the app, at the top of its own home
            screen. The asset sheet is explicit that the tile belongs to the launcher, the store and
            the splash, and nowhere in the product. */}
        <Mark size={24} color="var(--accent)" className="app-mark" />
        <h1 className="screen-title">Billy</h1>
        {/* A labelled pill rather than a bare ＋. The glyph on its own was a mystery: the one
            control on this screen that creates anything, sitting in the corner hardest to reach,
            saying nothing about what it does. The word costs 40px and removes the guess.

            aria-label keeps the fuller "New split" for a screen reader, which reads it out of
            context where "New" alone means nothing. */}
        <button
          className="btn btn-pill"
          aria-label="New split"
          onClick={() => {
            setAdding(true);
            // The form appears under the header. From half way down a long list that would be
            // off-screen, so the tap takes you to it.
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <span aria-hidden="true" style={{ fontSize: "17px", fontWeight: 600 }}>＋</span>
          New
        </button>
      </div>

      {adding && (
        <div className="card">
          <div className="row">
            <h3 style={{ margin: 0 }}>New split</h3>
            {/* The header button opens this; closing it belongs here, next to what it closes. */}
            {data.trips.length > 0 && (
              <button className="btn btn-ghost" aria-label="Close the new split form" onClick={() => setAdding(false)}>
                ✕
              </button>
            )}
          </div>
          <input
            placeholder="Split name"
            autoFocus={data.trips.length > 0}
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
            Create split
          </button>
          {/* Here rather than in a menu, because somebody who has been sent a code arrives with an
              empty app and this card is what opens in front of them. */}
          <button
            className="btn btn-ghost"
            style={{ width: "100%", marginTop: "var(--s2)" }}
            onClick={() => go({ screen: "join" })}
          >
            Somebody sent you a code? Join their split
          </button>
        </div>
      )}

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
