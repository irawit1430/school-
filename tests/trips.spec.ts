import { test, expect } from '@playwright/test';
import { ACTIVE_TRIP_STATUSES, isActiveTrip, activeTripsSoonestFirst, describeTrip, nextDepartureAt, routeHasMatchingTrip } from '../lib/trips';

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

// ─── Route-level trip filtering (replaces the "representative trip" heuristic) ───────

test('filtering by driver finds every route they are on, not just the picked trip', () => {
  const trips = [
    { id: 'a', status: 'COMPLETED', driverId: 'd1', busId: 'b1' },
    { id: 'b', status: 'PLANNED',   driverId: 'd2', busId: 'b2' },
  ];
  // The old code tested one chosen trip, so d2 could be filtered out of their own route.
  expect(routeHasMatchingTrip(trips, { driverId: 'd2' })).toBe(true);
  expect(routeHasMatchingTrip(trips, { driverId: 'd1' })).toBe(true);
  expect(routeHasMatchingTrip(trips, { driverId: 'd3' })).toBe(false);
});

test('two filters must hold on the same trip, not across different ones', () => {
  const trips = [
    { id: 'a', status: 'DELAYED', busId: 'b1' },
    { id: 'b', status: 'PLANNED', busId: 'b2' },
  ];
  expect(routeHasMatchingTrip(trips, { busId: 'b1', status: 'DELAYED' })).toBe(true);
  // b2 is PLANNED and b1 is DELAYED — no single trip is both.
  expect(routeHasMatchingTrip(trips, { busId: 'b2', status: 'DELAYED' })).toBe(false);
});

test('an empty filter matches everything, including a route with no trips', () => {
  expect(routeHasMatchingTrip([], {})).toBe(true);
  expect(routeHasMatchingTrip(null, {})).toBe(true);
  expect(routeHasMatchingTrip(null, { busId: 'b1' })).toBe(false);
});

test('next departure reads the soonest ACTIVE trip, including one already running', () => {
  const running = { id: 'now', status: 'DELAYED', scheduledStart: '2026-09-20T07:15:00.000Z' };
  const later   = { id: 'pm',  status: 'PLANNED', scheduledStart: '2026-09-20T14:30:00.000Z' };
  const done    = { id: 'old', status: 'COMPLETED', scheduledStart: '2026-09-01T07:15:00.000Z' };

  // The running trip departed in the past — it must still be what the column reports.
  expect(nextDepartureAt([later, running, done])).toBe(Date.parse(running.scheduledStart));
  expect(nextDepartureAt([done])).toBe(0);
  expect(nextDepartureAt([])).toBe(0);
});
