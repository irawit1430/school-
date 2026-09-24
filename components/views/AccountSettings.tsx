"use client";
import React, { useEffect, useState } from 'react';
import { Mail, Shield, School, KeyRound, Check } from 'lucide-react';
import { apiErrorMessage, getUser, updatePassword } from '@/lib/api';
import toast from 'react-hot-toast';

/**
 * The logged-in administrator's own account.
 *
 * There was a password path for parents and a credential generator for drivers, and nothing
 * at all for the person actually using this dashboard. Staff turn over, and shared office
 * logins become the norm precisely because self-service does not exist — someone who
 * suspects their password is known had no recourse inside the product. `updatePassword`
 * already existed and was called from nowhere but the login screen's reset mode.
 */
const MIN_PASSWORD = 8;

export function AccountSettings() {
  const [user, setUser] = useState<any>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(getUser());
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!current) {
      setError('Enter your current password.');
      return;
    }
    if (next.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (next !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updatePassword(current, next);
      setCurrent(''); setNext(''); setConfirm(''); setDone(true);
      toast.success('Password changed.');
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not change your password.'));
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20';

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Your account</h2>
        <p className="mt-1 text-sm text-slate-500">Who you are signed in as, and your password.</p>
      </div>

      <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Signed in as</h3>
        <dl className="mt-3 space-y-2.5 text-sm">
          <div className="flex items-center gap-2.5">
            <Mail size={15} className="shrink-0 text-slate-400" />
            <dt className="sr-only">Email</dt>
            <dd className="min-w-0 break-all font-semibold text-slate-900">{user?.email || '—'}</dd>
          </div>
          <div className="flex items-center gap-2.5">
            <Shield size={15} className="shrink-0 text-slate-400" />
            <dt className="sr-only">Role</dt>
            <dd className="text-slate-700">{user?.role ? String(user.role).replace(/_/g, ' ') : '—'}</dd>
          </div>
          <div className="flex items-center gap-2.5">
            <School size={15} className="shrink-0 text-slate-400" />
            <dt className="sr-only">School</dt>
            <dd className="min-w-0 break-all text-slate-700">
              {user?.schoolName || user?.schoolId || 'No school on this account'}
            </dd>
          </div>
        </dl>
        {user?.name && <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">{user.name}</p>}
      </div>

      <form onSubmit={submit} className="max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
          <KeyRound size={15} /> Change password
        </h3>

        {done && (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            <Check size={15} /> Your password was changed. It applies the next time you sign in.
          </p>
        )}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <fieldset disabled={saving} className="space-y-4">
          <div>
            <label htmlFor="account-current-password" className="mb-1 block text-sm font-semibold text-slate-700">
              Current password
            </label>
            <input
              id="account-current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={e => { setCurrent(e.target.value); setError(''); setDone(false); }}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="account-new-password" className="mb-1 block text-sm font-semibold text-slate-700">
              New password
            </label>
            <input
              id="account-new-password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={e => { setNext(e.target.value); setError(''); setDone(false); }}
              className={field}
            />
            <p className="mt-1 text-xs text-slate-500">At least {MIN_PASSWORD} characters.</p>
          </div>
          <div>
            <label htmlFor="account-confirm-password" className="mb-1 block text-sm font-semibold text-slate-700">
              Confirm new password
            </label>
            <input
              id="account-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(''); }}
              className={field}
            />
          </div>
        </fieldset>

        {/* The endpoint returns a fresh token and setToken stores it, so the session keeps
            working here while every other one is invalidated. Worth saying, because the
            alternative reading — "did this sign me out everywhere?" — sends people looking. */}
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          You&apos;ll stay signed in on this device. Anywhere else still using the old
          password will need to sign in again.
        </p>

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <button
            type="submit"
            disabled={saving || !current || !next || !confirm}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </form>
    </div>
  );
}
