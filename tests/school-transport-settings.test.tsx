import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SchoolTransportSettings } from '../components/views/SchoolTransportSettings';
import * as api from '../lib/api';

// The wait at each stop is the school's own setting now, and the school's location
// decides whether the drive to school is in every bus time.

vi.mock('../lib/api', () => ({
  fetchSchool: vi.fn(), updateSchoolTransport: vi.fn(),
  apiErrorMessage: (error: Error, fallback: string) => error.message || fallback,
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.resetAllMocks();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const render = async (school: Partial<api.SchoolTransport>) => {
  vi.mocked(api.fetchSchool).mockResolvedValue({ id: 's1', latitude: null, longitude: null, stopDwellMinutes: null, ...school });
  await act(async () => root.render(<SchoolTransportSettings key={Math.random()} />));
};
const input = () => host.querySelector<HTMLInputElement>('#stop-wait')!;
const type = (value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), value);
  input().dispatchEvent(new Event('input', { bubbles: true }));
});
const submit = () => act(async () => { host.querySelector('form')!.requestSubmit(); });

test('saves the minutes the school types', async () => {
  vi.mocked(api.updateSchoolTransport).mockResolvedValue({ id: 's1', stopDwellMinutes: 2.5, defaultStopDwellMinutes: 1 });
  await render({ stopDwellMinutes: 1 });
  expect(input().value).toBe('1');

  await type('2.5');
  await submit();

  expect(api.updateSchoolTransport).toHaveBeenCalledWith(2.5);
  expect(host.textContent).toContain('Saved.');
});

test('an empty box goes back to the default', async () => {
  vi.mocked(api.updateSchoolTransport).mockResolvedValue({ id: 's1', stopDwellMinutes: null, defaultStopDwellMinutes: 1 });
  await render({ stopDwellMinutes: 3 });

  await type('');
  await submit();

  expect(api.updateSchoolTransport).toHaveBeenCalledWith(null);
});

test('refuses more than 10 minutes', async () => {
  await render({});
  await type('15');
  await submit();

  // The browser stops it first (max=10); the form's own check backs that up.
  expect(input().validity.rangeOverflow).toBe(true);
  expect(api.updateSchoolTransport).not.toHaveBeenCalled();
});

test('says when the school has no location, and what it costs', async () => {
  await render({});
  expect(host.textContent).toMatch(/Not set.*drive between the last stop and school is missing/);

  await render({ latitude: 12.97, longitude: 77.63 });
  expect(host.textContent).toMatch(/Morning trips end here/);
});
