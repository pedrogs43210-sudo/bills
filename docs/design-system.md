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
| `--sunset-1` | `#FF7059` | gradient start |
| `--sunset-2` | `#FFB347` | gradient end |
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
`--accent` `#FF8F73` · `--sunset-1` `#FF7059` · `--sunset-2` `#FFB347` · `--good` `#4FCB92` ·
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
| `.btn-primary` label on the sunset gradient | `#FFF` | **2.72:1** red end, **1.78:1** amber end | `#4A1F10` → 5.2:1 / 7.9:1 |
| `.note` and `.banner-*` body text | the accent (`--note` / `--good`) | **3.24:1** and **2.92:1** | `--ink` → 11.9:1 / 11.6:1 |
| `.note-dot` glyph | `--note` / `--good` fill | **3.24:1** | `--note-strong` / `--good-strong` → 5.3:1 |
| `.btn-ghost` label | `--accent` | **3.67:1**, and 4.25:1 inside a note | `--accent-ink` → 4.9:1 worst case |
| `.muted` / `.micro` in dark | `--ink-3` `#7D6555` | **2.83:1** | `#A89383` → 4.67:1 |

Two rules come out of this:

1. **A fill colour is not a text colour.** The brand accent, the amber and the green are tuned for
   borders, dots, rings and bars, where 3:1 is the bar. As 13–15px words they all fail. Accent
   *words* use `--accent-ink`; a coloured field carries an `--ink` body, with the colour left to
   the dot and the border to do the signalling.
2. **The gradient is the brand, so the ink moves.** Darkening the sunset until white passed would
   have turned it into burnt orange. The label went dark instead, and the gradient is untouched.

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
trip summary. Amber gradient while there is work left, green when there isn't.

States: `0/26 Check it` (flat amber) · `14/26 Keep going` (amber gradient) · `26/26 Done` (green).

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
- **A fixed bottom bar reserves its own space.** `components/Footerbar.tsx` measures itself and
  publishes `--footer-h`, which the page padding is derived from. The stylesheet used to reserve a
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
