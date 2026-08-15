# Splits, Scan, Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Billy a three-tab bottom bar — Splits, Scan, Profile — where Scan opens the camera and creates a named split from the receipt, and rename "trip" to "split" everywhere a user can read it.

**Architecture:** No data model change and no migration. The `Trip` type, the `trips` field and every stored key stay exactly as they are; only user-visible words change. The tab bar is a new component that publishes `--footer-h` the same way `Footerbar` does, and renders only on the two root screens so the existing "one publisher per screen" rule holds. Quick scan is orchestrated in the router, because the scan begins with no trip to own it.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest 4 + React Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-08-14-splits-scan-profile-design.md`

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/quickScan.ts` | **New.** Pure rules: what to name a split made from a receipt, and which people to suggest. No React, no storage. |
| `src/lib/quickScan.test.ts` | **New.** Tests for the above. |
| `src/components/TabBar.tsx` | **New.** The three tabs. Publishes `--footer-h`. |
| `src/screens/WhosInScreen.tsx` | **New.** The one step between a quick scan landing and review. |
| `src/screens/ProfileScreen.tsx` | **Renamed** from `SettingsScreen.tsx`. Scans first, no back button — it is a root. |
| `src/App.tsx` | `View` gains `profile`, loses `settings`; `paywall.tripId` optional; owns the quick-scan flow and renders the tab bar. |
| `src/lib/history.ts` | `isHome` covers the splits root. |
| `src/screens/TripListScreen.tsx` | FAB out, `+` into the header, copy to "split". |
| `src/theme.css` | `.tabbar` styles. The stylesheet is `theme.css`, not `index.css` — this plan said the wrong name until Task 3 found it. |

---

### Task 1: Naming a split from a receipt

**Files:**
- Create: `src/lib/quickScan.ts`
- Test: `src/lib/quickScan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { splitNameFor } from "./quickScan";

describe("splitNameFor", () => {
  it("uses the shop's name, which is what the person will recognise", () => {
    expect(splitNameFor("Tasca do Bairro", "2026-08-14")).toBe("Tasca do Bairro");
  });

  it("falls back to the date when the scan could not read a shop name", () => {
    // Never "Untitled". A date is a fact about the receipt; "Untitled" is an apology.
    expect(splitNameFor(null, "2026-08-14")).toBe("14 Aug split");
    expect(splitNameFor("", "2026-08-14")).toBe("14 Aug split");
    expect(splitNameFor("   ", "2026-08-14")).toBe("14 Aug split");
  });

  it("falls back again when the date is unusable, rather than printing Invalid Date", () => {
    expect(splitNameFor(null, "not-a-date")).toBe("New split");
    expect(splitNameFor(null, "")).toBe("New split");
  });

  it("trims and shortens a name too long to read in a list row", () => {
    const long = "Supermercado Continente Modelo Hipermercados Amoreiras Lisboa";
    expect(splitNameFor(long, "2026-08-14").length).toBeLessThanOrEqual(40);
    expect(splitNameFor(`  Pingo Doce  `, "2026-08-14")).toBe("Pingo Doce");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/quickScan.test.ts`
Expected: FAIL — "Failed to resolve import ./quickScan"

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/quickScan.ts`:

```ts
import type { Trip } from "../types";

/**
 * The rules behind scanning a receipt with no split to put it in.
 *
 * Pure, and in their own file, because the alternative is discovering what they do by standing in a
 * restaurant with a phone. Nothing here touches React, storage, or the network.
 */

/** Longer than this and a name stops being a label and starts being a paragraph. */
const MAX_NAME = 40;

/**
 * What to call a split made from a receipt.
 *
 * The shop's name, because that is what the person will recognise in a list a week later. A date
 * when the scan could not read one — never "Untitled", which is an apology rather than a fact.
 */
export function splitNameFor(storeName: string | null | undefined, date: string): string {
  const shop = (storeName ?? "").trim();
  if (shop) return shop.length > MAX_NAME ? `${shop.slice(0, MAX_NAME - 1).trimEnd()}…` : shop;

  const when = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(when.getTime())) return "New split";
  const day = when.getUTCDate();
  const month = when.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${day} ${month} split`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/quickScan.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/quickScan.ts src/lib/quickScan.test.ts
git commit -m "feat: name a split after the shop on its receipt"
```

---

### Task 2: Suggesting the people from last time

**Files:**
- Modify: `src/lib/quickScan.ts`
- Test: `src/lib/quickScan.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/quickScan.test.ts`:

```ts
import { recentPeopleNames } from "./quickScan";
import type { Trip } from "../types";

const trip = (id: string, createdAt: string, names: string[]): Trip => ({
  id,
  name: id,
  emoji: "🧾",
  currency: "EUR",
  people: names.map((n, i) => ({ id: `${id}-${i}`, name: n, color: "#fff" })),
  groups: [],
  receipts: [],
  createdAt,
  schemaVersion: 2,
});

describe("recentPeopleNames", () => {
  it("offers the people from the most recent other split", () => {
    const trips = [
      trip("old", "2026-08-01T10:00:00Z", ["Ana", "Rui"]),
      trip("recent", "2026-08-12T10:00:00Z", ["Maria", "João"]),
      trip("current", "2026-08-14T10:00:00Z", ["You"]),
    ];
    expect(recentPeopleNames(trips, "current")).toEqual(["Maria", "João"]);
  });

  it("never suggests somebody already here — including the You it just created", () => {
    const trips = [
      trip("recent", "2026-08-12T10:00:00Z", ["You", "Maria"]),
      trip("current", "2026-08-14T10:00:00Z", ["You"]),
    ];
    expect(recentPeopleNames(trips, "current")).toEqual(["Maria"]);
  });

  it("ignores case and padding when deciding somebody is already here", () => {
    const trips = [
      trip("recent", "2026-08-12T10:00:00Z", [" maria ", "Rui"]),
      trip("current", "2026-08-14T10:00:00Z", ["Maria"]),
    ];
    expect(recentPeopleNames(trips, "current")).toEqual(["Rui"]);
  });

  it("says nothing when there is no previous split, rather than an empty row of chips", () => {
    expect(recentPeopleNames([trip("current", "2026-08-14T10:00:00Z", ["You"])], "current")).toEqual([]);
    expect(recentPeopleNames([], "current")).toEqual([]);
  });

  it("skips a previous split that had nobody in it", () => {
    const trips = [
      trip("has-people", "2026-08-10T10:00:00Z", ["Ana"]),
      trip("empty", "2026-08-12T10:00:00Z", []),
      trip("current", "2026-08-14T10:00:00Z", ["You"]),
    ];
    expect(recentPeopleNames(trips, "current")).toEqual(["Ana"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/quickScan.test.ts`
Expected: FAIL — "recentPeopleNames is not a function"

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/quickScan.ts`:

```ts
/**
 * Who to offer as one-tap chips on a fresh split.
 *
 * The people from the last split that had any — which is the whole of the "same flatmates every
 * week" benefit, without a global person record, a roster screen, or anything new in storage.
 *
 * Two exclusions, both of which matter. The split being filled in is skipped, because it is by
 * definition the newest and would otherwise suggest itself. Anyone already on it is skipped by
 * name, or the first chip offered would be a second "You".
 */
export function recentPeopleNames(trips: Trip[], currentTripId: string): string[] {
  const here = new Set(
    (trips.find((t) => t.id === currentTripId)?.people ?? []).map((p) => p.name.trim().toLowerCase())
  );

  const previous = trips
    .filter((t) => t.id !== currentTripId && t.people.length > 0)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];

  return (previous?.people ?? [])
    .map((p) => p.name.trim())
    .filter((name) => name && !here.has(name.toLowerCase()));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/quickScan.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/quickScan.ts src/lib/quickScan.test.ts
git commit -m "feat: offer the people from last time, without a roster"
```

---

### Task 3: The tab bar

**Files:**
- Create: `src/components/TabBar.tsx`
- Create: `src/components/tabbar.test.tsx`
- Modify: `src/theme.css` (append)

- [ ] **Step 1: Write the failing test**

Create `src/components/tabbar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabBar } from "./TabBar";

describe("TabBar", () => {
  it("offers the three tabs", () => {
    render(<TabBar current="splits" onSplits={() => {}} onScan={() => {}} onProfile={() => {}} />);
    expect(screen.getByRole("tab", { name: /splits/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /scan/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /profile/i })).toBeTruthy();
  });

  it("marks the current tab, and never marks scan — it is an action, not a place", () => {
    render(<TabBar current="splits" onSplits={() => {}} onScan={() => {}} onProfile={() => {}} />);
    expect(screen.getByRole("tab", { name: /splits/i }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /scan/i }).getAttribute("aria-selected")).toBe("false");

    render(<TabBar current="profile" onSplits={() => {}} onScan={() => {}} onProfile={() => {}} />);
    const profile = screen.getAllByRole("tab", { name: /profile/i }).at(-1)!;
    expect(profile.getAttribute("aria-selected")).toBe("true");
  });

  it("calls the right thing", async () => {
    const onSplits = vi.fn();
    const onScan = vi.fn();
    const onProfile = vi.fn();
    render(<TabBar current="splits" onSplits={onSplits} onScan={onScan} onProfile={onProfile} />);
    await userEvent.click(screen.getByRole("tab", { name: /scan/i }));
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    expect(onScan).toHaveBeenCalledOnce();
    expect(onProfile).toHaveBeenCalledOnce();
    expect(onSplits).not.toHaveBeenCalled();
  });

  it("reserves its own height, so the last split is never underneath it", () => {
    render(<TabBar current="splits" onSplits={() => {}} onScan={() => {}} onProfile={() => {}} />);
    expect(document.documentElement.style.getPropertyValue("--footer-h")).not.toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/tabbar.test.tsx`
Expected: FAIL — "Failed to resolve import ./TabBar"

- [ ] **Step 3: Write minimal implementation**

Create `src/components/TabBar.tsx`:

```tsx
import { useRef } from "react";
import { useReservedBottom } from "../lib/useReservedBottom";

export type TabName = "splits" | "profile";

/**
 * The bar along the bottom: Splits, Scan, Profile.
 *
 * Scan is an action wearing a tab's clothes. Tapping it does not go to a Scan screen — it opens the
 * camera — so it is never the selected tab, because there is no screen for it to be selected on.
 * This is the Instagram-＋ pattern, and it is here for the same reason: the middle of the bar is the
 * easiest point to reach one-handed, and it should hold the thing the app is for rather than a list
 * you pass through on the way to it.
 *
 * Rendered only on the two root screens. Everywhere else has a Footerbar, and two stacked bars is
 * worse than either — which also keeps `useReservedBottom`'s one-publisher-per-screen rule intact.
 */
export function TabBar({
  current,
  onSplits,
  onScan,
  onProfile,
}: {
  current: TabName;
  onSplits: () => void;
  onScan: () => void;
  onProfile: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useReservedBottom(ref);

  return (
    <div className="tabbar" ref={ref} role="tablist" aria-label="Billy">
      <button
        className={`tab${current === "splits" ? " selected" : ""}`}
        role="tab"
        aria-selected={current === "splits"}
        onClick={onSplits}
      >
        <span className="tab-icon" aria-hidden="true">🧾</span>
        Splits
      </button>

      {/* Drawn rather than typed, for the same reason the old ＋ was: a glyph's weight depends on
          which font loaded, and this one has to read at a glance in the middle of the bar. */}
      <button className="tab tab-scan" role="tab" aria-selected={false} onClick={onScan}>
        <span className="tab-scan-disc" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 9V7a3 3 0 0 1 3-3h2M15 4h2a3 3 0 0 1 3 3v2M20 15v2a3 3 0 0 1-3 3h-2M9 20H7a3 3 0 0 1-3-3v-2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        </span>
        Scan
      </button>

      <button
        className={`tab${current === "profile" ? " selected" : ""}`}
        role="tab"
        aria-selected={current === "profile"}
        onClick={onProfile}
      >
        <span className="tab-icon" aria-hidden="true">👤</span>
        Profile
      </button>
    </div>
  );
}
```

Append to `src/theme.css`:

```css
/* The bottom bar. Aligned to the app's own column rather than the window, the same as .footerbar,
   so on a wide screen it sits under the content instead of stretching across the whole browser. */
.tabbar {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  width: 100%;
  max-width: var(--col);
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  background: var(--bg);
  border-top: 1px solid var(--line);
  padding-bottom: env(safe-area-inset-bottom);
  z-index: 20;
}

.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  /* 44px is the smallest a tap target may be; this is comfortably over it including the label. */
  min-height: 56px;
  padding: 8px 4px;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.72rem;
  color: var(--ink-3);
  cursor: pointer;
}

.tab.selected { color: var(--accent-ink); }
.tab-icon { font-size: 1.25rem; line-height: 1.25; }

.tab-scan-disc {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  margin-top: -2px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/tabbar.test.tsx`
Expected: PASS, 4 tests

- [ ] **Step 5: Check the CSS variables actually exist**

Run: `npm test -- --run src/tokens.test.ts`
Expected: PASS. This test fails on any `var(--…)` that is never declared — if `--col`, `--line`, `--bg`, `--ink-3`, `--accent` or `--accent-ink` are named differently in `theme.css`, fix the names in `.tabbar` to match rather than adding new variables.

- [ ] **Step 6: Commit**

```bash
git add src/components/TabBar.tsx src/components/tabbar.test.tsx src/theme.css
git commit -m "feat: a bottom bar whose middle tab is the camera"
```

---

### Task 4: Profile replaces Settings in the router

**Files:**
- Modify: `src/App.tsx:20-27` (the `View` union)
- Modify: `src/App.tsx:94-114` (`screen()`)
- Rename: `src/screens/SettingsScreen.tsx` → `src/screens/ProfileScreen.tsx`
- Modify: `src/screens/TripScreen.tsx:92`, `src/screens/TripListScreen.tsx:54`, `src/screens/HelpScreen.tsx`, `src/screens/ScanFailedScreen.tsx` — every `{ screen: "settings" }`
- Test: `src/screens/settings.test.tsx` → `src/screens/profile.test.tsx`

- [ ] **Step 1: Find every reference**

Run: `npx rg -n 'screen: "settings"|SettingsScreen' src`
Expected: a list of call sites. Every one is edited in step 3; none may be left behind or the build fails.

- [ ] **Step 2: Write the failing test**

Rename `src/screens/settings.test.tsx` to `src/screens/profile.test.tsx`, replace `SettingsScreen` with `ProfileScreen` throughout it, and add:

```tsx
it("is a root, so it has no back button — the tab bar is how you leave", () => {
  render(<ProfileScreen go={() => {}} />);
  expect(screen.queryByRole("button", { name: /^back$/i })).toBeNull();
});
```

- [ ] **Step 3: Rename and rewire**

```bash
git mv src/screens/SettingsScreen.tsx src/screens/ProfileScreen.tsx
git mv src/screens/settings.test.tsx src/screens/profile.test.tsx
```

In `src/screens/ProfileScreen.tsx`: rename the export to `ProfileScreen`, change the title to `Profile`, and delete the back button — replace lines 66-69 with:

```tsx
      <div className="topbar">
        <h1 className="screen-title">Profile</h1>
      </div>
```

In `src/App.tsx`, change the `View` union member `{ screen: "settings" }` to `{ screen: "profile" }`, update the import, and change the line in `screen()`:

```tsx
    if (view.screen === "profile") return <ProfileScreen go={setView} />;
```

At every site found in step 1, change `{ screen: "settings" }` to `{ screen: "profile" }`.

- [ ] **Step 4: Run the suite**

Run: `npm run typecheck && npm test -- --run`
Expected: PASS. A TypeScript error naming `"settings"` means a call site was missed in step 3.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: settings becomes the profile tab"
```

---

### Task 5: Home is the splits list, and back from Profile goes there

**Files:**
- Modify: `src/lib/history.ts:47-50`
- Test: `src/lib/history.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/history.test.ts`:

```ts
import { initialNav, navigate, back, isHome } from "./history";

describe("the tab roots", () => {
  it("treats the splits list as home and the profile as not", () => {
    expect(isHome({ screen: "trips" })).toBe(true);
    expect(isHome({ screen: "profile" })).toBe(false);
  });

  it("goes back from profile to the splits list rather than closing the app", () => {
    const nav = navigate(initialNav(), { screen: "profile" });
    expect(back(nav)?.current).toEqual({ screen: "trips" });
  });

  it("leaves no stack behind when tabs are switched, so one back still exits", () => {
    // Splits → Profile → Splits. The second hop unwinds rather than stacking, so from the splits
    // list there is nowhere left to go and the app closes — which is what Android expects at home.
    let nav = initialNav();
    nav = navigate(nav, { screen: "profile" });
    nav = navigate(nav, { screen: "trips" });
    expect(nav.stack).toEqual([]);
    expect(back(nav)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/history.test.ts`
Expected: FAIL on the profile case — `isHome` does not yet know about it, and the type does not allow `"profile"` until Task 4 landed (it did).

- [ ] **Step 3: Write minimal implementation**

Replace `isHome` in `src/lib/history.ts`:

```ts
/**
 * The splits list is home: from anywhere else — including the profile tab — back should reach it
 * rather than exiting. Only from home itself does back mean "close the app".
 */
export function isHome(view: View): boolean {
  return view.screen === "trips";
}
```

No change is needed for the third test: `navigate()` already unwinds to a view already in the stack. The test exists to pin that behaviour, because tab bars are exactly where it would otherwise regress.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/history.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/history.ts src/lib/history.test.ts
git commit -m "test: pin that switching tabs leaves no back stack"
```

---

### Task 6: The who's-in step

**Files:**
- Create: `src/screens/WhosInScreen.tsx`
- Create: `src/screens/whosIn.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/screens/whosIn.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WhosInScreen } from "./WhosInScreen";

const props = {
  people: ["You"],
  suggestions: ["Maria", "João"],
  onAdd: vi.fn(),
  onDone: vi.fn(),
};

describe("who's in", () => {
  it("shows who is already here", () => {
    render(<WhosInScreen {...props} />);
    expect(screen.getByText("You")).toBeTruthy();
  });

  it("offers last time's people as one tap each", async () => {
    const onAdd = vi.fn();
    render(<WhosInScreen {...props} onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /add maria/i }));
    expect(onAdd).toHaveBeenCalledWith("Maria");
  });

  it("takes a typed name", async () => {
    const onAdd = vi.fn();
    render(<WhosInScreen {...props} onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText(/add someone/i), "Rui{Enter}");
    expect(onAdd).toHaveBeenCalledWith("Rui");
  });

  it("ignores an empty or blank name rather than adding a nameless person", async () => {
    const onAdd = vi.fn();
    render(<WhosInScreen {...props} onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText(/add someone/i), "   {Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("shows no suggestion row at all when there is nothing to suggest", () => {
    render(<WhosInScreen {...props} suggestions={[]} />);
    expect(screen.queryByText(/last time/i)).toBeNull();
  });

  it("can always be finished — splitting with nobody yet is allowed", async () => {
    const onDone = vi.fn();
    render(<WhosInScreen {...props} onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/screens/whosIn.test.tsx`
Expected: FAIL — "Failed to resolve import ./WhosInScreen"

- [ ] **Step 3: Write minimal implementation**

Create `src/screens/WhosInScreen.tsx`:

```tsx
import { useState } from "react";
import { Footerbar } from "../components/Footerbar";

/**
 * The one step between a quick scan landing and reviewing it.
 *
 * It exists because the assign screen has no way to add anybody — people are added on the split
 * screen, which quick scan never passes through. Without this, a quick-scanned split would be stuck
 * with the "You" it was created with.
 *
 * Presentational on purpose: it is handed names and hands back names, so the whole of it can be
 * tested without a store, a scan, or a camera.
 */
export function WhosInScreen({
  people,
  suggestions,
  onAdd,
  onDone,
}: {
  people: string[];
  suggestions: string[];
  onAdd: (name: string) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
  }

  return (
    <div>
      <div className="topbar">
        <h1 className="screen-title">Who's in?</h1>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: "var(--s2)" }}>
          {people.map((p) => (
            <span key={p} className="chip selected">{p}</span>
          ))}
        </div>

        {/* Only when there is something to say. An empty row of chips under a heading reads as
            something failing to load. */}
        {suggestions.length > 0 && (
          <>
            <p className="micro" style={{ marginTop: "var(--s4)" }}>From last time</p>
            <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: "var(--s2)" }}>
              {suggestions.map((s) => (
                <button key={s} className="chip" aria-label={`Add ${s}`} onClick={() => onAdd(s)}>
                  ＋ {s}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="micro" htmlFor="whosin" style={{ display: "block", marginTop: "var(--s4)" }}>
          Add someone
        </label>
        <input
          id="whosin"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
      </div>

      {/* Never blocked on adding anybody. Someone who wants to look at the items first, or who is
          splitting with people they will name later, must not be held on this screen. */}
      <Footerbar>
        <button className="btn btn-primary" style={{ width: "100%" }} onClick={onDone}>
          Done
        </button>
      </Footerbar>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/screens/whosIn.test.tsx`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/screens/WhosInScreen.tsx src/screens/whosIn.test.tsx
git commit -m "feat: one step to say who is in, before the items"
```

---

### Task 7: Quick scan in the router

**Files:**
- Modify: `src/App.tsx`
- Test: `src/screens/quickScan.test.tsx` (create)

This is the task that matters. The rule it exists to hold: **nothing is created unless a scan succeeds.**

- [ ] **Step 1: Write the failing test**

Create `src/screens/quickScan.test.tsx`. Follow the mocking pattern already used in `src/screens/scan-flow.test.tsx` — read that file first and copy how it stubs `../lib/scan` and `../lib/image`, including the `vi.resetModules()` ordering inside `renderApp` (the stub must be installed *between* the reset and the dynamic `import("../App")`, or the spies are discarded).

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const scanReceipt = vi.fn();

async function renderApp() {
  vi.resetModules();
  vi.doMock("../lib/image", () => ({ downscaleToBase64Jpeg: async () => "base64" }));
  vi.doMock("../lib/scan", async () => {
    const actual = await vi.importActual<typeof import("../lib/scan")>("../lib/scan");
    return { ...actual, scanReceipt, usingProxy: () => true, fetchQuota: async () => null };
  });
  const { default: App } = await import("../App");
  return render(<App />);
}

const photo = () => new File(["x"], "receipt.jpg", { type: "image/jpeg" });

const goodScan = {
  storeName: "Tasca do Bairro",
  date: "2026-08-14",
  paidTotal: 2400,
  items: [{ name: "Bacalhau", quantity: 1, lineTotal: 2400, kind: "item" as const }],
};

beforeEach(() => {
  localStorage.clear();
  scanReceipt.mockReset();
});

describe("quick scan", () => {
  it("creates exactly one split, named after the shop", async () => {
    scanReceipt.mockResolvedValue(goodScan);
    await renderApp();
    await userEvent.click(screen.getByRole("tab", { name: /scan/i }));
    await userEvent.upload(screen.getByLabelText(/take a photo|choose a photo/i), photo());
    await waitFor(() => expect(screen.getByText(/who's in/i)).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: /done/i }));
    await userEvent.click(screen.getByRole("tab", { name: /splits/i }));
    expect(screen.getAllByText("Tasca do Bairro")).toHaveLength(1);
  });

  it.each([
    ["a network failure", "network"],
    ["an unreadable photo", "unparseable"],
    ["a refusal", "refused"],
    ["a busy proxy", "busy"],
  ])("creates nothing after %s", async (_label, reason) => {
    const { ScanError } = await import("../lib/scan");
    scanReceipt.mockRejectedValue(new ScanError(reason as never, "nope"));
    await renderApp();
    await userEvent.click(screen.getByRole("tab", { name: /scan/i }));
    await userEvent.upload(screen.getByLabelText(/take a photo|choose a photo/i), photo());

    await waitFor(() => expect(screen.getByText(/nope|couldn't/i)).toBeTruthy());
    await userEvent.click(screen.getByRole("tab", { name: /splits/i }));
    expect(screen.getByText(/no splits yet/i)).toBeTruthy();
  });

  it("creates nothing when the scans have run out, and shows the paywall", async () => {
    const { ScanError } = await import("../lib/scan");
    scanReceipt.mockRejectedValue(new ScanError("out-of-scans", "none left"));
    await renderApp();
    await userEvent.click(screen.getByRole("tab", { name: /scan/i }));
    await userEvent.upload(screen.getByLabelText(/take a photo|choose a photo/i), photo());

    await waitFor(() => expect(screen.getByText(/free scan|get more scans|out of scans/i)).toBeTruthy());
    // No trip to go back to, so that button must not be offered.
    expect(screen.queryByRole("button", { name: /back to split/i })).toBeNull();
  });

  it("makes the person holding the receipt the payer", async () => {
    scanReceipt.mockResolvedValue(goodScan);
    await renderApp();
    await userEvent.click(screen.getByRole("tab", { name: /scan/i }));
    await userEvent.upload(screen.getByLabelText(/take a photo|choose a photo/i), photo());
    await waitFor(() => expect(screen.getByText("You")).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/screens/quickScan.test.tsx`
Expected: FAIL — there is no Scan tab yet.

- [ ] **Step 3: Write minimal implementation**

In `src/App.tsx`:

1. Change the `View` union — add `{ screen: "whosin"; tripId: string }` and make the paywall's trip optional:

```tsx
export type View =
  | { screen: "trips" }
  | { screen: "trip"; tripId: string }
  | { screen: "receipt"; tripId: string; receiptId: string }
  | { screen: "settle"; tripId: string }
  | { screen: "whosin"; tripId: string }
  /* Optional, because quick scan can hit the wall with no split to go back to — the scan is
     refused before anything has been created, which is the whole point of creating nothing until
     it succeeds. */
  | { screen: "paywall"; tripId?: string }
  | { screen: "profile" }
  | { screen: "help" };
```

2. Add the quick-scan flow to `Router`. It mirrors `handlePhoto` in `TripScreen.tsx:112-189` — read that function and keep the two in step; the only differences are that this one creates the split first and names it, and that on failure it must leave nothing behind.

```tsx
  const [scanState, setScanState] = useState<"idle" | "picking" | "busy" | "error">("idle");
  const [scanFailure, setScanFailure] = useState<ScanFailure | null>(null);
  const [scanMessage, setScanMessage] = useState("");

  async function quickScan(file: File) {
    const apiKey = loadApiKey();
    if (!apiKey && !usingProxy()) {
      setScanState("idle");
      setView({ screen: "profile" });
      return;
    }
    setScanState("busy");
    try {
      const base64 = await downscaleToBase64Jpeg(file).catch(() => {
        throw new ScanError("unparseable", "Couldn't read that photo — try a different one.");
      });
      const result = await scanReceipt(apiKey, base64);

      // Everything above this line can fail, and until it has all succeeded nothing exists. An app
      // that leaves an empty "Tasca do Bairro" behind every time the network drops is an app people
      // delete.
      const tripId = newId();
      const personId = newId();
      const date = result.date ?? new Date().toISOString().slice(0, 10);
      dispatch({ type: "createTrip", id: tripId, name: splitNameFor(result.storeName, date), emoji: "🧾" });
      // Somebody photographing a receipt is holding it because they paid for it. This also gives
      // the receipt the payer it requires, which a brand-new split has nobody to provide.
      dispatch({ type: "addPerson", tripId, personId, name: "You" });

      const convention = discountConvention(scanTotals(result));
      const informational = !countsDiscountLines(convention);
      dispatch({
        type: "addReceipt",
        tripId,
        receipt: {
          id: newId(),
          storeName: result.storeName,
          date,
          payments: [{ personId, amount: Math.round(result.paidTotal) }],
          items: result.items.map((i) => ({
            id: newId(),
            name: i.name,
            quantity: Math.max(1, Math.round(i.quantity)),
            lineTotal: Math.round(i.lineTotal),
            assignment: { kind: "unassigned" as const },
            ...(i.kind === "discount" ? { discountLine: true } : {}),
            ...(i.kind === "discount" && informational ? { informational: true } : {}),
          })),
          printedTotal: Math.round(result.paidTotal),
          status: "review",
          discountConvention: convention,
        },
      });
      setScanState("idle");
      setView({ screen: "whosin", tripId });
    } catch (err) {
      if (err instanceof ScanError && err.reason === "out-of-scans") {
        setScanState("idle");
        setView({ screen: "paywall" });
        return;
      }
      setScanState("error");
      setScanFailure(err instanceof ScanError ? err.reason : null);
      setScanMessage(err instanceof ScanError ? err.message : "Something went wrong reading the photo.");
    }
  }
```

3. Render the picker, progress and failure screens ahead of `screen()`, and the tab bar after it. Reuse the same photo-picker component `TripScreen` uses for its condensed camera/gallery control.

```tsx
  const root = view.screen === "trips" || view.screen === "profile";

  return (
    <>
      {screen()}
      {view.screen !== "paywall" && <PendingOffer />}
      {root && (
        <TabBar
          current={view.screen === "profile" ? "profile" : "splits"}
          onSplits={() => setView({ screen: "trips" })}
          onScan={() => setScanState("picking")}
          onProfile={() => setView({ screen: "profile" })}
        />
      )}
    </>
  );
```

4. Wire `whosin` into `screen()`:

```tsx
    if (view.screen === "whosin") {
      return (
        <WhosInScreen
          people={trip.people.map((p) => p.name)}
          suggestions={recentPeopleNames(data.trips, trip.id)}
          onAdd={(name) => dispatch({ type: "addPerson", tripId: trip.id, personId: newId(), name })}
          onDone={() => {
            const receipt = trip.receipts[trip.receipts.length - 1];
            setView(receipt ? { screen: "receipt", tripId: trip.id, receiptId: receipt.id } : { screen: "trip", tripId: trip.id });
          }}
        />
      );
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/screens/quickScan.test.tsx`
Expected: PASS, 7 tests (4 from the `it.each`)

- [ ] **Step 5: Run the whole suite**

Run: `npm run typecheck && npm test -- --run`
Expected: PASS. `paywall.tripId` becoming optional will surface anywhere it was assumed present — fix those by guarding rather than by asserting non-null.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scan a receipt with no split to put it in"
```

---

### Task 8: The splits list loses its FAB

**Files:**
- Modify: `src/screens/TripListScreen.tsx`
- Test: `src/screens/trips.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/screens/trips.test.tsx`, replace any assertion about the round button with:

```tsx
it("starts a split from the header, not a floating button — the bar owns the bottom now", () => {
  render(<TripListScreen go={() => {}} />);
  expect(screen.queryByRole("button", { name: /new trip/i })).toBeNull();
  expect(screen.getByRole("button", { name: /new split/i })).toBeTruthy();
});

it("calls a split a split", () => {
  render(<TripListScreen go={() => {}} />);
  expect(screen.getByText(/no splits yet/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/screens/trips.test.tsx`
Expected: FAIL — the FAB is still there and the copy still says "trip"

- [ ] **Step 3: Write minimal implementation**

In `src/screens/TripListScreen.tsx`:

- Delete the `Fab` import and the whole `{!adding && <Fab …/>}` block at the end.
- Replace the ⚙️ button in the topbar with the add button:

```tsx
        <button
          className="btn btn-ghost"
          aria-label="New split"
          onClick={() => {
            setAdding(true);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          ＋
        </button>
```

- Change the copy: `New trip` → `New split`, the `Trip name` placeholder → `Split name`, `Create trip` → `Create split`, `Close the new trip form` → `Close the new split form`, and the empty state to `No splits yet — tap ＋ to start one.`
- Add `🧾` to the front of `EMOJIS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/screens/trips.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: the bar owns the bottom, so the round button goes"
```

---

### Task 9: The copy sweep

**Files:**
- Modify: every screen with user-visible "trip"
- Test: `src/copy.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/copy.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripListScreen } from "./screens/TripListScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { HelpScreen } from "./screens/HelpScreen";

/**
 * The rename is spread across enough files that a human will miss one.
 *
 * Matched on rendered text rather than source, so `tripId` and the `Trip` type — which deliberately
 * keep their names, because renaming them would change the shape of saved data — do not trip it.
 * Whole words only, so nothing legitimate is caught.
 */
const TRIP = /\btrips?\b/i;

describe("nothing a user reads says trip", () => {
  it.each([
    ["splits list", <TripListScreen go={() => {}} />],
    ["profile", <ProfileScreen go={() => {}} />],
    ["help", <HelpScreen go={() => {}} />],
  ])("%s", (_name, element) => {
    const { container } = render(element);
    const offenders = (container.textContent ?? "").split(/\s+/).filter((w) => TRIP.test(w));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/copy.test.tsx`
Expected: FAIL, listing the words still saying "trip"

- [ ] **Step 3: Fix every one**

Run: `npx rg -n --glob 'src/**/*.tsx' '\btrips?\b' -i` and change every string a user can read. Leave `tripId`, the `Trip` type, `createTrip`, `importTrip`, `exportTrip` and every `data.trips` alone.

Known sites: `ProfileScreen` ("Export each trip", "No trips to export", "Import trip", "isn't a Billy trip export"), `HelpScreen` ("Your trips, who is on them"), `SettleScreen` ("back to trip"), `TripScreen` ("Delete trip"), `ScanFailedScreen`.

Add the comment that explains the split at the top of `src/types.ts`:

```ts
/**
 * A note on names. The UI calls these SPLITS; the code calls them TRIPS.
 *
 * Not an oversight. `Trip`, `trips` and `tripId` appear in the JSON on every existing user's phone,
 * so renaming them means a migration — real risk, for a benefit no user can see. The words on
 * screen were the whole point of the rename, and those have changed. See
 * docs/superpowers/specs/2026-08-14-splits-scan-profile-design.md.
 */
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/copy.test.tsx && npm test -- --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: the words users read say split"
```

---

### Task 10: Check it on a real screen

**Files:** none — this is verification.

- [ ] **Step 1: Start the preview**

Use `preview_start` with the project's dev server, then navigate to it.

- [ ] **Step 2: Check the bar reserves its own space**

On the splits list, scroll to the bottom. The last split card must be fully visible above the bar. Run in the console:

```js
getComputedStyle(document.documentElement).getPropertyValue('--footer-h')
```

Expected: a pixel value matching the bar's height, and exactly one element with class `tabbar` or `footerbar` in the DOM on any screen:

```js
document.querySelectorAll('.tabbar, .footerbar').length
```

Expected: `1` on every screen, `0` on none.

- [ ] **Step 3: Check the bar is absent where it should be**

Open a split, then a receipt, then the settle screen. `.tabbar` must not be present on any of them.

- [ ] **Step 4: Check contrast**

The unselected tab label against the bar's background must reach 4.5:1. Measure it rather than trusting it — every contrast failure in this project so far was found this way and none were found by reading the code.

- [ ] **Step 5: Screenshot and commit**

```bash
git add -A
git commit -m "docs: verified the tab bar on a real screen"
```

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Three tabs, Scan never selected | 3 |
| Tab bar on roots only, one `--footer-h` publisher | 3, 7, 10 |
| Quick scan flow | 7 |
| Split named from the receipt | 1, 7 |
| Created with "You" as payer | 7 |
| Who's in, with recent-people chips | 2, 6, 7 |
| Nothing created until a scan succeeds | 7 (a case per failure mode) |
| Paywall without a trip | 7 |
| Profile tab | 4 |
| `isHome`, back from Profile, tab switching leaves no stack | 5 |
| Rename, words only | 8, 9 |
| `Fab.tsx` left in place, unrendered | 8 |

**Naming consistency:** `splitNameFor` and `recentPeopleNames` are defined in Tasks 1–2 and used under those names in Task 7. `TabName` is `"splits" | "profile"` in Task 3 and passed as such in Task 7. `View`'s `profile` arrives in Task 4 and is relied on in 5 and 7 — Task 5's test will not compile before Task 4 lands, which is why they are in this order.

**Known gap, deliberate:** `AssignScreen` still cannot add people. The who's-in step covers the quick-scan route, and the ordinary route goes through `TripScreen`, which can. Adding a second place to add people is out of scope for this plan.
