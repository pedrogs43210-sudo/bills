# Bills — design brief

A brief for redesigning an existing, working mobile web app. **Cleaner and more professional, without losing the warmth.** Nothing here asks for new features; this is about how the app looks and feels.

---

## What the app is

Bills splits grocery receipts between friends on holiday. One person photographs the receipt, AI reads the items, everyone taps who each item was for, and the app says who owes whom. One phone holds the ledger; the others just read a shared summary.

It has been used on a real holiday by a real group and works. It is now being prepared for the App Store and Play Store, which is why the visuals need to grow up.

## Who uses it

Friends aged roughly 25–40 splitting a supermarket run, standing in a rented kitchen, often slightly tipsy, holding a curled-up receipt. The person doing the tapping wants to be finished. The others want to see one number: what they owe.

Two things follow from that:

- **It is used in short bursts, one-handed, at arm's length.** Not studied.
- **It is about money between friends.** It has to look trustworthy enough that nobody double-checks it with a calculator, while never feeling like a banking app. Nobody wants their holiday to feel like accounting.

## The feeling to keep

Sunny holiday. Warm cream background, sunset orange, rounded corners, a bit of emoji. It should feel like the good part of the holiday, not the admin part.

The current look was described as "sunny holidays" and got that right in spirit. What it lacks is craft: spacing is inconsistent, type is all one weight and size, cards float without hierarchy, and the money — the thing everyone actually came for — is the same size as everything else.

**The redesign should read as the same app, done properly.** Not a new personality.

## What exists today

Design tokens currently in use (`src/theme.css`):

| Token | Value | Used for |
|---|---|---|
| `--bg` | `#fff8f0` | Page background (warm cream) |
| `--card` | `#ffffff` | Cards |
| `--ink` | `#3d2b24` | Text (warm dark brown) |
| `--muted` | `#9c8577` | Secondary text |
| `--sunset1` | `#ffb347` | Amber, gradient end |
| `--sunset2` | `#ff7059` | Coral, gradient start / accent |
| `--good` | `#2e9e6b` | Confirmations |
| `--warn` | `#b7791f` | Warnings |
| `--radius` | `14px` | Everything rounded |

Type is `system-ui` throughout, headings at weight 800. Layout is a single 480px-max column. Primary buttons are a coral→amber gradient. People are shown as pill "chips", each friend assigned a pastel colour used consistently wherever they appear.

Treat the palette as a **starting point, not a constraint** — refine, extend, or replace it if the result is warmer and clearer. Two things should survive in some form: the cream-not-white background, and each person having their own colour.

## The screens

Six, in the order a user meets them:

1. **Trip list** — a new-trip form at the top, then existing trips newest-first, each showing name, emoji, number of people and receipts.
2. **Trip** — the people on the trip (each a coloured chip, addable/renameable/removable), saved groups of people, a list of receipts with status, and buttons to scan a receipt, add one by hand, or settle up.
3. **Check the receipt** — the busiest and ugliest screen. An editable list of scanned items (name, quantity, price each), the receipt total, who paid (one or several people with amounts), and warning banners when the numbers don't add up.
4. **Assign** — the heart of the app. Each item is a row; tapping it opens a row of chips: one per person, one per saved group, `👥 Everyone`, and `🔢 Split units` for multi-quantity lines. Tapping a group or Everyone lights up all its members so one can be un-tapped for "everyone except Sofia".
5. **Settle up** — each person's share and what they paid, then the list of who pays whom, and a share button.
6. **Settings** — API key, currency, export/import backup.

## What to fix

In priority order. The first three matter most.

**1. Money should look like money.** Amounts are currently the same size and weight as item names. A person's total on the settle screen is the single most important number in the app and should be unmistakable. Item prices, receipt totals, and per-person shares form a clear three-level hierarchy right now only by position.

**2. The assign screen has to survive a long receipt.** Thirty items, four people, three groups. Today it's a flat list of cards, and the chip row wraps into an unpredictable block. It needs to stay scannable at speed: which items are done, which aren't, and where you were. Assigned and unassigned items are currently distinguished by a dashed orange outline, which is doing a lot of work alone.

**3. Warnings need one clear voice.** The app is deliberately honest about what it can't do: a receipt whose payer is missing is excluded from the maths and says so, in three different places. Those messages are currently plain coloured boxes stacked above content and can pile up. They should feel like helpful notes, not errors — but never be easy to miss, because a missed one means someone pays the wrong amount.

**4. Type and spacing.** One font at one weight for almost everything. Card padding, gaps between cards, and the space around the fixed bottom button bar are all slightly different values chosen ad hoc.

**5. Chips are carrying too much.** Person chips, group chips, `👥 Everyone`, `🔢 Split units`, emoji pickers, and status badges are all the same pill. Selected state is a 3px outline. A person, a group, and an action deserve to look different.

**6. Touch targets.** Chips are 28–31px tall; comfortable is 44px. This applies everywhere, and matters most on the assign screen where a mis-tap silently moves money.

**7. Nothing indicates progress.** A receipt goes review → assigning → done, and a trip accumulates receipts, but neither shows a sense of "how much is left".

## Constraints

These are real and non-negotiable.

- **Mobile web, installed to the home screen.** Design for 375×812 first. It must work offline, so no web fonts fetched at runtime — a self-hosted font is fine, a Google Fonts link is not.
- **Plain CSS, no framework.** Currently one 60-line stylesheet plus inline styles. A design that needs Tailwind or a component library is out of scope; CSS custom properties, flexbox, and grid are all available.
- **Nothing may scroll sideways.** Long group names and long item names already exist and wrap today.
- **Both light and dark.** Only light exists now. Dark should feel like evening on the same holiday, not a different app.
- **Accessibility is not optional.** Text on coloured chips must stay readable, selected state must not be conveyed by colour alone, and every control needs a real label.
- **Money is displayed in integer cents formatted per currency** (`€6.99`, and other currencies too). Never invent a layout that assumes two digits or a currency symbol's position.

## What is out of scope

Don't redesign the flow. The screens, their order, and what's on them are settled and tested. No onboarding, no tab bar, no new navigation. If something about the structure seems wrong, say so as a note rather than designing around it.

## What would be most useful back

1. A refined set of design tokens — colour (light and dark), type scale, spacing scale, radii, shadows — as CSS custom properties.
2. The **settle screen** and the **assign screen** drawn out. Those two carry the app: one is the answer everyone wants, the other is where all the work happens.
3. How money, warnings, and progress should look, consistently, wherever they appear.
4. A treatment for chips that distinguishes a person from a group from an action.

If only one thing can be done: the assign screen.
