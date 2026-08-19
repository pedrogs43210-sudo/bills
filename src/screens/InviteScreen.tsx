import { useCallback, useEffect, useState } from "react";
import { useStore } from "../state/StoreProvider";
import { Footerbar } from "../components/Footerbar";
import { shareOrCopy } from "../lib/share";
import { mergeClaims, type Claim } from "../lib/mergeClaims";
import {
  hostShareFor,
  inviteLink,
  publishSplit,
  readClaims,
  revokeSplit,
  ShareError,
  type HostShare,
} from "../lib/sharedSplit";
import type { View } from "../App";

/**
 * Inviting the other people at the table to say what they had.
 *
 * The host publishes the split, sends a link, and waits. Answers do not rewrite anything on their
 * own — the host taps Apply. Merging silently would mean tracking every item the host had corrected
 * by hand since the last answer arrived, so that a friend replying late did not undo it; one button
 * removes that problem entirely, and lets the host see what changed.
 */
export function InviteScreen({ tripId, go }: { tripId: string; go: (v: View) => void }) {
  const { data, dispatch } = useStore();
  const trip = data.trips.find((t) => t.id === tripId);

  const [share, setShare] = useState<HostShare | null>(() => hostShareFor(tripId));
  const [claims, setClaims] = useState<Claim[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);

  const poll = useCallback(async (code: string) => {
    try {
      setClaims(await readClaims(code));
    } catch {
      // A failed poll is not worth a message. The next one is four seconds away, and the screen
      // already shows everything it knew a moment ago.
    }
  }, []);

  /* Every four seconds while this screen is open, and never in the background: somebody watching
     for their friends to answer is looking at the screen, and a phone in a pocket polling all
     evening is a battery complaint. */
  useEffect(() => {
    if (!share) return;
    void poll(share.code);
    const timer = setInterval(() => void poll(share.code), 4000);
    return () => clearInterval(timer);
  }, [share, poll]);

  if (!trip) return null;

  async function publish() {
    setBusy(true);
    setError("");
    try {
      setShare(await publishSplit(trip!));
    } catch (err) {
      setError(err instanceof ShareError ? err.message : "That didn't work. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  /** Apply everyone's picks to every receipt. Idempotent — the claims are the source, not a diff. */
  function apply() {
    for (const receipt of trip!.receipts) {
      const items = mergeClaims(receipt.items, claims);
      // Only write receipts that actually changed, so applying twice does not churn the store or
      // mark untouched receipts as edited.
      if (items.some((item, i) => item.assignment !== receipt.items[i].assignment)) {
        dispatch({ type: "updateReceipt", tripId, receipt: { ...receipt, items } });
      }
    }
    setApplied(true);
  }

  const answered = claims.filter((c) => c.itemIds.length > 0);
  const nameOf = (personId: string) => trip.people.find((p) => p.id === personId)?.name ?? "Someone";

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "trip", tripId })}>←</button>
        <h1 className="screen-title">Invite</h1>
      </div>

      {!share ? (
        <div className="card">
          <h3>Let everyone say what they had</h3>
          <p className="label" style={{ marginTop: 0 }}>
            Send a link and your friends tick their own items, so you are not guessing who had the
            fish. They need Billy installed — the link takes them to it.
          </p>
          <p className="muted">
            Everyone who joins keeps their own copy of the split, for good. The link itself stops
            working after a week, and you can take it back before then.
          </p>
          {error && <div className="banner-warn">{error}</div>}
          <button className="btn btn-primary" disabled={busy} onClick={() => void publish()}>
            {busy ? "Sharing…" : "🔗 Create the link"}
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <h3>Send this to your friends</h3>
            <p className="label" style={{ marginTop: 0, overflowWrap: "anywhere", fontFamily: "ui-monospace, monospace" }}>
              {inviteLink(share.code)}
            </p>
            <button
              className="btn btn-primary"
              onClick={() =>
                void shareOrCopy(
                  `${trip.emoji} ${trip.name}\nTick what you had — ${inviteLink(share.code)}`
                )
              }
            >
              📤 Share the link
            </button>
            {/* The code on its own, because a link that has been through three apps sometimes
                arrives broken and reading twelve characters aloud is the fallback that always
                works. It is why the alphabet has no O, I or 1 in it. */}
            <p className="micro" style={{ marginTop: "var(--s4)" }}>Or read out this code</p>
            <p className="money-1" style={{ textAlign: "left", letterSpacing: "0.06em" }}>{share.code}</p>
          </div>

          <div className="card">
            <h3>Who has answered</h3>
            {answered.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Nobody yet. Their picks appear here as they tap them.
              </p>
            ) : (
              answered.map((c) => (
                <div key={c.personId} className="row" style={{ padding: "var(--s2) 0" }}>
                  <span>{nameOf(c.personId)}</span>
                  <span className="label">
                    {c.itemIds.length} item{c.itemIds.length === 1 ? "" : "s"}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h3>Take it back</h3>
            <p className="label" style={{ marginTop: 0 }}>
              Deletes the shared copy immediately. The link stops working for everyone.
            </p>
            <button
              className="btn"
              onClick={() => {
                void revokeSplit(tripId, share).catch(() => {});
                setShare(null);
                setClaims([]);
              }}
            >
              🗑 Revoke the link
            </button>
          </div>
        </>
      )}

      {share && (
        <Footerbar>
          <button
            className="btn btn-primary"
            disabled={answered.length === 0}
            onClick={apply}
          >
            {applied ? "✓ Applied" : `Apply ${answered.length || ""} ${answered.length === 1 ? "answer" : "answers"}`.trim()}
          </button>
        </Footerbar>
      )}
    </div>
  );
}
