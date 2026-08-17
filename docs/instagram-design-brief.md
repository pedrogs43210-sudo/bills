# Billy — social post templates

I need a set of reusable post templates for a small app's brand account, serving **both Instagram and
TikTok** — TikTok's photo carousels perform well, so one design run covers both. Give me the designs
and your reasoning, not code.

## What the app is

**Billy** splits restaurant and supermarket receipts between friends. You photograph the receipt, an
AI reads the items, you tap who had what, and it tells you who owes whom. It is a phone app.

The product exists and is nearly launched. Everything is being produced in bulk now and published
the week it goes live, so these templates need to survive a month of use from day one rather than be
tuned as they go.

**Campaign line:** *Billy remembers.* — two words, faintly ominous, and it makes Billy a character
rather than a utility: the friend who quietly keeps score. *Billy knows who had what* is the
explanatory version, kept for the store listing and the website, not for social.
**Voice:** deadpan. Billy is the friend who is quietly, annoyingly correct about money. Never sells,
never uses an exclamation mark, never the loudest thing in the post. When a post is funny, the
situation is funny — Billy just states the fact at the end.

**What the content is about:** not the app. It is about the small, extremely familiar argument that
happens when four people who ordered different things are handed one bill. The app is the punchline,
often only a signature at the bottom.

## The brand as it stands

**Fonts:** Fredoka (headings, the brand) · Nunito (body).

**Light palette**
```
bg        #fff8f0   warm cream       surface   #ffffff
sunken    #fdf1e4                    line      #efe0cf
ink       #3d2b24   warm near-black  ink-2     #6e574a   ink-3 #7d6555
accent    #e8492f   tomato red       accent-ink #b83e1a  (the text-safe one)
sunset    #ff7059 → #ffb347          the gradient
```

**Dark palette**
```
bg #241a17   surface #2f221d   sunken #3a2a23   line #4a362d   ink #fbeee2   ink-3 #a89383
```

**The mark** is a till receipt with a torn foot and three lines knocked out of it, drawn on a
64-unit grid as one path with `fill-rule: evenodd` — so the lines are holes that take whatever is
behind them:

```
M20 8H44a6 6 0 0 1 6 6v34l-3 4-3-4-3 4-3-4-3 4-3-4-3 4-3-4-3 4-3-4V14a6 6 0 0 1 6-6Z
M28 19h14a2.5 2.5 0 0 1 0 5H28a2.5 2.5 0 0 1 0-5z
M28 27h9a2.5 2.5 0 0 1 0 5h-9a2.5 2.5 0 0 1 0-5z
M28 35h14a2.5 2.5 0 0 1 0 5H28a2.5 2.5 0 0 1 0-5z
```

**A rule from the app's asset sheet that applies here too:** the gradient tile belongs to the
launcher, the store and the splash. In content, the mark is used **flat** — ink, cream, or accent —
never as a gradient badge stamped on a post.

## Hard constraints

1. **Design at 9:16 (1080×1920), and make 4:5 (1080×1350) a safe crop of it.** The same carousels run
   on TikTok, which is taller than Instagram — so compose for the tall frame and keep everything
   that matters in the middle. Nothing important goes near the top or bottom edge, where TikTok's
   own chrome (caption, buttons, username) sits over the image. Show me the safe area you are
   working to, because it is the constraint that will break these if it is ignored.
2. **Carousels are up to 10 slides.** Assume most are 5–7.
3. **Text must survive a phone-sized thumbnail.** If the first slide's hook is not readable at
   150px wide, it does not work.
4. **Text contrast 4.5:1 minimum.** This project has been bitten repeatedly — white on the sunset
   gradient measured 1.78:1 and had to be thrown out.
5. **One person will make these, 4–5 a week, alongside a job.** A template that needs 40 minutes of
   fiddling will not get used. Design for speed: swap the copy, keep everything else.
6. No stock photography of smiling people. No 3D renders. No illustration style that needs an
   illustrator to maintain.

---

# What I need

## Template 1 — The chat

A conversation between friends, unfolding as an argument about a bill.

**Do not imitate WhatsApp or iMessage.** Trademark risk, and platforms sometimes suppress it. Build
Billy's own chat look out of the palette above — it becomes recognisable in a way a screenshot of
somebody else's app never can.

Real example, to design against:

> **Marta:** I had 2 glasses of wine
> **Alex:** I had none
> **Marta:** Yeah but we're splitting the whole dinner anyway
> **Alex:** Why am I paying €8 for your wine
> **Marta:** It's €8...
> **Alex:** That's not the point
>
> **Billy:** The point is €8.

The last line is Billy's, and it must land differently from the others — that is the whole joke.
Show me how Billy speaks in a chat without it looking like a sponsored message.

Needs to work at 4–8 messages. Show a short one and a long one.

## Template 2 — Receipt hell

**This is the one I care most about.** It is the only chance to own a look nobody else in the
category has, and the raw material is free: a real receipt, photographed.

A photographed receipt with minimal copy over it. Examples of the copy:

- THIS RECEIPT STARTED AN ARGUMENT.
- €184.72 · 5 people · 0 agreement.
- Somebody here had the wine.

Show me two or three genuinely different treatments — copy over the photo, copy beside it, the
receipt as a torn edge against a flat field, whatever you think is strongest. Tell me how to
photograph the receipts so this is repeatable on a kitchen table with a phone: surface, light,
angle, what to have in shot.

## Template 3 — The list carousel

Slide 1 is a title. Slides 2–7 are one item each. Final slide is Billy.

> **THINGS YOU SHOULD NEVER SPLIT EVENLY**
> Restaurant bills · Supermarket shops · Airbnb groceries · Group takeaway · Bar tabs ·
> That €70 bottle of wine Dave insisted on
>
> *Unless everybody actually had the same thing.*

The tension: slide 1 must stop a scroll on its own, and slides 2–7 must be fast to produce and not
monotonous across six of them. Show how the rhythm varies without needing a new design each time.

## Template 4 — Group chat vs Billy

Two columns. On one side the group chat; on the other, Billy.

```
"Wait who had the nachos?"    →  Assigned
"How much was the wine?"      →  €24
"Did you pay me?"             →  Settled
37 messages                   →  1 scan
```

The one that demonstrates the product without being a demo. It needs to read in about two seconds.

## Template 5 — The end slide

Every carousel ends on Billy. One slide, reusable, doing as little as possible: the mark, the name,
the line *Billy remembers*. Show me the version that works after a funny post and after a
serious one — or argue that it should be the same slide either way.

---

## What I would like back

For each template: two or three genuinely different directions, in **both light and dark**, with one
sentence on what each is going for and what it gives up. I would rather have three sharp options
with honest trade-offs than six variations of one idea.

Also, honestly: **which of the five is weakest?** I would rather cut one than have somebody making
five formats a week where four are good and one is filler.

If any of this fights the constraints above, say so — they came from real problems, but they are not
sacred.
