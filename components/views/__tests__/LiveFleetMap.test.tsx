import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveFleetMap } from '../LiveFleetMap';
import * as api from '@/lib/api';

// Mock dependencies
vi.mock('@/lib/api', () => ({
  fetchBuses: vi.fn(),
  fetchDrivers: vi.fn(),
}));

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

describe('LiveFleetMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders correctly and fetches buses and drivers', async () => {
    vi.mocked(api.fetchBuses).mockResolvedValue([
      { id: '1', name: 'Bus 123', gpsLogs: [{ speed: 50 }], capacity: 40, status: 'active', gpsStatus: {speed: 50} },
    ]);
    vi.mocked(api.fetchDrivers).mockResolvedValue([
      { id: 'd1', name: 'Driver 1', driverTrips: [] },
    ]);

    render(<LiveFleetMap />);

    await waitFor(() => {
      expect(api.fetchBuses).toHaveBeenCalledTimes(1);
      expect(api.fetchDrivers).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      const busElements = screen.getAllByText('Bus 123');
      expect(busElements.length).toBeGreaterThan(0);
    });
  });

  it('handles error when fetchBuses fails', async () => {
    const error = new Error('Failed to fetch buses');
    vi.mocked(api.fetchBuses).mockRejectedValue(error);
    vi.mocked(api.fetchDrivers).mockResolvedValue([]);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<LiveFleetMap />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    });

    consoleErrorSpy.mockRestore();
  });

  it('handles error when fetchDrivers fails', async () => {
    const error = new Error('Failed to fetch drivers');
    vi.mocked(api.fetchBuses).mockResolvedValue([]);
    vi.mocked(api.fetchDrivers).mockRejectedValue(error);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<LiveFleetMap />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    });

    consoleErrorSpy.mockRestore();
  });
});
