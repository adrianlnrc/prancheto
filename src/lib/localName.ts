const keyFor = (slug: string) => `prancheto:name:${slug}`;

export function getSavedName(slug: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(keyFor(slug));
}

export function saveName(slug: string, name: string) {
  window.localStorage.setItem(keyFor(slug), name);
}
