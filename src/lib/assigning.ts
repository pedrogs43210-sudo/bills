import type { Assignment, Item, Person, Receipt } from "../types";

/** Order-insensitive set comparison — assignment order carries no meaning. */
export function sameMembers(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
}

/**
 * Who an assignment gives an item to, as a plain list of people.
 *
 * "Everyone" is expanded against the trip's people rather than treated as a set of its own,
 * because untapping a name has to mean "everyone except them" — that is how the assign screen
 * lets you say it.
 *
 * A split by units answers with nobody. Not because no one has it, but because a name tapped
 * against a unit split replaces the whole thing: showing those people as highlighted would invite
 * a tap that quietly threw their unit counts away.
 */
export function peopleOf(assignment: Assignment, allPeople: Person[]): string[] {
  const a = assignment;
  if (a.kind === "everyone") return allPeople.map((p) => p.id);
  if (a.kind === "people") return a.personIds;
  return [];
}

/** A comparable form of an assignment, so two of them can be told apart regardless of order. */
function key(assignment: Assignment): string {
  const a = assignment;
  if (a.kind === "people") return `people:${[...a.personIds].sort().join("|")}`;
  if (a.kind === "units") {
    const shares = Object.entries(a.shares)
      .filter(([, units]) => units > 0)
      .sort(([x], [y]) => (x < y ? -1 : 1))
      .map(([id, units]) => `${id}=${units}`);
    return `units:${shares.join("|")}`;
  }
  return a.kind;
}

/**
 * The assignment every one of these items shares, or `null` when they are not all the same.
 *
 * This is what decides how the chips look while several items are picked. `null` is a real answer,
 * not a failure: the items disagree, so no name can honestly be shown as highlighted, and the
 * panel says so in words instead of choosing one of the two truths.
 */
export function sharedAssignment(items: Item[]): Assignment | null {
  if (items.length === 0) return null;
  const first = items[0].assignment;
  return items.every((i) => key(i.assignment) === key(first)) ? first : null;
}

/** The people every one of these items is assigned to — empty when they disagree. */
export function sharedPeople(items: Item[], allPeople: Person[]): string[] {
  const shared = sharedAssignment(items);
  return shared === null ? [] : peopleOf(shared, allPeople);
}

/**
 * Whether the line directly under `parent` is a discount that should follow it.
 *
 * A discount line inherits its parent's assignment while it is unassigned or still mirroring
 * whatever the parent had a moment ago, and stops following the moment someone assigns it by
 * hand (spec §7). An informational discount never follows: it is already inside the prices above
 * it, so crediting it to anybody would subtract the same discount twice.
 */
export function followsParent(parent: Item, next: Item | undefined): boolean {
  if (!next || next.lineTotal >= 0 || next.informational) return false;
  return next.assignment.kind === "unassigned" || key(next.assignment) === key(parent.assignment);
}

/**
 * Every item id one assignment tap should write to: the ones tapped, plus any discount line
 * dragged along behind them.
 *
 * Worked out in one pass from the receipt as it is *now*, before anything is written, because
 * whether a discount follows depends on what its parent was assigned a moment ago. Assigning the
 * items one at a time and re-reading in between would compare a discount against an assignment
 * that had already changed, so a selection of ten would behave differently from ten single taps.
 */
export function assignTargets(receipt: Receipt, itemIds: string[]): string[] {
  const wanted = new Set(itemIds);
  const out: string[] = [];
  receipt.items.forEach((item, index) => {
    if (!wanted.has(item.id)) return;
    out.push(item.id);
    const next = receipt.items[index + 1];
    // A picked discount line is written directly, so it must not also be added as a follower.
    if (next && !wanted.has(next.id) && followsParent(item, next)) out.push(next.id);
  });
  return out;
}

/**
 * The assignment a name-tap produces, for one item or for a whole selection.
 *
 * Both directions work on the *shared* set rather than on each item's own, because the point of
 * picking several items is that they end up assigned the same way. When they start out disagreeing
 * there is nothing to add to, so the first name tapped becomes the whole answer — which is exactly
 * what the panel warns about before it happens.
 */
export function togglePersonFor(items: Item[], personId: string, allPeople: Person[]): Assignment {
  const base = sharedPeople(items, allPeople);
  const next = base.includes(personId) ? base.filter((id) => id !== personId) : [...base, personId];
  if (next.length === 0) return { kind: "unassigned" };
  // Deliberately a list of people even when that list is everybody, exactly as tapping the names
  // one at a time on a single item has always behaved. "Everyone" is what the Everyone chip is
  // for, and it means something slightly different: whoever is on the trip at the time.
  return { kind: "people", personIds: next };
}
