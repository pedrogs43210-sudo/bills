# Bills — design system

Extracted from the Claude Design project `Bills.dc.html`
(`claude.ai/design/p/cbf3fda9-90a4-42a7-af0d-19cc5a9eee51`), turn 1b "The system — tokens and
the four rules", as refined through turn 5. This file is the implementation contract, so nobody
has to re-read a 190 KB canvas to know what a token is worth.

## Colour — light

| Token | Value | Use |
|---|---|---|
| `--bg` | `#FFF8F0` | page |
| `--surface` | `#FFFFFF` | cards |
| `--sunken` | `#FDF1E4` | inset areas, inputs |
| `--line` | `#EFE0CF` | hairlines |
| `--line-strong` | `#E2CDB6` | card borders |
| `--ink` | `#3D2B24` | primary text |
| `--ink-2` | `#6E574A` | secondary text |
| `--ink-3` | `#7D6555` | tertiary / muted |
| `--accent` | `#E8492F` | brand red, links, active |
| `--on-accent` | `#FFFFFF` | what sits **on** a filled accent surface |
| `--good` | `#2E9E6B` | done |
| `--good-bg` | `#E4F2EA` | done tint |
| `--note` | `#B7791F` | warning ink (amber, **never red**) |
| `--note-bg` | `#FDF0DC` | warning tint |
| `--note-line` | `#F0CE92` | warning border |
| `--accent-ink` | `#B83E1A` | accent-coloured **words** (see below) |
| `--warn` | `#B3261E` | deleting — the only irreversible thing in the app |
| `--note-strong` | `#94600F` | the filled note dot, which carries a white glyph |
| `--good-strong` | `#1F7A52` | the filled good dot |

## Colour — dark ("evening on the same holiday")

`--bg` `#241A17` · `--surface` `#2F221D` · `--sunken` `#3A2A23` · `--line` `#4A362D` ·
`--line-strong` `#5C4437` · `--ink` `#FBEEE2` · `--ink-2` `#C4A895` · `--ink-3` `#7D6555` ·
`--accent` `#FF8F73` · `--on-accent` `#241A17` · `--good` `#4FCB92` ·
`--good-bg` `#1E3B2C` · `--note` `#F0C070` · `--note-bg` `#3D2C16` · `--note-line` `#6B4E1E` ·
`--warn` `#FF9B8D` · `--accent-ink`, `--note-strong`, `--good-strong` = the accents themselves

`--ink-3` is `#A89383` here, **not** the light-mode `#7D6555`. That value was carried over by
mistake and measured **2.83:1** on the dark surfaces, which put every `.muted` and `.micro` line —
the badges, the "each" prices, the field labels — below the 4.5:1 floor. `#A89383` measures 4.67:1
on the sunken fill, the worst case, and stays a clear step dimmer than `--ink-2`.

## Legibility — measured, not assumed

Every one of these was found by measuring contrast in a real browser at 375×812, in both themes.
The palette above is unchanged: what changed is *which* token gets used for words.

| Where | Was | Measured | Now |
|---|---|---|---|
| `.btn-primary` label on the sunset gradient | `#FFF` | **2.72:1** red end, **1.78:1** amber end | *superseded — the gradient is gone, see below* |
| `.btn-primary` on flat `--accent-ink` | `#4A1F10` cocoa | **3.63:1** | `--on-accent` → 5.61:1 / 7.63:1 |
| `.track > span` fill against its `--line` track | `--accent` | **2.99:1** | `--accent-ink` → 4.34:1 |
| `.scan-chip-last` against the button behind it | `#3D2B24` fixed | **2.38:1** on the flat fill | `--on-accent` → 5.61:1 / 7.63:1 |
| `.note` and `.banner-*` body text | the accent (`--note` / `--good`) | **3.24:1** and **2.92:1** | `--ink` → 11.9:1 / 11.6:1 |
| `.note-dot` glyph | `--note` / `--good` fill | **3.24:1** | `--note-strong` / `--good-strong` → 5.3:1 |
| `.btn-ghost` label | `--accent` | **3.67:1**, and 4.25:1 inside a note | `--accent-ink` → 4.9:1 worst case |
| `.muted` / `.micro` in dark | `--ink-3` `#7D6555` | **2.83:1** | `#A89383` → 4.67:1 |

The hero is the one piece of money that is **centred**, not right-aligned: right-alignment is for a
column of figures, and the hero is a lone figure in a centred card. It inherited `text-align: right`
from the shared money rule and sat hard against its card's right edge with 190px of nothing to its
left.

Two rules come out of this:

1. **A fill colour is not a text colour.** The brand accent, the amber and the green are tuned for
   borders, dots, rings and bars, where 3:1 is the bar. As 13–15px words they all fail. Accent
   *words* use `--accent-ink`; a coloured field carries an `--ink` body, with the colour left to
   the dot and the border to do the signalling.
2. **The brand is the mark's two colours, not a sunset.** *(Revised — the gradient has been
   removed.)* The mark is `--ink` for the long bar and `--accent` for the short one, and the app
   now uses exactly that: filled accent surfaces are flat `--accent-ink`, labelled with
   `--on-accent`.

   `--on-accent` is the one token that moves **opposite** to its own fill. `--accent-ink` darkens
   for daylight and lightens for night, so a label that failed to invert alongside it would be
   white on pale coral at 1.9:1. Anything sitting on a filled accent surface takes the pair — see
   `.scan-chip-last`, which is an inversion of the button rather than a colour of its own.

   Rule 1 still holds, with one measured exception: `--accent` is a bar colour, but a bar sitting
   in `--line` rather than on the page measured 2.99:1 against it. `.track > span` uses
   `--accent-ink` for that reason. The rule assumes a bar on a card; measure when it is not.

`--warn` is not a decoration: four places asked for it before it existed, CSS dropped those
declarations silently, and "Delete trip" was the same colour as everything else. `src/tokens.test.ts`
now fails if any `var(--…)` in the app is not declared.

## Person colour — the one thing that must survive

The eight stored pastels in `PERSON_COLORS` stay **exactly as they are**. They're stored per
person, so a new palette would reach new people only and split an existing group's colours in
half. The chip field remains the stored hex with `--ink` on top.

What is new: a **26px disc** carrying the person's initial, filled with a darker, more saturated
colour *computed from that same stored hex*. No migration, and identity survives colour
blindness, a bright kitchen window, and a 22px avatar in a settle row.

This also **retires `outline: 3px solid` as the selected state** — that existed only because a
fill couldn't be made legible across eight pastels. The disc fills instead.

Disc colours the designer specified for the first five pastels:

| Stored tint | Disc |
|---|---|
| `#FFD9A0` | `#7E5410` |
| `#FFC4B8` | `#A8452F` |
| `#C9E8C9` | `#3F7A44` |
| `#BFD9FF` | `#3C6BB5` |
| `#E8C9F0` | `#8A4CA0` |

## Type — Fredoka + Nunito, seven jobs

`B` = `Fredoka, ui-rounded, system-ui, sans-serif` · `N` = `Nunito, system-ui, sans-serif`

| Token | Spec | Sample |
|---|---|---|
| `--t-hero` | Fredoka 600 · 44px / `-.012em` | `€68.80` |
| `--t-money-1` | Fredoka 600 · 25px | `€28.60` |
| `--t-title` | Fredoka 600 · 19px | "Who got what?" |
| `--t-money-2` | Fredoka 600 · 15px | `€16.20` |
| `--t-body` | Nunito 600 · 14.5px | item names |
| `--t-label` | Nunito 500 · 12.5px | "Conad Superstore · 11 Aug" |
| `--t-micro` | Nunito 800 · 11px / `.08em` | `ASSIGNED` |

## Space and shape

`--s1` 4 · `--s2` 8 · `--s3` 12 · `--s4` 16 · `--s5` 20 · `--s6` 26 · `--s7` 34 (px)

Radii: `sm` 9px · `md` 13px · `lg` 18px · `xl` 20px · `pill` 999px
Shadows: `sh-1` rest · `sh-2` action · `sh-3` sheet

---

## The four rules

### Rule 1 — Money has three sizes and a hero

`--t-hero` for what you're owed; `--t-money-1` for a payment or receipt total; `--t-money-2` for
a line's price; `--t-label` for the arithmetic (`×12 · €1.35 each`).

Always `tabular-nums`, always right-aligned in its own column, always formatted by
`Intl.NumberFormat` from integer cents — so the symbol lands wherever the currency puts it and
nothing assumes two decimals. The hero splits the currency symbol into a `0.6em` muted glyph
while the digits keep full weight.

### Rule 2 — Warnings are notes, in one voice

Amber tint, amber border, amber disc. **Never red — nothing here is an error.** A filled disc and
a bold first line carry the meaning, so colour never works alone — which is why the *body* is ink:
amber words on the amber tint measured 3.24:1. The colour is in the field and the dot, not the
sentence.

Shape: one line of what happened, then one line of what it costs you and a way out. Several
notes **merge into one card with several lines** rather than stacking into a wall. A note always
sits next to the thing it is about, and collapses to a pill once that thing scrolls away.

### Rule 3 — Progress is one bar and one fraction

The same 5px track and the same fraction appear on the receipt row, the assign header, and the
trip summary. Accent while there is work left, green when there isn't.

States: `0/26 Check it` (flat amber) · `14/26 Keep going` (flat `--accent-ink`) · `26/26 Done`
(green).

### Rule 4 — A person, a group and a verb look different

- **Person** — fully round pill. Their disc, their initial, their tint. *A noun.*
- **Group** — rounded rect, 13px corners, with a stack of member discs. *A collective noun.*
- **Action** — dashed ghost, no fill, emoji up front. *A verb.*

Selected is never colour alone: the disc fills in, the border thickens to 1.5px, the label goes
to 600, and a dark ✓ appears.

**Every one of them is 44px tall** — and so is anything *inside* one. The rename button in a person
chip was the bare name, 14px tall in a 44px pill, so most of what looked like one target did
nothing; `.chip-inline` stretches it to the full height, and the × takes the chip's right padding
as hit area too.

---

## Notes for implementation

- Fonts must be **self-hosted**. The app is an offline-capable PWA on GitHub Pages; loading from
  `fonts.googleapis.com` would break offline use and add a third-party request on every launch.
- The dark theme ships with the tokens, via `prefers-color-scheme`.
- `PERSON_COLORS` must not change. The disc colour is derived, not stored.
- **A section's name goes inside its box.** Friends, Groups, Receipts, Trip settings, To settle,
  Appearance — every section on every screen is a card with its `h3` inside it. That is why the
  receipts are rows in a Receipts card (`.receipt-row`) rather than cards of their own under a
  heading that floated outside: one section reading differently from its neighbours is the thing
  you notice. A row reaches the card's edges through a negative margin, so its separator and its
  amber "not counted" edge line up with the box rather than floating inside it.
- **A bar that holds a mode sticks.** While items are picked, the top bar carries the count,
  Select all and the way out — and every one of those is needed *while scrolling to find the next
  item*, so `.topbar-sticky` pins it at the top with an opaque background and negative margins that
  reach the screen's edges. A mode's exit that scrolls away is a mode you cannot leave.
- **The way on is at the bottom, not only in the corner.** The settle screen's arrow back to the
  trip is duplicated as a full button beside Share, because settling up is rarely the end of the
  holiday and the topbar's far corner is not where a thumb is.
- **One round button in the bottom-right corner** for the single thing a screen is for — adding a
  trip, on the trip list. 56px, a `--surface` disc with an `--accent-ink` *drawn* plus: a typed ＋ at 30px puts
  only 16px of ink inside the circle, and how much depends on which font managed to load. The
  slot is centred on the app's 480px column exactly as the bottom bar is, so on a wide screen the
  button sits beside the content instead of drifting to the window's edge, and it takes no pointer
  events so the list scrolls under it. It replaced a ＋ in the header, which is the hardest corner
  of a phone to reach one-handed.

  **Placement.** 16px from the trailing edge, which lines its right edge up with the cards. At the
  bottom, `16px + max(env(safe-area-inset-bottom), 26px)`. Material's 16dp is measured from the
  *content* area, and on Android that sits above a 24–48dp navigation bar — so a native FAB has the
  bar's worth of space beneath it. A web page has none, and a literal 16px hugged the corner. The
  `max()` supplies what the system bar would have: 50px on an installed iPhone, of which 34 is the
  home indicator, so 16px above it; 42px everywhere else. The gap lives in the slot's padding, not
  in `bottom`, so the space the page reserves is measured from the slot's box rather than guessed.
- **A fixed bottom bar reserves its own space.** `lib/useReservedBottom.ts` measures the
  fixed thing — the bar or the round button — and publishes `--footer-h`, which the page padding is
  derived from. One publisher per screen: everything fixed at the bottom is either the bar or the
  button, never both. The stylesheet used to reserve a
  hard-coded 140px while the trip screen's bar measured 172px, so "Delete trip" and the last
  receipt sat under it at every scroll position. A number in a stylesheet cannot know how tall a
  bar is on six different screens.
- **A topbar's title takes the slack** (`flex: 1`), which pushes the right-hand action to the right
  edge. Without it the buttons pack left and 🗑 floats in the middle of the row.
- **Icon-only actions in a topbar, with an `aria-label`.** "✏️ Edit items" beside two icon buttons
  read as a third kind of control and pushed the title off centre.
- **Hold to pick several.** A long press (500ms, 10px of slop) on an item selects it; tapping adds
  more. The bottom bar becomes the assign panel — the *same* chips a single item shows, from one
  `chipPanel(items)`, so the two can never drift apart. A chip lights up only when every picked
  item has that assignment; when they disagree the panel says so in words rather than picking one
  of the two truths. Back — the topbar's ✕ and Android's hardware button, via `lib/backIntercept.ts`
  — clears the selection before it means "leave the receipt".
- **A `<select>` is sized by its longest option, not its answer.** The currency picker was a grey
  bar three quarters of the screen wide while it read "EUR — Euro (€)". `.select-compact` uses
  `field-sizing: content`, with a `max-width` for browsers that lack it.
