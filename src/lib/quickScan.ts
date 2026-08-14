/**
 * The rules behind scanning a receipt with no split to put it in.
 *
 * Pure, and in their own file, because the alternative is discovering what they do by standing in a
 * restaurant with a phone. Nothing here touches React, storage, or the network.
 */

import type { Trip } from "../types";

/** Longer than this and a name stops being a label and starts being a paragraph. */
const MAX_NAME = 40;

/**
 * What to call a split made from a receipt.
 *
 * The shop's name, because that is what the person will recognise in a list a week later. A date
 * when the scan could not read one — never "Untitled", which is an apology rather than a fact.
 */
export function splitNameFor(storeName: string | null | undefined, date: string): string {
  const shop = (storeName ?? "").trim();
  if (shop) return shop.length > MAX_NAME ? `${shop.slice(0, MAX_NAME - 1).trimEnd()}…` : shop;

  const when = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(when.getTime())) return "New split";
  const day = when.getUTCDate();
  const month = when.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${day} ${month} split`;
}

/**
 * Who to offer as one-tap chips on a fresh split.
 *
 * The people from the last split that had any — which is the whole of the "same flatmates every
 * week" benefit, without a global person record, a roster screen, or anything new in storage.
 *
 * Two exclusions, both of which matter. The split being filled in is skipped, because it is by
 * definition the newest and would otherwise suggest itself. Anyone already on it is skipped by
 * name, or the first chip offered would be a second "You".
 */
export function recentPeopleNames(trips: Trip[], currentTripId: string): string[] {
  const here = new Set(
    (trips.find((t) => t.id === currentTripId)?.people ?? []).map((p) => p.name.trim().toLowerCase())
  );

  const previous = trips
    .filter((t) => t.id !== currentTripId && t.people.length > 0)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];

  return (previous?.people ?? [])
    .map((p) => p.name.trim())
    .filter((name) => name && !here.has(name.toLowerCase()));
}
