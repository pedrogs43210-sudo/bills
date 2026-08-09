import { useState } from "react";
import { useStore } from "../state/StoreProvider";
import { balances, excludedReceipts, exclusionReason, paidTotals, settle, shareTotals, type ExclusionReason } from "../lib/settle";
import { isFullyAssigned } from "../lib/split";
import { formatCents, formatCentsParts } from "../lib/money";
import { Disc } from "../components/chips";
import { settledMessage, summaryText } from "../lib/summary";
import { shareOrCopy } from "../lib/share";
import type { View } from "../App";

export function SettleScreen({ tripId, go }: { tripId: string; go: (v: View) => void }) {
  const { data } = useStore();
  const [feedback, setFeedback] = useState<"" | "copied" | "failed">("");
  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) return null;

  const paid = paidTotals(trip);
  const shares = shareTotals(trip);
  const transfers = settle(balances(trip));
  const person = (id: string) => trip.people.find((p) => p.id === id);
  const name = (id: string) => person(id)?.name ?? "?";
  const hasUnassigned = trip.receipts.some((r) => !isFullyAssigned(r));
  const excluded = excludedReceipts(trip);
  const reasonText: Record<ExclusionReason, string> = {
    "no-payer": "nobody is marked as paying",
    "unknown-payer": "a payer isn't in this trip any more",
    "negative-amount": "an amount is negative",
  };
  const toMove = transfers.reduce((sum, t) => sum + t.amount, 0);

  // One line of what happened, then one line of what it costs and a way out.
  const notes: { head: string; body: string }[] = [];
  if (excluded.length > 0) {
    const listed = excluded
      .slice(0, 3)
      .map((r) => {
        const reason = exclusionReason(r, trip);
        return `${r.storeName || "Receipt"} — ${reason ? reasonText[reason] : "needs fixing"}`;
      })
      .join("; ");
    notes.push({
      head: `${excluded.length} receipt${excluded.length === 1 ? " isn't" : "s aren't"} counted yet. `,
      body:
        `${listed}${excluded.length > 3 ? `; and ${excluded.length - 3} more` : ""}. ` +
        `Open ${excluded.length === 1 ? "it" : "them"} from the trip screen and fix the warning at the bottom ` +
        `(tap ✏️ Edit items first if the receipt opens on the assigning screen).`,
    });
  }
  if (hasUnassigned) {
    notes.push({
      head: "Some items aren't assigned to anyone. ",
      body: "Their cost currently falls on whoever paid — open the receipt and tap who got what.",
    });
  }

  async function share() {
    const outcome = await shareOrCopy(summaryText(trip!));
    if (outcome === "shared") return;
    setFeedback(outcome);
    setTimeout(() => setFeedback(""), 2000);
  }

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "trip", tripId })}>←</button>
        <h1 className="screen-title">Settle up</h1>
      </div>

      {/* Rule 2 — several notes merge into one card with several lines, rather than stacking
          into a wall of warnings above the numbers. */}
      {notes.length > 0 && (
        <div className="note" role="status">
          <span className="note-dot" aria-hidden="true">!</span>
          <div>
            {notes.map((note, idx) => (
              <p key={idx} style={{ margin: idx === 0 ? 0 : "8px 0 0" }}>
                <span className="note-head">{note.head}</span>
                {note.body}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Rule 1 — the hero. Not "what you're owed": one phone holds the ledger for everyone, so
          there is no "you" here to be owed anything. What is true for the whole table is how
          much still has to change hands. */}
      <div className="card" style={{ textAlign: "center" }}>
        {transfers.length === 0 ? (
          <p style={{ margin: 0 }}>{settledMessage(trip)}</p>
        ) : (
          <>
            <span className="hero">
              {formatCentsParts(toMove, trip.currency).map((part, idx) =>
                part.currency ? (
                  <span key={idx} className="sym">{part.text}</span>
                ) : (
                  part.text
                )
              )}
            </span>
            <span className="micro">
              to change hands · {transfers.length} payment{transfers.length === 1 ? "" : "s"}
            </span>
          </>
        )}
      </div>

      <div className="card">
        <h3>To settle</h3>
        {transfers.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Nobody owes anybody.</p>
        ) : (
          transfers.map((t, idx) => (
            <div key={idx} className="row" style={{ padding: "8px 0" }}>
              <span className="row" style={{ gap: "var(--s2)", minWidth: 0 }}>
                {person(t.from) && <Disc person={person(t.from)!} small />}
                <span>{name(t.from)}</span>
                {/* The arrow carries the direction visually; "pays" carries it aloud, or the
                    row would be read as "Ana Pedro €5.00". */}
                <span className="muted" aria-hidden="true">→</span>
                <span className="sr-only">pays</span>
                {person(t.to) && <Disc person={person(t.to)!} small />}
                <span>{name(t.to)}</span>
              </span>
              <span className="money-1">{formatCents(t.amount, trip.currency)}</span>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h3>Each person's share</h3>
        {trip.people.map((p) => (
          <div key={p.id} className="row" style={{ padding: "8px 0" }}>
            <span className="row" style={{ gap: "var(--s2)", minWidth: 0 }}>
              <Disc person={p} />
              <span>{p.name}</span>
            </span>
            <span style={{ textAlign: "right" }}>
              <span className="money-2" style={{ display: "block" }}>{formatCents(shares[p.id] ?? 0, trip.currency)}</span>
              <span className="micro">paid {formatCents(paid[p.id] ?? 0, trip.currency)}</span>
            </span>
          </div>
        ))}
      </div>

      {feedback === "copied" && <div className="banner-good">Copied to clipboard ✓</div>}
      {feedback === "failed" && <div className="banner-warn">Couldn't share on this device.</div>}
      <div className="footerbar">
        <button className="btn btn-primary" onClick={share}>📤 Share summary</button>
      </div>
    </div>
  );
}
