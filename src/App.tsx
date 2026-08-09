import { useState } from "react";
import { StoreProvider, useStore } from "./state/StoreProvider";
import { TripListScreen } from "./screens/TripListScreen";
import { TripScreen } from "./screens/TripScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { AssignScreen } from "./screens/AssignScreen";
import { SettleScreen } from "./screens/SettleScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { PaywallScreen } from "./screens/PaywallScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { hasOnboarded } from "./lib/onboarding";
import { lastKnownQuota } from "./lib/scan";

export type View =
  | { screen: "trips" }
  | { screen: "trip"; tripId: string }
  | { screen: "receipt"; tripId: string; receiptId: string }
  | { screen: "settle"; tripId: string }
  | { screen: "paywall"; tripId: string }
  | { screen: "settings" };

function Router() {
  const [view, setView] = useState<View>({ screen: "trips" });
  // Only ever for someone with nothing yet: an existing user who has cleared their trips has
  // still been introduced, and a returning user must never be taught the app twice.
  const { data } = useStore();
  const [showIntro, setShowIntro] = useState(() => !hasOnboarded() && data.trips.length === 0);

  if (showIntro) return <OnboardingScreen onDone={() => setShowIntro(false)} />;

  if (view.screen === "trips") return <TripListScreen go={setView} />;
  if (view.screen === "settings") return <SettingsScreen go={setView} />;

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

export default function App() {
  return (
    <StoreProvider>
      <Router />
    </StoreProvider>
  );
}
