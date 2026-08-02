import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Overview } from './Overview';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  fetchBuses: vi.fn(),
  fetchLeaves: vi.fn(),
  fetchStats: vi.fn(),
  fetchRoutes: vi.fn(),
  fetchDrivers: vi.fn(),
  approveLeave: vi.fn(),
  rejectLeave: vi.fn(),
}));

const mockBuses = [{ id: 'b1', status: 'active' }, { id: 'b2', status: 'maintenance' }];
const mockLeaves = [
  { id: 'l1', student: { name: 'John Doe' }, startDate: '2023-10-27T00:00:00Z', reason: 'Sick' },
  { id: 'l2', student: null, startDate: '2023-10-28T00:00:00Z', reason: 'Family' },
];
const mockStats = {
  totalStudents: 500,
  totalBuses: 10,
  totalRoutes: 5,
  activeDevices: 8,
  offlineDevices: 2,
  pendingLeaves: 2,
};
const mockDrivers = [{ id: 'd1', name: 'Alice' }, { id: 'd2', name: 'Bob' }];
const mockRoutes = [
  {
    id: 'r1',
    name: 'Route 1',
    trips: [
      { id: 't1', driverId: 'd1', status: 'IN_PROGRESS', progressPercent: 50, currentEtaMessage: 'On time' },
      { id: 't2', driverId: 'd2', status: 'DELAYED', progressPercent: 30, currentEtaMessage: 'Delayed by 5m' },
      { id: 't3', driverId: 'd1', status: 'COMPLETED' },
    ]
  }
];

describe('Overview component', () => {
  const originalAlert = global.alert;
  const mockAlert = vi.fn();
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    global.alert = mockAlert;
    vi.mocked(api.fetchBuses).mockResolvedValue(mockBuses);
    vi.mocked(api.fetchLeaves).mockResolvedValue(mockLeaves);
    vi.mocked(api.fetchStats).mockResolvedValue(mockStats);
    vi.mocked(api.fetchRoutes).mockResolvedValue(mockRoutes);
    vi.mocked(api.fetchDrivers).mockResolvedValue(mockDrivers);
    vi.mocked(api.approveLeave).mockResolvedValue({});
    vi.mocked(api.rejectLeave).mockResolvedValue({});
  });

  afterEach(() => {
    global.alert = originalAlert;
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    render(<Overview />);
    const loadingEllipses = screen.getAllByText('...');
    expect(loadingEllipses.length).toBeGreaterThan(0);
  });

  it('loads and displays data successfully', async () => {
    render(<Overview />);

    await waitFor(() => {
      expect(screen.queryAllByText('...').length).toBe(0);
    });

    // Check stats
    expect(screen.getByText('500')).toBeInTheDocument(); // total students
    expect(screen.getByText('10')).toBeInTheDocument(); // total buses
    expect(screen.getByText('5')).toBeInTheDocument(); // total routes

    // Check routes
    expect(screen.getAllByText('Route 1')[0]).toBeInTheDocument();
    expect(screen.getByText('Driver: Alice')).toBeInTheDocument();
    expect(screen.getByText('Driver: Bob')).toBeInTheDocument();
    expect(screen.getByText('50% Done')).toBeInTheDocument();
    expect(screen.getByText('30% Done')).toBeInTheDocument();

    // Check leaves
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('Sick')).toBeInTheDocument();
  });

  it('approves leave and removes it from list', async () => {
    render(<Overview />);
    await waitFor(() => {
      expect(screen.queryAllByText('...').length).toBe(0);
    });

    const approveButtons = screen.getAllByRole('button', { name: 'Approve' });
    expect(approveButtons.length).toBe(2);

    fireEvent.click(approveButtons[0]);

    await waitFor(() => {
      expect(api.approveLeave).toHaveBeenCalledWith('l1');
    });

    await waitFor(() => {
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });
  });

  it('rejects leave and removes it from list', async () => {
    render(<Overview />);
    await waitFor(() => {
      expect(screen.queryAllByText('...').length).toBe(0);
    });

    const rejectButtons = screen.getAllByRole('button', { name: 'Reject' });
    expect(rejectButtons.length).toBe(2);

    fireEvent.click(rejectButtons[0]);

    await waitFor(() => {
      expect(api.rejectLeave).toHaveBeenCalledWith('l1');
    });

    await waitFor(() => {
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });
  });

  it('handles error on load gracefully', async () => {
    vi.mocked(api.fetchBuses).mockRejectedValueOnce(new Error('Network error'));

    render(<Overview />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load overview data:', expect.any(Error));
    });

    await waitFor(() => {
      expect(screen.queryAllByText('...').length).toBe(0); // Loading state should still finish
    });
  });

  it('handles error on approve leave', async () => {
    vi.mocked(api.approveLeave).mockRejectedValueOnce(new Error('API error'));

    render(<Overview />);
    await waitFor(() => {
      expect(screen.queryAllByText('...').length).toBe(0);
    });

    const approveButtons = screen.getAllByRole('button', { name: 'Approve' });
    fireEvent.click(approveButtons[0]);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
    });

    await waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith('Failed to approve leave');
    });

    // Leave should still be in the document since the action failed
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('handles error on reject leave', async () => {
    vi.mocked(api.rejectLeave).mockRejectedValueOnce(new Error('API error'));

    render(<Overview />);
    await waitFor(() => {
      expect(screen.queryAllByText('...').length).toBe(0);
    });

    const rejectButtons = screen.getAllByRole('button', { name: 'Reject' });
    fireEvent.click(rejectButtons[0]);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
    });

    await waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith('Failed to reject leave');
    });

    // Leave should still be in the document since the action failed
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });
});
