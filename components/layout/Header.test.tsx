import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Header } from './Header';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';

// Mock useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('Header', () => {
  let fetchMock: any;
  let consoleErrorMock: any;

  beforeEach(() => {
    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn((key) => {
        if (key === 'token') return 'fake-token';
        if (key === 'user') return JSON.stringify({ name: 'Test User', role: 'admin' });
        return null;
      }),
      setItem: vi.fn(),
      clear: vi.fn(),
    };
    global.localStorage = localStorageMock as any;

    fetchMock = vi.spyOn(global, 'fetch');
    consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles errors when fetching notifications', async () => {
    // Mock a failed fetch request
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    render(<Header />);

    // Wait for the initial effect to run fetchNotifications
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://gps-backend-jzd7.onrender.com/api/notifications',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer fake-token'
          }
        })
      );
    });

    // Check if error was logged
    await waitFor(() => {
      expect(consoleErrorMock).toHaveBeenCalledWith(
        'Failed to fetch notifications:',
        expect.any(Error)
      );
    });
  });
});
