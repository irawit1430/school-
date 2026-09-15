import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ApiError } from '@/lib/api';
import LoginPage from './page';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// Only the network-facing calls are mocked — ApiError stays real so the page's
// `instanceof` branch is exercised rather than stubbed around.
vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>();
  return {
    ...actual,
    login: vi.fn(),
    updatePassword: vi.fn(),
    getUser: vi.fn(() => null),
    setUser: vi.fn(),
  };
});

const api = await import('@/lib/api');
const login = vi.mocked(api.login);
const updatePassword = vi.mocked(api.updatePassword);

const adminUser = {
  id: '1',
  name: 'Admin',
  email: 'admin@school.edu',
  role: 'SCHOOL_ADMIN',
  schoolId: 's1',
  mustResetPassword: false,
  preferences: {},
};

function signIn(email = 'admin@school.edu', password = 'hunter2') {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /^Sign in$/i }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('signs in and sends the admin to the dashboard', async () => {
    login.mockResolvedValue(adminUser);
    render(<LoginPage />);

    signIn();

    await waitFor(() => expect(login).toHaveBeenCalledWith('admin@school.edu', 'hunter2'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });

  it('shows the server message inline instead of an alert', async () => {
    login.mockRejectedValue(new ApiError('Invalid credentials', 401));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<LoginPage />);

    const submitButton = screen.getByRole('button', { name: /^Sign in$/i });
    signIn();
    expect(submitButton).toBeDisabled();

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect(submitButton).not.toBeDisabled());
  });

  it('explains a rate limit rather than repeating the server text', async () => {
    login.mockRejectedValue(new ApiError('Too Many Requests', 429));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<LoginPage />);

    signIn();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts, please wait a minute.'
    );
  });

  it('puts field validation issues under the fields they belong to', async () => {
    login.mockRejectedValue(
      new ApiError('Validation failed', 400, [{ path: 'email', message: 'Not a valid email' }])
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<LoginPage />);

    signIn('not-an-email');

    expect(await screen.findByText('Not a valid email')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true');
  });

  it('falls back to a generic message for a non-API failure', async () => {
    login.mockRejectedValue(new Error('Network error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<LoginPage />);

    signIn();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Login failed. Please check your credentials.'
    );
  });

  it('reveals and re-hides the password', () => {
    render(<LoginPage />);
    const field = screen.getByLabelText('Password');

    expect(field).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field).toHaveAttribute('type', 'password');
  });

  it('remembers the email only when asked, and prefills it next time', async () => {
    login.mockResolvedValue(adminUser);
    const { unmount } = render(<LoginPage />);

    fireEvent.click(screen.getByLabelText('Remember my email'));
    signIn();

    await waitFor(() => expect(localStorage.getItem('voltava.login.email')).toBe('admin@school.edu'));
    unmount();

    render(<LoginPage />);
    expect(screen.getByLabelText('Email address')).toHaveValue('admin@school.edu');
    expect(screen.getByLabelText('Remember my email')).toBeChecked();
  });
});

describe('LoginPage forced password reset', () => {
  beforeEach(() => {
    localStorage.clear();
    login.mockResolvedValue({ ...adminUser, mustResetPassword: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function reachResetMode() {
    render(<LoginPage />);
    signIn();
    return screen.findByRole('heading', { name: /Choose a new password/i });
  }

  it('asks for a new password instead of going to the dashboard', async () => {
    await reachResetMode();
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps submit disabled until the rules are met and the passwords match', async () => {
    await reachResetMode();
    const submit = screen.getByRole('button', { name: /Set password/i });
    expect(submit).toBeDisabled();

    // Long enough, but no digit.
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'passwordonly' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'passwordonly' },
    });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpass1234' } });
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'newpass1234' },
    });
    expect(submit).toBeEnabled();
  });

  it('updates the password and continues to the dashboard', async () => {
    updatePassword.mockResolvedValue(undefined);
    await reachResetMode();

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpass1234' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'newpass1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Set password/i }));

    await waitFor(() => expect(updatePassword).toHaveBeenCalledWith('newpass1234'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });

  it('lets the admin back out to the sign-in form', async () => {
    await reachResetMode();

    fireEvent.click(screen.getByRole('button', { name: /Back to sign in/i }));

    expect(screen.getByRole('heading', { name: /Welcome back/i })).toBeInTheDocument();
  });
});
