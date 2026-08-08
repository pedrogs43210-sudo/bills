# Bills — the design as it stands today

**Written:** 2026-08-08, from the code, not from memory. Everything here is what ships in v2.
**Purpose:** a starting point for a designer. This is the inventory, not a wish list — the
things worth changing are in `docs/design-brief.md`.

The whole visual system is **one 60-line stylesheet** (`src/theme.css`) plus about 30 one-off
inline styles across six screens. There is no CSS framework, no component library, no icon
set, and no build-time design tokens. That is the good news: it can be replaced wholesale
without unpicking anything.

---

## 1. Colours

All of it lives in `:root` in `src/theme.css`.

| Token | Value | Swatch | Where it's used |
|---|---|---|---|
| `--bg` | `#FFF8F0` | warm off-white | page background |
| `--card` | `#FFFFFF` | white | every card |
| `--ink` | `#3D2B24` | dark warm brown | all body text |
| `--muted` | `#9C8577` | soft taupe | secondary text, hints, `13px` |
| `--sunset1` | `#FFB347` | amber | gradient start, app icon |
| `--sunset2` | `#FF7059` | coral | gradient end, selected outline |
| `--accent` | `#FF7059` | coral | ghost-button text (same as `--sunset2`) |
| `--good` | `#2E9E6B` | green | success banner text |
| `--warn` | `#B7791F` | dark amber | warning banner text, "not counted" badges |

Colours that are **hardcoded outside the token list** — these are the loose ends a designer
should know about:

| Value | Where |
|---|---|
| `#F0E4D8` | default button and chip background (sand) |
| `#E5D5C5` | input border |
| `#EADBCB` | dashed divider between item rows |
| `#FFF3D6` | warning banner background |
| `#E2F5EA` | success banner background |
| `#FFB347` | dashed outline on an unassigned item (`2px dashed`) |
| `rgba(61,43,36,0.08)` | the single shadow used everywhere |

**Person colours** — assigned automatically in rotation as friends are added
(`PERSON_COLORS` in `src/types.ts`), first unused one wins:

`#FFD9A0` `#FFC4B8` `#C9E8C9` `#BFD9FF` `#E8C9F0` `#F5E6A0` `#B8E8E0` `#F0C9C9`

Eight pastels, in that order. They are the background of that person's chip everywhere in the
app, and they are stored per person, so **changing this list won't recolour existing people** —
anyone already added keeps the hex they were given.

**One accessibility note worth carrying into any redesign:** the pastel person-chips use
`--ink` on those light backgrounds, which is fine, but `--muted` (`#9C8577`) on `--card`
(white) is roughly 3.1:1 — under the 4.5:1 minimum for body text. It's used for hints and
secondary lines at `13px`, which is the worst combination of small and low-contrast.

---

## 2. Type

There is no web font. The stack is deliberately the device's own:

```css
font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
```

So it renders as **SF Pro** on iPhone, **Roboto** on Android, **Segoe UI** on Windows. Nothing
is loaded over the network, which is part of why the app is fast and works offline.

| Role | Size | Weight |
|---|---|---|
| Screen title (`.screen-title`) | 24px | 800 |
| Card heading (`h3`) | browser default (~1.17em) | 800 |
| Body / buttons | 16px | 700 on buttons |
| Chips | 14px | 600 |
| Banners | 14px | normal |
| Muted / hint text | 13px | normal |
| Inputs | 16px | normal — **deliberate: iOS zooms the page if an input is under 16px** |

Only three weights in play: normal, 600, 700/800. Money figures are wrapped in `<b>`, so
they inherit the platform bold rather than a tabular or display face.

---

## 3. Shape, depth, spacing

| Property | Value |
|---|---|
| `--radius` | `14px` — cards, buttons, inputs (inputs actually use `10px`) |
| Chips | `999px` — fully round |
| `--shadow` | `0 2px 10px rgba(61,43,36,0.08)` — the only shadow in the app |
| Card padding | `14px` |
| Card gap | `10px` bottom margin |
| Page padding | `16px` |
| Screen max width | `480px`, centred |

Spacing is ad-hoc rather than on a scale: `4px`, `6px`, `8px`, `10px`, `14px`, `16px` all
appear. **There is no spacing scale to inherit** — a designer can impose one freely.

---

## 4. Components, in full

Seven classes. This is the entire component vocabulary.

- **`.card`** — white, rounded, soft shadow. Every screen is a stack of these.
- **`.btn`** — sand background (`#F0E4D8`), `14px 18px`, weight 700.
- **`.btn-primary`** — the one gradient in the app: `linear-gradient(90deg, #FF7059, #FFB347)`,
  white text, full width. Used for the single main action per screen.
- **`.btn-ghost`** — transparent, coral text. Back arrows, cancel, destructive actions
  (destructive ones override the colour to `--warn` inline).
- **`.chip`** — pill. Person chips carry that person's pastel; everything else is sand.
  Selected state is **`outline: 3px solid #FF7059`** — an outline, not a fill, so the person's
  own colour stays visible underneath.
- **`.banner-warn` / `.banner-good`** — full-width tinted rounded blocks, `14px` text.
- **`.row`** — `flex` with `space-between`, the workhorse for "label left, number right".
- **`.topbar`** — back arrow + title, `flex`, `14px` bottom margin.
- **`.footerbar`** — **fixed** to the bottom, `480px` max width, with a
  `linear-gradient(transparent, var(--bg) 35%)` fade so content scrolls up behind it. The
  page reserves `140px` of bottom padding for it.
- **`.item-row`** — `1px dashed #EADBCB` between rows, none on the last.
- **Disabled** — `opacity: 0.45` everywhere.
- **Buttons with no `.btn` class** — several tappable rows use `style={{ all: "unset" }}` to
  stay a `<button>` for accessibility while looking like a plain row.

`env(safe-area-inset-bottom)` is respected in both `#root` padding and the footer bar, so it
sits correctly on notched iPhones.

---

## 5. Emoji as the icon set

There are **no icon files**. Every icon in the app is an emoji in a text node, which is why
there is no icon licence, no sprite sheet, and no loading cost — and also why icons look
different on iOS, Android, and Windows. Counted from the source:

| Emoji | Meaning in the app |
|---|---|
| ⚠️ (×10) | not counted, warnings, discrepancies |
| 👥 (×5) | Everyone chip, group chips, friend count |
| 🧾 (×5) | receipts, app icon |
| 🎉 (×5) | "All square!" |
| ✓ / ✅ | confirmed, done, coverage met |
| 🗑 (×4) | delete trip / receipt |
| 💸 (×3) | a transfer on the settle screen |
| ✏️ | edit items |
| 📤 | share |
| 🔢 | split by units |
| 📝 👉 | receipt status: checking / assigning |
| 📸 ✍️ | scan a receipt / add items by hand |
| ⚙️ | settings |
| ✨ | scanning in progress |
| 🏖️ ⛰️ 🏙️ 🎿 🏕️ 🎉 | the six trip emoji a user picks from |

Trip emoji are **user-chosen and stored per trip**, so any redesign has to keep showing an
arbitrary emoji next to a trip name.

---

## 6. The six screens

| Screen | Structure |
|---|---|
| **Trip list** | Settings ⚙️ top-right. Trip rows (emoji, name, "4 👥 · 1 🧾"), **newest first**. "New trip" card at the bottom: name field, six emoji chips, Create button. |
| **Trip** | Back + title. *Friends* card (add field, coloured chips with × to remove, tap to rename). *Groups* card — **hidden until there are 2+ friends**. Receipt rows with store, total, payers, date, status badge. Footer: 📸 Scan / ✍️ Add by hand / 💸 Settle up. |
| **Review** | Store name, date, payers (name + amount each, add/remove), item rows (name, qty, price), a discrepancy banner when items don't match the total, the **"Use €X"** one-tap total button, then confirm. |
| **Assign** | One card per item, tap to expand. Expanded: person chips → group chips → 👥 Everyone → 🔢 Split units. Collapsed shows who it's assigned to. Unassigned items get an amber dashed outline. Footer shows "N of M unassigned" and a disabled Done button until complete. |
| **Settle** | Exclusion banner if any receipt isn't counted. *Each person's share* — chip, share, "· paid €X". *To settle* — 💸 transfers, or the settled message. Footer: 📤 Share summary. |
| **Settings** | *Scanning* — API key field, Save, Test key. *Backup* — Export per trip, Import trip. |

Shared text output (`src/lib/summary.ts`) is plain text for WhatsApp — emoji, no markup — and
is the one part of the "design" that leaves the app.

---

## 7. What a redesign must not break

Not aesthetic preferences — these are load-bearing:

1. **16px minimum on inputs**, or iOS zooms the page when a field is focused.
2. **The selected chip must stay legible on eight different pastels.** That's why selection is
   an outline rather than a fill. A fill-based design needs to solve it per colour.
3. **No ads or tappable decoration in the assign chip rows or the review price fields.** A
   mis-tap there silently changes money with no error shown.
4. **The 480px cap and the fixed footer** are what make it feel like an app rather than a page.
5. **Emoji stay as text.** Replacing them with an icon font costs the offline guarantee and the
   zero-licence position — worth doing deliberately, not by accident.
6. **`⚠️ not counted` must stay visually louder than the status badges** it replaces, because it
   is the one signal that a receipt is missing from the totals.
7. **Person colours are stored, not computed.** A new palette applies to new people only.
