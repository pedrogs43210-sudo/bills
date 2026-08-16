import type { Item } from "../types";

/**
 * Turning what everybody said they had into who pays for what.
 *
 * Pure, and tested harder than anything else in this feature, because it decides what people owe
 * each other. A bug here is not a visual glitch; it is somebody paying for a steak they did not eat.
 *
 * The rule that makes this simple: **claims are additive.** Two people claiming one item share it,
 * which is the correct answer rather than a conflict to resolve, so this is a union and never a
 * negotiation. Nothing here locks, retries, or decides who was first.
 */

/** One person's answer: the items they say they had. */
export type Claim = { personId: string; itemIds: string[] };

export function mergeClaims(items: Item[], claims: Claim[]): Item[] {
  // Built in claim order, so the personIds on an item come out in a stable order and applying the
  // same claims twice produces an identical result.
  const byItem = new Map<string, string[]>();
  for (const claim of claims ?? []) {
    if (!claim?.personId) continue;
    for (const itemId of claim.itemIds ?? []) {
      const people = byItem.get(itemId);
      if (people) {
        if (!people.includes(claim.personId)) people.push(claim.personId);
      } else {
        byItem.set(itemId, [claim.personId]);
      }
    }
  }

  return items.map((item) => {
    const people = byItem.get(item.id);
    // Nobody claimed it, so nobody has answered about it. Leave whatever the host decided —
    // inventing "everyone" here would put bread on the bill of somebody who never said so, and it
    // would look exactly like an answer rather than like a question still open.
    if (!people || people.length === 0) return item;
    return { ...item, assignment: { kind: "people", personIds: [...people] } };
  });
}
