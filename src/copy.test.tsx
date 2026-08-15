import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StoreProvider } from "./state/StoreProvider";
import { TripListScreen } from "./screens/TripListScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { HelpScreen } from "./screens/HelpScreen";

/**
 * The rename is spread across enough files that a human will miss one.
 *
 * Matched on RENDERED TEXT, not source, so `tripId` and the `Trip` type — which deliberately keep
 * their names, because renaming them would change the shape of saved data — do not trip it. Whole
 * words only, so nothing legitimate is caught.
 */
const TRIP = /\btrips?\b/i;

describe("nothing a user reads says trip", () => {
  it.each([
    ["splits list", () => <TripListScreen go={() => {}} />],
    ["profile", () => <ProfileScreen go={() => {}} />],
    ["help", () => <HelpScreen go={() => {}} />],
  ])("%s", (_name, make) => {
    const { container } = render(<StoreProvider>{make()}</StoreProvider>);
    const offenders = (container.textContent ?? "").split(/\s+/).filter((w) => TRIP.test(w));
    expect(offenders).toEqual([]);
  });
});
