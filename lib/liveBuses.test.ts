// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  describeFixAge, fixAgeMs, isMoving, isSpeeding, resolveBusDriver,
  SILENT_AFTER_MS, STALE_AFTER_MS, trackerState,
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
