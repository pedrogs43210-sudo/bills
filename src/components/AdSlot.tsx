/**
 * A place an ad may go, and nothing more.
 *
 * It renders nothing today, on purpose. AdMob is a native SDK — it cannot run in the web build
 * at all — so until the store apps ship there is no ad to show, and a reserved empty box would
 * just be a hole in the layout.
 *
 * When ads do arrive, this is the only file that needs to know: mount the banner here, keyed by
 * `placement`, and every screen that already has a slot gets one. Two rules travel with it.
 *
 * 1. **Nothing that can delay a result.** On the scan screen the items must appear the moment
 *    they are ready, whether or not an ad has finished. The app's one impressive moment must not
 *    become its most annoying one.
 * 2. **Never on a surface that edits money.** The assign screen's chips and the review screen's
 *    price fields are the only places where a mis-tap silently changes what someone owes, with no
 *    error shown. Ads elsewhere cost attention; ads there cost accuracy.
 */
export type AdPlacement = "scan-progress";

export function AdSlot({ placement }: { placement: AdPlacement }) {
  void placement;
  return null;
}
