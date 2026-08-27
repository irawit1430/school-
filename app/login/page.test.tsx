import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import LoginPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('LoginPage Error Handling', () => {
  const originalFetch = global.fetch;
  const originalAlert = global.alert;
  const mockAlert = vi.fn();

  beforeEach(() => {
    global.alert = mockAlert;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.alert = originalAlert;
    vi.restoreAllMocks();
  });

  it('displays an alert and handles errors when API response is not ok', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
      } as Response)
    );

    // We expect console.error to be called twice:
    // 1. 'Login failed with status:', response.status
    // 2. 'Login error:', error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpassword' } });

    const submitButton = screen.getByRole('button', { name: /Sign in/i });
    fireEvent.click(submitButton);

    // It should immediately be disabled
    expect(submitButton).toBeDisabled();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Login failed with status:', 401);
    });

    await waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith('Login failed. Please check your credentials.');
    });

    // Should be re-enabled after finally block
    expect(submitButton).not.toBeDisabled();

    consoleSpy.mockRestore();
  });

  it('displays an alert and handles network errors (fetch throws)', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });

    const submitButton = screen.getByRole('button', { name: /Sign in/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Login error:', expect.any(Error));
    });

    await waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith('Login failed. Please check your credentials.');
    });

    expect(submitButton).not.toBeDisabled();

    consoleSpy.mockRestore();
  });
});
