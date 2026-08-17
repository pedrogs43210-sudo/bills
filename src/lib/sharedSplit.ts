import { installId } from "./installId";
import { scanProxyUrl } from "./scan";
import type { Claim } from "./mergeClaims";
import type { Trip } from "../types";

/**
 * Talking to the shared-split endpoints, and remembering what this phone is to each split.
 *
 * Two roles use this file. The **host** publishes a split and later polls for everyone's answers;
 * a **guest** reads one, says which person they are, and posts what they had. The same phone can be
 * both, on different splits.
 *
 * Nothing here decides anything about money — merging claims into assignments is `mergeClaims`, and
 * it is pure. This file only moves data.
 */

const appToken: string = import.meta.env?.VITE_APP_TOKEN ?? "";

/* Same `bills.` prefix as every other key. The app's name changed; the storage did not, and a
   tidier prefix would silently orphan what is already on people's phones. */
const HOST_KEY = "bills.share.host";
const GUEST_KEY = "bills.share.guest";

/** What the host keeps for a split they published. The token is the only thing that can revoke. */
export type HostShare = { code: string; hostToken: string; expiresAt: number };

/** What a guest keeps for a split they joined: which person on it they said they were. */
export type GuestShare = { code: string; personId: string };

function readMap<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, T>) : {};
  } catch {
    return {}; // a sharing record is never worth an exception
  }
}

function writeMap<T>(key: string, map: Record<string, T>): void {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Storage full. The cost is a link that cannot be revoked from this phone, which is worse than
    // nothing but much better than a crash in the middle of sharing a dinner.
  }
}

export const hostShareFor = (tripId: string): HostShare | null => readMap<HostShare>(HOST_KEY)[tripId] ?? null;

export function rememberHostShare(tripId: string, share: HostShare): void {
  writeMap(HOST_KEY, { ...readMap<HostShare>(HOST_KEY), [tripId]: share });
}

export function forgetHostShare(tripId: string): void {
  const map = readMap<HostShare>(HOST_KEY);
  delete map[tripId];
  writeMap(HOST_KEY, map);
}

export const guestShareFor = (code: string): GuestShare | null => readMap<GuestShare>(GUEST_KEY)[code] ?? null;

export function rememberGuestShare(share: GuestShare): void {
  writeMap(GUEST_KEY, { ...readMap<GuestShare>(GUEST_KEY), [share.code]: share });
}

/** Everything a shared split can fail with, in words a screen can show. */
export class ShareError extends Error {
  constructor(
    readonly reason: "offline" | "not-found" | "person-taken" | "not-joined" | "refused",
    message: string
  ) {
    super(message);
  }
}

const MESSAGES: Record<string, { reason: ShareError["reason"]; message: string }> = {
  "not-found": { reason: "not-found", message: "That link has expired, or the split was taken back." },
  "person-taken": { reason: "person-taken", message: "Somebody else already picked that name." },
  "not-joined": { reason: "not-joined", message: "Say which one you are first." },
};

async function call(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  if (!scanProxyUrl) throw new ShareError("refused", "Sharing isn't set up in this build.");
  let res: Response;
  try {
    res = await fetch(`${scanProxyUrl}${path}`, {
      ...init,
      headers: {
        "x-install-id": installId(),
        ...(appToken ? { "x-app-token": appToken } : {}),
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ShareError("offline", "Couldn't reach Billy — are you online?");
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return body;
  const known = MESSAGES[String(body.error)];
  throw new ShareError(known?.reason ?? "refused", known?.message ?? "That didn't work. Try again in a moment.");
}

/**
 * Publish a split, or update the one already published for it.
 *
 * Deliberately sends only what a guest needs to answer: the people, and the receipts with their
 * items. Not the balances, not the settle-up, not any other split. Re-publishing with the stored
 * code and token updates in place rather than scattering a new link every time a receipt is added.
 */
export async function publishSplit(trip: Trip): Promise<HostShare> {
  const existing = hostShareFor(trip.id);
  const body = await call("/v1/splits", {
    method: "POST",
    body: JSON.stringify({
      ...(existing ? { code: existing.code, hostToken: existing.hostToken } : {}),
      split: {
        name: trip.name,
        emoji: trip.emoji,
        currency: trip.currency,
        people: trip.people,
        receipts: trip.receipts,
      },
    }),
  });
  const share: HostShare = {
    code: String(body.code),
    // The server only returns a token when it makes a NEW split; an update keeps the old one.
    hostToken: typeof body.hostToken === "string" ? body.hostToken : (existing?.hostToken ?? ""),
    expiresAt: Number(body.expiresAt) || 0,
  };
  rememberHostShare(trip.id, share);
  return share;
}

export type SharedSplitView = {
  split: { name: string; emoji: string; currency: string; people: Trip["people"]; receipts: Trip["receipts"] };
  taken: string[];
  expiresAt: number;
};

export async function readSharedSplit(code: string): Promise<SharedSplitView> {
  const body = await call(`/v1/splits/${code}`);
  return {
    split: body.split as SharedSplitView["split"],
    taken: Array.isArray(body.taken) ? (body.taken as string[]) : [],
    expiresAt: Number(body.expiresAt) || 0,
  };
}

export async function joinSplit(code: string, personId: string): Promise<void> {
  await call(`/v1/splits/${code}/join`, { method: "POST", body: JSON.stringify({ personId }) });
  rememberGuestShare({ code, personId });
}

export async function putClaims(code: string, itemIds: string[]): Promise<void> {
  await call(`/v1/splits/${code}/claims`, { method: "PUT", body: JSON.stringify({ itemIds }) });
}

export async function readClaims(code: string): Promise<Claim[]> {
  const body = await call(`/v1/splits/${code}/claims`);
  return Array.isArray(body.claims) ? (body.claims as Claim[]) : [];
}

export async function revokeSplit(tripId: string, share: HostShare): Promise<void> {
  await call(`/v1/splits/${share.code}`, { method: "DELETE", headers: { "x-host-token": share.hostToken } });
  forgetHostShare(tripId);
}

/** The link that goes in the message. Part C makes this open the app; today it opens the web build. */
export const inviteLink = (code: string): string => {
  const base = (import.meta.env?.VITE_APP_LINK || window.location.origin + window.location.pathname).replace(
    /[?#].*$/,
    ""
  );
  return `${base.replace(/\/+$/, "")}/?join=${code}`;
};
