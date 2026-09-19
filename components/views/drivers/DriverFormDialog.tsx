import React, { useState } from 'react';
import { apiErrorMessage, createDriver, updateDriver } from '@/lib/api';
import { buildDriverUpdate, type DriverRecord } from '@/lib/drivers';
import { DriverDialog } from './DriverDialog';

export interface DriverCredentials { email: string; tempPassword: string }

export function DriverFormDialog({ driver, onClose, onSaved }: {
  driver?: DriverRecord; onClose: () => void; onSaved: (credentials?: DriverCredentials) => void;
}) {
  const [form, setForm] = useState({ name: driver?.name ?? '', email: driver?.email ?? '', phone: driver?.phone ?? '', password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!form.name.trim()) { setError('Enter the driver’s name.'); return; }
    setSaving(true);
    setError('');
    try {
      if (driver) {
        await updateDriver(driver.id, buildDriverUpdate(form));
        onSaved();
      } else {
        const result = await createDriver({ name: form.name.trim(), email: form.email.trim(), ...(form.phone.trim() ? { phone: form.phone.trim() } : {}) });
        onSaved(result?.tempPassword ? { email: result.driver?.email ?? form.email.trim(), tempPassword: result.tempPassword } : undefined);
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save the driver. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DriverDialog title={driver ? `Edit ${driver.name}` : 'Add driver'} onClose={onClose} busy={saving}>
      <form onSubmit={save} className="space-y-4 p-6">
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <label className="block text-sm font-semibold" htmlFor="driver-name">Driver name
          <input id="driver-name" required maxLength={200} autoComplete="name" value={form.name} disabled={saving}
            onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} />
        </label>
        <label className="block text-sm font-semibold" htmlFor="driver-email">Email address
          <input id="driver-email" type="email" required autoComplete="email" value={form.email} disabled={saving}
            onChange={e => setForm({ ...form, email: e.target.value })} className={inputClass} />
        </label>
        <label className="block text-sm font-semibold" htmlFor="driver-phone">Phone number <span className="font-normal text-slate-500">(optional)</span>
          <input id="driver-phone" type="tel" minLength={6} maxLength={20} autoComplete="tel" placeholder="e.g. +91 9876543210" value={form.phone} disabled={saving}
            onChange={e => setForm({ ...form, phone: e.target.value })} className={inputClass} />
        </label>
        {driver && <div>
          <label className="block text-sm font-semibold" htmlFor="driver-password">New password <span className="font-normal text-slate-500">(optional)</span></label>
          <input id="driver-password" type={showPassword ? 'text' : 'password'} minLength={8} maxLength={200} autoComplete="new-password" value={form.password} disabled={saving}
            aria-describedby="driver-password-help" onChange={e => setForm({ ...form, password: e.target.value })} className={inputClass} />
          <button type="button" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="mt-1 text-sm text-orange-700">{showPassword ? 'Hide password' : 'Show password'}</button>
          <p id="driver-password-help" className="mt-1 text-xs text-slate-500">Leave blank to keep the current password. Changing it signs the driver out; share the new password with them.</p>
        </div>}
        {!driver && <p className="text-sm text-slate-500">You’ll receive temporary login details to share with the driver.</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">{saving ? 'Saving…' : driver ? 'Save changes' : 'Add driver'}</button>
        </div>
      </form>
    </DriverDialog>
  );
}
