# The paying journey — plan

Where someone subscribes, where they manage it, and where they watch an ad to keep scanning.

**Status:** plan only, nothing built.

## Decisions taken

| | |
|---|---|
| Platform | **Native apps for the App Store and Play**, wrapping the existing web app |
| Server | **Cloudflare Workers + D1** |
| Free tier | **3 scans, once** — a trial, not a monthly allowance. See below |
| Price | **Scan packs** — €2.99 for 20 as the main product. A subscription only if repeat buyers appear |
| Accounts | **None.** See below — the stores make them unnecessary |
| Ads | Available again on native, incl. rewarded video. Not in the first release |

### Why native changes two things for the better

**Rewarded ads are back.** AdMob is native-SDK only and cannot be used in a PWA or a WebView
wrapper ([AdMob SDK
group](https://groups.google.com/g/google-admob-ads-sdk/c/PeonG5OcoKY),
[android-browser-helper #535](https://github.com/GoogleChrome/android-browser-helper/issues/535)).
Going native restores "watch an ad, get one more scan" — the strongest revenue idea in
`going-public.md`, worth 20–40 banner impressions per view.

**Nobody has to sign up.** Store IAP is tied to the buyer's Apple or Google account, so a
subscription survives a new phone via *Restore purchases* with no account system of your own.
That was the only reason the earlier draft wanted email magic links.

Two useful consequences: there is no personal data to hold, and **Apple's account-deletion
requirement does not apply**, because it only applies to apps that create accounts. That screen
drops off the launch list.

### Why packs rather than a subscription

**€2.99 for 20 scans.** It nets €2.07 after VAT and the store's 15%, and costs €0.57 to serve —
3.6× cost, and it *cannot* lose money, because revenue and cost move together. An unlimited annual
subscription at €4.99 nets €3.45 and goes underwater at 120 scans: it hands the heavy user your
card.

Packs also match how the app is used. Splitting is episodic — a holiday, a dinner — so a recurring
charge asks for the renewal decision at the exact moment the value is zero. And they are simpler to
build: no renewals, no grace periods, no lapsed states, no restore edge cases.

Add an annual "unlimited" (fair-use capped) **later, if repeat buyers appear.** That is evidence
rather than a guess.

If a subscription ever does ship, the price is presented as a store *introductory offer*, never as
a permanent "was €9.99, now €4.99": under the EU Omnibus rules (Portugal: DL 109-G/2021) a
never-charged reference price is a prohibited misleading claim, and a "limited time" offer that
never ends is the dark pattern regulators fine.

---

## Finding that still blocks everything

**Today every user must create their own Anthropic API key** — console.anthropic.com, load
credit, paste it into Settings. No member of the general public will do this. It is the whole
funnel and it is a wall.

So the first build is the **scan proxy**: one key (yours) on a server, scanning on the user's
behalf. It is also the only place a free-scan limit can exist, because `localStorage.clear()` is
otherwise an infinite supply of free scans and clearing site data is a normal thing people do.

---

## Identity without accounts

Three layers, none of which ask the user anything:

1. **Anonymous install ID**, generated on first launch, kept in device storage. Enough to count a
   one-off trial of three scans.
2. **App Attest (iOS) / Play Integrity (Android)**, so the server can tell a genuine install of
   your app from a script pointed at the proxy. This is the abuse that would actually cost
   money — someone burning your Anthropic credit — and it is worth stopping properly.
3. **Store receipts** for subscribers, verified server-side: Apple's App Store Server API
   (signed JWS transactions) and Google's Play Developer API `subscriptions.v2`. The client
   never asserts its own entitlement.

A reinstall resets someone's free counter. **Accept it.** A scan on `claude-sonnet-5` costs roughly
**2–3 cents** — about 6,000 input tokens (a 2576px photo is up to 4,784 image tokens, plus the
prompt) and around 1,000 out, at $2/$10 per million on the introductory rate and $3/$15 after it
ends on **31 August 2026**. So a farmed reset is worth 10–15 cents, which is far cheaper than the
conversions a sign-up wall would cost. Budget for the scan cost rising by half in September.

---

## What an account would buy, and what it would cost

Asked directly: does anyone need to sign up in order to pay for an annual subscription? **No.** The
subscription is tied to the buyer's Apple ID or Google account — they signed in to the phone, and
that is the account. The store receipt *is* the credential: the app sends it to the Worker, the
Worker verifies it against Apple's or Google's server API, and `subscriptions.install_id` records
the result. Restore purchases moves it to a new phone; refunds and lapses arrive as server
notifications keyed to the same `original_transaction_id`. Family sharing comes free if enabled.

| | **No account** (this plan) | **Account / Google sign-in** |
|---|---|---|
| Onboarding | Scan a receipt in three taps; "no account, no sign-up" is on screen | A sign-up wall in front of the whole app |
| New phone, same platform | Restore purchases | Works |
| **Android → iPhone** | **Subscription lost** — the entitlement lives in Play, and Apple cannot receive it | Works. This is the one real thing an account buys |
| Free-scan farming | A reinstall resets the counter (see above) | Quota follows the person |
| Losing the phone | Trips are gone — they are local by design | Could restore them, but that is a *backup* feature, not a payment one |
| Legal exposure | Almost no personal data; nothing to service a deletion request with | Emails mean a lawful basis, DSR handling, breach notification, a processor named in the policy |
| Extra store rules | None | Apple requires in-app account deletion, and offering Google sign-in obliges an equivalent privacy-preserving option (Sign in with Apple). Google Play requires deletion too |
| Build cost | Nothing | Auth, sessions, reset-or-OAuth, account deletion, a users table |

**Decision: no accounts for payment.** The Android→iPhone switch is the only genuine loss, and the
honest fix is a sentence in the paywall — *your subscription lives with your Google Play account* —
plus a manual restore by email if anyone ever asks. Everything else on the "account" side of that
table is either a different feature or a liability.

**If accounts ever become worth it, the shape is an anonymous one.** The Worker already mints an
install id; the addition is an optional "add an email so you can move Billy to a new phone" —
no password, no sign-up screen, nothing blocking the front door. That buys the cross-platform
restore *and* trip backup. The right moment for it is when people start asking to keep their trips,
not when they start paying.

---

## The journey, screen by screen

### 1. First run — nothing asked for

No sign-up, no permissions, no API key. Create a trip, add friends, scan. Onboarding says
nothing about money.

The counter is visible from the first scan, on the trip screen where the scan button already is:
`2 free scans left`. Running out is never a surprise.

### 2. The wall — scan 4

Full screen, and it appears **before the camera opens**, never after. Nobody should photograph a
receipt only to have it thrown away.

- `That's your 3 free scans used.`
- `20 scans, €2.99.` *(when packs ship)*
- `Watch a short ad → one more scan now` *(when rewarded ads ship; capped 3–5/day)*
- `Or keep splitting by hand — still free, still unlimited.`
- `Restore purchase`

**It must not imply the app is now useless.** Adding items by hand is the entire app minus the
camera, and anyone who leaves believing otherwise never returns.

### 3. Paying — the store's own sheet

Tap subscribe → the native purchase sheet → back to exactly where they were, with the receipt
they were about to scan still waiting. No card details ever touch this code.

The server verifies the transaction and records the entitlement; the client then asks the server
what it has. Never the reverse.

### 4. Living with it — in Settings

A card answering the four questions people actually have:

- What have I got? `Bills unlimited — renews 14 Aug 2027`
- Am I still in the intro year? `First year at €4.99, then €9.99`
- Where's my receipt? → the store's subscription page
- How do I stop? → **Cancel** in plain words, one tap out to the store, no retention maze

Free users see the same card: `Free — 4 scans left this month`, plus the upgrade button.

### 5. Failure states — most of the real work

| What happened | What the user sees |
|---|---|
| Billing retry at renewal | A note, not a lockout: `We couldn't renew — check your payment method. Scanning keeps working for 3 days.` |
| Subscribed but offline | Scanning needs the network anyway; everything else works. Never "unsubscribed" because a check failed. |
| Cancelled | Unlimited until the paid period ends, then quietly back to 5/month. Nothing is ever deleted. |
| Server down | `Scanning is down — add the items by hand and we'll be back.` The maths is local, so the app still works. |
| Refund / chargeback | Back to free at the next check. No punishment, no data loss. |
| Grace period / billing retry (store-driven) | Treated as subscribed until the store says otherwise. |

---

## The server

One Worker, three jobs, and deliberately boring:

1. **Scan proxy** — holds the Anthropic key, forwards the photo, returns items. Attestation
   required, rate-limited per install, **never stores the photo**.
2. **Entitlement** — is this install subscribed, and how many scans has it used this month.
   Server-authoritative: a client that can grant itself scans has given itself a free unlimited
   plan.
3. **Store notifications** — Apple App Store Server Notifications v2 and Google Real-time
   Developer Notifications. These are the source of truth for renewals, cancellations and
   refunds, not anything the app reports.

D1 holds two small tables: installs (id, attestation state, month, scans used) and subscriptions
(store, original transaction id, status, current period end).

**Deliberately not on the server: trips, receipts, or who owes whom.** That stays on the phone.
It keeps the privacy promise true, keeps the server tiny, and means an outage never stops anyone
splitting a bill by hand.

---

## Order of work

1. **Scan proxy + attestation + server-side counting.** The app becomes usable by a stranger.
   Generous free allowance while it settles; no payments yet.
2. **Capacitor wrapper, both stores, review passed.** Nothing about billing can be tested until
   the app is actually in a store build.
3. **Scans-left indicator + paywall, with "split by hand" as its only door.** Measures how many
   people hit the wall before billing exists.
4. **IAP: the introductory offer, receipt verification, store notifications, Settings card.**
5. **Failure states.** Where trust is won or lost.
6. **Then ads**, rewarded first — highest value, lowest risk — with the EU consent SDK, which is
   mandatory before any ad loads.

## Still open

- **Store accounts** — Apple $99/yr and Google $25 one-off need to exist before step 2, in your
  name with your details. I can't create those for you.
- **A privacy policy that is true**, naming Anthropic as processing receipt photos. Both stores
  require it, as does the law where your users are.
- **Sonnet 5's accuracy and the discount tagging are still unvalidated** against real Pingo Doce
  and Continente receipts. That is worth settling before strangers rely on it.
