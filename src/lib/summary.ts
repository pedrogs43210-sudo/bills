import type { Receipt, Trip } from "../types";
import { balances, countableReceipts, excludedReceipts, paidTotals, settle, shareTotals } from "./settle";
import { receiptShares } from "./split";
import { formatCents } from "./money";

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
    `${trip.emoji} ${trip.name} — grocery split`,
    `${counted.length} receipt${counted.length === 1 ? "" : "s"} · ${fmt(total)} total`,
    "",
    ...trip.people.map((p) => `${p.name}: ${fmt(shares[p.id] ?? 0)} (paid ${fmt(paid[p.id] ?? 0)})`),
    "",
  ];
  if (transfers.length > 0) {
    lines.push("To settle:");
    for (const t of transfers) lines.push(`💸 ${name(t.from)} → ${name(t.to)} ${fmt(t.amount)}`);
  } else {
    lines.push("All square! 🎉");
  }
  if (excluded.length > 0) {
    lines.push(
      `⚠️ ${excluded.length} receipt${excluded.length === 1 ? "" : "s"} not counted yet — open ${excluded.length === 1 ? "it" : "them"} in Bills to fix who paid.`
    );
  }
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
  return [
    `🧾 ${receipt.storeName || "Receipt"} · ${receipt.date}`,
    `${fmt(receipt.printedTotal)} paid by ${payerLine || "?"}`,
    "",
    ...trip.people
      .filter((p) => (shares[p.id] ?? 0) !== 0)
      .map((p) => `${p.name}: ${fmt(shares[p.id] ?? 0)}`),
  ].join("\n");
}
