# Splits, Scan, Profile — a bottom tab bar for Billy

**Date:** 2026-08-14
**Status:** design, awaiting review

## The problem

Billy has one top-level destination. Everything else is a stack beneath it:

```
Trips
 └ Trip
    └ Receipt → Review → Assign
    └ Settle
Settings, Help          reached from a ⚙️ in the header
```

Two things follow from that shape, and both are worth fixing.

**The app's whole purpose is buried.** To scan a receipt you must open the app, find or create a
trip, open it, find the receipts card, and tap a control inside it. Five deliberate acts before the
camera opens. For a holiday that is fine — you set the trip up once and add to it for a week. For a
restaurant bill, which is most of what Billy will actually be pointed at, it is absurd: "create a
trip" is a strange thing to do while standing at a table holding the bill.

**"Trip" is the wrong word.** It fits a weekend in Lisbon and misfits a Tuesday dinner, which is the
more common case. The word is doing quiet harm — it tells people what the app is for, and it is
telling them something narrower than the truth.

## What this is not

Deliberately ruled out during design, recorded here so they are not re-proposed:

- **No People tab.** A list of names is thin, and the thing that would make it substantial is a
  ledger.
- **No cross-trip balances.** "Maria owes you €34 across three splits" requires `Person` to become
  global *and* a way to mark a debt as paid, which does not exist today. An app that confidently
  shows the wrong amount of money owed is worse than one that shows nothing.
- **No data model change and no migration.** Nothing in `types.ts` or in stored JSON changes. This
  is the constraint that keeps the whole change small and reversible.

## The shape

Three tabs, fixed to the bottom:

| Tab | What it is |
|---|---|
| **Splits** | The list that is the trip list today. The app's home. |
| **Scan** | Not a screen — an action. Opens the camera immediately. |
| **Profile** | Scans remaining, settings, help, privacy. |

### Scan is an action wearing a tab's clothes

This is the one genuinely unusual decision and it should be understood before it is built.

Tapping **Scan** does not navigate to a Scan screen. It opens the photo control at once, runs the
existing scan, and lands the user on the review screen for the receipt that came back. The tab
therefore **never shows a selected state** — there is no screen for it to be selected on.

This is the Instagram-`+` pattern, and it is right here for the same reason it is right there: the
middle slot is the most reachable point on a phone held in one hand, and it should hold the thing
the app is for rather than a list you look at on the way to it.

### The tab bar is only on the roots

It appears on **Splits** and **Profile**. It is hidden on every stack screen — split detail, review,
assign, settle, paywall, help — because those screens already have a `Footerbar` fixed at the
bottom, and two stacked bars is worse than either.

This preserves the existing invariant in `useReservedBottom`: **one publisher of `--footer-h` per
screen.** On a root the publisher is the tab bar. On a stack screen it is the `Footerbar`. There is
never a moment when both are mounted, so nothing has to be added up.

The cost, stated plainly: from inside a split you cannot reach Scan in one tap — you go back first.
Accepted, because the split screen has its own scan control already, which is the closer one anyway.

## Quick scan

The flow, end to end:

1. Tap **Scan**. The condensed camera/gallery control opens.
2. A photo is chosen. It is downscaled and sent, exactly as `TripScreen` does today.
3. `ScanProgressScreen` while it runs.
4. On success, Billy **creates a split** and opens the review screen for the new receipt.
5. Review → assign → done, unchanged from today.

### Naming the split it creates

From the receipt, so the user never types anything:

- `storeName` when the scan returned one — "Tasca do Bairro"
- otherwise the date, readably — "14 Aug split"

The emoji is 🧾, added to the existing `EMOJIS` list. The name is editable afterwards like any
other. Currency is the app default, as it is for a hand-made split.

### Nothing is created until a scan succeeds

The split is created **after** the scan returns, never before. A failed or cancelled scan must leave
no trace: an app that litters its own home screen with empty "Tasca do Bairro" entries every time the
network drops is an app people delete. This is the single most important behavioural rule in this
document.

### When it goes wrong

| What happened | What the user sees |
|---|---|
| Cancelled the camera | Back where they were. Nothing created. |
| Out of scans (`402`) | The paywall. Nothing created. |
| Proxy busy (`503`) | `ScanFailedScreen`, busy wording. Nothing created. |
| Unreadable, refused, network | `ScanFailedScreen` with retry. Nothing created. |

The paywall currently requires a trip: `{ screen: "paywall"; tripId: string }`. Quick scan has no
trip to name, so **`tripId` becomes optional** on that view. The paywall's "back to split" button
appears only when there is one to go back to.

### People, without a roster

On the assign screen for a quick-scanned split, offer **the people from the most recent split other
than this one** as tappable chips above the "add someone" field. The exclusion matters: a
quick-scanned split is by definition the newest one, and suggesting its own (empty) list of people
would offer nothing at all.

Derived at render time from `data.trips` — no global `Person`, no roster screen, nothing new stored.
If it is the same three flatmates, that is three taps. If it is new people, typing works exactly as
it does now. This is the whole of the recurring-group benefit, at none of the ledger's cost.

## Profile

What is behind the ⚙️ today, plus the thing that should never have been buried:

- **Scans remaining**, at the top, with "Get more scans" → paywall. A number that visibly counts
  down is a better argument for a pack than any popup, and it is currently invisible.
- Settings: default currency, export, import, theme, and the API key field when the proxy is off.
- Help & about, including the install reference.
- A link to the privacy policy.

`SettingsScreen` becomes this tab. `HelpScreen` stays a separate stack screen reached from it.

## Renaming trips to splits

**The words users read change. The code does not.**

Everything user-visible becomes "split": the list heading, "New trip" → "New split", "Trip name" →
"Split name", the empty state, the settle screen's "back to trip", and the copy in Help.

The `Trip` type, the `trips` field, `createTrip`, every `tripId` prop and the stored JSON all keep
their present names. Renaming them would change the shape of saved data and require a migration, for
a benefit no user can see. Storage keys keep their `bills.` prefix regardless — renaming those
destroys every existing user's splits.

The cost is that a future reader meets "Trip" in code and "Split" on screen. A comment at the top of
`types.ts` explains why, which is cheaper than a migration.

## Navigation and the back button

- `history.ts`'s `isHome` becomes true for the splits list rather than the trips list — the same
  screen under a new label, so this is a rename inside that function.
- Android back on **Profile** goes to **Splits**, not out of the app.
- Android back on **Splits** exits, as today.
- Android back during a quick scan cancels it. Nothing is created.
- Switching tabs does not stack: going Splits → Profile → Splits leaves an empty back stack, so one
  press of back from the splits list still exits. `navigate()` already unwinds to a view already in
  the stack, so this needs no new logic — only a test that pins it.

## What gets built

| File | Change |
|---|---|
| `src/components/TabBar.tsx` | New. Three tabs, publishes `--footer-h`, hides itself off the roots. |
| `src/App.tsx` | `View`'s `settings` becomes `profile`; `paywall.tripId` becomes optional; renders the tab bar on roots. |
| `src/lib/quickScan.ts` | New. The scan-then-create sequence, pure where it can be, so the "nothing on failure" rule is testable without a camera. |
| `src/screens/TripListScreen.tsx` | Copy to "splits". `Fab` retires; `+` moves to the header beside the mark. ⚙️ leaves — it is a tab now. |
| `src/screens/SettingsScreen.tsx` | Becomes Profile: scans block on top, existing settings below. |
| `src/lib/history.ts` | `isHome` covers the splits root. |
| `src/screens/AssignScreen.tsx` | Recent-people chips. |
| Copy across screens | "trip" → "split" wherever a user can read it. |

`Fab.tsx` is left in place — `useReservedBottom` and the fab styles are still the right tool if a
round button is wanted again — but nothing renders it after this change.

## Testing

Beyond keeping the existing 521 green:

- **Quick scan creates exactly one split on success**, and **zero** on each of: cancel, out of
  scans, busy, network failure, unreadable. This is the rule that matters most, so it gets a case per
  failure mode rather than one representative case.
- The split is named from `storeName`, and falls back to the date when the scan returned none.
- Out of scans reaches the paywall with no trip, and the paywall renders without a "back to split"
  button in that state.
- The tab bar renders on the two roots and on none of the stack screens.
- Exactly one element publishes `--footer-h` on every screen.
- Back from Profile lands on Splits; back from Splits exits; tab switching leaves no stack.
- Recent-people chips show the last split's people, and nothing at all when there is no previous
  split.
- A copy test asserting no rendered text contains "trip" as a whole word, case-insensitively. It
  matches on rendered output rather than source, so `tripId` and the `Trip` type do not trip it, and
  on whole words so nothing legitimate is caught. The rename is spread across enough files that a
  human will miss one.

## Open question for review

**Should the split detail screen keep the tab bar?** This design says no, because that screen has a
`Footerbar`. The alternative is to show both, which costs about 56px of a phone screen on the app's
busiest view. Worth a look on a real device before it is built.
