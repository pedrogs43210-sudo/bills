/**
 * The rules behind scanning a receipt with no split to put it in.
 *
 * Pure, and in their own file, because the alternative is discovering what they do by standing in a
 * restaurant with a phone. Nothing here touches React, storage, or the network.
 */

import type { Trip } from "../types";

/** Longer than this and a name stops being a label and starts being a paragraph. */
const MAX_NAME = 40;

/** Month abbreviations, stable across all devices regardless of ICU version. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * What to call a split made from a receipt.
 *
 * The shop's name, because that is what the person will recognise in a list a week later. A date
 * when the scan could not read one — never "Untitled", which is an apology rather than a fact.
 */
export function splitNameFor(storeName: string, date: string | null): string {
  const shop = storeName.trim();
  if (shop) {
    const chars = Array.from(shop);
    if (chars.length > MAX_NAME) {
      // Slice by code point, not UTF-16 unit, so astral characters like 🧾 don't half-render.
      return `${chars.slice(0, MAX_NAME - 1).join("").trimEnd()}…`;
    }
    return shop;
  }

  if (!date) return "New split";

  const when = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(when.getTime())) return "New split";
  const day = when.getUTCDate();
  const month = MONTHS[when.getUTCMonth()];
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
 * name, or the first chip offered would be a second "You". A You-only split is skipped until an
 * earlier trip with actual friends is found, so that quick-scanning every week without adding
 * people does not erase the memory of who you split with last month.
 */
export function recentPeopleNames(trips: Trip[], currentTripId: string): string[] {
  const here = new Set(
    (trips.find((t) => t.id === currentTripId)?.people ?? []).map((p) => p.name.trim().toLowerCase())
  );

  // Find the most recent trip (by createdAt, then by array order) that yields a non-empty result.
  const candidates = trips
    .map((trip, index) => ({ trip, index }))
    .filter(({ trip }) => trip.id !== currentTripId && trip.people.length > 0)
    .sort((a, b) => {
      // ISO string comparison is deterministic and needs no locale machinery.
      const cmp = (b.trip.createdAt ?? "").localeCompare(a.trip.createdAt ?? "");
      return cmp !== 0 ? cmp : b.index - a.index;
    });

  for (const { trip } of candidates) {
    const suggested = trip.people
      .map((p) => p.name.trim())
      .filter((name) => name && !here.has(name.toLowerCase()));

    if (suggested.length > 0) {
      // Dedupe on the same normalised key the `here` set uses, keeping the first spelling.
      const seen = new Set<string>();
      const deduped: string[] = [];
      for (const name of suggested) {
        const normalized = name.toLowerCase();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          deduped.push(name);
        }
      }
      return deduped;
    }
  }

  return [];
}
