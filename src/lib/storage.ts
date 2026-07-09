import { SCHEMA_VERSION, type Trip } from "../types";

const DATA_KEY = "bills.data.v1";
const API_KEY_KEY = "bills.apiKey";

export type AppData = { schemaVersion: number; trips: Trip[] };

export function emptyData(): AppData {
  return { schemaVersion: SCHEMA_VERSION, trips: [] };
}

export function loadData(): AppData {
  const raw = localStorage.getItem(DATA_KEY);
  if (raw === null) return emptyData();
  try {
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.trips) || typeof parsed.schemaVersion !== "number") {
      throw new Error("bad shape");
    }
    return parsed;
  } catch {
    // Never lose user data: keep the raw string for manual recovery.
    localStorage.setItem(`${DATA_KEY}.corrupt`, raw);
    return emptyData();
  }
}

export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false; // quota exceeded or storage unavailable — caller shows a warning
  }
}

export function loadApiKey(): string {
  return localStorage.getItem(API_KEY_KEY) ?? "";
}

export function saveApiKey(key: string): void {
  localStorage.setItem(API_KEY_KEY, key.trim());
}

export function exportTrip(trip: Trip): string {
  return JSON.stringify({ app: "bills", schemaVersion: trip.schemaVersion, trip }, null, 2);
}

export function importTrip(json: string): Trip {
  const parsed = JSON.parse(json) as { trip?: Trip };
  const trip = parsed?.trip;
  if (
    !trip ||
    typeof trip.id !== "string" ||
    typeof trip.name !== "string" ||
    !Array.isArray(trip.people) ||
    !Array.isArray(trip.receipts)
  ) {
    throw new Error("Not a Bills trip export");
  }
  return trip;
}
