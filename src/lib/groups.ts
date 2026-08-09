/**
 * The assign screen already offers a "👥 Everyone" chip that picks the whole trip. A group by
 * the same name would render an identical-looking chip beside it, so tapping the wrong one would
 * split an item among the group's members with nothing on screen to reveal the mistake. The name
 * is therefore refused when creating a group, and renamed when it arrives in imported data.
 */
export function isReservedGroupName(name: string): boolean {
  return name.trim().toLowerCase() === "everyone";
}

/** Suffix used to keep an imported "Everyone" group, its members intact, without the collision. */
export function unreserveGroupName(name: string): string {
  return isReservedGroupName(name) ? `${name.trim()} (group)` : name.trim();
}
