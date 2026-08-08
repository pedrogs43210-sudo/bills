# Bills — every screen the app needs

Companion to `docs/design-brief.md` (which covers the six screens that exist and the look to
keep). This one is the full map, including everything not yet built, so the design can be one
coherent system rather than six good screens and nine mismatched ones.

**Read `design-brief.md` first.** It has the palette, the fonts, the feeling to keep, and the
specific things to fix.

---

## How to use this list

Each screen is marked:

- **Settled** — the behaviour is decided. Design it properly.
- **Rough** — worth a sketch, but the logic behind it may still move. Don't invest detail.
- **Don't design yet** — the decisions underneath it aren't made. A finished design would
  quietly make them for us.

The app is a **phone-first web app**, max width 480px, single column, one thumb, often in a
supermarket or a holiday kitchen. Nothing below assumes a desktop layout.

---

## Part 1 — Screens that exist (redesign)

These are described in detail in `design-brief.md` §"The screens". Summary only here:

| Screen | Purpose | Note |
|---|---|---|
| Trip list | Pick or create a trip | First thing a stranger sees — currently no explanation at all |
| Trip | People, groups, receipts, actions | Densest navigation point |
| Check the receipt | Fix what the scanner read | **The ugliest screen. Biggest win available.** |
| Assign | Tap who each item was for | The heart of the app — must stay fast and tappable |
| Settle up | Who owes whom | The payoff. Should feel like relief |
| Settings | Key, currency, backup | Plain is fine |

---

## Part 2 — Screens that must exist before launch

### 1. Onboarding / first run — **Settled**

**Why:** the app currently opens on an empty trip list with no explanation. Friends knew what to
do because they were told. A stranger downloading this has no idea.

**Job:** explain the one idea — *photograph a receipt, tap who each thing was for, see who owes
whom* — and get out of the way fast.

Needs: 2–3 screens maximum, skippable, never shown again. It should be possible to reach a
usable empty trip in under 15 seconds. No account, no email, no permissions requested up front.

**Constraint:** the app works entirely offline and holds no account. Don't design a sign-up.

---

### 2. Paywall — **Settled**

**Why:** free scans run out at 10 per month.

**Job:** two doors, honestly presented.

- **Subscribe** — €9.99/year, with a 7-day free trial. Annual only, no monthly.
- **Watch an ad for one more scan** — the free way through, capped at 3–5 a day.

Must also say, plainly, **what stays free forever**: splitting bills by hand, unlimited trips,
unlimited people, all the maths. Only the camera costs money. A paywall that implies the whole
app is locked will lose users who would have stayed.

Needs: the price, the trial, both doors, "what's free", restore-purchases link, and a way out
that isn't a dead end.

**Constraint:** this screen appears at the worst possible moment — the user is standing in a
kitchen with a receipt in their hand. It has to be readable in five seconds.

---

### 3. Scan failed — **Settled** (partly exists)

**Why:** today a failure shows an error message. A stranger needs a way forward, not an apology.

**Job:** one clear next action — **add the items by hand** — plus retry, and the specific reason
when it's useful (no key, offline, photo unreadable, out of free scans).

Needs: four states, worded so each suggests a different action. This is currently a plain
banner and deserves better; it's the moment the app either loses someone or keeps them.

---

### 4. Ad consent (EU) — **Settled, and legally required**

**Why:** a Google-certified consent platform is mandatory before any ad loads for users in the
EU, UK, or Switzerland — which is the entire audience.

**Job:** the standard consent choice, in plain language, before the first ad.

Needs: accept / reject / manage detail. Mostly rendered by Google's own SDK, so the design work
is making it not feel like a legal ambush — an intro line in the app's voice before the SDK
takes over.

**Constraint:** it must come *before* any ad, and rejecting must visibly still work.

---

### 5. Subscription management — **Settled**

**Why:** Apple requires a restore-purchases path. Users need to see what they have.

**Job:** current status, **scans left this month**, renewal date, restore purchases, cancel.

The scans-left number is the useful part and is worth surfacing outside this screen too — a
quiet counter somewhere the user already looks, so running out is never a surprise.

---

### 6. Help / about — **Settled**

**Why:** both stores expect it, and people will ask how the split works.

**Job:** how the maths works (especially the rounding and "the payer absorbs the difference"),
how discounts are handled, what happens to receipt photos, how to reach you, version number.

Needs: plain prose, no marketing. This is also where the honest answer to "why is my share one
cent different from my friend's" lives.

---

### 7. Delete my data — **Settled**

**Why:** required by both stores once any user data is held.

**Job:** delete everything, with a clear statement of what goes and what can't be recovered,
and an export offered first.

**Constraint:** must not be reachable by accident, and must not look like a scary red trap.

---

## Part 3 — Screens needed soon after launch

### 8. Discount convention notice — **Settled** (being built now)

Not a screen but a band on **Check the receipt**. One plain sentence stating an assumption the
app has made from the receipt's own arithmetic, with a toggle that recomputes instantly:

> *These prices already include the discounts, so I left the 3 discount lines out.*

Three variants: discounts counted, discounts left out, and *"these numbers don't add up either
way"* — the last one changes nothing on its own and only warns.

**Design need:** informational lines must look **present but inactive** in the item list —
clearly on the receipt, clearly not part of the sum, and clearly not waiting to be assigned.
This is the single most delicate visual problem in the app right now.

---

### 9. Scan progress — **Settled**

**Why:** a scan takes 5–20 seconds and is the app's one moment of magic.

**Job:** make the wait feel deliberate rather than broken. Currently a busy state on a button.

**Constraint:** an interstitial ad may appear here later. The ad must never delay the result,
so the design needs a state where the ad is dismissible the instant the items are ready.

---

### 10. Empty and loading states — **Settled**

Not a screen, but the weakest part of the app and worth designing as a set:

- No trips yet (first run)
- Trip with no people yet — the scan button is disabled and it isn't obvious why
- Trip with people but no receipts
- Receipt with no items read
- Nothing to settle yet

Each should say what to do next, in the app's voice, not just show a blank card.

---

## Part 4 — Don't design yet

- **Sharing a trip between phones.** The most-requested change once strangers use it, and a
  large one: it needs a backend, identity, and conflict rules. Designing the screen first would
  commit us to a model before the hard questions are answered.
- **Anything account-shaped** — profiles, login, friends lists. The app deliberately has no
  accounts today, and that's a feature.
- **Receipt history / analytics** — "what did we spend on beer this holiday" is a tempting
  feature with no decided shape.

---

## What I'd most like from the designer

1. **A component set, not fifteen screens.** Cards, chips, buttons, banners, list rows, empty
   states, one number style for money. The app is already built from about eight repeating
   parts; if those are right, every screen improves at once.
2. **Fix "Check the receipt".** It's where people spend the most time and it's the worst-looking
   screen. Anything that makes a dense editable list feel calm is the highest-value work here.
3. **A way to show "present but not counted"** (see §8) that doesn't look like an error.
4. **One warning style with three weights** — this app has a lot to say about numbers not adding
   up, and right now every warning shouts equally loudly.
5. **Keep it fun.** Sunny, warm, holiday. It should not end up looking like a banking app. The
   money must be legible and trustworthy; everything around it can be cheerful.
