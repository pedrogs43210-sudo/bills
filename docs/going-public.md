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

**The shape chosen:** free scans up to a limit, then **one annual subscription** for unlimited scanning and no ads. Ads on the free tier, as many placements as the app can carry without breaking what it's for.

### The free limit

Set it by holiday, not by month. Your users are not daily users — they use this intensely for one week and then not for three months. A monthly cap punishes exactly the week they need it, which is the week they'd otherwise consider paying.

**Suggested: 10 free scans per month, unused ones not rolling over.** Ten covers a long weekend and most of a week's shopping; a two-week holiday for a big group hits the wall, which is the moment to sell. Splitting bills by hand always stays free and unlimited — only ever charge for the thing that costs you money.

### Price: annual only

**€9.99/year, no monthly option.** Right call for this app: usage is seasonal, so an annual subscription survives the nine months nobody opens it, and a monthly subscriber to a holiday app cancels in week two while you pay a store fee on every transaction.

One thing to add on top: **a 7-day free trial**. Annual-only is a bigger commitment than monthly, and the trial is the standard way to recover the conversion you lose by removing the cheap entry point. It costs you almost nothing — a trial user scanning 20 receipts costs 20 cents.

At €9.99, roughly **200 subscribers clears about €2,000/year** before Apple and Google take their 15–30%. That covers the scanning bill many times over. It is not an income.

### Ads: what each placement is actually worth

Rates for 2026, and the spread between formats is the whole story:

| Format | Global eCPM | Tier 1 (US/UK/CA/AU) |
|---|---|---|
| **Rewarded video** | **$10–22** | $18–45 |
| Interstitial (full screen) | $2.50–5.00 | $5–8 |
| Banner | $0.25–0.90 | $0.50–2.10 |

Two things to read from that table. **A rewarded video is worth 20–40 banner impressions.** And your audience is mostly Portugal and Europe, not the US, so assume the low end of each range — plus a further discount because reported gaming rates run 20–30% higher than utility apps like this one, where people don't expect interruptions.

### The placement plan

Ordered by revenue per unit of annoyance. The first one is worth more than all the others combined.

**1. Rewarded: "watch an ad, get one more scan."** Shown at the moment someone hits scan 11. This is the single best idea available to you, for four reasons: it's the highest-paying format by a wide margin; it's opt-in, so no store risk and no trust damage; it monetises precisely the users who won't subscribe; and it makes the subscription concrete — the alternative to €9.99/year is watching a video every time you photograph a receipt. Cap it (3–5 a day) so it doesn't become a free replacement for subscribing.

**2. App-open ad, once per day.** Fires on the first cold start of the day, skippable. High-volume, standard, and it lands before the user has begun a task, so it interrupts nothing.

**3. Interstitial after the settle-up is shared.** The task is finished, everyone has their number, nothing can be mis-tapped.

**4. Interstitial after a receipt is marked done.** A natural break, and on a shopping trip with three receipts it fires three times. Frequency-cap it to one every couple of minutes so a fast user isn't hit repeatedly.

**5. Interstitial during the scan wait.** You asked for this one and it's defensible: the scan takes 5–20 seconds of genuinely idle attention. Two conditions make it safe rather than damaging: **the ad must never delay the result** — the moment the items are ready, the ad is dismissible and the user is through — and it should be the first placement you cut if you see people abandoning after their first scan. It is the app's one moment of magic, and it's also its most fragile.

**6. Native ad card in the trip list.** Styled as a card among the trips, below the first one. Low friction, always visible, no interaction risk.

**7. Banner on the settings screen.** Free money, no downside, nobody is doing anything delicate there.

**8. Banner on the trip screen.** Above the bottom button bar, on the receipt list. Not an editing surface, so a mis-tap costs a wasted tap and nothing else.

### Two screens that stay ad-free — for correctness, not taste

**The assign screen's chip rows** and **the review screen's price and total fields.** These are the only places in the app where a mis-tap silently changes money: tap the wrong chip and an item is split between the wrong people; nudge the wrong field and a price changes. Nobody sees an error message, the numbers just come out wrong, and the whole app is worth using only because the numbers are right. Ads elsewhere cost attention; ads there cost accuracy.

That still leaves eight placements, including the two most valuable formats.

### What that's worth

At 2,000 monthly-active users during the season, a rough monthly estimate:

| Placement | Impressions/month | Revenue |
|---|---|---|
| Rewarded (20% of users, ~3 each) | ~1,200 | ~€12 |
| App-open (once daily, ~4 sessions each) | ~8,000 | ~€24 |
| Interstitials (share + receipt-done + scan) | ~10,000 | ~€30 |
| Banners + native cards | ~40,000 | ~€20 |
| **Total** | | **~€85/month** |

Treat that as an order of magnitude, not a forecast. The useful conclusion: **at this scale ads roughly cover the scanning bill (~$100/month), and the subscription becomes profit.** That's a better reason to run ads than the revenue itself — it makes the free tier self-funding, so a user who never pays costs you nothing.

Banners are the weakest line in that table: 40,000 impressions for €20, paid for with permanent visual clutter on a money app. Keep the two low-risk banner slots, but if you ever find yourself adding a ninth banner for another €5, that's the point where the app starts looking cheap for nothing.

### Ads are not free to build

Running ads adds real obligations, all of which belong in the work list:

- **A Google-certified consent platform (CMP) is mandatory** for users in the EU, UK, and Switzerland — which is your entire audience. Google's own User Messaging Platform SDK is the usual choice, and TCF v2.3 has been required since February 2026. No CMP means no personalised ads in Europe, which means the low end of every rate above.
- **Apple's tracking prompt** on iOS, and a privacy policy that names the ad SDK and what it collects.
- **Store data-safety declarations** that match actual behaviour — reviewers reject manifests that contradict what the app does.
- **Ad-free must actually be ad-free.** A subscriber who still sees a banner because of a caching bug will ask for a refund and leave a one-star review, and they'll be right.

---

## 3. What has to be built

Ordered by whether the launch is blocked without it.

### Blocks launch

**A backend.** Today the app is a static site with no server at all — this is the single biggest change and the one that ends the app's "your data never leaves your phone" simplicity.

- A scan endpoint holding your API key, that accepts a photo and returns items. This must never become a free API for the whole internet, so: per-device authentication, rate limiting, and a hard monthly ceiling that fails safe. A leaked or abused endpoint is a bill you can't cap after the fact.
- Scan counting per user, to enforce the free limit — the only server-side state you actually need.
- Subscription verification against Apple's and Google's receipts. Never trust the app's claim that someone has paid.
- **Rewarded-ad credit granted server-side**, for the same reason. A client that can award itself extra scans is a client that has given itself a free unlimited plan.
- **Deliberately not on the server: trips, receipts, or who owes whom.** Keep all of that on the phone. It stays simple, it stays private, and it means a server outage doesn't stop anyone splitting a bill by hand.

**Store presence.** An Apple developer account (~$99/year) and a Google Play one (~$25 once). App icons, screenshots, store descriptions, an age rating.

**A privacy policy, and it has to be true.** The moment receipt photos go to your server, you are handling other people's shopping data. What you keep, for how long, and who else sees it (Anthropic processes the photo) must be written down and honest. Both stores require it; so does the law where your users are.

**Wrapping it for the stores.** The app is a website. Publishing it means putting it in a native shell (Capacitor is the usual route) and handling in-app purchases through each store's billing.

### Needed soon after

**Missing screens:**

- **Onboarding** — right now the app opens on an empty trip list with no explanation. A stranger has no idea what to do; your friends did because you told them.
- **Paywall** — what appears at scan 11. Two doors: subscribe, or watch an ad for one more scan. Honest about what's free forever (splitting by hand always is).
- **Subscription management** — status, scans left this month, restore purchases (Apple requires this), cancel.
- **A consent screen** for EU ad tracking, shown before the first ad. Not optional, and it has to come before any ad loads.
- **Something when scanning fails** — currently an error message. A stranger needs a way forward, i.e. "add the items by hand".
- **Help / about** — how the split works, and how to reach you.
- **Account deletion** — required by both stores if you hold any user data.

**Other work:**

- **The discount-convention problem**, already written up in `docs/superpowers/specs/2026-08-06-discount-conventions-notes.md` and needing real receipts from Pingo Doce and Continente. This is a correctness issue that affects the numbers, and it's the one item on this list your existing users would notice.
- **Crash and error reporting.** With strangers using it, you cannot rely on someone telling you it broke.
- **A way to know what scanning is costing you**, per day, before the bill arrives — and what ads are earning, so you can tell whether the free tier pays for itself.
- **Ad placement, one at a time, with retention watched.** Eight placements shipped at once is untestable: if installs stop converting you won't know which one did it. Ship the rewarded ad and the app-open ad first (highest value, lowest risk), then add the rest.
- **Sharing a trip between phones.** The one-phone-holds-the-ledger model works for friends in a kitchen and will be the most-requested change once strangers use it. It is a large change; don't put it in the first release.

---

## 4. A sensible order

**Done:** scanning switched to Haiku 4.5. Still needs measuring against real Pingo Doce and Continente receipts — the code change is verified, the accuracy is not.

**Next:** the design refresh (see `docs/design-brief.md`). v2 is built and waiting on this before it publishes, and it has to happen before store screenshots rather than after.

**Then:** the discount-convention fix. It's correctness, it's already specified, and it affects every user you have today.

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
