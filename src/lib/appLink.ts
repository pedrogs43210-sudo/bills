/**
 * Where to send somebody who reads a shared summary and wants the app.
 *
 * A settle summary goes into a group chat and is read by everyone who was on the split — three or
 * four people who have just watched Billy work out what they owe. That is the best audience the app
 * will ever have, and until now the message gave them no way to get it.
 *
 * This is deliberately the whole of the growth mechanism for the moment. A referral scheme that pays
 * a free scan per install is a defensible idea and a much bigger one: it needs the Play Install
 * Referrer API, an endpoint that grants scans — the exact thing the purchase path was built to avoid
 * — and defences against reinstalling for a fresh reward. None of that is worth building before
 * anybody has tapped a plain link. Measure first.
 */

/**
 * The marker that makes measuring possible.
 *
 * A constant, not an identifier: it says "somebody arrived from a shared summary" and nothing about
 * who shared it or who followed it. Putting an install id in a URL that lands in a group chat would
 * be both a privacy problem and the attribution half of a referral scheme nobody has agreed to
 * build yet.
 */
const SOURCE = "?from=share";

/**
 * Overridable at build time so the phone builds can point at the store listing while the web build
 * keeps pointing at itself. When the Play listing exists, set VITE_APP_LINK in the workflow to
 * `https://play.google.com/store/apps/details?id=...` and nothing here has to change.
 */
const BASE = import.meta.env?.VITE_APP_LINK || "https://pedrogs43210-sudo.github.io/bills/";

export const APP_LINK = `${BASE.replace(/[?#].*$/, "").replace(/\/+$/, "")}/${SOURCE}`;

/**
 * The one line appended to a shared summary.
 *
 * One line, at the end, after the numbers. A friend opens this message to find out what they owe;
 * anything above that answer is in their way. And it is a statement rather than an instruction —
 * "Get Billy!" in a message your friend sent reads as your friend advertising at you, which is a
 * good way to make somebody not share it a second time.
 */
export const SHARE_FOOTER = `Split yours with Billy — ${APP_LINK}`;
