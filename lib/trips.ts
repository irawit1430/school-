// Which trip statuses mean "this trip is live right now".
//
// DELAYED belongs here: a bus running late is still running. Omitting it has been
// the single most repeated defect across this platform — it made a late driver read
// as free on the drivers page, where they could then be handed a second trip.
//
// ponytail: this duplicates a set the backend already filters on. Delete it and read
// the set from the API the day /api exposes it, so the definition stops living in two
// languages.
export const ACTIVE_TRIP_STATUSES = ['PLANNED', 'ON_SCHEDULE', 'DELAYED'];

export const isActiveTrip = (trip: { status?: string } | null | undefined): boolean =>
  !!trip && ACTIVE_TRIP_STATUSES.includes(trip.status ?? '');

/**
 * The live trips for a driver/route/bus, soonest first.
 *
 * The ordering matters: callers that render or act on "the current trip" used to take
 * whatever element the API happened to return first. That is correct only while nobody
 * has two trips in a day — which the recurring-run scheduler is specifically designed
 * to stop being true.
 */
export const activeTripsSoonestFirst = (trips: any[] | null | undefined): any[] =>
  (trips ?? [])
    .filter(isActiveTrip)
    .sort((a, b) => {
      const at = Date.parse(a.scheduledStart ?? a.createdAt ?? '') || 0;
      const bt = Date.parse(b.scheduledStart ?? b.createdAt ?? '') || 0;
      return at - bt;
    });

/** Human label for a trip, for confirmations that must name what they are about to change. */
export const describeTrip = (trip: any): string => {
  const route = trip?.route?.name || 'Unknown route';
  const bus = trip?.bus?.registrationNumber;
  const when = trip?.scheduledStart
    ? new Date(trip.scheduledStart).toLocaleString([], {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : null;
  return [route, bus && `bus ${bus}`, when].filter(Boolean).join(' · ');
};

/**
 * Why a route refused to delete, when the reason is trips.
 *
 * The server counts every trip that ever referenced the route, COMPLETED and CANCELLED
 * included, so the two outcomes mean opposite things to the admin: `active` is something
 * they can clear and retry, `historical` can never be deleted at all. A single shared
 * message would tell half of them to keep retrying something that will never work — and
 * the caller needs the kind, not just the words, to know whether offering a way out is
 * even honest.
 *
 * Duck-typed on purpose so this stays free of the API module: it only needs the status
 * and the parsed body. Returns null when the refusal is something else, leaving the
 * caller to show whatever the server said.
 */
export type RouteDeleteBlock = {
  kind: 'active' | 'historical';
  message: string;
  activeTripCount: number;
  tripCount: number;
};

export const routeDeleteBlock = (error: unknown): RouteDeleteBlock | null => {
  const failure = error as
    { status?: number; data?: { code?: string; tripCount?: number; activeTripCount?: number } } | null;
  if (failure?.status !== 409 || failure.data?.code !== 'ROUTE_HAS_TRIPS') return null;

  const activeTripCount = failure.data.activeTripCount ?? 0;
  const tripCount = failure.data.tripCount ?? 0;
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

  if (activeTripCount > 0) {
    return {
      kind: 'active',
      activeTripCount,
      tripCount,
      message: `This route still has ${count(activeTripCount, 'active trip')}. Cancel ${activeTripCount === 1 ? 'it' : 'them'} to delete the route.`,
    };
  }
  if (tripCount > 0) {
    return {
      kind: 'historical',
      activeTripCount,
      tripCount,
      message: `This route has already run ${count(tripCount, 'trip')}, so it can no longer be deleted — that history is attached to it. Leave it unassigned instead.`,
    };
  }
  return null;
};
