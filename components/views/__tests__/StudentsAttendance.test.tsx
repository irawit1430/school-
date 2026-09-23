import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { StudentsAttendance } from '../StudentsAttendance';
import * as api from '@/lib/api';

const navigation = vi.hoisted(() => ({ query: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.query) }));
vi.mock('@/lib/api', () => ({
  fetchStudents: vi.fn(), fetchTodayAttendance: vi.fn(), fetchStats: vi.fn(), fetchRoutes: vi.fn(),
  fetchNotifications: vi.fn(), createStudent: vi.fn(), importStudentsCSV: vi.fn(),
  assignStudentToStop: vi.fn(), updateStudentMapping: vi.fn(), sendMessageToParent: vi.fn(), clearApiCache: vi.fn(),
  resetParentPassword: vi.fn(), fetchPasswordResetRequests: vi.fn(), approvePasswordReset: vi.fn(), rejectPasswordReset: vi.fn(),
  apiErrorMessage: (error: Error, fallback: string) => error.message || fallback,
  ApiError: class ApiError extends Error {
    status: number; data?: Record<string, any>;
    constructor(message: string, status: number, _issues?: unknown, data?: Record<string, any>) {
      super(message); this.name = 'ApiError'; this.status = status; this.data = data;
    }
  },
}));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() }, default: { success: vi.fn(), error: vi.fn() } }));

const students = [
  { id: 'a', name: 'Asha', parentId: 'parent-a', parentEmail: 'a@example.test', rfidTag: 'A-1' },
  { id: 'b', name: 'Bina', parentId: 'parent-b', parentEmail: 'b@example.test', rfidTag: 'B-2' },
];
const route = { id: 'r1', name: 'North', stops: [{ id: 's1', name: 'Gate', stopTime: '07:00' }] };
// A route the office can actually move a child within, plus the mapping row that makes
// the move addressable at all.
const twoStopRoute = { id: 'r1', name: 'North', stops: [{ id: 's1', name: 'Gate', stopTime: '07:00' }, { id: 's2', name: 'Oak St', stopTime: '07:10' }] };
const mapping = { id: 'm1', routeStopId: 's1', direction: null, stopName: 'Gate', routeId: 'r1', routeName: 'North', lat: 12.9, lng: 77.6 };
const assignedAsha = { ...students[0], assignedRoute: 'North', routeStopName: 'Gate', mappings: [mapping] };
const useTwoStopRoute = () => vi.mocked(api.fetchRoutes).mockImplementation(async options =>
  options?.summary ? [{ id: twoStopRoute.id, name: twoStopRoute.name }] : [twoStopRoute]);
const openChangeFor = async (name: string) => {
  await render();
  await click(button('Change Route & Stop', row(name)));
};
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.resetAllMocks(); navigation.query = '';
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  vi.mocked(api.fetchStudents).mockResolvedValue(structuredClone(students));
  vi.mocked(api.fetchTodayAttendance).mockResolvedValue([]);
  vi.mocked(api.fetchStats).mockResolvedValue({ totalStudents: 2, lateArrivals: 0 });
  vi.mocked(api.fetchNotifications).mockResolvedValue([]);
  vi.mocked(api.fetchRoutes).mockImplementation(async options => options?.summary ? [{ id: route.id, name: route.name }] : [route]);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

const render = async () => { await act(async () => root.render(<StudentsAttendance />)); };
const button = (label: string, scope: ParentNode = host) => {
  const result = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label || item.getAttribute('aria-label') === label);
  if (!result) throw new Error('Button missing: ' + label);
  return result;
};
const click = async (element: HTMLElement) => { await act(async () => element.click()); };
const row = (name: string) => [...host.querySelectorAll('tbody tr')].find(item => item.textContent?.includes(name))!;
const fill = async (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) => {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
};
const submit = async () => { await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); };
const messageAction = (name: string) => row(name).querySelector<HTMLButtonElement>('button[aria-label^="Message Parent"],button[aria-label^="Message parent"]')!;

test('changing message recipient clears the previous draft', async () => {
  await render(); await click(messageAction('Asha'));
  await fill(host.querySelector<HTMLInputElement>('input[placeholder="e.g. Bus Delay Notice"]')!, 'Asha private update');
  await fill(host.querySelector<HTMLTextAreaElement>('textarea')!, 'Only for parent A');
  await click(button('Cancel')); await click(messageAction('Bina'));
  expect(host.querySelector<HTMLInputElement>('input[placeholder="e.g. Bus Delay Notice"]')!.value).toBe('');
  expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
});

test('a second assignment still has stops after the first save refreshes the page', async () => {
  await render(); await click(button('Assign Route & Stop', row('Asha')));
  await fill(host.querySelector<HTMLSelectElement>('select[required]')!, 'r1');
  await fill(host.querySelectorAll<HTMLSelectElement>('select[required]')[1], 's1');
  await submit();
  await click(button('Assign Route & Stop', row('Bina')));
  await fill(host.querySelector<HTMLSelectElement>('select[required]')!, 'r1');
  expect([...host.querySelectorAll('select[required] option')].some(option => option.getAttribute('value') === 's1')).toBe(true);
});

test('same-page global search reacts to a new query and clears a restrictive status filter', async () => {
  await render(); await click(button('Currently Boarded'));
  navigation.query = 'q=Bina'; await render();
  expect(host.querySelector('tbody')!.textContent).toContain('Bina');
  expect(host.querySelector('tbody')!.textContent).not.toContain('Asha');
});

test('a failed refresh preserves the loaded roster and reports unavailable alerts and stats', async () => {
  await render();
  vi.mocked(api.fetchStudents).mockRejectedValue(new Error('Roster unavailable'));
  vi.mocked(api.fetchNotifications).mockRejectedValue(new Error('Alerts unavailable'));
  vi.mocked(api.fetchStats).mockRejectedValue(new Error('Stats unavailable'));
  await click(button('Refresh'));
  expect(host.querySelector('tbody')!.textContent).toContain('Asha');
  expect(host.textContent).toContain('Roster unavailable');
  expect(host.textContent).toContain('Alerts unavailable');
  expect(host.textContent).toContain('Stats unavailable');
  expect(host.textContent).not.toContain('No recent alerts');
});

test('an automatic refresh does not discard a slow initial roster request', async () => {
  vi.useFakeTimers();
  let resolveStudents!: (value: typeof students) => void;
  vi.mocked(api.fetchStudents).mockReturnValue(new Promise(resolve => { resolveStudents = resolve; }));
  await render();
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(api.fetchStudents).toHaveBeenCalledTimes(1);
  await act(async () => resolveStudents(students));
  expect(host.querySelector('tbody')!.textContent).toContain('Asha');
});

test('a pending optional panel does not lock refresh of the roster', async () => {
  vi.mocked(api.fetchStats).mockReturnValue(new Promise(() => {}));
  await render();
  expect(host.querySelector('tbody')!.textContent).toContain('Asha');
  expect(button('Refresh').disabled).toBe(false);
  await click(button('Refresh'));
  expect(api.fetchStudents).toHaveBeenCalledTimes(2);
});

test('a successful registration keeps its credentials visible if the roster refresh fails', async () => {
  await render();
  vi.mocked(api.createStudent).mockResolvedValue({ parentCredentials: { email: 'new@example.test', temporaryPassword: 'one-time-test-password' } });
  vi.mocked(api.fetchStudents).mockRejectedValue(new Error('Refresh unavailable'));
  await click(button('Add New Student'));
  await fill(host.querySelector<HTMLInputElement>('input[name="name"]')!, '  Cora  ');
  await fill(host.querySelector<HTMLInputElement>('input[name="parentName"]')!, '  Parent C  ');
  await fill(host.querySelector<HTMLInputElement>('input[name="parentEmail"]')!, 'new@example.test');
  await submit();
  expect(api.createStudent).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cora', parentName: 'Parent C' }));
  expect(host.textContent).toContain('Student Added!');
  expect(host.textContent).toContain('one-time-test-password');
  expect(host.textContent).toContain('Refresh unavailable');
  expect(host.querySelector('tbody')!.textContent).toContain('Asha');
});

test('automatic refresh updates boarding status and clamps a shrinking second page', async () => {
  vi.useFakeTimers();
  const boarded = Array.from({ length: 9 }, (_, index) => ({ ...students[0], id: 'student-' + index, name: 'Student ' + index, boardingStatus: 'BOARDED' }));
  vi.mocked(api.fetchStudents).mockResolvedValue(boarded);
  await render(); await click(button('Currently Boarded')); await click(button('Next page'));
  expect(host.textContent).toContain('Showing 9 to 9 of 9 students');
  vi.mocked(api.fetchStudents).mockResolvedValue(boarded.map((student, index) => index === 8 ? { ...student, boardingStatus: 'ALIGHTED' } : student));
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(host.textContent).toContain('Showing 1 to 8 of 8 students');
  expect(host.querySelectorAll('tbody tr')).toHaveLength(8);
});

test('flattened assigned students display their stop and cannot create a second mapping', async () => {
  vi.mocked(api.fetchStudents).mockResolvedValue([{ ...students[0], assignedRoute: 'South', routeStopName: 'Library' }, students[1]]);
  await render();
  expect(row('Asha').textContent).toContain('Library');
  expect(row('Asha').textContent).not.toContain('Change Route & Stop');
  expect([...row('Asha').querySelectorAll('button')].some(item => item.textContent?.includes('Assign Route & Stop'))).toBe(false);
  await click(button('Assign Route & Stop', row('Bina')));
  expect(api.assignStudentToStop).not.toHaveBeenCalled();
});

test('a newly discovered assignment blocks a dialog opened from an older unassigned snapshot', async () => {
  vi.useFakeTimers();
  await render(); await click(button('Assign Route & Stop', row('Asha')));
  await fill(host.querySelector<HTMLSelectElement>('select[required]')!, 'r1');
  await fill(host.querySelectorAll<HTMLSelectElement>('select[required]')[1], 's1');
  vi.mocked(api.fetchStudents).mockResolvedValue([{ ...students[0], assignedRoute: 'South', routeStopName: 'Library' }, students[1]]);
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  await submit();
  expect(api.assignStudentToStop).not.toHaveBeenCalled();
  expect(host.querySelector('dialog')!.textContent).toContain('already has a route assignment');
});

test('a successful create cannot be repeated for another stop when roster refresh fails', async () => {
  await render(); await click(button('Assign Route & Stop', row('Asha')));
  await fill(host.querySelector<HTMLSelectElement>('select[required]')!, 'r1');
  await fill(host.querySelectorAll<HTMLSelectElement>('select[required]')[1], 's1');
  vi.mocked(api.fetchStudents).mockRejectedValue(new Error('Refresh unavailable'));
  await submit();
  expect(api.assignStudentToStop).toHaveBeenCalledExactlyOnceWith({ studentId: 'a', routeStopId: 's1' });
  expect([...row('Asha').querySelectorAll('button')].some(item => item.textContent?.includes('Assign Route & Stop'))).toBe(false);
});


// ─── Reassignment ────────────────────────────────────────────────────────────
// The mapping id is what makes a correction possible; before the payload carried it the
// office had no way to fix a wrong stop at all.

test('changing a stop is one PUT against the mapping id, not delete-then-create', async () => {
  vi.mocked(api.fetchStudents).mockResolvedValue([assignedAsha, students[1]]);
  useTwoStopRoute();
  await openChangeFor('Asha');
  await fill(host.querySelectorAll<HTMLSelectElement>('select[required]')[1], 's2');
  await submit();
  // `direction` is deliberately absent: sending it would widen a one-leg mapping to both.
  expect(api.updateStudentMapping).toHaveBeenCalledExactlyOnceWith('m1', { routeStopId: 's2' });
  expect(api.assignStudentToStop).not.toHaveBeenCalled();
});

test('the stop already assigned cannot be resubmitted as a move', async () => {
  vi.mocked(api.fetchStudents).mockResolvedValue([assignedAsha, students[1]]);
  useTwoStopRoute();
  await openChangeFor('Asha');
  await submit();
  expect(api.updateStudentMapping).not.toHaveBeenCalled();
  expect(host.querySelector('dialog')!.textContent).toContain('already assigned');
});

test('a duplicate-mapping conflict is explained rather than shown as a raw conflict', async () => {
  vi.mocked(api.fetchStudents).mockResolvedValue([assignedAsha, students[1]]);
  useTwoStopRoute();
  vi.mocked(api.updateStudentMapping).mockRejectedValue(
    new api.ApiError('Conflict', 409, undefined, { code: 'MAPPING_EXISTS' }));
  await openChangeFor('Asha');
  await fill(host.querySelectorAll<HTMLSelectElement>('select[required]')[1], 's2');
  await submit();
  expect(host.querySelector('dialog')!.textContent).toContain('already assigned to that stop');
});

test('a mapping deleted elsewhere tells the admin why and refetches the roster', async () => {
  vi.mocked(api.fetchStudents).mockResolvedValue([assignedAsha, students[1]]);
  useTwoStopRoute();
  vi.mocked(api.updateStudentMapping).mockRejectedValue(new api.ApiError('Not found', 404));
  await openChangeFor('Asha');
  const readsBefore = vi.mocked(api.fetchStudents).mock.calls.length;
  await fill(host.querySelectorAll<HTMLSelectElement>('select[required]')[1], 's2');
  await submit();
  expect(host.querySelector('dialog')!.textContent).toContain('changed somewhere else');
  expect(vi.mocked(api.fetchStudents).mock.calls.length).toBeGreaterThan(readsBefore);
});

test('a child with morning and afternoon stops moves only the leg the admin picked', async () => {
  const afternoon = { id: 'm2', routeStopId: 's2', direction: 'FROM_SCHOOL', stopName: 'Oak St', routeId: 'r1', routeName: 'North' };
  vi.mocked(api.fetchStudents).mockResolvedValue([
    { ...assignedAsha, mappings: [{ ...mapping, direction: 'TO_SCHOOL' }, afternoon] }, students[1]]);
  useTwoStopRoute();
  await openChangeFor('Asha');
  const picker = host.querySelector<HTMLSelectElement>('dialog select:not([required])')!;
  expect(picker.textContent).toContain('Afternoon');
  await fill(picker, 'm2');
  await fill(host.querySelectorAll<HTMLSelectElement>('select[required]')[1], 's1');
  await submit();
  expect(api.updateStudentMapping).toHaveBeenCalledExactlyOnceWith('m2', { routeStopId: 's1' });
});

test('a flattened assignment offers a reload, then says plainly there is no record to edit', async () => {
  // The roster names the stop but returns no mapping row, so there is no id to PUT to.
  vi.mocked(api.fetchStudents).mockResolvedValue([{ ...students[0], assignedRoute: 'South', routeStopName: 'Library' }, students[1]]);
  await render();
  // This used to be plain text telling the admin to refresh, which the row gave them no
  // way to do — and which would not have helped, because the payload never changes.
  await click(button('Reload to change', row('Asha')));
  expect(row('Asha').textContent).toContain('no editable record');
  expect([...row('Asha').querySelectorAll('button')].some(item => item.textContent?.includes('Reload to change'))).toBe(false);
  // Still never a second POST: that is what would put the child on two driver rosters.
  expect(api.assignStudentToStop).not.toHaveBeenCalled();
});

test('a reload that does return the mapping record makes the assignment changeable again', async () => {
  vi.mocked(api.fetchStudents)
    .mockResolvedValueOnce([{ ...students[0], assignedRoute: 'North', routeStopName: 'Gate' }, students[1]])
    .mockResolvedValue([structuredClone(assignedAsha), students[1]]);
  await render();
  await click(button('Reload to change', row('Asha')));
  expect(button('Change Route & Stop', row('Asha'))).toBeTruthy();
});

// ─── Helping a locked-out parent ───────────────────────────
// The profile said "Parent Email: Not provided" for everyone (the API never sent it), and
// the only reset button waited on a notification the server never produced.

test("the profile shows the parent's sign-in email and resets their password once", async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(api.resetParentPassword).mockResolvedValue({ user: { id: 'parent-a', name: 'A', email: 'a@example.test' }, tempPassword: 'Tmp4Asha9xyz' });
  await render(); await click(button('View Student Asha'));
  expect(host.querySelector('dialog')!.textContent).toContain('a@example.test');

  await click(button('Reset parent password'));

  expect(api.resetParentPassword).toHaveBeenCalledWith('parent-a');
  expect([...host.querySelectorAll('textarea')].map(t => t.value)).toEqual(['a@example.test', 'Tmp4Asha9xyz']);
  expect(host.textContent).toContain('New temporary password');
});

test('nothing is reset if the admin cancels the confirmation', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  await render(); await click(button('View Student Asha'));
  await click(button('Reset parent password'));
  expect(api.resetParentPassword).not.toHaveBeenCalled();
});

test("searching a parent's email finds their child", async () => {
  await render();
  await fill(host.querySelector<HTMLInputElement>('#student-search')!, 'b@example.test');
  expect(host.querySelector('tbody')!.textContent).toContain('Bina');
  expect(host.querySelector('tbody')!.textContent).not.toContain('Asha');
});

test('password requests: approving shows the new password once, declining clears the request', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(api.fetchPasswordResetRequests).mockResolvedValue([
    { id: 'req-1', createdAt: '2026-09-22T04:00:00Z', user: { id: 'parent-a', name: 'Anil', email: 'a@example.test', role: 'PARENT', phone: '98' } },
    { id: 'req-2', createdAt: '2026-09-22T05:00:00Z', user: { id: 'drv-1', name: 'Ravi', email: 'ravi@example.test', role: 'DRIVER' } },
  ]);
  vi.mocked(api.approvePasswordReset).mockResolvedValue({ user: { id: 'parent-a', name: 'Anil', email: 'a@example.test' }, tempPassword: 'Tmp7Anil2abc' });
  vi.mocked(api.rejectPasswordReset).mockResolvedValue({});
  await render();

  await click(button('Password requests'));
  const list = () => host.querySelector('ul[aria-label="Pending password requests"]')!;
  expect(list().textContent).toContain('Anil');
  expect(list().textContent).toContain('Ravi');

  await click(button('Create temporary password', list().querySelector('li')!));
  expect(api.approvePasswordReset).toHaveBeenCalledWith('req-1');
  expect([...host.querySelectorAll('textarea')].map(t => t.value)).toEqual(['a@example.test', 'Tmp7Anil2abc']);

  await click(button('Done'));
  expect(list().textContent).not.toContain('Anil');
  await click(button('Decline', list().querySelector('li')!));
  expect(api.rejectPasswordReset).toHaveBeenCalledWith('req-2');
  expect(host.textContent).toContain('No one is waiting for a new password.');
});
