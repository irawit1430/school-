import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Overview } from './Overview';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import * as api from '@/lib/api';

// Mock the API module
vi.mock('@/lib/api', () => ({
  fetchBuses: vi.fn(),
  fetchLeaves: vi.fn(),
  fetchStats: vi.fn(),
  fetchRoutes: vi.fn(),
  fetchDrivers: vi.fn(),
  approveLeave: vi.fn(),
  rejectLeave: vi.fn(),
}));

describe('Overview', () => {
  let consoleErrorMock: any;
  let alertMock: any;

  beforeEach(() => {
    vi.resetAllMocks();

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
    alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
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
      expect(alertMock).toHaveBeenCalledWith('Failed to approve leave');
    });
  });
});
