import { useCallback, useEffect, useState } from "react";
import { Footerbar } from "../components/Footerbar";
import { formatCents } from "../lib/money";
import { isValidShareCode } from "../lib/shareCodes";
import {
  guestShareFor,
  joinSplit,
  putClaims,
  readSharedSplit,
  ShareError,
  type SharedSplitView,
} from "../lib/sharedSplit";
import { Disc } from "../components/chips";
import type { View } from "../App";

/**
 * The guest's side: open a link, say which one you are, tick what you had.
 *
 * Three steps on one screen rather than three screens, because the whole thing takes about twenty
 * seconds and a wizard would be longer than the task. The step is derived from what is known — no
 * code yet, no person yet, or picking — so arriving with a code in the link skips straight past the
 * first one without any special casing.
 */
export function JoinScreen({ code: initialCode, go }: { code?: string; go: (v: View) => void }) {
  const [code, setCode] = useState(initialCode ?? "");
  const [typed, setTyped] = useState("");
  const [view, setView] = useState<SharedSplitView | null>(null);
  const [personId, setPersonId] = useState<string | null>(() =>
    initialCode ? (guestShareFor(initialCode)?.personId ?? null) : null
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async (c: string) => {
    setBusy(true);
    setError("");
    try {
      setView(await readSharedSplit(c));
      setCode(c);
    } catch (err) {
      setError(err instanceof ShareError ? err.message : "That code didn't work.");
      setView(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (initialCode) void load(initialCode);
  }, [initialCode, load]);

  /** Every item across every receipt, which is what a guest is being asked about. */
  const items = (view?.split.receipts ?? []).flatMap((r) =>
    r.items.filter((i) => !i.informational).map((i) => ({ ...i, from: r.storeName }))
  );
  const currency = view?.split.currency ?? "EUR";

  /* What they have claimed so far. Shown while they tap, because a running total is the reason to
     bother — without it this is data entry for somebody else's benefit. Each item is divided by
     however many people claimed it, but a guest cannot see other people's picks, so this is their
     share if nobody else claims the same things. Labelled as such rather than presented as final. */
  const runningTotal = items
    .filter((i) => picked.has(i.id))
    .reduce((sum, i) => sum + i.lineTotal, 0);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await putClaims(code, [...picked]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ShareError ? err.message : "Couldn't send that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // --- step one: no split loaded yet ---------------------------------------------------------
  if (!view) {
    return (
      <div>
        <div className="topbar">
          <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "trips" })}>←</button>
          <h1 className="screen-title">Join a split</h1>
        </div>
        <div className="card">
          <p className="label" style={{ marginTop: 0 }}>
            Somebody sent you a code? Type it here and tick what you had.
          </p>
          <label className="micro" htmlFor="code" style={{ display: "block" }}>Code</label>
          <input
            id="code"
            placeholder="ABCD2345WXYZ"
            autoCapitalize="characters"
            value={typed}
            onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/\s/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && isValidShareCode(typed) && void load(typed)}
          />
          {error && <div className="banner-warn">{error}</div>}
          <button
            className="btn btn-primary"
            style={{ marginTop: "var(--s3)" }}
            disabled={busy || !isValidShareCode(typed)}
            onClick={() => void load(typed)}
          >
            {busy ? "Looking…" : "Find the split"}
          </button>
        </div>
      </div>
    );
  }

  // --- step two: which one are you? ----------------------------------------------------------
  if (!personId) {
    return (
      <div>
        <div className="topbar">
          <button className="btn btn-ghost" aria-label="Back" onClick={() => setView(null)}>←</button>
          <h1 className="screen-title">{view.split.emoji} {view.split.name}</h1>
        </div>
        <div className="card">
          <h3>Which one are you?</h3>
          <p className="label" style={{ marginTop: 0 }}>
            So your picks land on the right person.
          </p>
          {error && <div className="banner-warn">{error}</div>}
          <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: "var(--s2)" }}>
            {view.split.people.map((p) => {
              // Shown but not selectable: knowing Ana is taken is more useful than discovering it
              // after tapping, and it tells you your friends are already here.
              const taken = view.taken.includes(p.id);
              return (
                <button
                  key={p.id}
                  className={`chip chip-person${taken ? "" : ""}`}
                  disabled={taken || busy}
                  style={{ opacity: taken ? 0.45 : 1 }}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await joinSplit(code, p.id);
                      setPersonId(p.id);
                    } catch (err) {
                      setError(err instanceof ShareError ? err.message : "Couldn't join.");
                      void load(code); // refresh who is taken
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Disc person={p} small />
                  {p.name}
                  {taken && " ✓"}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // --- step three: tick what you had ---------------------------------------------------------
  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "trips" })}>←</button>
        <h1 className="screen-title">{view.split.emoji} {view.split.name}</h1>
      </div>

      <div className="card">
        <h3>What did you have?</h3>
        <p className="label" style={{ marginTop: 0 }}>
          Tap everything that was yours. Anything two of you shared, you both tap.
        </p>
        {items.map((i) => {
          const on = picked.has(i.id);
          return (
            <button
              key={i.id}
              className="receipt-row"
              aria-pressed={on}
              style={{ borderLeftColor: on ? "var(--accent)" : "transparent" }}
              onClick={() =>
                setPicked((was) => {
                  const next = new Set(was);
                  if (next.has(i.id)) next.delete(i.id);
                  else next.add(i.id);
                  return next;
                })
              }
            >
              <span className="row">
                <span style={{ minWidth: 0, fontWeight: on ? 700 : 500 }}>
                  {on ? "☑ " : "☐ "}
                  {i.name}
                </span>
                <span className="money-2">{formatCents(i.lineTotal, currency)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {error && <div className="banner-warn">{error}</div>}

      <Footerbar>
        {/* Their own total, and honestly labelled: they cannot see anybody else's picks, so an
            item somebody else also claims will end up costing them less than this says. Calling it
            "so far" is the difference between a running tally and a wrong bill. */}
        <div className="row" style={{ marginBottom: "var(--s2)" }}>
          <span className="micro">Yours so far</span>
          <span className="money-1">{formatCents(runningTotal, currency)}</span>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
          {saved ? "✓ Sent" : busy ? "Sending…" : "Send my picks"}
        </button>
      </Footerbar>
    </div>
  );
}
