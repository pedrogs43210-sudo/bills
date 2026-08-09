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

## Colour — dark ("evening on the same holiday")

`--bg` `#241A17` · `--surface` `#2F221D` · `--sunken` `#3A2A23` · `--line` `#4A362D` ·
`--line-strong` `#5C4437` · `--ink` `#FBEEE2` · `--ink-2` `#C4A895` · `--ink-3` `#7D6555` ·
`--accent` `#FF8F73` · `--sunset-1` `#FF7059` · `--sunset-2` `#FFB347` · `--good` `#4FCB92` ·
`--good-bg` `#1E3B2C` · `--note` `#F0C070` · `--note-bg` `#3D2C16` · `--note-line` `#6B4E1E`

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

Amber ink on warm tint. **Never red — nothing here is an error.** A filled disc and a bold first
line carry the meaning, so colour never works alone.

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

**Every one of them is 44px tall.** The old 28px chips were the mis-tap that quietly moved money.

---

## Notes for implementation

- Fonts must be **self-hosted**. The app is an offline-capable PWA on GitHub Pages; loading from
  `fonts.googleapis.com` would break offline use and add a third-party request on every launch.
- The dark theme ships with the tokens, via `prefers-color-scheme`.
- `PERSON_COLORS` must not change. The disc colour is derived, not stored.
