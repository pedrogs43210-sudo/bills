import type { Receipt, Trip } from "../types";
import { balances, countableReceipts, excludedReceipts, paidTotals, settle, shareTotals } from "./settle";
import { receiptShares } from "./split";
import { formatCents } from "./money";
import { SHARE_FOOTER } from "./appLink";

/**
 * What "nobody owes anybody" actually means, which depends on how much the app was able to
 * count. Claiming "All square! 🎉" while receipts sit excluded reads as a final answer when
 * it is really an unfinished one, so the confident version is reserved for a complete trip.
 * Shared by the settle screen and the shared summary text so the two can never disagree.
 */
export function settledMessage(trip: Trip): string {
  if (countableReceipts(trip).length === 0) return "Nothing to settle yet.";
  if (excludedReceipts(trip).length > 0) return "All square so far — some receipts aren't counted yet.";
  return "All square! 🎉";
}

export function summaryText(trip: Trip): string {
  const paid = paidTotals(trip);
  const shares = shareTotals(trip);
  const transfers = settle(balances(trip));
  const name = (id: string) => trip.people.find((p) => p.id === id)?.name ?? "?";
  const counted = countableReceipts(trip);
  const excluded = excludedReceipts(trip);
  const total = counted.reduce((s, r) => s + r.printedTotal, 0);
  const fmt = (c: number) => formatCents(c, trip.currency);

  const lines = [
    // Not "grocery split": restaurants are the commoner case, and a dinner bill announcing itself
    // as groceries in a group chat is a small wrongness everybody notices.
    `${trip.emoji} ${trip.name}`,
    `${counted.length} receipt${counted.length === 1 ? "" : "s"} · ${fmt(total)} total`,
  ];
  // Right after the headline, before the numbers below look final — a friend skimming a
  // group chat reads top to bottom, and must not reach "All square! 🎉" before this caveat.
  if (excluded.length > 0) {
    lines.push(`⚠️ Not final — ${excluded.length} receipt${excluded.length === 1 ? " isn't" : "s aren't"} counted yet.`);
  }
  lines.push("", ...trip.people.map((p) => `${p.name}: ${fmt(shares[p.id] ?? 0)} (paid ${fmt(paid[p.id] ?? 0)})`), "");
  if (transfers.length > 0) {
    lines.push("To settle:");
    for (const t of transfers) lines.push(`💸 ${name(t.from)} → ${name(t.to)} ${fmt(t.amount)}`);
  } else {
    lines.push(settledMessage(trip));
  }
  // Last, below the answer everybody opened the message for. This is the app's only growth
  // mechanism today and it is one line of text — see lib/appLink.ts for why it is not more.
  lines.push("", SHARE_FOOTER);
  return lines.join("\n");
}

export function receiptSummaryText(trip: Trip, receipt: Receipt): string {
  const shares = receiptShares(receipt, trip.people);
  const fmt = (c: number) => formatCents(c, trip.currency);
  const name = (id: string) => trip.people.find((p) => p.id === id)?.name ?? "?";
  const payerLine =
    receipt.payments.length === 1
      ? name(receipt.payments[0].personId)
      : receipt.payments.map((p) => `${name(p.personId)} (${fmt(p.amount)})`).join(" + ");
  // No payments at all means nobody to name — "paid by ?" would just be noise for a
  // friend reading this in chat, so drop the clause rather than print a placeholder.
  const totalLine =
    receipt.payments.length === 0 ? fmt(receipt.printedTotal) : `${fmt(receipt.printedTotal)} paid by ${payerLine}`;
  return [
    `🧾 ${receipt.storeName || "Receipt"} · ${receipt.date}`,
    totalLine,
    "",
    ...trip.people
      .filter((p) => (shares[p.id] ?? 0) !== 0)
      .map((p) => `${p.name}: ${fmt(shares[p.id] ?? 0)}`),
  ].join("\n");
}
