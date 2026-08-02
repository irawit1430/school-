import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaveRequests } from './LeaveRequests';
import { fetchLeaves, approveLeave, rejectLeave } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  fetchLeaves: vi.fn(),
  approveLeave: vi.fn(),
  rejectLeave: vi.fn(),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  CheckCircle: () => <div data-testid="icon-check-circle" />,
  XCircle: () => <div data-testid="icon-x-circle" />,
  Clock: () => <div data-testid="icon-clock" />,
  Filter: () => <div data-testid="icon-filter" />,
  Download: () => <div data-testid="icon-download" />,
  Calendar: () => <div data-testid="icon-calendar" />,
  FileText: () => <div data-testid="icon-file-text" />,
  Check: () => <div data-testid="icon-check" />,
  X: () => <div data-testid="icon-x" />,
  Search: () => <div data-testid="icon-search" />,
  User: () => <div data-testid="icon-user" />,
}));

describe('LeaveRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockLeaves = [
    {
      id: 'leave-1',
      student: { name: 'John Doe', rfidTag: 'RFID-123' },
      startDate: '2023-10-25T00:00:00Z',
      endDate: '2023-10-26T00:00:00Z',
      reason: 'Family event',
      status: 'PENDING',
    },
    {
      id: 'leave-2',
      student: { name: 'Jane Smith', rfidTag: 'RFID-456' },
      startDate: '2023-10-27T00:00:00Z',
      endDate: '2023-10-27T00:00:00Z',
      reason: 'Medical appointment',
      status: 'APPROVED',
    },
  ];

  it('should render loading state initially', () => {
    vi.mocked(fetchLeaves).mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<LeaveRequests />);
    expect(screen.getByText('Loading leaves...')).toBeInTheDocument();
  });

  it('should render leave requests after fetching', async () => {
    vi.mocked(fetchLeaves).mockResolvedValue(mockLeaves);
    render(<LeaveRequests />);

    await waitFor(() => {
      expect(screen.queryByText('Loading leaves...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Family event')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Medical appointment')).toBeInTheDocument();
  });

  it('should display "No leave requests found" when the list is empty', async () => {
    vi.mocked(fetchLeaves).mockResolvedValue([]);
    render(<LeaveRequests />);

    await waitFor(() => {
      expect(screen.getByText('No leave requests found')).toBeInTheDocument();
    });
  });

  it('should handle API errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetchLeaves).mockRejectedValue(new Error('API Error'));

    render(<LeaveRequests />);

    await waitFor(() => {
      expect(screen.queryByText('Loading leaves...')).not.toBeInTheDocument();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load leaves:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('should change filter and fetch with new status', async () => {
    vi.mocked(fetchLeaves).mockResolvedValue([]);
    render(<LeaveRequests />);

    await waitFor(() => {
        expect(fetchLeaves).toHaveBeenCalledWith('all');
    });

    const filterSelect = screen.getByRole('combobox');
    fireEvent.change(filterSelect, { target: { value: 'PENDING' } });

    await waitFor(() => {
      expect(fetchLeaves).toHaveBeenCalledWith('pending');
    });
  });

  it('should call approveLeave and refresh leaves when "Approve" is clicked', async () => {
    vi.mocked(fetchLeaves).mockResolvedValue([mockLeaves[0]]); // Mock pending leave
    vi.mocked(approveLeave).mockResolvedValue({});

    render(<LeaveRequests />);

    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Approve'));

    await waitFor(() => {
      expect(approveLeave).toHaveBeenCalledWith('leave-1');
      expect(fetchLeaves).toHaveBeenCalledTimes(2); // Initial load + refresh
    });
  });

  it('should call rejectLeave and refresh leaves when "Reject" is clicked', async () => {
    vi.mocked(fetchLeaves).mockResolvedValue([mockLeaves[0]]); // Mock pending leave
    vi.mocked(rejectLeave).mockResolvedValue({});

    render(<LeaveRequests />);

    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Reject'));

    await waitFor(() => {
      expect(rejectLeave).toHaveBeenCalledWith('leave-1');
      expect(fetchLeaves).toHaveBeenCalledTimes(2); // Initial load + refresh
    });
  });

  it('should show an alert if approveLeave fails', async () => {
    vi.mocked(fetchLeaves).mockResolvedValue([mockLeaves[0]]); // Mock pending leave
    vi.mocked(approveLeave).mockRejectedValue(new Error('Approve Error'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<LeaveRequests />);

    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Approve'));

    await waitFor(() => {
      expect(approveLeave).toHaveBeenCalledWith('leave-1');
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith('Failed to approve leave');
    });

    consoleErrorSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('should show an alert if rejectLeave fails', async () => {
    vi.mocked(fetchLeaves).mockResolvedValue([mockLeaves[0]]); // Mock pending leave
    vi.mocked(rejectLeave).mockRejectedValue(new Error('Reject Error'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<LeaveRequests />);

    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Reject'));

    await waitFor(() => {
      expect(rejectLeave).toHaveBeenCalledWith('leave-1');
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith('Failed to reject leave');
    });

    consoleErrorSpy.mockRestore();
    alertSpy.mockRestore();
  });
});
