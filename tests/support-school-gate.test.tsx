import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SupportSchoolGate } from '../components/layout/SupportSchoolGate';
import * as api from '../lib/api';

// A Voltava support session used to land on schools[0] — whichever school the API listed
// first — with nothing on screen naming it and every write going there.

vi.mock('../lib/api', () => ({
  fetchSchools: vi.fn(),
  getUser: vi.fn(),
  getSupportSchool: vi.fn(),
  setSupportSchool: vi.fn(),
  apiErrorMessage: (error: Error, fallback: string) => error.message || fallback,
}));

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

const render = async () => {
  await act(async () => root.render(
    <SupportSchoolGate key={Math.random()}><p>the dashboard</p></SupportSchoolGate>,
  ));
};

test('a school admin never sees any of this', async () => {
  vi.mocked(api.getUser).mockReturnValue({ role: 'SCHOOL_ADMIN', schoolId: 'school-1' });
  vi.mocked(api.getSupportSchool).mockReturnValue(null);
  await render();

  expect(host.textContent).toContain('the dashboard');
  expect(host.textContent).not.toContain('SUPPORT VIEW');
  // And no /schools request on their behalf.
  expect(api.fetchSchools).not.toHaveBeenCalled();
});

test('a support session with no school chosen gets a picker, not a dashboard', async () => {
  vi.mocked(api.getUser).mockReturnValue({ role: 'SUPER_ADMIN' });
  vi.mocked(api.getSupportSchool).mockReturnValue(null);
  vi.mocked(api.fetchSchools).mockResolvedValue([
    { id: 's1', name: 'Kendriya Vidyalaya Patna' },
    { id: 's2', name: 'DAV Bihta' },
  ]);
  await render();

  expect(host.textContent).not.toContain('the dashboard');
  expect(host.textContent).toContain('Choose a school to work in');
  expect(host.textContent).toContain('Kendriya Vidyalaya Patna');
  expect(host.textContent).toContain('DAV Bihta');
});

test('a chosen school is named where it cannot be missed', async () => {
  vi.mocked(api.getUser).mockReturnValue({ role: 'SUPER_ADMIN' });
  vi.mocked(api.getSupportSchool).mockReturnValue({ id: 's2', name: 'DAV Bihta' });
  await render();

  expect(host.textContent).toContain('the dashboard');
  expect(host.textContent).toContain('VOLTAVA SUPPORT VIEW');
  expect(host.textContent).toContain('DAV Bihta');
  // No dismiss control: the failure this replaces was not knowing whose data was on screen.
  expect([...host.querySelectorAll('button')].map(b => b.textContent?.trim())).toEqual(['Switch school']);
});

test('a failed school list says so and offers a retry, rather than picking one', async () => {
  vi.mocked(api.getUser).mockReturnValue({ role: 'SUPER_ADMIN' });
  vi.mocked(api.getSupportSchool).mockReturnValue(null);
  vi.mocked(api.fetchSchools).mockRejectedValue(new Error('Network unreachable'));
  await render();

  expect(host.textContent).toContain('Network unreachable');
  expect(host.textContent).toContain('Try again');
  expect(host.textContent).not.toContain('the dashboard');
});
