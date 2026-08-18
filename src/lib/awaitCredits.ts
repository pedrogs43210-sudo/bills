import type { ScanQuota } from "./scan";

/**
 * Waiting for scans somebody has already paid for.
 *
 * There is a gap between Google taking the money and the scans existing. The phone finishes its
 * purchase, but the credits are only added when RevenueCat's webhook reaches the Worker — usually a
 * second or two, occasionally much longer if a delivery is retried. In that window the app knows a
 * purchase succeeded and the server does not yet agree.
 *
 * It is the most frightening state in the app, because it is the only one where somebody's money has
 * left their account and the screen shows them nothing. So it gets an explicit wait rather than a
 * refresh they have to think of themselves.
 *
 * Pure but for the clock and the fetcher, both injected, so every branch is testable without a
 * store account, a network, or a real wait.
 */

/**
 * How long to keep asking before saying so.
 *
 * Long enough to cover a retried webhook, short enough that nobody is watching a spinner wondering
 * whether the app has died. Past this the wait does not fail — it stops *hiding*, and tells the
 * person their scans are coming and where to write if they do not.
 */
export const CREDIT_WAIT_MS = 20_000;
const POLL_EVERY_MS = 1_500;

export type CreditWait =
  /** The scans arrived. `credits` is the new balance. */
  | { kind: "arrived"; credits: number }
  /** Still not there. Not a failure — the purchase stands and the webhook will land. */
  | { kind: "slow" };

/**
 * Poll until the credit balance rises above what it was before the purchase.
 *
 * Compares against a baseline rather than an expected total, deliberately: the app does not know how
 * many scans the pack is worth. Only the server does, because the number comes from its own
 * catalogue and never from the client — the same rule that keeps the purchase path honest. Any
 * increase means the webhook has landed.
 */
export async function awaitCredits(
  before: number,
  fetchQuota: () => Promise<ScanQuota | null>,
  opts: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<CreditWait> {
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = now();

  // Asked at least once before any waiting: the webhook often beats the phone back to this screen,
  // and a mandatory first sleep would show a spinner to somebody whose scans already exist.
  for (;;) {
    const quota = await fetchQuota().catch(() => null);
    if (quota && quota.credits > before) return { kind: "arrived", credits: quota.credits };
    if (now() - started >= CREDIT_WAIT_MS) return { kind: "slow" };
    await sleep(POLL_EVERY_MS);
  }
}
