import type { Receipt, Trip } from "../types";
import { balances, paidTotals, settle, shareTotals } from "./settle";
import { receiptShares } from "./split";
import { formatCents } from "./money";
import { primaryPayerId } from "./payments";

export function summaryText(trip: Trip): string {
  const paid = paidTotals(trip);
  const shares = shareTotals(trip);
  const transfers = settle(balances(trip));
  const name = (id: string) => trip.people.find((p) => p.id === id)?.name ?? "?";
  const total = trip.receipts.reduce((s, r) => s + r.printedTotal, 0);
  const fmt = (c: number) => formatCents(c, trip.currency);

  const lines = [
    `${trip.emoji} ${trip.name} — grocery split`,
    `${trip.receipts.length} receipt${trip.receipts.length === 1 ? "" : "s"} · ${fmt(total)} total`,
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
  return lines.join("\n");
}

export function receiptSummaryText(trip: Trip, receipt: Receipt): string {
  const shares = receiptShares(receipt, trip.people);
  const fmt = (c: number) => formatCents(c, trip.currency);
  const payer = trip.people.find((p) => p.id === primaryPayerId(receipt))?.name ?? "?";
  return [
    `🧾 ${receipt.storeName || "Receipt"} · ${receipt.date}`,
    `${fmt(receipt.printedTotal)} paid by ${payer}`,
    "",
    ...trip.people
      .filter((p) => (shares[p.id] ?? 0) !== 0)
      .map((p) => `${p.name}: ${fmt(shares[p.id] ?? 0)}`),
  ].join("\n");
}
