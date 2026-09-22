import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Header } from './Header';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { API_BASE, clearApiCache } from '@/lib/api';
import { CONFIG } from '@/lib/config';

// Mock useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Keep the real API layer so the request is built for real, but don't open a live
// socket.io connection to the backend from a unit test.
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  connectSocket: vi.fn(() => ({ on: vi.fn(), off: vi.fn(), disconnect: vi.fn() })),
}));

describe('Header', () => {
  let fetchMock: any;

  beforeEach(() => {
    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn((key) => {
        if (key === 'token') return 'fake-token';
        if (key === CONFIG.USER_STORAGE_KEY) return JSON.stringify({ name: 'Test User', role: 'admin' });
        return null;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    global.localStorage = localStorageMock as any;

    clearApiCache();
    fetchMock = vi.spyOn(global, 'fetch');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
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
        `${API_BASE}/notifications?limit=20`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer fake-token',
          }),
        })
      );
    });

    // A failed refresh is not an empty inbox: the panel must say it couldn't refresh.
    fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    expect(
      await screen.findByText('Could not refresh notifications. Showing the last available updates.')
    ).toBeInTheDocument();
  });
});
