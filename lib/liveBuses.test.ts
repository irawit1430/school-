// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  describeFixAge, fixAgeMs, isMoving, isSpeeding, resolveBusDriver,
  SILENT_AFTER_MS, STALE_AFTER_MS, trackerState,
  metresFromPath, isOffRoute, OFF_ROUTE_METRES, busPosition,
} from './liveBuses';

const now = Date.parse('2026-09-19T08:00:00Z');
const busAt = (agoMs: number | null, speed = 0) => ({
  id: 'bus-1',
  gpsLogs: [{ lat: 12.9, lng: 77.6, speed, ...(agoMs === null ? {} : { timestamp: new Date(now - agoMs).toISOString() }) }],
});

describe('tracker health is not motion', () => {
  it('calls a stopped bus with a fresh fix live, not offline', () => {
    // The original bug: speed 0 meant "offline", so a bus at a stop with children
    // boarding looked exactly like a bus whose tracker had died.
    const stoppedButReporting = busAt(5_000, 0);
    expect(trackerState(stoppedButReporting, now)).toBe('live');
    expect(isMoving(stoppedButReporting)).toBe(false);
  });

  it('calls a moving bus with an old fix silent, however fast it was going', () => {
    const movingButSilent = busAt(SILENT_AFTER_MS + 1, 48);
    expect(trackerState(movingButSilent, now)).toBe('silent');
    expect(isMoving(movingButSilent)).toBe(true);
  });

  it('separates live, stale and silent at the thresholds', () => {
    expect(trackerState(busAt(0), now)).toBe('live');
    expect(trackerState(busAt(STALE_AFTER_MS - 1), now)).toBe('live');
    expect(trackerState(busAt(STALE_AFTER_MS), now)).toBe('stale');
    expect(trackerState(busAt(SILENT_AFTER_MS - 1), now)).toBe('stale');
    expect(trackerState(busAt(SILENT_AFTER_MS), now)).toBe('silent');
  });

  it('says unknown rather than guessing when no fix carries a timestamp', () => {
    // Guessing either way is how the screen came to lie; "unknown" must stay its own state.
    expect(trackerState(busAt(null), now)).toBe('unknown');
    expect(trackerState({ id: 'b', gpsLogs: [] }, now)).toBe('unknown');
    expect(trackerState({ id: 'b' }, now)).toBe('unknown');
    expect(fixAgeMs(busAt(null), now)).toBeNull();
    expect(describeFixAge(busAt(null), now)).toBeNull();
  });

  it('never reports a negative age when a tracker clock runs ahead', () => {
    expect(fixAgeMs(busAt(-30_000), now)).toBe(0);
    expect(trackerState(busAt(-30_000), now)).toBe('live');
  });

  it('describes an age briefly enough to sit on a marker', () => {
    expect(describeFixAge(busAt(12_000), now)).toBe('12s ago');
    expect(describeFixAge(busAt(4 * 60_000), now)).toBe('4 min ago');
    expect(describeFixAge(busAt(69 * 60_000), now)).toBe('1h 09m ago');
  });
});

describe('overspeed uses one definition', () => {
  it('holds the hysteresis gap so a bus on the limit does not flicker', () => {
    expect(isSpeeding(false, 62)).toBe(false);
    expect(isSpeeding(true, 62)).toBe(true);
    expect(isSpeeding(false, 66)).toBe(true);
    expect(isSpeeding(true, 54)).toBe(false);
  });
});

describe('one driver identity for card and focus view', () => {
  const drivers = [{ id: 'd1', name: 'Ramesh Kumar', phone: '+91999', driverTrips: [{ busId: 'bus-1', status: 'ON_SCHEDULE' }] }];

  it('prefers the REST identity feed, which is the only one carrying a name', () => {
    const resolved = resolveBusDriver({ id: 'bus-1' }, { driverName: 'Asha Rao', driverPhone: '+91888' }, drivers);
    expect(resolved).toEqual({ name: 'Asha Rao', phone: '+91888', assigned: true });
  });

  it('falls back to the running trip, counting a DELAYED bus as running', () => {
    const delayed = [{ ...drivers[0], driverTrips: [{ busId: 'bus-1', status: 'DELAYED' }] }];
    // A late bus losing its driver match is exactly when someone needs to phone them.
    expect(resolveBusDriver({ id: 'bus-1' }, undefined, delayed).name).toBe('Ramesh Kumar');
  });

  it('does not treat the literal string "Unassigned" as a driver name', () => {
    const resolved = resolveBusDriver({ id: 'bus-9', driverName: 'Unassigned' }, undefined, []);
    expect(resolved.assigned).toBe(false);
    expect(resolved.name).toBe('Unassigned');
    expect(resolved.phone).toBeNull();
  });
});

describe('has this bus left its route', () => {
  // A straight ~1.1 km east-west run near Bengaluru, as a stored polyline would give it.
  const path: [number, number][] = [[12.9700, 77.5900], [12.9700, 77.6000]];

  it('measures zero on the line and grows perpendicular to it', () => {
    expect(metresFromPath([12.9700, 77.5950], path)).toBeLessThan(1);
    // 0.001 degree of latitude is ~111 m.
    const off = metresFromPath([12.9710, 77.5950], path)!;
    expect(off).toBeGreaterThan(100);
    expect(off).toBeLessThan(120);
  });

  it('clamps to the ends, so a bus past the last stop measures to the stop', () => {
    // Well east of the path's end, not perpendicular to any segment.
    const beyond = metresFromPath([12.9700, 77.6100], path)!;
    const endToPoint = metresFromPath([12.9700, 77.6100], [[12.9700, 77.6000]])!;
    expect(Math.abs(beyond - endToPoint)).toBeLessThan(1);
  });

  it('does not flag a wide turn or ordinary GPS drift', () => {
    // ~110 m off is a bus on the far side of a dual carriageway, not a detour.
    expect(isOffRoute(metresFromPath([12.9710, 77.5950], path))).toBe(false);
    expect(OFF_ROUTE_METRES).toBeGreaterThanOrEqual(150);
  });

  it('flags a real detour', () => {
    // ~550 m off the route.
    expect(isOffRoute(metresFromPath([12.9750, 77.5950], path))).toBe(true);
  });

  it('never flags when there is nothing to compare against', () => {
    expect(metresFromPath([12.97, 77.59], [])).toBeNull();
    expect(metresFromPath([12.97, 77.59], null)).toBeNull();
    expect(isOffRoute(null)).toBe(false);
  });

  it('reads a position only when the bus has actually reported one', () => {
    expect(busPosition({ gpsLogs: [{ lat: 12.9, lng: 77.6 }] })).toEqual([12.9, 77.6]);
    expect(busPosition({ gpsLogs: [{ speed: 30 }] })).toBeNull();
    expect(busPosition({})).toBeNull();
  });
});
