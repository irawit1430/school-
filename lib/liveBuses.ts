import type { Socket } from 'socket.io-client';
import { activeTripsSoonestFirst, isActiveTrip } from './trips';

/**
 * Batch `location_update` packets instead of setting state on each one.
 *
 * Every packet used to trigger its own `setBuses`, which rebuilt the bus array and
 * re-rendered the whole map and the whole sidebar. A fleet of 40 buses reporting every
 * few seconds meant something like a dozen full re-renders a second, all to move a few
 * markers — which is most of why the map felt slow.
 *
 * Packets are collected and flushed on a fixed interval, last-position-wins per bus.
 * Dropping intermediate positions is correct here: the map shows where a bus *is*, not
 * where it has been.
 */
export function subscribeToBusPositions(
  socket: Socket,
  apply: (updates: Map<string, any>) => void,
  intervalMs = 1000,
): () => void {
  const pending = new Map<string, any>();

  // A marker frozen on its initial REST position looks identical whether no telemetry is
  // arriving at all or telemetry is arriving for an id that matches no bus on screen.
  // These two lines tell those apart from the console without a debugger.
  let announced = false;

  const onUpdate = (data: any) => {
    const id = data?.busId || data?.id;
    if (!announced) {
      announced = true;
      console.info('[telemetry] first location_update received', { busId: id, keys: Object.keys(data ?? {}) });
    }
    if (id) pending.set(id, data);
  };
  socket.on('location_update', onUpdate);

  const timer = setInterval(() => {
    if (pending.size === 0) return;
    const batch = new Map(pending);
    pending.clear();
    apply(batch);
  }, intervalMs);

  return () => {
    clearInterval(timer);
    socket.off('location_update', onUpdate);
  };
}

/**
 * Merge one telemetry packet into a bus row.
 *
 * Returns the original object when nothing moved, so React can skip re-rendering that
 * bus. The telemetry paths disagree on shape — the TCP one real hardware uses carries
 * position only — so every non-position field falls back to what we already had rather
 * than being blanked by its absence.
 */
export function mergeBusPosition(bus: any, data: any): any {
  const lat = data.lat ?? bus.gpsLogs?.[0]?.lat;
  const lng = data.lng ?? bus.gpsLogs?.[0]?.lng;
  const speed = data.speed ?? 0;
  const prev = bus.gpsLogs?.[0];

  if (prev && prev.lat === lat && prev.lng === lng && prev.speed === speed) return bus;

  return {
    ...bus,
    // Decided here because this is where the previous value is. The marker icon is keyed
    // on it, so a bare threshold would rebuild the icon whenever a bus sat on the limit.
    speeding: isSpeeding(Boolean(bus.speeding), speed),
    capacity: data.capacity || bus.capacity,
    driverName: data.driverName || bus.driverName,
    routeName: data.routeName || bus.routeName,
    status: data.status || bus.status,
    gpsLogs: [{ lat, lng, speed, timestamp: data.timestamp || new Date().toISOString() }],
  };
}

/**
 * Is this bus speeding, given what it was a moment ago?
 *
 * A bare `speed > 60` flips on every packet for a bus sitting on the limit, and the
 * marker's icon is keyed on it — so the DOM element is rebuilt mid-move and the position
 * transition restarts from scratch, which reads as a flicker. The gap between the two
 * thresholds means a bus has to actually change behaviour to change appearance.
 */
export const ALERT_ENTER_KMH = 65;
export const ALERT_EXIT_KMH = 55;

export const isSpeeding = (wasSpeeding: boolean, speed: number): boolean =>
  wasSpeeding ? speed > ALERT_EXIT_KMH : speed > ALERT_ENTER_KMH;

// ─── Tracker health, which is not the same thing as motion ──────────────────
//
// These were one concept and it was the wrong one. `speed > 0` was standing in for
// "this bus is fine", so a bus halted at a stop with children boarding — the most
// attention-worthy moment on a route — was rendered identically to a bus whose tracker
// had died. An operator scanning for dead trackers saw a list padded with healthy
// stationary buses, and learned to ignore the only signal that must never be ignored.
//
// Connectivity comes from the age of the last fix. Motion comes from its speed. A bus
// can be reporting and stopped, or moving and silent (last known heading, tracker since
// dead), and those are four distinct states an operator needs to tell apart.

export const STALE_AFTER_MS = 2 * 60_000;
export const SILENT_AFTER_MS = 10 * 60_000;

/** Age of the newest position fix, or null when no fix has ever carried a timestamp. */
export const fixAgeMs = (bus: any, now: number = Date.now()): number | null => {
  const at = Date.parse(bus?.gpsLogs?.[0]?.timestamp ?? '');
  if (!Number.isFinite(at)) return null;
  // A tracker whose clock runs ahead would otherwise read as a negative age and sort
  // as the stalest thing on the screen.
  return Math.max(0, now - at);
};

/**
 * `unknown` is a real answer, not a fallback: until a fix with a timestamp arrives there
 * is no basis for calling a bus either healthy or silent, and guessing either way is how
 * this screen came to lie in the first place.
 */
export type TrackerState = 'live' | 'stale' | 'silent' | 'unknown';

export const trackerState = (bus: any, now: number = Date.now()): TrackerState => {
  const age = fixAgeMs(bus, now);
  if (age === null) return 'unknown';
  if (age >= SILENT_AFTER_MS) return 'silent';
  if (age >= STALE_AFTER_MS) return 'stale';
  return 'live';
};

export const isMoving = (bus: any): boolean => (bus?.gpsLogs?.[0]?.speed ?? 0) > 0;

/** Short enough to sit on a marker: "12s ago", "4 min ago", "1h 09m ago". */
export const describeFixAge = (bus: any, now: number = Date.now()): string | null => {
  const age = fixAgeMs(bus, now);
  if (age === null) return null;
  const seconds = Math.floor(age / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m ago`;
};

/**
 * Who is driving this bus right now.
 *
 * Extracted because the sidebar card and the focus HUD had diverged: the card went
 * through the REST identity feed, the HUD read the raw bus fields, and the two disagreed
 * on screen at the same moment — the HUD saying "Unassigned" for a bus the card had
 * correctly named. The REST feed wins because the socket path real hardware uses carries
 * no driver identity at all, and because it resolves the running trip in a defined order
 * once a bus has two legs in a day.
 */
export function resolveBusDriver(
  bus: any,
  identity: { driverName?: string; driverPhone?: string } | undefined,
  drivers: any[],
): { name: string; phone: string | null; assigned: boolean } {
  // DELAYED counts as running here: a late bus must not lose its driver match, which is
  // exactly when someone needs to phone them.
  const onTrip = drivers.find(driver =>
    driver.driverTrips?.some((trip: any) => trip.busId === bus.id && isActiveTrip(trip)));
  const name = identity?.driverName
    || onTrip?.name
    || (bus.driverName !== 'Unassigned' ? bus.driverName : null)
    || bus.driver?.user?.name
    || bus.driver?.name
    || null;
  const phone = identity?.driverPhone || onTrip?.phone || bus.driver?.phone || null;
  return { name: name || 'Unassigned', phone, assigned: Boolean(name) };
}

/**
 * The trip this bus is running right now, or null.
 *
 * Resolved through the drivers payload because that is the only place the map already has
 * trips, and taken soonest-first rather than as an arbitrary element: a bus with a morning
 * and an afternoon leg has two, and picking the wrong one attributes the wrong route,
 * driver and ETA to a vehicle on screen.
 */
export function resolveBusTrip(bus: any, drivers: any[]): any | null {
  const trips = drivers.flatMap((driver: any) =>
    (driver.driverTrips ?? []).filter((trip: any) => trip.busId === bus?.id));
  return activeTripsSoonestFirst(trips)[0] ?? null;
}

/** The route a bus is currently serving, from its running trip. */
export const resolveBusRouteId = (bus: any, drivers: any[]): string | null =>
  resolveBusTrip(bus, drivers)?.routeId ?? bus?.routeId ?? null;
