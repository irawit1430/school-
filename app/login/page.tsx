"use client";
import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MapPin,
  ShieldCheck,
  Siren,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Logo } from '@/components/ui/Logo';
import { ApiError, getUser, login, setUser, updatePassword } from '@/lib/api';

/** Admins sign in from the same office desktop every morning; only the email is
 *  remembered, never the password. */
const REMEMBERED_EMAIL_KEY = 'voltava.login.email';

/** What the dashboard behind this form actually does — shown on the brand panel
 *  so a first-time admin knows what they are signing into. */
const CAPABILITIES = [
  { icon: MapPin, title: 'Live fleet on a map', body: 'Every bus, every route, updated as it moves.' },
  { icon: ShieldCheck, title: 'Who boarded, when', body: 'Student boarding and drop-offs logged in real time.' },
  { icon: Siren, title: 'SOS reaches you first', body: 'A driver alert lands here the moment it is raised.' },
];

/** Mirrors the backend's password rules so we can fail before the round trip. */
function passwordChecks(password: string) {
  return [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'A letter and a number', ok: /[a-zA-Z]/.test(password) && /\d/.test(password) },
  ];
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Array<{ path: string; message: string }>>([]);
  const [showForgotHint, setShowForgotHint] = useState(false);
  const router = useRouter();

  const [isResetMode, setIsResetMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Prefill the email this browser signed in with last time. This has to happen
  // after mount rather than in a lazy initializer: localStorage does not exist
  // during the server render, so reading it any earlier renders a filled field
  // over an empty one and trips a hydration mismatch.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage, see above
        setEmail(saved);
        setRememberEmail(true);
      }
    } catch {
      // Private browsing or blocked storage — just start with an empty field.
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setApiError(null);
    setIssues([]);

    try {
      const user = await login(email, password);

      try {
        if (rememberEmail) localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
        else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      } catch {
        // Not being able to remember the email is not worth failing the sign-in.
      }

      if (user.mustResetPassword === true) {
        setIsResetMode(true);
      } else {
        router.push('/');
      }
    } catch (error) {
      console.error('Login error:', error);
      if (error instanceof ApiError) {
        setApiError(
          error.status === 429
            ? 'Too many attempts, please wait a minute.'
            : error.message || 'Login failed.'
        );
        if (error.issues) setIssues(error.issues);
      } else {
        setApiError('Login failed. Please check your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setApiError('Passwords do not match');
      return;
    }
    setIsLoading(true);
    setApiError(null);
    try {
      // `password` is still the one they just signed in with.
      await updatePassword(password, newPassword);

      // The user is already authenticated at this point — clear the flag locally
      // so the dashboard does not bounce them straight back here.
      const user = getUser();
      if (user) {
        user.mustResetPassword = false;
        setUser(user);
      }

      toast.success('Password updated');
      router.push('/');
    } catch (error) {
      console.error('Password update error:', error);
      setApiError(error instanceof Error ? error.message : 'Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  const leaveResetMode = () => {
    setIsResetMode(false);
    setNewPassword('');
    setConfirmPassword('');
    setPassword('');
    setApiError(null);
  };

  const emailIssue = issues.find((i) => i.path === 'email')?.message;
  const passwordIssue = issues.find((i) => i.path === 'password')?.message;

  const checks = passwordChecks(newPassword);
  const meetsRules = checks.every((c) => c.ok);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const canSubmitReset = meetsRules && passwordsMatch && !isLoading;

  // globals.css already gives every focusable element a :focus-visible outline in
  // the brand colour, so the fields only need to move their border — adding a ring
  // on top of that outline reads as a doubled halo.
  const fieldClass = (hasIssue?: string) =>
    `block w-full rounded-lg border bg-app-bg/60 py-2.5 pl-10 pr-11 text-sm text-text-strong placeholder:text-text-muted/70 transition-colors ${
      hasIssue ? 'border-danger' : 'border-surface-border focus:border-primary'
    }`;

  const errorBanner = apiError && (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger"
    >
      {apiError}
    </div>
  );

  return (
    <div className="min-h-screen bg-app-bg lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ── Brand panel ─────────────────────────────────────────────────────
          Desktop only. On smaller screens the compact header below stands in
          for it, so an admin on a tablet is not scrolling past a poster. */}
      <aside className="relative hidden overflow-hidden bg-primary px-14 py-12 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-warning/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-white/5 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <Logo className="h-10 w-10" variant="dark" />
          <span className="text-lg font-bold tracking-tight text-white">Voltava</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white">
            Every bus, every child,
            <br />
            on one screen.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white/70">
            The command centre for your school&apos;s transport — from the first pickup to
            the last drop.
          </p>

          <ul className="mt-10 space-y-5">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-warning">
                  <Icon size={18} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{title}</span>
                  <span className="block text-sm text-white/60">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs font-medium text-white/40">
          Voltava Mobility India · Proudly built in India 🇮🇳
        </p>
      </aside>

      {/* ── Form panel ──────────────────────────────────────────────────── */}
      <main className="flex min-h-screen flex-col justify-center px-5 py-12 sm:px-8 lg:min-h-0 lg:px-14">
        <div className="mx-auto w-full max-w-sm">
          {/* Compact brand header — carries the logo on phones and tablets. */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo className="h-9 w-9" variant="light" />
            <span className="text-base font-bold tracking-tight text-text-strong">Voltava</span>
          </div>

          {!isResetMode ? (
            <>
              <h2 className="text-2xl font-bold tracking-tight text-text-strong">Welcome back</h2>
              <p className="mt-1.5 text-sm text-text-muted">
                Sign in to your school&apos;s fleet dashboard.
              </p>

              <form className="mt-8 space-y-5" onSubmit={handleLogin} noValidate>
                {errorBanner}

                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-text-strong">
                    Email address
                  </label>
                  <div className="relative mt-2">
                    <Mail
                      aria-hidden
                      className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                    />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={Boolean(emailIssue)}
                      aria-describedby={emailIssue ? 'email-error' : undefined}
                      className={fieldClass(emailIssue)}
                      placeholder="admin@yourschool.edu"
                    />
                  </div>
                  {emailIssue && (
                    <p id="email-error" className="mt-1.5 text-sm text-danger">
                      {emailIssue}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-text-strong">
                    Password
                  </label>
                  <div className="relative mt-2">
                    <Lock
                      aria-hidden
                      className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                    />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={(e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
                      onBlur={() => setCapsLock(false)}
                      aria-invalid={Boolean(passwordIssue)}
                      aria-describedby={passwordIssue ? 'password-error' : undefined}
                      className={fieldClass(passwordIssue)}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-text-muted transition-colors hover:text-text-strong"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {passwordIssue && (
                    <p id="password-error" className="mt-1.5 text-sm text-danger">
                      {passwordIssue}
                    </p>
                  )}
                  {capsLock && (
                    <p className="mt-1.5 text-sm text-warning">Caps Lock is on.</p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="remember-email" className="flex items-center gap-2 text-sm text-text-muted">
                    <input
                      id="remember-email"
                      name="remember-email"
                      type="checkbox"
                      checked={rememberEmail}
                      onChange={(e) => setRememberEmail(e.target.checked)}
                      className="h-4 w-4 rounded border-surface-border text-primary accent-primary"
                    />
                    Remember my email
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowForgotHint((v) => !v)}
                    aria-expanded={showForgotHint}
                    className="text-sm font-semibold text-primary transition-colors hover:text-primary-hover"
                  >
                    Forgot password?
                  </button>
                </div>

                {showForgotHint && (
                  <p className="rounded-lg bg-primary-soft px-3 py-2.5 text-sm text-primary-softtext">
                    Passwords are reset by your school administrator. Ask them to issue a new
                    one — you&apos;ll be asked to choose your own the next time you sign in.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isLoading ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      Sign in
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={leaveResetMode}
                className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted transition-colors hover:text-text-strong"
              >
                <ArrowLeft size={16} />
                Back to sign in
              </button>

              <h2 className="text-2xl font-bold tracking-tight text-text-strong">
                Choose a new password
              </h2>
              <p className="mt-1.5 text-sm text-text-muted">
                You&apos;re signing in with a default password. Set your own to continue.
              </p>

              <form className="mt-8 space-y-5" onSubmit={handleResetPassword} noValidate>
                {errorBanner}

                <div>
                  <label htmlFor="new-password" className="block text-sm font-semibold text-text-strong">
                    New password
                  </label>
                  <div className="relative mt-2">
                    <Lock
                      aria-hidden
                      className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                    />
                    <input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className={fieldClass()}
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-text-muted transition-colors hover:text-text-strong"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  <ul className="mt-3 space-y-1.5">
                    {checks.map(({ label, ok }) => (
                      <li
                        key={label}
                        className={`flex items-center gap-2 text-sm ${
                          ok ? 'text-success' : 'text-text-muted'
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                            ok ? 'border-success bg-success text-white' : 'border-surface-border'
                          }`}
                        >
                          {ok && <Check size={11} strokeWidth={3} />}
                        </span>
                        {label}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <label
                    htmlFor="confirm-password"
                    className="block text-sm font-semibold text-text-strong"
                  >
                    Confirm new password
                  </label>
                  <div className="relative mt-2">
                    <Lock
                      aria-hidden
                      className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted"
                    />
                    <input
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={fieldClass()}
                      placeholder="Confirm new password"
                    />
                  </div>
                  {confirmPassword.length > 0 && !passwordsMatch && (
                    <p className="mt-1.5 text-sm text-danger">Passwords do not match.</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!canSubmitReset}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isLoading ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      Set password &amp; continue
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          <p className="mt-10 text-center text-xs font-medium text-text-muted lg:text-left">
            Protected by Voltava Mobility India ·{' '}
            <a href="#" className="text-text-strong hover:underline">
              Privacy Policy
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
