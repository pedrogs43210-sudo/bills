import { useState } from "react";
import { Footerbar } from "../components/Footerbar";

/**
 * The step between a quick scan landing and the review screen.
 *
 * The assign screen has no way to add a person — people are added on the trip screen, which a
 * quick scan never passes through. Without a stop here, a quick-scanned split would be
 * permanently stuck with the one person the scan created ("You"). Done is never disabled: someone
 * who wants to look at the items first, or name people later, must not be trapped on a screen
 * that only exists to save them a trip back to add a friend.
 *
 * Purely presentational — it holds no state but the text field, touches no store, and knows
 * nothing about scanning. It is handed names and hands back names.
 */
export function WhosInScreen({
  people,
  suggestions,
  onAdd,
  onDone,
}: {
  people: string[];
  suggestions: string[];
  onAdd: (name: string) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
  }

  return (
    <div>
      <div className="topbar">
        <h1 className="screen-title">Who's in?</h1>
      </div>

      <div className="card">
        <h3>Already here</h3>
        {/* Not buttons: nothing on this screen removes a person, so a tap target that does
            nothing would be a false affordance. */}
        {people.map((p) => (
          <span key={p} className="chip selected">
            {p}
          </span>
        ))}
      </div>

      {suggestions.length > 0 && (
        <div className="card">
          <h3>From last time</h3>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="chip chip-action"
              aria-label={`Add ${s}`}
              onClick={() => onAdd(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="card">
        <label className="micro" htmlFor="whosin-name" style={{ display: "block", marginBottom: "var(--s2)" }}>
          Add someone
        </label>
        <input
          id="whosin-name"
          placeholder="Type a name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>

      <Footerbar>
        <button className="btn btn-primary" onClick={onDone}>
          Done
        </button>
      </Footerbar>
    </div>
  );
}
