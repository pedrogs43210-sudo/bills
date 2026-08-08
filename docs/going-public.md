# Taking Bills public — costs, money, and what's missing

Written 2026-08-08, based on decisions made this session: **scanning free for users (you absorb the cost)**, **app stores as the main plan**, **free scan limit then a subscription, with ads on the free tier**.

Prices below were checked on 2026-08-08 and move often — re-check before committing.

---

## 1. Scanning: the honest version

The app currently asks each user to paste their own Anthropic API key. That works among friends and cannot go public: nobody downloads an app from a store and then signs up for a developer API account. So the key moves to a small server of yours, and **every scan becomes a cost you pay.**

### There is no free AI API for this

Free tiers exist, but they are for building and testing, not for shipping:

- **Google Gemini free tier** — 5–15 requests per minute and 100–1,000 requests per *day* depending on model, and prompts on the free tier may be used to improve Google's products. That last part alone rules it out: those prompts are photographs of your users' shopping.
- Every provider's free tier has a daily cap that a few hundred users would blow through before lunch.

So the real choice is between **paying a small amount per scan** and **doing the reading on the phone for free**.

### Option A — a cheap AI model (recommended)

The app currently uses Claude Opus, which is the most expensive option and far more model than reading a receipt needs. **Claude Haiku 4.5 is the right tool** at $1 per million input tokens and $5 per million output.

Rough cost of one receipt scan (a downscaled photo, ~30 items returned as structured data):

| Model | Per scan | Per 1,000 scans |
|---|---|---|
| **Haiku 4.5** | **~$0.01** | **~$10** |
| Sonnet 5 | ~$0.03 | ~$30 |
| Opus 5 / 4.8 (what it uses now) | ~$0.05 | ~$50 |

Switching the scanner from Opus to Haiku cuts the cost roughly **five-fold** for a task that is "read this text and put it in a list". Worth measuring accuracy on real Pingo Doce and Continente receipts before committing — if Haiku misreads more, Sonnet is still half the cost of today.

**Two discounts, and only one of them helps you:**

- **Prompt caching** (~90% off repeated input) does not apply: the receipt photo is different every time, and the reusable part — the instructions — is smaller than the 4,096-token minimum Haiku needs before caching kicks in.
- **Batch processing** is 50% off, but it's asynchronous: minutes to hours, not seconds. Useless for someone standing in the kitchen wanting the split now. It would only fit a "scan these overnight" feature, which nobody asked for.

Plan on roughly **1 cent per scan, no discounts**.

### Option B — free, on the phone

- **On-device text recognition** (Apple's built-in Vision, Google's ML Kit) is genuinely free, unlimited, works offline, and never sends the photo anywhere. Since you're going to app stores, this is available to you in a way it isn't on the web.
- **Tesseract.js** is the browser equivalent, also free.

The catch is accuracy, and it is a big catch for your exact use case: reported accuracy on faded thermal supermarket receipts sits around **60% of characters correct**, and these tools read *text* without understanding *structure* — they'll return a jumble of words and numbers, not "Batatas fritas — 2.49". Turning that into item lines is a parsing problem you would own, per supermarket chain, forever.

### Option C — cheap and free, together

The pattern the industry has settled on: **run the free on-device reader first, and only send it to the AI when the result looks unreliable.** Clean, flat, well-lit receipts cost you nothing; crumpled ones cost a cent. If even half of scans stay on-device, your bill halves.

This is more code than Option A and worth doing **only once you know what scanning actually costs you per month**. Don't build it first.

### Recommendation

**Ship Option A on Haiku, measure, then consider C.** Even pessimistically — 2,000 users averaging 5 scans a month — that's 10,000 scans, about **$100/month**. That number is the foundation of the pricing below, so measure it early against real receipts rather than trusting my estimate.

### Not worth it for you

- **Dedicated OCR APIs** (Mistral OCR at $4 per 1,000 pages, AWS Textract, etc.) cost *more* than Haiku and return text and layout rather than the clean item list you need. You'd still need a model to interpret them.

---

## 2. Money

**The shape you chose:** free scans up to a limit, then a subscription for unlimited; ads on free, no ads for subscribers.

### On the free limit

Set it by holiday, not by month. Your users are not daily users — they use this intensely for one week and then not for three months. A monthly cap punishes exactly the week they need it, which is the week they'd otherwise consider paying.

**Suggested: 10 free scans per month, unused ones not rolling over.** Ten covers a long weekend and most of a week's shopping; a two-week holiday for a big group hits the wall, which is the moment to offer the subscription. Splitting bills by hand always stays free and unlimited — you should only ever charge for the thing that costs you money.

### On price

At ~1 cent a scan, a heavy user scanning 40 receipts a month costs you 40 cents. Almost anything you charge is profitable; the question is what people will actually pay for a holiday app.

- **€2.49/month** or **€9.99/year** — the annual one priced so it's obviously the better deal, because your users' usage is seasonal and an annual subscription survives the nine months they don't open the app.
- Lead with annual. A monthly subscriber on a holiday app cancels in week two, and you pay a store fee on every transaction either way.

### On ads — my recommendation differs from your instinct

You mentioned banners or an ad during the scan. **During the scan is the wrong moment and banners are the wrong format.**

The scan is the app's one moment of magic — you photograph a crumpled receipt and it turns into a tidy list. Interrupting it teaches people the app is slow and cheap. And a persistent banner on a screen full of money is where it looks least trustworthy; this app's whole value is that the numbers are right, and a flashing ad beside them undermines that for very little revenue.

**Better: a single full-screen ad after the settle-up is shared** — the task is complete, the user got what they came for, and nothing is at risk of being mis-tapped. One per session, never during scanning or assigning.

Be realistic about the number, though: a small app with a few thousand seasonal users earns **single-digit euros per month** from ads. Ads are not the business. If the choice is a cleaner app or a few euros, take the cleaner app — the subscription is where the money is, and ads mainly exist to make the ad-free upgrade feel worth buying.

### The uncomfortable maths

At €9.99/year you need roughly **200 subscribers to clear €2,000/year** before store fees (Apple and Google take 15–30%). That covers your scanning bill many times over but is not an income. Price it to be sustainable, not to get rich, and it can pay for itself indefinitely.

---

## 3. What has to be built

Ordered by whether the launch is blocked without it.

### Blocks launch

**A backend.** Today the app is a static site with no server at all — this is the single biggest change and the one that ends the app's "your data never leaves your phone" simplicity.

- A scan endpoint holding your API key, that accepts a photo and returns items. This must never become a free API for the whole internet, so: per-device authentication, rate limiting, and a hard monthly ceiling that fails safe. A leaked or abused endpoint is a bill you can't cap after the fact.
- Scan counting per user, to enforce the free limit — the only server-side state you actually need.
- Subscription verification against Apple's and Google's receipts. Never trust the app's claim that someone has paid.
- **Deliberately not on the server: trips, receipts, or who owes whom.** Keep all of that on the phone. It stays simple, it stays private, and it means a server outage doesn't stop anyone splitting a bill by hand.

**Store presence.** An Apple developer account (~$99/year) and a Google Play one (~$25 once). App icons, screenshots, store descriptions, an age rating.

**A privacy policy, and it has to be true.** The moment receipt photos go to your server, you are handling other people's shopping data. What you keep, for how long, and who else sees it (Anthropic processes the photo) must be written down and honest. Both stores require it; so does the law where your users are.

**Wrapping it for the stores.** The app is a website. Publishing it means putting it in a native shell (Capacitor is the usual route) and handling in-app purchases through each store's billing.

### Needed soon after

**Missing screens:**

- **Onboarding** — right now the app opens on an empty trip list with no explanation. A stranger has no idea what to do; your friends did because you told them.
- **Paywall** — what appears at scan 11. Needs to be honest about what's free forever.
- **Subscription management** — status, restore purchases (Apple requires this), cancel.
- **Something when scanning fails** — currently an error message. A stranger needs a way forward, i.e. "add the items by hand".
- **Help / about** — how the split works, and how to reach you.
- **Account deletion** — required by both stores if you hold any user data.

**Other work:**

- **The discount-convention problem**, already written up in `docs/superpowers/specs/2026-08-06-discount-conventions-notes.md` and needing real receipts from Pingo Doce and Continente. This is a correctness issue that affects the numbers, and it's the one item on this list your existing users would notice.
- **Crash and error reporting.** With strangers using it, you cannot rely on someone telling you it broke.
- **A way to know what scanning is costing you**, per day, before the bill arrives.
- **Sharing a trip between phones.** The one-phone-holds-the-ledger model works for friends in a kitchen and will be the most-requested change once strangers use it. It is a large change; don't put it in the first release.

---

## 4. A sensible order

**Now:** switch scanning to Haiku and measure accuracy on real receipts. Cheapest possible change, five-fold cost reduction, and it tells you whether Option A is viable at all.

**Then:** the discount-convention fix. It's correctness, it's already specified, and it affects every user you have today.

**Then:** the design refresh (see `docs/design-brief.md`). Do it before the store screenshots, not after.

**Then:** the backend and the paywall — the big one. Nothing about the store submission can start until scanning works without the user's own key.

**Then:** onboarding, the missing screens, the native wrapper, and submission.

**Later:** on-device scanning to cut costs, and multi-phone trips.

One thing worth saying plainly: everything before "the backend" makes the app better for the people already using it. Everything from the backend onward is a different kind of project — servers, store reviews, other people's money and data. It's worth being sure you want to run a product before starting that part, because the first four items are worth doing either way.

---

Sources for the prices and limits above:
- [Gemini API free tier rate limits](https://www.aifreeapi.com/en/posts/gemini-api-free-tier-rate-limits)
- [Mistral OCR pricing](https://mistral.ai/news/ocr-4/)
- [ML Kit on-device text recognition](https://developers.google.com/ml-kit/vision/text-recognition/v2/android)
- [Tesseract accuracy on receipts](https://www.koncile.ai/en/ressources/is-tesseract-still-the-best-open-source-ocr)
- [Receipt OCR API comparison](https://yomio.app/en/blog/ocr-receipt-scanner-api)
