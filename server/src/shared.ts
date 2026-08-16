/**
 * Reading the requests that make a split shared.
 *
 * Pure, like `webhook.ts` and for the same reason: every branch should be arguable in a test rather
 * than discovered by four people standing around a table waiting to find out what they owe.
 */

/** Bigger than any real dinner, small enough that filling the database is not free. */
export const MAX_PAYLOAD_BYTES = 128_000;

/** More item ids than any receipt has lines. A cap, not a limit anyone will meet. */
const MAX_CLAIMED_ITEMS = 1000;

export type PublishResult = { ok: true; payload: string } | { ok: false; why: string };

export function readPublish(body: unknown): PublishResult {
  if (typeof body !== "object" || body === null) return { ok: false, why: "not an object" };
  const split = (body as { split?: unknown }).split;
  if (typeof split !== "object" || split === null || Array.isArray(split)) {
    return { ok: false, why: "no split" };
  }
  const payload = JSON.stringify(split);
  // Measured in bytes rather than characters: the cap exists to bound what is stored, and an emoji
  // is four bytes of storage however it counts as a string length.
  if (new TextEncoder().encode(payload).length > MAX_PAYLOAD_BYTES) {
    return { ok: false, why: "too large" };
  }
  return { ok: true, payload };
}

/**
 * What one phone says its owner had.
 *
 * Unknown ids are dropped rather than refused: the host may have deleted a misread line after the
 * link went out, and rejecting the whole answer because one id is stale would lose the other nine.
 */
export function readClaims(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null) return null;
  const ids = (body as { itemIds?: unknown }).itemIds;
  if (!Array.isArray(ids)) return null;
  return ids
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .slice(0, MAX_CLAIMED_ITEMS);
}
