import { test, expect } from '@playwright/test';
import { buildDriverUpdate, formatDeparture, getDriverTrips, matchesDriverSearch, toLocalDateTime } from '../lib/drivers';

test('planned departures do not make a driver currently running', () => {
  const driver = { id: 'd1', name: 'Asha', email: 'asha@example.test', driverTrips: [
    { id: 'later', status: 'PLANNED', scheduledStart: '2026-10-03T09:00:00Z' },
    { id: 'unscheduled', status: 'PLANNED' },
    { id: 'earlier', status: 'PLANNED', scheduledStart: '2026-10-02T09:00:00Z' },
  ] };
  expect(getDriverTrips(driver).activity).toBe('planned');
  expect(getDriverTrips(driver).planned.map(t => t.id)).toEqual(['earlier', 'later', 'unscheduled']);
  expect(driver.driverTrips[0].id).toBe('later');
});

test('a running delayed trip takes precedence over an older planned trip', () => {
  const result = getDriverTrips({ id: 'd', name: 'Asha', email: '', driverTrips: [
    { id: 'plan', status: 'PLANNED', scheduledStart: '2026-01-01T09:00:00Z' },
    { id: 'live', status: 'DELAYED' }, { id: 'done', status: 'COMPLETED' },
  ] });
  expect(result.activity).toBe('running');
  expect(result.primary?.id).toBe('live');
  expect(result.planned).toHaveLength(1);
  expect(getDriverTrips({ id: 'empty', name: '', email: '' }).activity).toBe('unassigned');
});

test('search includes phone, route and the backend license plate', () => {
  const driver = { id: 'd', name: 'Asha', email: 'asha@example.test', phone: '+91 98765 43210',
    driverTrips: [{ id: 't', status: 'PLANNED', bus: { id: 'b', licensePlate: 'DL 1P 1234' }, route: { name: 'North Gate' } }] };
  for (const query of ['asha', '9876543210', 'north gate', 'dl1p1234', '']) expect(matchesDriverSearch(driver, query)).toBe(true);
  expect(matchesDriverSearch(driver, 'South Gate')).toBe(false);
});

test('editing a driver without a phone sends null and preserves the password', () => {
  expect(buildDriverUpdate({ name: ' Asha ', email: ' asha@example.test ', phone: ' ', password: '' }))
    .toEqual({ name: 'Asha', email: 'asha@example.test', phone: null });
  expect(buildDriverUpdate({ name: 'Asha', email: '', phone: '+91 9876543210', password: 'new pass' }))
    .toMatchObject({ phone: '+91 9876543210', password: 'new pass' });
});

test('departure editing preserves local wall-clock time and missing times stay explicit', () => {
  const date = new Date(2026, 8, 5, 7, 15);
  expect(toLocalDateTime(date.toISOString())).toBe('2026-09-05T07:15');
  expect(new Date(toLocalDateTime(date.toISOString())).getTime()).toBe(date.getTime());
  expect(toLocalDateTime('bad date')).toBe('');
  expect(formatDeparture(null)).toBe('Departure time not set');
});
