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

/**
 * The soonest active trip's scheduled start, as a sortable epoch (0 when there is none).
 *
 * Deliberately not "the soonest *future* departure": a trip that is running right now
 * departed in the past, and hiding it would reintroduce the bug where the row went quiet
 * about the very trip the admin is watching.
 */
export const nextDepartureAt = (trips: any[] | null | undefined): number => {
  const soonest = activeTripsSoonestFirst(trips)[0];
  return soonest?.scheduledStart ? Date.parse(soonest.scheduledStart) || 0 : 0;
};

/**
 * Does this route have a trip matching the admin's bus/driver/status filter?
 *
 * Route-level on purpose. The old filter tested one heuristically-chosen "representative"
 * trip, so filtering by a driver found only the routes where that driver's trip happened
 * to win the pick — a route they genuinely drive could vanish from their own filter.
 *
 * The predicates must hold on the *same* trip: "bus 12 AND delayed" means one trip that
 * is both, not a route with some delayed trip and some trip on bus 12.
 */
export const routeHasMatchingTrip = (
  trips: any[] | null | undefined,
  filter: { busId?: string; driverId?: string; status?: string },
): boolean => {
  const { busId, driverId, status } = filter;
  if (!busId && !driverId && !status) return true;
  return (trips ?? []).some(trip =>
    (!busId || trip.busId === busId) &&
    (!driverId || trip.driverId === driverId) &&
    (!status || trip.status === status));
};

/**
 * How long a trip is assumed to occupy its driver when its route has no estimated
 * duration. Deliberately generous: a missed warning costs a morning, a spare one costs
 * the admin a glance at two departure times.
 */
export const DEFAULT_TRIP_MINUTES = 60;

const RUNNING_STATUSES = ['ON_SCHEDULE', 'DELAYED'];

/**
 * The driver's other active trips that would collide with a trip leaving at `start`.
 *
 * A driver can only run one trip at a time — the server refuses to start a second while
 * the first is live — but nothing stops an admin *planning* two at once. This is the
 * warning for that, so the clash is found at the desk instead of by the driver at 7am.
 *
 * Each trip is taken to occupy [departure, departure + route duration). A trip running
 * right now occupies at least until now, however long it was meant to take: it has not
 * ended until the driver ends it. With no `start`, the new trip can be started whenever
 * the driver likes, so only a trip running right now is in the way. A planned trip with
 * no departure time cannot be placed and is left out.
 */
export const findDriverClashes = (
  trips: any[] | null | undefined,
  candidate: { start?: string | null; durationMinutes?: number | null; excludeTripId?: string | null },
  opts: { durationOf?: (trip: any) => number | null | undefined; now?: number } = {},
): any[] => {
  const now = opts.now ?? Date.now();
  const span = (minutes?: number | null) => (minutes && minutes > 0 ? minutes : DEFAULT_TRIP_MINUTES) * 60_000;
  const candidateStart = Date.parse(candidate.start ?? '');
  const candidateEnd = candidateStart + span(candidate.durationMinutes);

  return activeTripsSoonestFirst(trips).filter(trip => {
    if (candidate.excludeTripId && trip.id === candidate.excludeTripId) return false;
    const running = RUNNING_STATUSES.includes(trip.status);
    if (!Number.isFinite(candidateStart)) return running;

    let start = Date.parse((running && trip.startTime) || trip.scheduledStart || '');
    if (!Number.isFinite(start)) {
      if (!running) return false;
      start = now;
    }
    let end = start + span(opts.durationOf?.(trip));
    if (running) end = Math.max(end, now);
    return candidateStart < end && start < candidateEnd;
  });
};
