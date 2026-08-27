import { test, expect } from '@playwright/test';
import { ACTIVE_TRIP_STATUSES, isActiveTrip, activeTripsSoonestFirst, describeTrip } from '../lib/trips';

// These guard the two defects that kept recurring across the platform: a DELAYED trip
// being treated as not-live, and "the current trip" being whichever element the API
// happened to return first.

test('DELAYED counts as live — a late bus is still running', () => {
  expect(ACTIVE_TRIP_STATUSES).toContain('DELAYED');
  expect(isActiveTrip({ status: 'DELAYED' })).toBe(true);
  expect(isActiveTrip({ status: 'ON_SCHEDULE' })).toBe(true);
  expect(isActiveTrip({ status: 'PLANNED' })).toBe(true);
  expect(isActiveTrip({ status: 'COMPLETED' })).toBe(false);
  expect(isActiveTrip({ status: 'CANCELLED' })).toBe(false);
  expect(isActiveTrip(null)).toBe(false);
  expect(isActiveTrip({})).toBe(false);
});

test('a two-leg day returns the morning trip first, whatever order the API sent', () => {
  const afternoon = { id: 'pm', status: 'PLANNED', scheduledStart: '2026-08-27T14:30:00.000Z' };
  const morning = { id: 'am', status: 'DELAYED', scheduledStart: '2026-08-27T07:15:00.000Z' };
  const finished = { id: 'done', status: 'COMPLETED', scheduledStart: '2026-08-26T07:15:00.000Z' };

  const ordered = activeTripsSoonestFirst([afternoon, morning, finished]);

  expect(ordered.map(t => t.id)).toEqual(['am', 'pm']);
  // The morning leg is DELAYED — the old filter dropped it and handed callers the
  // afternoon trip, which is what made Unassign act on a trip nobody was looking at.
  expect(ordered[0].id).toBe('am');
});

test('trips with no scheduledStart fall back to createdAt and do not throw', () => {
  const ordered = activeTripsSoonestFirst([
    { id: 'b', status: 'PLANNED', createdAt: '2026-08-27T09:00:00.000Z' },
    { id: 'a', status: 'PLANNED', createdAt: '2026-08-27T08:00:00.000Z' },
    { id: 'c', status: 'PLANNED' },
  ]);
  expect(ordered.map(t => t.id)).toEqual(['c', 'a', 'b']);
});

test('activeTripsSoonestFirst tolerates a missing collection', () => {
  expect(activeTripsSoonestFirst(null)).toEqual([]);
  expect(activeTripsSoonestFirst(undefined)).toEqual([]);
  expect(activeTripsSoonestFirst([])).toEqual([]);
});

test('describeTrip names enough for a confirmation to be acted on', () => {
  const label = describeTrip({
    route: { name: 'Route 4' },
    bus: { registrationNumber: 'DL 1P 1234' },
    scheduledStart: '2026-08-27T07:15:00.000Z',
  });
  expect(label).toContain('Route 4');
  expect(label).toContain('DL 1P 1234');

  // A half-populated trip still produces something, never "undefined".
  expect(describeTrip({})).toBe('Unknown route');
  expect(describeTrip(null)).toBe('Unknown route');
});
