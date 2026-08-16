import { useCallback, useEffect, useRef, useState } from "react";
import { StoreProvider, useStore } from "./state/StoreProvider";
import { TripListScreen } from "./screens/TripListScreen";
import { TripScreen } from "./screens/TripScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { AssignScreen } from "./screens/AssignScreen";
import { SettleScreen } from "./screens/SettleScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { PaywallScreen } from "./screens/PaywallScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { HelpScreen } from "./screens/HelpScreen";
import { WhosInScreen } from "./screens/WhosInScreen";
import { ScanProgressScreen } from "./screens/ScanProgressScreen";
import { ScanFailedScreen } from "./screens/ScanFailedScreen";
import { PackOfferSheet } from "./components/PackOfferSheet";
import { PhotoPicker } from "./components/PhotoPicker";
import { Footerbar } from "./components/Footerbar";
import { TabBar } from "./components/TabBar";
import { hasOnboarded } from "./lib/onboarding";
import { clearOffer, decline, usePendingOffer } from "./lib/promo";
import {
  fetchQuota,
  lastKnownQuota,
  scanReceipt,
  scanTotals,
  ScanError,
  usingProxy,
  type ScanFailure,
  type ScanQuota,
} from "./lib/scan";
import { countsDiscountLines, discountConvention } from "./lib/discounts";
import { downscaleToBase64Jpeg } from "./lib/image";
import { recentPeopleNames, splitNameFor } from "./lib/quickScan";
import { loadApiKey } from "./lib/storage";
import { newId } from "./lib/ids";
import { back, initialNav, navigate } from "./lib/history";
import { exitApp, onHardwareBack } from "./lib/nativeBack";
import { runBackIntercept } from "./lib/backIntercept";
import type { Receipt } from "./types";

export type View =
  | { screen: "trips" }
  | { screen: "trip"; tripId: string }
  | { screen: "receipt"; tripId: string; receiptId: string }
  | { screen: "settle"; tripId: string }
  | { screen: "whosin"; tripId: string }
  /* Optional, because a quick scan can hit the wall with no split to go back to: the scan is
     refused before anything has been created, which is exactly the point of creating nothing
     until it succeeds. */
  | { screen: "paywall"; tripId?: string }
  | { screen: "profile" }
  | { screen: "help" };

/** Where the quick scan has got to. `picking` is the camera/gallery screen the Scan tab opens. */
type ScanState = "idle" | "picking" | "busy" | "error";

/**
 * The offer sheet, wherever the person happens to be standing.
 *
 * Rendered by the router rather than by a screen because the two are not the same: the scan
 * finishes on the trip screen and the person is sent straight to their new receipt, which is where
 * the sheet should appear. Anything owned by a screen would unmount on the way.
 */
function PendingOffer() {
  const about = usePendingOffer();
  if (about === null) return null;
  return (
    <PackOfferSheet
      title="That was your last free scan"
      /* One line, not four. The full explanation of why reading a photo costs money lives on the
         paywall screen, where there is room for it and where somebody has gone looking. Here it
         pushed the way out below the fold, and an offer whose decline you have to scroll for is
         the trick this sheet was designed not to be. */
      blurb="Everything else stays free — only reading the photo costs anything."
      onClose={() => {
        // Recorded against this receipt, so it will not reappear on this one — and will on the
        // next time they run low. A no that is forgotten immediately is nagging; a no that is
        // remembered forever loses a customer who was only busy.
        decline("last-scan", about);
        clearOffer();
      }}
      onBought={() => {
        void fetchQuota();
        clearOffer();
      }}
    />
  );
}

function Router() {
  const [nav, setNav] = useState(() => initialNav());
  const view = nav.current;
  const setView = useCallback((next: View) => setNav((n) => navigate(n, next)), []);
  // Only ever for someone with nothing yet: an existing user who has cleared their trips has
  // still been introduced, and a returning user must never be taught the app twice.
  const { data, dispatch } = useStore();
  const [showIntro, setShowIntro] = useState(() => !hasOnboarded() && data.trips.length === 0);

  // The quick scan: the Scan tab opens the camera with no split behind it, and one is made only
  // once a receipt has actually been read. Orchestrated here rather than in a screen because at
  // the moment the shutter goes there is no screen that owns it.
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanFailure, setScanFailure] = useState<ScanFailure | null>(null);
  const [scanMessage, setScanMessage] = useState("");

  /**
   * How many scans are left, asked for once on launch.
   *
   * It has to live here rather than be read from `lastKnownQuota()` at render time, for two
   * reasons. The module variable is only populated by whoever last called `fetchQuota`, so until
   * this existed the badge and the button's chip were both blank on a fresh launch and only
   * appeared once you happened to open a split — the two surfaces the design puts the number on
   * were the two that never had it. And a module variable changing does not re-render React, so
   * the count would then be stale until something else moved.
   */
  const [quota, setQuota] = useState<ScanQuota | null>(lastKnownQuota());
  const refreshQuota = useCallback(() => {
    if (!usingProxy()) return;
    void fetchQuota().then((q) => q && setQuota(q));
  }, []);
  useEffect(refreshQuota, [refreshQuota]);
  const lastPhoto = useRef<File | null>(null);
  // Set when the wait is cancelled or backed out of: the scan carries on and its result is still
  // kept, but the person is not dragged onto a screen they walked away from.
  const abandoned = useRef(false);
  // The back handler is installed once and would otherwise close over the first scanState forever.
  const scanRef = useRef<ScanState>("idle");
  useEffect(() => {
    scanRef.current = scanState;
  }, [scanState]);

  // Android's hardware back button. Without this it closes the app from any screen, which is
  // both wrong and something Play reviewers look for. On the web this does nothing at all.
  useEffect(
    () =>
      onHardwareBack(() => {
        // A screen can be in a state that back should leave first — a selection of items on the
        // assign screen. Only if nobody wants it does back mean "go back".
        if (runBackIntercept()) return;
        // Mid-scan, back means "stop this", not "leave the screen underneath it" — which the
        // person cannot even see. The request is left to finish; only the arrival is called off.
        if (scanRef.current !== "idle") {
          abandoned.current = true;
          setScanState("idle");
          return;
        }
        setNav((n) => {
          const previous = back(n);
          if (previous) {
            return previous;
          }
          void exitApp();
          return n;
        });
      }),
    []
  );

  if (showIntro) return <OnboardingScreen onDone={() => setShowIntro(false)} />;

  /**
   * A photograph, with no split to put it in.
   *
   * The one rule this function exists to hold: **nothing is created unless the scan succeeded.**
   * Every `dispatch` below sits after the `await scanReceipt` line, and must stay there. Creating
   * the split first so there is somewhere to put the receipt is the obvious shape and the wrong
   * one — it leaves an empty "Tasca do Bairro" on the home screen every time the signal drops, on
   * every unreadable photo, on every refusal and every time the scans have run out.
   *
   * It otherwise mirrors `handlePhoto` in TripScreen.tsx; keep the two in step.
   */
  /**
   * A split typed in by hand, with nothing to scan.
   *
   * The same shape as a quick scan minus the photograph: a split, a "You" to pay for it, and an
   * empty receipt to fill in. It matters most in the state where scanning is impossible — out of
   * scans, or a photo that will not read — because until now the scan screen offered no way out of
   * either except going back. Typing a receipt in has never had a limit and never will.
   */
  function quickManual() {
    const tripId = newId();
    const personId = newId();
    const today = new Date().toISOString().slice(0, 10);
    dispatch({ type: "createTrip", id: tripId, name: splitNameFor("", today), emoji: "🧾" });
    dispatch({ type: "addPerson", tripId, personId, name: "You" });
    dispatch({
      type: "addReceipt",
      tripId,
      receipt: {
        id: newId(),
        storeName: "",
        date: today,
        payments: [{ personId, amount: 0 }],
        items: [],
        printedTotal: 0,
        status: "review",
        totalIsAuto: true, // nothing was printed, so the items are the total
      },
    });
    setScanState("idle");
    setView({ screen: "whosin", tripId });
  }

  async function quickScan(file: File) {
    lastPhoto.current = file;
    const apiKey = loadApiKey();
    // Only the user's-own-key path needs a key. With a proxy configured, sending someone to
    // Settings would reinstate the exact wall the proxy exists to remove.
    if (!apiKey && !usingProxy()) {
      setScanState("idle");
      setView({ screen: "profile" });
      return;
    }
    abandoned.current = false;
    setScanState("busy");
    try {
      const base64 = await downscaleToBase64Jpeg(file).catch(() => {
        throw new ScanError(
          "unparseable",
          "Couldn't read that photo format — try a JPEG (on iPhone: Settings → Camera → Formats → 'Most Compatible'), or pick a different photo."
        );
      });
      const result = await scanReceipt(apiKey, base64);

      // ——— Everything above can fail, and until all of it has succeeded nothing exists. ———

      const tripId = newId();
      const personId = newId();
      const date = result.date ?? new Date().toISOString().slice(0, 10);
      // Work out from the receipt's own arithmetic whether its discounts are separate lines or
      // already inside the item prices; only in the latter case must they be left out of the
      // maths, or the same discount is subtracted twice.
      const convention = discountConvention(scanTotals(result));
      const discountsAreInformational = !countsDiscountLines(convention);
      const receipt: Receipt = {
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
          ...(i.kind === "discount" && discountsAreInformational ? { informational: true } : {}),
        })),
        printedTotal: Math.round(result.paidTotal),
        status: "review",
        discountConvention: convention,
      };

      dispatch({
        type: "createTrip",
        id: tripId,
        name: splitNameFor(result.storeName, date),
        emoji: "🧾",
      });
      // Somebody photographing a receipt is holding it because they paid for it. This also gives
      // the receipt the payer it requires, which a brand-new split has nobody else to provide.
      dispatch({ type: "addPerson", tripId, personId, name: "You" });
      dispatch({ type: "addReceipt", tripId, receipt });

      setScanState("idle");
      // They asked to stop waiting, so the split is kept and listed — the scan was paid for and
      // did work — but they are not dragged into it.
      if (abandoned.current) return;
      setView({ screen: "whosin", tripId });
    } catch (err) {
      if (err instanceof ScanError && err.reason === "out-of-scans") {
        // No tripId: nothing was created, so there is no split to offer as a way back.
        setScanState("idle");
        setView({ screen: "paywall" });
        return;
      }
      // Someone who walked away from the wait should not be hauled back to be told it failed.
      if (abandoned.current) {
        setScanState("idle");
        return;
      }
      setScanState("error");
      setScanFailure(err instanceof ScanError ? err.reason : null);
      setScanMessage(
        err instanceof ScanError ? err.message : "Something went wrong reading the photo."
      );
    }
  }

  /**
   * The way out of a failed scan: a split to type the receipt into by hand.
   *
   * This creates without a scan, deliberately and only ever on an explicit tap — it is the
   * offer the failure screen makes, and the free path the whole app is built around. It is not
   * the automatic creation the rule above forbids.
   */
  function startByHandSplit() {
    const tripId = newId();
    const personId = newId();
    const today = new Date().toISOString().slice(0, 10);
    const receipt: Receipt = {
      id: newId(),
      storeName: "",
      date: today,
      payments: [{ personId, amount: 0 }],
      items: [],
      printedTotal: 0,
      status: "review",
      totalIsAuto: true, // nothing was printed, so the items are the total
    };
    dispatch({ type: "createTrip", id: tripId, name: splitNameFor("", today), emoji: "🧾" });
    dispatch({ type: "addPerson", tripId, personId, name: "You" });
    dispatch({ type: "addReceipt", tripId, receipt });
    setScanState("idle");
    setView({ screen: "receipt", tripId, receiptId: receipt.id });
  }

  /** Which screen the current view means. Kept as a function so the sheet can sit beside it. */
  function screen() {
    if (view.screen === "trips") return <TripListScreen go={setView} />;
    if (view.screen === "profile") return <ProfileScreen go={setView} />;
    if (view.screen === "help") return <HelpScreen go={setView} />;
    // Ahead of the trip lookup, because this is the one screen that can be reached with no split
    // at all — and the lookup's "trip was deleted" fallback would send it to the list instead.
    if (view.screen === "paywall") {
      const still = view.tripId && data.trips.some((t) => t.id === view.tripId);
      return (
        <PaywallScreen
          tripId={still ? view.tripId : undefined}
          quota={quota}
          go={setView}
        />
      );
    }

    const trip = data.trips.find((t) => t.id === view.tripId);
    if (!trip) return <TripListScreen go={setView} />; // trip was deleted

    if (view.screen === "trip") return <TripScreen tripId={trip.id} go={setView} />;
    if (view.screen === "settle") return <SettleScreen tripId={trip.id} go={setView} />;
    if (view.screen === "whosin") {
      return (
        <WhosInScreen
          people={trip.people.map((p) => p.name)}
          suggestions={recentPeopleNames(data.trips, trip.id)}
          onAdd={(name) => dispatch({ type: "addPerson", tripId: trip.id, personId: newId(), name })}
          onDone={() => {
            const receipt = trip.receipts[trip.receipts.length - 1];
            setView(
              receipt
                ? { screen: "receipt", tripId: trip.id, receiptId: receipt.id }
                : { screen: "trip", tripId: trip.id }
            );
          }}
        />
      );
    }

    const receipt = trip.receipts.find((r) => r.id === view.receiptId);
    if (!receipt) return <TripScreen tripId={trip.id} go={setView} />;
    return receipt.status === "review" ? (
      <ReviewScreen tripId={trip.id} receiptId={receipt.id} go={setView} />
    ) : (
      <AssignScreen tripId={trip.id} receiptId={receipt.id} go={setView} />
    );
  }

  /**
   * A quick scan takes over the whole window while it is happening, exactly as it does on the trip
   * screen. Each of these three states carries its own way out — a scan that has gone wrong must
   * never be a screen somebody is stuck on.
   */
  function body() {
    if (scanState === "busy") {
      return (
        <ScanProgressScreen
          onCancel={() => {
            abandoned.current = true;
            setScanState("idle");
          }}
        />
      );
    }
    if (scanState === "error") {
      return (
        <ScanFailedScreen
          reason={scanFailure}
          message={scanMessage}
          canRetry={lastPhoto.current !== null}
          onRetry={() => {
            const photo = lastPhoto.current;
            setScanState("idle");
            if (photo) void quickScan(photo);
          }}
          onAddByHand={startByHandSplit}
          onSettings={() => {
            setScanState("idle");
            setView({ screen: "profile" });
          }}
          onBack={() => setScanState("idle")}
        />
      );
    }
    if (scanState === "picking") {
      const empty = quota?.left === 0;
      return (
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
          <div className="topbar">
            <button className="btn btn-ghost" aria-label="Back" onClick={() => setScanState("idle")}>←</button>
            <h1 className="screen-title">Scan a receipt</h1>
          </div>

          {/* The object the screen is about, in the middle of it. This used to be a paragraph at
              the top, a bottom full of buttons, and nothing in between — which read as a form
              rather than as the one moment where the app does something impressive. */}
          <div className="scan-stage">
            <div className="viewfinder">
              <div className={`viewfinder-paper${empty ? " viewfinder-paper-empty" : ""}`}>
                {empty ? (
                  <>
                    <span style={{ fontSize: 26, opacity: 0.6 }} aria-hidden="true">🎟</span>
                    <p style={{ margin: 0, fontFamily: "var(--brand)", fontWeight: 700, fontSize: "12.5px" }}>
                      Out of scans
                    </p>
                  </>
                ) : (
                  <>
                    <span className="viewfinder-line viewfinder-line-head" style={{ width: "58%" }} />
                    <span className="viewfinder-line" style={{ width: "34%", marginBottom: 4 }} />
                    {["88%", "74%", "84%", "56%", "80%", "68%"].map((w, i) => (
                      <span key={i} className="viewfinder-line" style={{ width: w }} />
                    ))}
                    <span
                      className="viewfinder-line viewfinder-line-head"
                      style={{ width: "44%", marginTop: "auto", height: 8 }}
                    />
                  </>
                )}
              </div>
              {/* Brackets, not a border: a border says "here is a box", brackets say "point this
                  at something". They stay put in the empty state too — the frame is still what
                  the screen is, even when there is nothing to aim it at. */}
              <span className="viewfinder-bracket viewfinder-tl" />
              <span className="viewfinder-bracket viewfinder-tr" />
              <span className="viewfinder-bracket viewfinder-bl" />
              <span className="viewfinder-bracket viewfinder-br" />
            </div>
            {/* Deliberately not a number of seconds. A scan takes anywhere from five to twenty
                depending on the connection and the length of the receipt, and an app that promises
                eight and takes fifteen has broken a promise it never needed to make. */}
            <p className="label" style={{ textAlign: "center", maxWidth: 216, margin: 0 }}>
              {empty
                ? "Buy a pack and the camera comes back. Adding a split by hand is always free."
                : "Fit the whole receipt in frame. Billy reads it in a few seconds."}
            </p>
          </div>

          <Footerbar>
            <PhotoPicker
              quota={quota}
              onPick={(f) => void quickScan(f)}
              onGetMore={() => {
                setScanState("idle");
                setView({ screen: "paywall" });
              }}
            />
            {/* Under the scan button rather than beside it: this is the alternative to scanning,
                not a peer of it. It is also the only way off this screen when the scans have run
                out or a photo will not read — a screen whose single action can be unavailable is a
                dead end. */}
            <button className="btn" style={{ width: "100%" }} onClick={quickManual}>
              ✍️ Add items by hand
            </button>
          </Footerbar>
        </div>
      );
    }
    return screen();
  }

  // Only the two roots get the bar. Every other screen has a Footerbar of its own, and exactly one
  // element per screen may publish `--footer-h` — see lib/useReservedBottom.ts. The scan states
  // count as other screens: each brings its own footer.
  const root = view.screen === "trips" || view.screen === "profile";

  return (
    <>
      {body()}
      {/* Never on the paywall: that screen is already the ask, and a sheet over it would be the
          same offer twice, one of them covering the other. */}
      {view.screen !== "paywall" && <PendingOffer />}
      {root && scanState === "idle" && (
        <TabBar
          current={view.screen === "profile" ? "profile" : "splits"}
          scansLeft={quota?.left ?? null}
          onSplits={() => setView({ screen: "trips" })}
          onScan={() => setScanState("picking")}
          onProfile={() => setView({ screen: "profile" })}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Router />
    </StoreProvider>
  );
}
