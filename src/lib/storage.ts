import { SCHEMA_VERSION, type Trip } from "../types";
import { migrateTrip } from "./migrate";

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
    // Data written by a newer version of the app: don't guess at its shape.
    if (parsed.schemaVersion > SCHEMA_VERSION) throw new Error("data from a newer version");
    const data: AppData = { schemaVersion: SCHEMA_VERSION, trips: parsed.trips.map(migrateTrip) };
    if (parsed.schemaVersion < SCHEMA_VERSION) saveData(data); // upgrade on disk once
    return data;
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
  const parsed = JSON.parse(json) as { trip?: unknown };
  // migrateTrip validates the shape and upgrades v1 export files.
  return migrateTrip(parsed?.trip);
}
