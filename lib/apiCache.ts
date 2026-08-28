/**
 * A brief cache for GET responses, plus in-flight deduplication.
 *
 * Every screen refetches on mount and they overlap heavily — buses, drivers, routes and
 * stats are each requested by four or five pages. Clicking Overview → Drivers → Buses
 * re-ran the same calls three times over. This makes moving between tabs instant without
 * holding data long enough for it to be wrong.
 *
 * Any write clears everything, so a user action is never followed by a stale read. That
 * is blunter than invalidating per resource, and it is why this stays small enough to
 * reason about.
 *
 * ponytail: one flat map and a wholesale clear. If a screen ever needs finer control,
 * that is the moment to reach for a real query cache — not before.
 */

export const CACHE_TTL_MS = 30_000;

const entries = new Map<string, { at: number; data: any }>();
const inFlight = new Map<string, Promise<any>>();

export const clearApiCache = () => {
  entries.clear();
  inFlight.clear();
};

/** Test seam: lets a test advance time without waiting 30 real seconds. */
let clock: () => number = () => Date.now();
export const __setClock = (fn: () => number) => { clock = fn; };

export async function cachedGet<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && clock() - hit.at < CACHE_TTL_MS) return hit.data as T;

  // Two components asking for the same thing at once share one request rather than
  // racing — the header and a page both want notifications on load.
  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const p = fetcher()
    .then(data => {
      entries.set(key, { at: clock(), data });
      return data;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, p);
  return p;
}
