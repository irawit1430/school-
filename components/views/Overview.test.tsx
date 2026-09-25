import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Overview } from './Overview';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import * as api from '@/lib/api';

// Mock the API module
vi.mock('@/lib/api', async (importOriginal) => ({
  // Keep the real apiErrorMessage, so this exercises the message an admin sees.
  ...(await importOriginal<typeof import('@/lib/api')>()),
  connectSocket: vi.fn(),
  fetchBuses: vi.fn(),
  fetchLeaves: vi.fn(),
  fetchStats: vi.fn(),
  fetchRoutes: vi.fn(),
  fetchDrivers: vi.fn(),
  approveLeave: vi.fn(),
  rejectLeave: vi.fn(),
}));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { error: toastError, success: vi.fn() } }));

describe('Overview', () => {
  let consoleErrorMock: any;

  beforeEach(() => {
    vi.resetAllMocks();

    // The live-position feed; nothing is emitted in these tests.
    (api.connectSocket as any).mockReturnValue({ on: vi.fn(), off: vi.fn(), disconnect: vi.fn() });

    (api.fetchBuses as any).mockResolvedValue([]);
    (api.fetchStats as any).mockResolvedValue({});
    (api.fetchRoutes as any).mockResolvedValue([]);
    (api.fetchDrivers as any).mockResolvedValue([]);
    (api.fetchLeaves as any).mockResolvedValue([
      {
        id: 'leave-1',
        student: { name: 'Test Student' },
        startDate: '2023-10-25T00:00:00Z',
        reason: 'Sick'
      }
    ]);

    consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles errors when approving a leave', async () => {
    const testError = new Error('API Error');
    (api.approveLeave as any).mockRejectedValueOnce(testError);

    render(<Overview />);

    const approveButton = await screen.findByRole('button', { name: 'Approve' });
    expect(approveButton).toBeInTheDocument();

    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(api.approveLeave).toHaveBeenCalledWith('leave-1');
      expect(consoleErrorMock).toHaveBeenCalledWith(testError);
      expect(toastError).toHaveBeenCalledWith('API Error');
    });
  });
  it('says the figures are unavailable rather than showing zero', async () => {
    // A failed load used to leave the tiles printing the em dash they use while loading,
    // so six cards sat there apparently still working while the banner above them said
    // the refresh had failed. 'Buses with GPS Offline: 0' is worse again — it is the
    // reading that means every bus is accounted for.
    (api.fetchStats as any).mockRejectedValue(new Error('Gateway timeout'));

    render(<Overview />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Gateway timeout'));
    expect(await screen.findAllByText('Unavailable')).toHaveLength(6);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('prints a successful zero as zero', async () => {
    (api.fetchStats as any).mockResolvedValue({ offlineDevices: 0, totalBuses: 12 });

    render(<Overview />);

    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
  });
  it('walks a new school through setup, but never during an outage', async () => {
    (api.fetchStats as any).mockResolvedValue({ totalBuses: 0, totalStudents: 0 });
    const { unmount } = render(<Overview />);
    expect(await screen.findByText('Finish setting up tracking')).toBeInTheDocument();
    expect(screen.getByText('0 of 5 done')).toBeInTheDocument();
    unmount();

    // Stats failed: zero buses is unknown, not true, so no "add your buses".
    (api.fetchStats as any).mockRejectedValue(new Error('Gateway timeout'));
    render(<Overview />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Gateway timeout'));
    expect(screen.queryByText('Finish setting up tracking')).not.toBeInTheDocument();
  });
});
