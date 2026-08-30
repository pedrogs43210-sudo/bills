import { useRef, useState } from "react";
import { useStore } from "../state/StoreProvider";
import { newId } from "../lib/ids";
import type { View } from "../App";
import type { Trip } from "../types";
import { Disc } from "../components/chips";
import { Mark } from "../components/Mark";
import { defaultCurrency } from "../lib/currencies";
import { keptSplits } from "../lib/keptSplits";
import { nudge } from "../lib/nudge";

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
  /* Why "Create split" did nothing, said out loud.
     It used to `return` on an empty name — the tap landed, the button moved, and nothing happened
     and nothing explained itself, which reads as a broken app rather than as a missing field. */
  const [nameError, setNameError] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  /* The form used to sit above the trips, so opening the app meant looking at an empty field
     before your own holidays. It lives behind the ＋ now — and opens by itself for someone with
     no trips, who has nothing else to look at and one obvious thing to do. */
  const [adding, setAdding] = useState(data.trips.length === 0);

  function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      // Three channels, because one of them fails for somebody: the sentence for anyone reading,
      // the shake for anyone who tapped without reading, and the buzz for anyone whose eyes are on
      // the table rather than the phone. The field is focused last so the keyboard comes up on the
      // thing that needs filling in.
      setNameError("Give it a name first — “Algarve”, “Tuesday dinner”, anything.");
      nudge(nameInput.current);
      nameInput.current?.focus();
      return;
    }
    setNameError("");
    const id = newId();
    dispatch({ type: "createTrip", id, name: trimmed, emoji, currency: defaultCurrency() });
    setName("");
    setAdding(false);
    go({ screen: "trip", tripId: id });
  }

  const joined = keptSplits();

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
        <Mark size={24} color="var(--ink)" accent="var(--accent)" className="app-mark" />
        <h1 className="screen-title">Billy</h1>
      </div>

      {adding && (
        <div className="card card-form">
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
            ref={nameInput}
            placeholder="Split name"
            autoFocus={data.trips.length > 0}
            value={name}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "split-name-error" : undefined}
            onChange={(e) => {
              setName(e.target.value);
              // Clears as soon as they start fixing it. An error that outlives the problem is the
              // second most annoying kind after one that never appears.
              if (nameError) setNameError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          {nameError && (
            /* role="alert" so it is announced, not just drawn — somebody using a screen reader got
               exactly as little from the old silent return as everybody else. */
            <p className="field-error" id="split-name-error" role="alert">
              {nameError}
            </p>
          )}
          <div className="emoji-row">
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
            style={{ width: "100%" }}
            onClick={() => go({ screen: "join" })}
          >
            Somebody sent you a code? Join their split
          </button>
        </div>
      )}

      {/* Bottom-right, thumb-height, above the tab bar: the place people reach for an add button
          without reading anything, in Gmail, Photos, Keep and every Material app since. The header
          pill this replaces was legible but in the corner hardest to reach on a large phone, and it
          made the one action on the screen look like a setting.

          The word is gone, so the label has to carry it: "New split" rather than "New", because a
          screen reader reads this out of a context where "New" alone means nothing. */}
      {!adding && (
        <div className="fab-slot">
          <button
            className="fab"
            aria-label="New split"
            onClick={() => {
              setAdding(true);
              // The form opens under the header. From half way down a long list that is off-screen,
              // so the tap takes you to it.
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            {/* Drawn rather than typed: a ＋ glyph is a guess about which font loaded and how much
                ink it puts inside a 56px circle. --accent-ink rather than --accent because a
                2.6px stroke on the pale --surface disc is closer to a word than to a bar. */}
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 5v14M5 12h14"
                stroke="var(--accent-ink)"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            </svg>
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

      {/* Splits somebody else made and sent you.
          Separated from your own because they behave differently: you did not create them, you
          cannot add receipts to them, and while the link is alive your picks go to somebody else's
          phone. Listed at all because the alternative — which is what shipped — was that a guest's
          only route back to a receipt was the original message, and after a week not even that. */}
      {joined.length > 0 && (
        <>
          <h3 className="section-head">Shared with you</h3>
          {joined.map((k) => (
            <button
              key={k.code}
              className="card tap-card"
              onClick={() => go({ screen: "join", code: k.code })}
            >
              <span className="row" style={{ alignItems: "flex-start" }}>
                <span className="trip-name">
                  <span aria-hidden="true" style={{ marginRight: 6 }}>{k.view.split.emoji}</span>
                  {k.view.split.name}
                </span>
                <span className="micro">
                  {k.view.split.receipts.length} receipt{k.view.split.receipts.length === 1 ? "" : "s"}
                </span>
              </span>
              <span className="label" style={{ display: "block", marginTop: 8 }}>
                Shared by {k.view.split.people[0]?.name ?? "a friend"} — your copy, kept on this phone.
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
