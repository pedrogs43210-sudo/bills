# Billy — design exploration brief

I need four explorations of a mobile app's UI. Give me visual options with your reasoning, not code.

## What the app is

**Billy** splits receipts between friends. You photograph a receipt, an AI reads the items, you tap
who each item was for, and it tells you who owes whom. Mostly restaurant bills and supermarket
shops. It is a phone app (Android first) — never a desktop one, so design for a single column of
about 480px maximum and a thumb.

Two things shape everything:

- **There are no accounts.** No sign-up, no login, no profile photo, no friends list. Everything
  lives on the phone.
- **Scanning costs real money** (about 3 cents a photo, paid to an AI provider). Users get three
  free scans, then buy packs of 10/20/60 for €1.99/€2.99/€6.99. So the scan count is both a
  practical number and the app's entire business model.

The tone is warm and slightly playful — sunset colours, rounded shapes, emoji used as real
iconography. Not corporate, not cute-to-the-point-of-childish. It handles people's money, so it has
to feel trustworthy at the same time.

## The visual language it already has

**Fonts:** Fredoka (headings, the brand), Nunito (body).

**Light mode:**
```
bg        #fff8f0   (warm cream)      surface   #ffffff
sunken    #fdf1e4                     line      #efe0cf
ink       #3d2b24   (warm near-black) ink-2     #6e574a    ink-3  #7d6555
accent    #e8492f   (tomato red)      accent-ink #b83e1a   (the text-safe version)
sunset-1  #ff7059 → sunset-2 #ffb347  (the gradient, used on primary buttons and the app icon)
```

**Dark mode:**
```
bg #241a17   surface #2f221d   sunken #3a2a23   line #4a362d   ink #fbeee2   ink-3 #a89383
```

Radii run 9/13/18/20px plus a pill. Spacing is a 4→34px scale.

## Hard constraints — please don't design around these

1. **Both themes must work.** Every option needs to survive light and dark.
2. **Text contrast 4.5:1 minimum.** This has bitten the project repeatedly — white on the sunset
   gradient measured 1.78:1 and had to be replaced with a dark brown.
3. **Tap targets 44px minimum.**
4. **One fixed thing at the bottom per screen.** The bottom bar and any footer of actions are
   mutually exclusive; the layout reserves exactly one element's height. Two stacked bars is the
   thing to avoid.
5. No illustrations that need an artist to maintain. Anything drawn has to be reproducible in SVG
   or emoji.

## The bottom bar as it stands

Three tabs: **Splits | Scan | Profile**.

**Scan is an action, not a destination** — tapping it opens the camera rather than navigating to a
screen, so it is never shown as the selected tab. It currently sits in the middle as a filled
gradient circle with a viewfinder icon and the word "Scan" beneath.

---

# Exploration 1 — the scan screen is dull

**What exists:** tapping Scan gives a screen with a back arrow and the title "Scan a receipt", one
paragraph of explanatory text at the top —

> Photograph the whole receipt, top to bottom. Billy reads the items and makes a split named after
> the shop — nothing is saved until it has.

— then a large expanse of nothing, then two controls pinned to the bottom: a wide primary button
reading "📸 Scan receipt" and a 44px square "🖼" button beside it for choosing an existing photo.

**What's wrong:** all the words are at the top, all the action is at the bottom, and the middle —
the majority of the screen — is empty. It reads like a form, not like the most exciting thing the
app does.

**Explore:** move the centre of gravity to the middle of the screen. This is the app's one moment of
magic (it reads a crumpled receipt in about eight seconds), and it should feel like it. Ideas worth
trying, not a list to satisfy: a receipt-shaped frame or viewfinder as the central object; a sense
of what is about to happen; the three-free-scans state made visible without nagging; something that
makes an empty screen feel intentional rather than unfinished. Show me two or three genuinely
different directions rather than one idea at three sizes.

---

# Exploration 2 — would a floating button look wrong now?

**Background:** there used to be a circular ＋ button floating in the bottom-right for "new split".
It was removed when the tab bar arrived, because two round things at the bottom of the screen
competing for attention seemed worse than one. Creating a split by hand now happens via a small ＋
in the header.

**What to explore:** put it back and show me whether it clashes. A floating action button sitting
above a three-tab bar is a standard Android pattern, so it may well be fine — but the middle tab is
*also* a filled circle, and I suspect the two will fight.

Show: the splits list with a FAB above the bar, versus the current header ＋, in both themes. If it
does clash, show me whether a different FAB treatment (not a filled circle — an outlined one, a
pill with a label, a different colour) resolves it, or whether the header is simply right.

---

# Exploration 3 — the scans-left counter is in an awkward place

**What exists:** underneath the scan buttons sits a small text button reading `3 free scans left`,
or `No scans left — get more` when empty. It turns a warning colour at two or fewer. It is a button
because tapping it opens the pack store — someone watching that number fall is the most interested
person in the app, and a number they cannot act on is a dead end.

**What's wrong:** it looks like an afterthought bolted under the buttons. It is small, grey, and
visually unrelated to the thing it describes, despite being the app's main commercial surface.

**Explore the whole bottom region as one composition** — the scan button, the gallery button and the
counter together, rather than the counter alone. Directions worth trying: the count integrated into
the scan button itself; a progress or "fuel gauge" treatment showing three scans depleting; the
count promoted to somewhere with real presence; a distinct treatment for the zero state that reads
as an offer rather than a failure.

It needs to be honest — never nagging, never dishonestly urgent — while being noticeable enough that
running out is never the first time somebody learns there is a price.

---

# Exploration 4 — the screens without the bar

**What exists:** the tab bar shows only on two screens (the splits list and the profile). Every
other screen — a split's detail, the receipt review, the assign screen, the settle summary — hides
it, because those screens have their own bar of actions fixed to the bottom, and stacking two bars
costs ~56px on the app's busiest views.

**What's wrong, possibly:** it means the tab bar vanishes as soon as you go one level deep, which is
unusual and might feel like the navigation disappeared.

**Explore:** show those deeper screens *with* the tab bar present, and tell me honestly whether it
is worth the space. Specifically the split detail screen, which has the busiest footer (a scan
button, a gallery button, the scans counter, and an "add by hand" button). If both can coexist, show
how. If they can't, show what a compromise looks like — the tab bar collapsing to something shorter,
the footer actions moving into the page, or a persuasive argument that hiding it is correct.

---

## What I'd like back

For each exploration: two or three distinct directions, in both light and dark, with a sentence on
what each is trying to achieve and what it trades away. I would rather have three sharp options with
honest trade-offs than six variations of one idea.

If any of this fights the constraints above, say so — the constraints came from real problems, but
they are not sacred.
