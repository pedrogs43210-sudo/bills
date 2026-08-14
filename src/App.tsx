import { useCallback, useEffect, useState } from "react";
import { StoreProvider, useStore } from "./state/StoreProvider";
import { TripListScreen } from "./screens/TripListScreen";
import { TripScreen } from "./screens/TripScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { AssignScreen } from "./screens/AssignScreen";
import { SettleScreen } from "./screens/SettleScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { PaywallScreen } from "./screens/PaywallScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { HelpScreen } from "./screens/HelpScreen";
import { PackOfferSheet } from "./components/PackOfferSheet";
import { hasOnboarded } from "./lib/onboarding";
import { clearOffer, decline, usePendingOffer } from "./lib/promo";
import { fetchQuota, lastKnownQuota } from "./lib/scan";
import { back, initialNav, navigate } from "./lib/history";
import { exitApp, onHardwareBack } from "./lib/nativeBack";
import { runBackIntercept } from "./lib/backIntercept";

export type View =
  | { screen: "trips" }
  | { screen: "trip"; tripId: string }
  | { screen: "receipt"; tripId: string; receiptId: string }
  | { screen: "settle"; tripId: string }
  | { screen: "paywall"; tripId: string }
  | { screen: "settings" }
  | { screen: "help" };

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
  const { data } = useStore();
  const [showIntro, setShowIntro] = useState(() => !hasOnboarded() && data.trips.length === 0);

  // Android's hardware back button. Without this it closes the app from any screen, which is
  // both wrong and something Play reviewers look for. On the web this does nothing at all.
  useEffect(
    () =>
      onHardwareBack(() => {
        // A screen can be in a state that back should leave first — a selection of items on the
        // assign screen. Only if nobody wants it does back mean "go back".
        if (runBackIntercept()) return;
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

  /** Which screen the current view means. Kept as a function so the sheet can sit beside it. */
  function screen() {
    if (view.screen === "trips") return <TripListScreen go={setView} />;
    if (view.screen === "settings") return <SettingsScreen go={setView} />;
    if (view.screen === "help") return <HelpScreen go={setView} />;

    const trip = data.trips.find((t) => t.id === view.tripId);
    if (!trip) return <TripListScreen go={setView} />; // trip was deleted

    if (view.screen === "trip") return <TripScreen tripId={trip.id} go={setView} />;
    if (view.screen === "settle") return <SettleScreen tripId={trip.id} go={setView} />;
    if (view.screen === "paywall")
      return <PaywallScreen tripId={trip.id} quota={lastKnownQuota()} go={setView} />;

    const receipt = trip.receipts.find((r) => r.id === view.receiptId);
    if (!receipt) return <TripScreen tripId={trip.id} go={setView} />;
    return receipt.status === "review" ? (
      <ReviewScreen tripId={trip.id} receiptId={receipt.id} go={setView} />
    ) : (
      <AssignScreen tripId={trip.id} receiptId={receipt.id} go={setView} />
    );
  }

  return (
    <>
      {screen()}
      {/* Never on the paywall: that screen is already the ask, and a sheet over it would be the
          same offer twice, one of them covering the other. */}
      {view.screen !== "paywall" && <PendingOffer />}
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
