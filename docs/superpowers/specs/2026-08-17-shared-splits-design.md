# Shared splits — inviting friends into a split

**Date:** 2026-08-17
**Status:** design, awaiting review

## The problem

The person holding the receipt has to guess what everyone else had. They tap through forty items
deciding which of four friends ate the sea bass, and they get it slightly wrong, and the numbers are
slightly wrong, and nobody says anything.

The people who know the answer are standing right there with phones.

## What this is

The host invites friends into a split with a link. Each friend **installs Billy**, opens the link,
lands directly on the split, and ticks what they had. Their picks flow back to the host's phone.
Friends can also add a receipt they paid for, typed in by hand.

**Guests use the app, not a web page.** This is the point of the feature, not an implementation
detail: every invite is an install, and the guest becomes somebody who might scan their own receipts
next week. A browser-based guest view would be less friction and would grow nothing.

## Why this needs no accounts

An account proves two things: who you are, and that you are allowed in. This feature needs neither
solved the hard way.

**Allowed in** is the link. A capability URL carrying a code long enough that guessing is hopeless —
the same mechanism as a Google Docs "anyone with the link" share. Possession is the permission.

**Who you are** is much smaller than it looks. The split does not need Maria's identity in any global
sense; it needs to know which of the four people at the table she is. Every Billy install already has
an install id, so the app sends that plus the join code, and the server pairs them. She picks her
name from the split's people once, and her phone is that person from then on.

No email, no password, no sign-up, nothing to forget.

## The bit that makes this tractable

**Claims are additive, not exclusive.**

If Maria and João both tick the bottle of wine, they share it — which is the right answer, not a
conflict. So there is no locking, no last-write-wins, and no conflict resolution to get wrong. Each
participant owns their own list of "things I had", the server collects them, and the host merges by
union into the assignment model that already exists (`{ kind: "people", personIds: [...] }`).

The data model that is easiest to build is the one that is behaviourally correct.

## The merge is explicit, never silent

The host taps **"Apply their picks"**. Claims do not rewrite the split as they arrive.

Silent merging would need bookkeeping of which items the host has edited since the last sync, so a
guest answering late does not undo a correction the host already made. An explicit merge removes the
whole problem: the host chooses the moment, sees what changed, and can edit afterwards without being
overwritten. Applying again is idempotent, because the claims are the source.

## The link

```
https://<domain>/j/7Kq2mXp9vR4t
```

Two Android mechanisms make it behave:

**App Links** open Billy directly when it is installed, and the Play listing when it is not — no
"which app would you like to use" dialog, because the domain is verified as ours. This requires a
real domain; `github.io` cannot be verified.

**Play Install Referrer** carries the join code *through* the installation, so after installing,
Billy opens on Maria's split with the items in front of her. Without it the flow is tap → install →
open → an empty splits screen → give up, and the feature dies on its most important step.

## What gets published, and for how long

Publishing sends the split to the Worker. Deliberately not everything:

| Published | Not published |
|---|---|
| Split name, emoji, currency | Any other split |
| People's names on this split | The scan photo (it is never stored anywhere) |
| Receipts: shop, date, total, items, prices | Anything about the host's account or scan balance |
| Who paid what, so a guest can see their own share | |

**Seven days, then deleted.** The host's phone remains the source of truth; the server is a
**postbox, not a record**. That distinction is what the privacy policy will rest on.

Be honest about one thing in that table: **item-level detail is new exposure.** The shared summary
the host already sends to the same group chat carries names and totals, but not "Maria had the sea
bass". Do not claim this publishes nothing new.

## Guests adding receipts

A guest can add a receipt **typed in by hand**, and it merges into the split like any other.

A guest cannot **scan**. A scan spends the host's balance, and a link sitting in a group chat that
spends somebody's money is a hole. If the guest has their own scans, they scan on their own balance
and the receipt syncs across — same path, different payer.

## The trust model, stated plainly

Anyone with the link can claim to be anyone on the split. Maria's brother could open it and tick
items as Maria.

For splitting dinner among friends this is the right trust level — the same as a shared spreadsheet.
It would be the wrong trust level if money moved, and none does: Billy performs arithmetic and tells
people what to settle between themselves.

Two guards, because "it is fine" is not a design:

- **A name can only be taken once.** If an install id has already claimed "Ana", a second one is
  refused rather than silently taking over.
- **The host can revoke.** One tap deletes the shared copy; existing links stop working immediately.

## Screens

**Invite** (host) — the link with a Share button, who has joined so far, an "Apply their picks"
button when there are unapplied claims, and Revoke. Says plainly that the copy is deleted after
seven days.

**Join** (guest, on opening a link) — the split's name and "Which one are you?": the existing people
as chips, plus a field to add yourself. Names already taken by another phone are shown but not
selectable.

**Pick** (guest) — the item list with a tap target per row, and a running total of what they have
claimed so far. That total is the reason to bother tapping.

**The guest's split view** — the split as they can see it, plus "Add a receipt by hand".

## Endpoints

All behind `X-App-Token` as today, so only Billy builds reach them.

| | |
|---|---|
| `POST /v1/splits` | Host publishes or updates. Returns `{ code, hostToken }`. |
| `GET /v1/splits/:code` | Anyone with the code reads the split. |
| `POST /v1/splits/:code/join` | Guest claims a person. Refused if taken. |
| `PUT /v1/splits/:code/claims` | Guest replaces their own claim list. |
| `POST /v1/splits/:code/receipts` | Guest adds a hand-typed receipt. |
| `GET /v1/splits/:code/claims` | Host polls for answers. |
| `DELETE /v1/splits/:code` | Host revokes. Requires `hostToken`. |

`hostToken` is generated server-side and returned once. Only it can update or revoke, so a guest with
the code cannot delete the split or rewrite the receipts.

## Storage

```sql
CREATE TABLE shared_splits (
  code        TEXT PRIMARY KEY,     -- the join code from the link
  host_token  TEXT NOT NULL,        -- only this may update or revoke
  payload     TEXT NOT NULL,        -- the split as JSON, capped at 128 KB
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL      -- created_at + 7 days
);

CREATE TABLE split_participants (
  code        TEXT NOT NULL,
  install_id  TEXT NOT NULL,
  person_id   TEXT NOT NULL,        -- which person on the split this phone is
  claims      TEXT NOT NULL,        -- JSON array of item ids
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (code, install_id)
);
CREATE UNIQUE INDEX split_person_once ON split_participants (code, person_id);
```

That unique index is the "a name can only be taken once" rule, enforced where it cannot be raced
rather than checked in application code first.

Expiry is checked on every read and swept daily by a scheduled handler — a row that is only deleted
lazily lives forever if nobody ever asks for it again, which is exactly the case for an abandoned
split.

## Cost and abuse

No AI cost: guests never scan, so the expensive path is untouched. D1 rows are small and capped at
128 KB. The realistic abuse is somebody publishing thousands of splits to fill the database, which
the existing app token bounds to people running a real build, and which a per-install publish limit
bounds further.

## What the privacy policy has to say

This is the part that holds the launch, and it must be written before anything ships.

- A new section describing exactly the table above: what an invite publishes, that it is seven days,
  that revoking deletes it immediately.
- **The third-party problem, named.** The host uploads Maria's name and what Maria ate. Maria never
  agreed to anything and may not use Billy. That makes us a controller of her data, and the policy
  has to say so rather than hope nobody asks.
- The existing sentence — *"Everything else stays on this phone"* — becomes false the moment a split
  is shared, and must change. It currently appears in both the policy and the Help screen.

## Non-goals

- **Guests scanning.** Covered above.
- **Live updates.** The host polls while the invite screen is open. Push would be a service worker,
  a subscription store, and a notification permission prompt, for a screen somebody looks at for
  ninety seconds.
- **Guests editing prices or deleting items.** They pick what they had and add their own receipts.
  Letting four people edit the same receipt's numbers is a different feature with a different risk.
- **iOS.** Universal Links are the equivalent mechanism and can come with the iOS build.
- **Any of this before the domain and the Play listing exist.** App Links need a verified domain, and
  the link sends non-installers to a listing that has to be live.

## Sequencing

1. A domain (App Links cannot be verified on `github.io`)
2. The Play account finishes verifying, and the listing goes live
3. The rewritten privacy policy
4. This feature
