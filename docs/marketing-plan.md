# Billy — content plan

**Decided:** English only · faceless · 4–5 posts a week · TikTok organic (Pedro makes it) ·
Instagram designed (templates) · the app is **Billy**, not Spleceit.

---

## Produce in bulk now, publish at launch

**Decided:** everything gets made while Google verifies the account, and nothing is posted until
Billy is downloadable.

That is the right call and it removes a problem rather than delaying one. You get exactly one first
impression per person, and spending it by sending somebody to a store listing that does not exist is
spending it for nothing. Posting from a standing start with a back catalogue also means the first
three weeks are not simultaneously the first three weeks of learning the format.

Two consequences worth holding on to:

- **The landing page now exists.** ~~`splitwithbilly.com` serves the app itself, and a stranger who
  lands there and taps Scan gets an error.~~ Fixed: the site root is a landing page, the app moved
  to `/app/`, and invite links carrying `?join=` are forwarded so nothing already sent breaks. The
  page has no waitlist form — the call to action is an email link, because storing addresses means
  storing personal data and the privacy policy is not ready to say so.
- **Posts can say "download".** The whole "hold the punchline" constraint disappears, so the app can
  be the payoff rather than a signature.

**Target before publishing:** a bank of about 20 posts. Enough for a month at this cadence.

## Positioning

The market research is unambiguous about where the gap is, and your brief ignored it: competitors
target **item-level scanning** as the named weakness of the incumbents, and position against
**Splitwise's subscription** with one-off pricing. Billy has both.

That does not belong on TikTok — nobody scrolls for a feature comparison. It belongs on the website,
the store listing, and about one Instagram post in ten.

**Campaign line:** *Billy remembers.*

Two words, faintly ominous, and it makes Billy a character rather than a utility — the friend who
quietly keeps score. It also works on every format without modification: after an argument, under a
receipt, at the end of a list.

**The explanatory line:** *Billy knows who had what.* — for the store listing and the website, where
somebody needs to understand what the thing does before they are charmed by it. Not on social.

**Voice:** deadpan. Billy is the friend who is quietly, annoyingly correct about money. "The point is
€8" is exactly right. Billy never sells, never uses an exclamation mark, and is never the loudest
thing in the post.

## Five formats, because 4–5 a week means repeatable

Faceless, all of them. Each should take under 30 minutes once the template exists.

| # | Format | Home | What it is |
|---|---|---|---|
| 1 | **The argument** | TikTok | A chat unfolding in real time — typing indicators, one message at a time, trending sound. Ends on a Billy line. |
| 2 | **Receipt hell** | Instagram | A photographed receipt, minimal copy overlaid. This is the visual signature — nobody else in the category owns a look. |
| 3 | **The list** | Instagram | "Things you should never split evenly." Carousel. Tag-your-friends fuel. |
| 4 | **Group chat vs Billy** | Both | Two columns: 37 messages against 1 scan. Demonstrates the product without a demo. |
| 5 | **The proof** | Both | A real ugly receipt, actually scanned, actually parsed. Lowest frequency, highest conversion. |

**A week:** 2 × argument, 1 × receipt hell, 1 × list, 1 × proof or group-chat.

## Carousels work on both platforms

I had this wrong first time and said the carousel concepts were an Instagram plan mislabelled.
TikTok's photo carousels perform well, so the same posts serve both — which makes the whole plan
cheaper than it looked, because one design run covers two accounts.

**What that costs: every carousel has to work at 9:16 as well as 4:5.** TikTok is taller than
Instagram, so a layout composed for 4:5 gets padded or cropped. Design at 9:16 and let 4:5 be the
crop — the safe area is the middle, and nothing important goes near the top or bottom edge where
TikTok's own chrome sits.

The one thing that genuinely differs: **TikTok wants sound on everything, including carousels.** A
silent photo carousel gets less reach than the same one with a trending sound under it. That costs
nothing and is easy to forget.

## Do not mock up real WhatsApp or iMessage UI

Trademark risk, and platforms sometimes suppress it. Build a Billy-flavoured chat look instead —
cream bubbles, the app's own palette. It becomes recognisable, which a screenshot of somebody else's
app never can.

## The thing missing from all sixteen concepts

**The invite link is content and distribution in the same object.** You scan a receipt, send a link,
and your friends tick what they had on their own phones.

Nothing else in the plan is a thing people can *do to their friends*. "Send this to the group chat
and let them argue with the receipt instead of each other" is a better hook than any meme format,
because the payoff is a demonstration. Build a format around it the week the app launches.

## Copy bank

Ready to use. Deadpan, no exclamation marks.

**Drama enders**
- The point is €8.
- Billy knows who had what.
- Stop doing maths in the group chat.
- You had the burger.
- Billy remembers.

**Receipt overlays**
- This receipt started an argument.
- €184.72 · 5 people · 0 agreement.
- Somebody here had the wine.
- Four people. One receipt. Seventeen opinions.
- Nobody remembers ordering this.

**List headers**
- Things you should never split evenly
- The seven people you meet after dinner
- Things your friends will absolutely argue about
- Reasons "let's just split it" is a lie

**Positioning lines** (website and store, not TikTok)
- Every item. Every person. Every cent.
- Scan the receipt. Tap who had what. Done.
- No subscription. Scans, when you need them.
- Split it properly.

## What is not decided yet

- **Handles.** `@splitwithbilly` matches the domain. Check availability on both platforms before
  anything is designed with a handle baked into it.
- **Email capture.** The landing page asks people to write to `hello@splitwithbilly.com`, which is
  honest and costs nothing but converts far worse than a form. A real waitlist needs an endpoint on
  the Worker, a D1 table, and a privacy policy that mentions both. Worth doing before the first
  post, not before the page ships.
- **Posting starts when?** My advice: build a bank of 15 posts before publishing anything, so the
  first three weeks are not also the first three weeks of learning the format.
