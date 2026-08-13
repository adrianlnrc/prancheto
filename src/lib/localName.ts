const keyFor = (slug: string) => `prancheto:name:${slug}`;

export function getSavedName(slug: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(keyFor(slug));
}

export function saveName(slug: string, name: string) {
  window.localStorage.setItem(keyFor(slug), name);
}

// Tracks, per device, whether this device already added its saved name to a
// given round's list — so "digitar o nome" only ever calls add_player once
// per round, even across reloads/re-renders (see GroupApp's join effect).
const joinedKeyFor = (roundId: string) => `prancheto:joined:${roundId}`;

export function hasJoinedRound(roundId: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(joinedKeyFor(roundId)) === "1";
}

export function markJoinedRound(roundId: string) {
  window.localStorage.setItem(joinedKeyFor(roundId), "1");
}
