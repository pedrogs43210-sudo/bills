# The paying journey — plan

Where someone subscribes, where they manage it, and where they watch an ad to keep scanning.

**Status:** plan only, nothing built. Two findings below change the shape of it, so read them
before the screens.

---

## Finding 1 — the thing that actually blocks going public

**Today, every user has to create their own Anthropic API key.** Settings walks them through
console.anthropic.com, loading credit, and pasting a key.

No member of the general public will do that. Not one. It is the entire funnel, and it is a
wall.

So the first piece of the paying journey is not the paywall — it is a **scan proxy**: a small
server that holds *one* key (yours) and scans on the user's behalf. That single change is what
makes the app usable by a stranger, and it is also the only place a free-scan limit can be
enforced. Everything else in this document depends on it.

Related: the scan counter cannot live on the phone. `localStorage.clear()` is an infinite
supply of free scans, and "settings → clear site data" is a normal thing people do.

## Finding 2 — the ad plan assumed a native app, and this is a website

**AdMob cannot be used in a PWA**, and there is no supported way to show AdMob banners or
rewarded ads inside a wrapper (TWA/WebView) either — doing it anyway breaks AdMob and AdSense
policy. Sources: [AdMob SDK
group](https://groups.google.com/g/google-admob-ads-sdk/c/PeonG5OcoKY),
[android-browser-helper #535](https://github.com/GoogleChrome/android-browser-helper/issues/535),
[PWA monetisation
discussion](https://slickstack.io/forum/topic/monetizing-pwa-app-options-google-adsense-allowed-or-not).

That kills the best idea in `going-public.md` as long as Bills is a website. **Rewarded video —
"watch an ad, get one more scan" — does not exist on the open web.** The eCPM table in that
document ($10–22 rewarded, $2.50–5 interstitial) is AdMob, i.e. native only. On the web you get
AdSense display ads, which is the $0.25–0.90 banner row and nothing else.

**This is a platform decision, not an ad-placement decision, and it has to be made first.**

| | Path A — stay a website | Path B — wrap for the stores |
|---|---|---|
| Subscription | Stripe, ~2.9% + 30¢ | Apple/Google IAP, 15–30% |
| Ads available | AdSense display only | AdMob, incl. **rewarded video** |
| "Watch an ad for a scan" | **impossible** | yes — the whole point |
| Cost to start | domain + Stripe account | $99/yr Apple, $25 Google |
| Review / compliance | none | app review, ATT, consent SDK, data safety, account deletion |
| Time to first payment | days | weeks |

### Recommendation: A first, then B if the money is real

Ship **paid subscriptions on the web** first, with no ads at all. Reasons:

1. It tests the only question that matters — *will anyone pay for this?* — in days rather than
   weeks, and Stripe keeps 3% where Apple keeps 15–30%.
2. Ads were never the business. The estimate in `going-public.md` was ~€85/month at 2,000
   users, and that was with rewarded video included. Without it, web display ads on a small
   app are a rounding error that costs you the clean look.
3. If subscriptions do work, Path B becomes an evidence-backed decision instead of a bet, and
   the rewarded-ad idea comes back at that point.

The free tier still needs a limit, and without rewarded ads it is simply: **10 scans a month,
then subscribe, and splitting by hand stays free forever.** That is an honest, complete product.

---

## The journey, as a walk-through

### 1. First run — no key, no account, no questions

A stranger opens the app. No sign-up, no permissions, no API key. They create a trip, add
friends, and scan a receipt. The proxy does it. **Onboarding has to say nothing about money.**

Scan counter surfaces quietly from the start: `7 scans left this month` on the trip screen,
where the scan button already is. Never a surprise.

### 2. Hitting the wall — scan 11

Full-screen paywall, and it appears *before* the camera opens, never after (nobody should take
a photo that gets thrown away).

**What it says:**

- `You've used this month's 10 scans.`
- `€9.99 a year — unlimited scanning. 7 days free.`
- `Or keep splitting by hand: still free, still unlimited.` ← the honest way out
- `Restore purchase` (required by Apple later; harmless now)

**What it must not do:** imply the app is now unusable. Adding items by hand is the whole app
minus the camera, and someone who leaves believing otherwise never comes back.

### 3. Paying — Stripe Checkout, then straight back

Tap subscribe → Stripe Checkout (hosted, so no card details ever touch this code) → back to
exactly where they were, with the receipt they were about to scan still waiting.

The trial is 7 days, card required, cancel any time. After Checkout the server writes the
subscription against their account and the client asks the server what it is — never the
reverse.

**This is the step that forces accounts.** A subscription has to survive a new phone, and
`localStorage` does not. Lightest thing that works: **email magic link, only at the moment of
subscribing.** Free users stay anonymous forever.

### 4. Living with it — subscription management

In Settings, a card that answers the four questions people actually have:

- What have I got? `Bills unlimited — renews 14 Aug 2027`
- Am I in the trial? `Trial ends in 4 days, then €9.99/year`
- Where's my receipt? → Stripe customer portal
- How do I stop? → **Cancel**, in plain words, one tap, no retention maze

Free users see the same card showing `Free — 7 scans left this month` and the upgrade button.

### 5. Failure states, which are most of the real work

| What happened | What the user sees |
|---|---|
| Card declined at renewal | A note, not a lockout: `We couldn't renew — update your card. Scanning keeps working for 3 days.` |
| Subscribed but offline | Scanning needs the network anyway; the rest of the app works. Never "unsubscribed" because a check failed. |
| Cancelled | Keeps unlimited until the paid period ends, then quietly returns to 10/month. Nothing is deleted, ever. |
| Server down | `Scanning is down — add the items by hand and we'll be back.` The maths is local, so the app still works. |
| Refund / chargeback | Back to free at the next check. No punishment, no data loss. |

---

## What has to exist on the server

Small, boring, and only three jobs:

1. **Scan proxy.** Holds your Anthropic key, forwards the photo, returns items. Rate-limited
   per install. Never stores the photo.
2. **Entitlement.** Who is subscribed, and how many scans has this install used this month.
   Both server-authoritative: a client that can grant itself scans has given itself a free
   unlimited plan.
3. **Stripe webhooks.** `checkout.session.completed`, `invoice.paid`,
   `customer.subscription.deleted`. The webhook is the source of truth, not the browser
   redirect — people close the tab.

**Deliberately not on the server: trips, receipts, or who owes whom.** That stays on the phone.
It keeps the privacy promise true, keeps the server tiny, and means an outage never stops anyone
splitting a bill.

New screens needed: **onboarding**, **paywall**, **sign-in (magic link)**, **subscription
management**, **scan-failed**, and a **scans-left indicator**. All but the last are in
`screens-to-design.md` already; the ad-consent screen drops out entirely under Path A.

---

## Order of work

1. **Scan proxy + server-side scan counting.** Unblocks strangers using the app at all. No
   payments yet — a generous free allowance while it is proved out.
2. **Scans-left indicator + paywall screen.** Still no payments: the paywall's only door is
   "split by hand". This measures how many people actually hit the wall before you build
   billing.
3. **Stripe subscription + magic-link accounts + management screen.** The money.
4. **Failure states.** The table above. Not optional — this is where trust is won or lost.
5. **Only then**, and only if the subscription is earning: evaluate Path B for rewarded ads.

## Open questions for you

1. **Path A or B?** My recommendation is A now, B later on evidence. It changes everything
   below it.
2. **Where should the server live?** Cloudflare Workers or Vercel are both free at this size
   and both fit a static front end.
3. **Is €9.99/year still right** once you keep ~97% of it instead of ~75%?
4. **Free allowance during step 1** — before billing exists, is 10 a month right, or more
   generous to get people using it?
