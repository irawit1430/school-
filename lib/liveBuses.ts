import type { Socket } from 'socket.io-client';

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
