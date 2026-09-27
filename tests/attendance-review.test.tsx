import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() }, default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchAttendanceReview: vi.fn(),
  decideAttendanceReview: vi.fn(),
}));

import * as api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { AttendanceReviewModal } from '../components/views/students/AttendanceReviewModal';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

const render = async (ui: React.ReactNode) => { await act(async () => { root.render(ui); await Promise.resolve(); await Promise.resolve(); }); };
const button = (text: string) => {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
};
const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const refused = (): api.AttendanceReviewCase => ({
  id: 'case-1', status: 'PENDING', decisionReason: null, createdAt: '2026-09-27T03:00:00Z', updatedAt: '2026-09-27T03:00:00Z',
  driverId: 'd1', driverName: 'Ravi', text: '1 check-in was refused and need the office to decide.', note: null,
  scans: [{
    studentId: 's1', studentName: 'Asha', grade: '5B', tripId: 't1', routeName: 'Route 1', type: 'BOARDED',
    occurredAt: '2026-09-27T02:12:00Z', source: 'SCAN', reason: 'The trip was not running at that time', idempotencyKey: 'k1',
  }],
});

describe('Attendance to review', () => {
  it('shows who, what, when and why it was refused', async () => {
    vi.mocked(api.fetchAttendanceReview).mockResolvedValue([refused()]);
    await render(<AttendanceReviewModal open onClose={() => {}} />);

    const text = host.querySelector('[data-testid="review-case"]')!.textContent;
    expect(text).toContain('Ravi');
    expect(text).toContain('Asha');
    expect(text).toContain('Boarded');
    expect(text).toContain('7:42');
    expect(text).toContain('The trip was not running at that time');
  });

  it('asks what the office found before either decision', async () => {
    vi.mocked(api.fetchAttendanceReview).mockResolvedValue([refused()]);
    await render(<AttendanceReviewModal open onClose={() => {}} />);
    expect(button('Record in attendance').disabled).toBe(true);
    expect(button('Close without recording').disabled).toBe(true);
  });

  it('records it as an office correction and takes it off the list', async () => {
    vi.mocked(api.fetchAttendanceReview).mockResolvedValue([refused()]);
    vi.mocked(api.decideAttendanceReview).mockResolvedValue({ id: 'case-1', status: 'RESOLVED', decisionReason: 'x', recorded: 1 });
    await render(<AttendanceReviewModal open onClose={() => {}} />);

    await type(host.querySelector('input')!, 'Called the parent: she did board');
    await act(async () => button('Record in attendance').click());

    expect(api.decideAttendanceReview).toHaveBeenCalledWith('case-1', { status: 'RESOLVED', reason: 'Called the parent: she did board', record: true });
    expect(host.querySelector('[data-testid="review-case"]')).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Recorded 1 check-in in attendance.');
  });

  it('can close it without touching attendance', async () => {
    vi.mocked(api.fetchAttendanceReview).mockResolvedValue([refused()]);
    vi.mocked(api.decideAttendanceReview).mockResolvedValue({ id: 'case-1', status: 'REJECTED', decisionReason: 'x', recorded: 0 });
    await render(<AttendanceReviewModal open onClose={() => {}} />);

    await type(host.querySelector('input')!, 'Absent today');
    await act(async () => button('Close without recording').click());

    expect(api.decideAttendanceReview).toHaveBeenCalledWith('case-1', { status: 'REJECTED', reason: 'Absent today', record: false });
  });

  it('reloads when someone else already decided it', async () => {
    vi.mocked(api.fetchAttendanceReview).mockResolvedValueOnce([refused()]).mockResolvedValueOnce([]);
    vi.mocked(api.decideAttendanceReview).mockRejectedValue(new api.ApiError('This case is already resolved', 409));
    await render(<AttendanceReviewModal open onClose={() => {}} />);

    await type(host.querySelector('input')!, 'Checked');
    await act(async () => button('Record in attendance').click());

    expect(toast.error).toHaveBeenCalledWith('This case is already resolved');
    expect(api.fetchAttendanceReview).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('Nothing to review.');
  });
});
