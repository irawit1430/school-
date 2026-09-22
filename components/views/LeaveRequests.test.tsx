import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LeaveRequests } from './LeaveRequests';
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
});
