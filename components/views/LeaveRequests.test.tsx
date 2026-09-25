import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LeaveRequests, LEAVES_PAGE_SIZE } from './LeaveRequests';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import * as api from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => ({
  // Keep the real apiErrorMessage, so these tests exercise the message an admin sees.
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchLeaves: vi.fn(),
  approveLeave: vi.fn(),
  rejectLeave: vi.fn(),
}));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { error: toastError, success: vi.fn() } }));

describe('LeaveRequests', () => {
  const mockLeaves = [
    {
      id: '1',
      student: { name: 'Alice Smith', rfidTag: 'A123' },
      startDate: '2023-10-25T00:00:00.000Z',
      endDate: '2023-10-26T00:00:00.000Z',
      reason: 'Sick leave',
      status: 'PENDING'
    },
    {
      id: '2',
      student: { name: 'Bob Jones', rfidTag: 'B456' },
      startDate: '2023-11-01T00:00:00.000Z',
      endDate: '2023-11-01T00:00:00.000Z',
      reason: 'Family event',
      status: 'APPROVED'
    },
    {
      id: '3',
      student: { name: 'Charlie Brown', rfidTag: 'C789' },
      startDate: '2023-12-10T00:00:00.000Z',
      endDate: '2023-12-15T00:00:00.000Z',
      reason: 'Vacation',
      status: 'REJECTED'
    }
  ];

  beforeEach(() => {
    toastError.mockClear();
    (api.fetchLeaves as any).mockResolvedValue(mockLeaves);
    (api.approveLeave as any).mockResolvedValue({ success: true });
    (api.rejectLeave as any).mockResolvedValue({ success: true });

    // Mock console.error
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state initially', async () => {
    // Delay resolution slightly to test loading state
    let resolvePromise: any;
    const promise = new Promise(resolve => {
      resolvePromise = resolve;
    });
    (api.fetchLeaves as any).mockReturnValue(promise);

    render(<LeaveRequests />);

    expect(screen.getByText('Loading leaves...')).toBeInTheDocument();

    // Cleanup
    resolvePromise(mockLeaves);
    await waitFor(() => expect(screen.queryByText('Loading leaves...')).not.toBeInTheDocument());
  });

  it('renders leave requests after data is fetched', async () => {
    render(<LeaveRequests />);

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
      expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
    });

    expect(screen.getByText('Sick leave')).toBeInTheDocument();
    expect(screen.getByText('Family event')).toBeInTheDocument();
    expect(screen.getByText('Vacation')).toBeInTheDocument();
  });

  it("shows a leave on the school's calendar day, whatever the browser timezone", async () => {
    // One day of leave on 20 Aug in IST, exactly as the API returns it. Formatting the
    // instants in the browser's timezone showed this as 19 Aug to 20 Aug west of IST.
    (api.fetchLeaves as any).mockResolvedValue([{
      id: '4',
      student: { name: 'Dev Patel', rfidTag: 'D012' },
      startDate: '2026-08-19T18:30:00.000Z',
      endDate: '2026-08-20T18:29:59.999Z',
      startDay: '2026-08-20',
      endDay: '2026-08-20',
      timezone: 'Asia/Kolkata',
      reason: 'Unwell',
      status: 'PENDING',
    }]);

    render(<LeaveRequests />);

    await screen.findByText('Dev Patel');
    const row = screen.getByText('Dev Patel').closest('tr')!;
    expect(row).toHaveTextContent(new Date(2026, 7, 20).toLocaleDateString());
    expect(row).not.toHaveTextContent(new Date(2026, 7, 19).toLocaleDateString());
    expect(row).not.toHaveTextContent(/\bto\b/);
  });

  it('filters leave requests by status', async () => {
    render(<LeaveRequests />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    // Change filter to PENDING
    const filterSelect = screen.getByRole('combobox');
    fireEvent.change(filterSelect, { target: { value: 'PENDING' } });

    await waitFor(() => {
      expect(api.fetchLeaves).toHaveBeenCalledWith('pending');
    });

    // Change filter to APPROVED
    fireEvent.change(filterSelect, { target: { value: 'APPROVED' } });

    await waitFor(() => {
      expect(api.fetchLeaves).toHaveBeenCalledWith('approved');
    });

    // Change filter to REJECTED
    fireEvent.change(filterSelect, { target: { value: 'REJECTED' } });

    await waitFor(() => {
      expect(api.fetchLeaves).toHaveBeenCalledWith('rejected');
    });
  });

  it('handles approve leave action', async () => {
    render(<LeaveRequests />);

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    const approveButton = screen.getByText('Approve');
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(api.approveLeave).toHaveBeenCalledWith('1');
      // Should reload data after approval

    });
  });

  it('handles reject leave action', async () => {
    render(<LeaveRequests />);

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    const rejectButton = screen.getByText('Reject');
    fireEvent.click(rejectButton);

    await waitFor(() => {
      expect(api.rejectLeave).toHaveBeenCalledWith('1');
      // Should reload data after rejection

    });
  });

  it('displays empty state when no requests are found', async () => {
    (api.fetchLeaves as any).mockResolvedValue([]);

    render(<LeaveRequests />);

    await waitFor(() => {
      expect(screen.getByText('No leave requests found')).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    const error = new Error('API Error');
    (api.fetchLeaves as any).mockRejectedValueOnce(error);

    render(<LeaveRequests />);

    // A failed load must say so, not fall through to "No leave requests found".
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load leave requests.");
    expect(alert).toHaveTextContent('API Error');
    expect(screen.getByText('Leave requests are unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No leave requests found')).not.toBeInTheDocument();
  });

  it('handles approval errors gracefully', async () => {
    render(<LeaveRequests />);

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    const error = new Error('Approval Error');
    (api.approveLeave as any).mockRejectedValueOnce(error);

    const approveButton = screen.getByText('Approve');
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(error);
      expect(toastError).toHaveBeenCalledWith('Approval Error');
    });
  });

  it('handles rejection errors gracefully', async () => {
    render(<LeaveRequests />);

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    const error = new Error('Rejection Error');
    (api.rejectLeave as any).mockRejectedValueOnce(error);

    const rejectButton = screen.getByText('Reject');
    fireEvent.click(rejectButton);

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(error);
      expect(toastError).toHaveBeenCalledWith('Rejection Error');
    });
  });
  it('finds one child by name in a long queue, and pages the rest', async () => {
    // Exam season: the queue is the longest list in the product and used to render whole.
    const many = Array.from({ length: LEAVES_PAGE_SIZE + 5 }, (_, i) => ({
      id: `l${i}`,
      student: { name: `Student ${String(i).padStart(2, '0')}`, rfidTag: `R${i}` },
      startDate: '2026-09-25T00:00:00.000Z',
      endDate: '2026-09-25T00:00:00.000Z',
      reason: 'Exam',
      // The one pending request sits last in the payload; it must still lead page one.
      status: i === LEAVES_PAGE_SIZE + 4 ? 'PENDING' : 'APPROVED',
    }));
    (api.fetchLeaves as any).mockResolvedValue(many);

    render(<LeaveRequests />);

    await screen.findByText(`Showing 1–${LEAVES_PAGE_SIZE} of ${many.length}`);
    expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(1);
    expect(screen.getByText(`Student ${LEAVES_PAGE_SIZE + 4}`)).toBeInTheDocument(); // last in payload, first on screen
    expect(screen.queryByText(`Student ${LEAVES_PAGE_SIZE - 1}`)).not.toBeInTheDocument(); // pushed to page 2

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'student 07' } });
    expect(screen.getByText('Student 07')).toBeInTheDocument();
    expect(screen.getByText(`1 of ${many.length} Applications`)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nobody' } });
    expect(screen.getByText(/No student matches/)).toBeInTheDocument();
  });
});
