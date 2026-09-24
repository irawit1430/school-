import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DriversList } from '../components/views/DriversList';
import * as api from '../lib/api';
import toast from 'react-hot-toast';
import { toLocalDateTime } from '../lib/drivers';

vi.mock('../lib/api', () => ({
  fetchDrivers: vi.fn(), fetchBuses: vi.fn(), fetchRoutes: vi.fn(),
  createDriver: vi.fn(), updateDriver: vi.fn(), deleteDriver: vi.fn(),
  createTrip: vi.fn(), updateTrip: vi.fn(), updateTripStatus: vi.fn(),
  clearApiCache: vi.fn(),
  apiErrorMessage: (error: Error, fallback: string) => error.message || fallback,
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a> }));

const bus = { id: 'bus-1', licensePlate: 'DL 1P 1234', capacity: 40 };
const trip = { id: 'planned-1', status: 'PLANNED', busId: bus.id, routeId: 'route-1', driverId: 'driver-1', direction: 'TO_SCHOOL', bus,
  route: { id: 'route-1', name: 'North Gate' }, scheduledStart: '2026-10-03T01:45:23.000Z' };
const driver = { id: 'driver-1', name: 'Asha', email: 'asha@example.test', phone: null, driverTrips: [trip] };
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.resetAllMocks();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  vi.mocked(api.fetchDrivers).mockResolvedValue(structuredClone([driver]));
  vi.mocked(api.fetchBuses).mockResolvedValue([bus]);
  vi.mocked(api.fetchRoutes).mockResolvedValue([{ id: 'route-1', name: 'North Gate' }]);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

const render = async () => { await act(async () => root.render(<DriversList />)); };
const button = (label: string, scope: ParentNode = host) => {
  const result = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label);
  if (!result) throw new Error(`Button missing: ${label}`);
  return result;
};
const click = async (element: HTMLElement) => { await act(async () => element.click()); };
const fill = async (id: string, value: string) => {
  const element = host.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
};
const pickDirection = async (value: string) => {
  await click(host.querySelector<HTMLInputElement>(`input[name="driver-trip-direction"][value="${value}"]`)!);
};
const submit = async () => { await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); };

test('route loading failure leaves driver data visible and blocks only the trip form', async () => {
  vi.mocked(api.fetchRoutes).mockRejectedValue(new Error('Routes unavailable'));
  await render();
  expect(host.textContent).toContain('Asha');
  expect(host.textContent).toContain('DL 1P 1234');
  expect(host.querySelector('tbody')!.textContent).toContain('Trip planned');
  await click(button('View trips (1)')); await click(button('Plan a trip'));
  expect(host.querySelector('[role="alert"]')!.textContent).toContain('Routes unavailable');
  expect(button('Create planned trip').disabled).toBe(true);
});

test('driver loading failure has retry and never pretends the fleet has no drivers', async () => {
  vi.mocked(api.fetchDrivers).mockRejectedValueOnce(new Error('Connection lost'));
  await render();
  expect(host.textContent).toContain('Couldn’t load drivers');
  expect(host.textContent).not.toContain('No drivers yet');
  await click(button('Retry loading drivers'));
  expect(host.textContent).toContain('Asha');
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

test('search and trip filter can be cleared without losing loaded drivers', async () => {
  await render(); await fill('driver-search', 'DL1P1234');
  expect(host.querySelector('tbody')!.textContent).toContain('Asha');
  await fill('driver-filter', 'running');
  expect(host.textContent).toContain('No drivers match');
  await click(button('Clear search and filters'));
  expect(host.querySelector('tbody')!.textContent).toContain('Asha');
});

test('editing a driver without a phone succeeds with a null phone and no password update', async () => {
  await render(); await click(button('Edit driver')); await fill('driver-name', 'Asha Sharma'); await submit();
  expect(api.updateDriver).toHaveBeenCalledWith(driver.id, { name: 'Asha Sharma', email: driver.email, phone: null });
  expect(host.querySelector('dialog')).toBeNull();
});

test('a rejected driver edit stays open with the entered values and an inline error', async () => {
  vi.mocked(api.updateDriver).mockRejectedValue(new Error('Email already registered'));
  await render(); await click(button('Edit driver')); await fill('driver-name', 'Asha Sharma'); await submit();
  expect(host.querySelector('[role="alert"]')!.textContent).toContain('Email already registered');
  expect(host.querySelector<HTMLInputElement>('#driver-name')!.value).toBe('Asha Sharma');
});

test('all planned trips are accessible and cancelling targets the selected trip only', async () => {
  vi.mocked(api.fetchDrivers).mockResolvedValue([{ ...driver, driverTrips: [trip, { ...trip, id: 'planned-2', route: { name: 'South Gate' } }] }]);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  await render(); await click(button('View trips (2)'));
  const target = [...host.querySelectorAll('li')].find(item => item.textContent?.includes('South Gate'))!;
  await click(button('Cancel trip', target));
  expect(api.updateTripStatus).toHaveBeenCalledExactlyOnceWith('planned-2', 'CANCELLED');
  expect(confirm.mock.calls[0][0]).toContain('South Gate');
  expect(confirm.mock.calls[0][0]).toContain('DL 1P 1234');
});

test('an unchanged scheduled time is not rewritten when editing a planned trip', async () => {
  await render(); await click(button('View trips (1)')); await click(button('Edit planned trip')); await submit();
  expect(api.updateTrip).not.toHaveBeenCalled();
  expect(host.querySelector('dialog')).toBeNull();
});

test('clearing a planned departure uses the existing nullable API contract', async () => {
  await render(); await click(button('View trips (1)')); await click(button('Edit planned trip'));
  await fill('trip-departure', ''); await submit();
  expect(api.updateTrip).toHaveBeenCalledWith(trip.id, { scheduledStart: null });
});

test('changing a bus preserves the precise existing departure timestamp', async () => {
  vi.mocked(api.fetchBuses).mockResolvedValue([bus, { id: 'bus-2', licensePlate: 'DL 2P 4567' }]);
  await render(); await click(button('View trips (1)')); await click(button('Edit planned trip'));
  await fill('trip-bus', 'bus-2'); await submit();
  expect(api.updateTrip).toHaveBeenCalledWith(trip.id, { busId: 'bus-2' });
});

test('failed refresh preserves the last loaded list and labels it as stale', async () => {
  await render(); vi.mocked(api.fetchDrivers).mockRejectedValue(new Error('Connection lost'));
  await click(button('Refresh'));
  expect(api.clearApiCache).toHaveBeenCalledOnce();
  expect(host.textContent).toContain('Asha');
  expect(host.querySelector('[role="alert"]')!.textContent).toContain('Showing the last loaded list');
});

test('failed cancellation preserves the trip and does not announce success', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(api.updateTripStatus).mockRejectedValue(new Error('Trip changed. Refresh first.'));
  await render(); await click(button('View trips (1)')); await click(button('Cancel trip'));
  expect(host.querySelectorAll('li')).toHaveLength(1);
  expect(toast.error).toHaveBeenCalledWith('Trip changed. Refresh first.');
  expect(toast.success).not.toHaveBeenCalledWith('Trip cancelled');
  expect(button('Cancel trip').disabled).toBe(false);
});

test('new planned trip uses the license plate and existing scheduledStart contract', async () => {
  await render(); await click(button('View trips (1)')); await click(button('Plan a trip'));
  expect(host.querySelector('#trip-bus')!.textContent).toContain('DL 1P 1234');
  await fill('trip-bus', bus.id); await fill('trip-route', 'route-1'); await pickDirection('FROM_SCHOOL');
  await fill('trip-departure', '2026-10-04T07:15'); await submit();
  expect(api.createTrip).toHaveBeenCalledWith({ busId: bus.id, routeId: 'route-1', driverId: driver.id, direction: 'FROM_SCHOOL', scheduledStart: new Date('2026-10-04T07:15').toISOString() });
});

// The server refuses to start a driver's second trip while the first is live, but nothing
// stops the admin planning both. The dialog must say so before it becomes a 7am phone call.
test('planning a trip that overlaps one the driver already has warns without blocking', async () => {
  await render(); await click(button('View trips (1)')); await click(button('Plan a trip'));
  await fill('trip-bus', bus.id); await fill('trip-route', 'route-1'); await pickDirection('TO_SCHOOL');
  await fill('trip-departure', toLocalDateTime(new Date(Date.parse(trip.scheduledStart) + 30 * 60_000).toISOString()));
  expect(host.querySelector('dialog')!.textContent).toContain('Asha already has a trip at this time');
  expect(host.querySelector('dialog')!.textContent).toContain('North Gate');
  await fill('trip-departure', toLocalDateTime(new Date(Date.parse(trip.scheduledStart) + 3 * 3_600_000).toISOString()));
  expect(host.querySelector('dialog')!.textContent).not.toContain('at this time');
  await fill('trip-departure', toLocalDateTime(trip.scheduledStart)); await submit();
  expect(api.createTrip).toHaveBeenCalled();
});

test('editing a trip never reports it as clashing with itself', async () => {
  await render(); await click(button('View trips (1)')); await click(button('Edit planned trip'));
  expect(host.querySelector('dialog')!.textContent).not.toContain('at this time');
});

// A trip saved without a direction is stored as null, which costs the driver app its
// stop order and the parent app its wording. The form must not be able to produce one.
test('a trip cannot be created without a direction', async () => {
  await render(); await click(button('View trips (1)')); await click(button('Plan a trip'));
  await fill('trip-bus', bus.id); await fill('trip-route', 'route-1'); await submit();
  expect(api.createTrip).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')!.textContent).toContain('Choose a direction');
  await pickDirection('TO_SCHOOL'); await submit();
  expect(api.createTrip).toHaveBeenCalledWith(expect.objectContaining({ direction: 'TO_SCHOOL' }));
});

// Trips created before the backend had `direction` come back null. Editing one is the
// only place that data gets repaired, so the form must insist on a choice.
test('a legacy trip with no direction cannot be saved until one is chosen', async () => {
  const { direction: _omitted, ...legacyTrip } = trip;
  vi.mocked(api.fetchDrivers).mockResolvedValue([{ ...driver, driverTrips: [legacyTrip] }]);
  await render(); await click(button('View trips (1)')); await click(button('Edit planned trip'));
  await submit();
  expect(api.updateTrip).not.toHaveBeenCalled();
  await pickDirection('FROM_SCHOOL'); await submit();
  expect(api.updateTrip).toHaveBeenCalledWith(trip.id, { direction: 'FROM_SCHOOL' });
});

test('empty assignment options offer setup links instead of a submittable dead end', async () => {
  vi.mocked(api.fetchBuses).mockResolvedValue([]); vi.mocked(api.fetchRoutes).mockResolvedValue([]);
  await render(); await click(button('View trips (1)')); await click(button('Plan a trip'));
  expect(host.querySelector('a[href="/buses"]')).not.toBeNull();
  expect(host.querySelector('a[href="/routes"]')).not.toBeNull();
  expect(button('Create planned trip').disabled).toBe(true);
});

test('creating a driver includes phone and failed clipboard writes never announce success', async () => {
  vi.mocked(api.createDriver).mockResolvedValue({ driver: { email: 'new@example.test' }, tempPassword: 'fixture-only-password' });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
  await render(); await click(button('Add driver'));
  await fill('driver-name', 'New Driver'); await fill('driver-email', 'new@example.test'); await fill('driver-phone', '+91 9876543210'); await submit();
  expect(api.createDriver).toHaveBeenCalledWith({ name: 'New Driver', email: 'new@example.test', phone: '+91 9876543210' });
  await click(button('Copy login details'));
  expect(host.querySelector('[role="alert"]')!.textContent).toContain('Could not copy automatically');
  expect(toast.success).not.toHaveBeenCalledWith('Login details copied');
  expect(host.querySelector('dialog')!.textContent).toContain('fixture-only-password');
});
