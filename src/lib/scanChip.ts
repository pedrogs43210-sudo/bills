import type { ScanQuota } from "./scan";

/**
 * What the little chip on the scan button says, if anything.
 *
 * The count used to be a separate grey line underneath the buttons, which read as an afterthought
 * bolted onto the thing it describes. Putting it on the button means you read "this action, and you
 * have three of them" in one glance.
 *
 * Pure, because deciding when to remind somebody they are running out is a judgement about tone as
 * much as arithmetic, and it should be arguable in a test rather than discovered by a user.
 */

/**
 * Below this many BOUGHT scans, the chip comes back.
 *
 * Somebody who has just bought twenty does not need a counter on every screen — they solved this
 * problem and being reminded of it is nagging. Five is enough runway to buy again without hurrying.
 * The free trial is different: all three of those are worth explaining, so they always show.
 */
export const PAID_CHIP_BELOW = 5;

export type ScanChip = {
  text: string;
  /** `last` is the single one remaining — drawn inverted, for weight without a warning colour. */
  tone: "quiet" | "last";
};

export function scanChip(quota: ScanQuota | null): ScanChip | null {
  // No proxy configured means no counter exists; a subscriber has no cap. Inventing a number for
  // either would be a promise the app cannot keep.
  if (quota === null || quota.left === null) return null;
  // Zero is not a chip. At zero the whole button changes job — see PhotoPicker.
  if (quota.left <= 0) return null;

  // "free" only while they all are. Calling a scan somebody paid for free is a small lie, and it is
  // the kind that makes a person wonder what else is loose.
  const onTrial = quota.credits === 0;
  if (!onTrial && quota.left > PAID_CHIP_BELOW) return null;

  return {
    text: onTrial ? `${quota.left} free` : `${quota.left} left`,
    tone: quota.left === 1 ? "last" : "quiet",
  };
}
