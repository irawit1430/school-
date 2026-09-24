"use client";
import React, { useEffect, useState } from 'react';
import { Bus, Check, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiErrorMessage, fetchSchool, updateSchoolTransport, type SchoolTransport } from '@/lib/api';

// The server's own default when a school has not chosen. Kept in step with
// STOP_DWELL_MINUTES in the backend; the save response carries the real value.
const DEFAULT_WAIT = 1;

/**
 * How this school's bus times are worked out: the wait at each stop, and whether the
 * school's own location is known (it ends every morning trip and starts every
 * afternoon one).
 *
 * Route stop times are pure driving. Every ETA a parent sees, and the pickup time on a
 * child's profile, adds this wait for each stop before theirs. It was one number for
 * every school; a school with long boarding at each gate needs its own.
 */
export function SchoolTransportSettings() {
  const [school, setSchool] = useState<SchoolTransport | null>(null);
  const [loadError, setLoadError] = useState('');
  const [value, setValue] = useState('');
  const [defaultWait, setDefaultWait] = useState(DEFAULT_WAIT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSchool()
      .then((s) => {
        if (cancelled) return;
        setSchool(s);
        setValue(s.stopDwellMinutes == null ? '' : String(s.stopDwellMinutes));
      })
      .catch((err) => !cancelled && setLoadError(apiErrorMessage(err, 'Could not load the school settings.')));
    return () => { cancelled = true; };
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const trimmed = value.trim();
    const minutes = trimmed === '' ? null : Number(trimmed);
    if (minutes != null && (!Number.isFinite(minutes) || minutes < 0 || minutes > 10)) {
      setError('Enter a number of minutes from 0 to 10, or leave it empty for the default.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await updateSchoolTransport(minutes);
      setDefaultWait(res.defaultStopDwellMinutes ?? DEFAULT_WAIT);
      setSchool((s) => (s ? { ...s, stopDwellMinutes: res.stopDwellMinutes } : s));
      setDone(true);
      toast.success('Saved. Parents’ bus times use it from now on.');
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20';
  const located = school?.latitude != null && school?.longitude != null;

  return (
    <div className="space-y-6 p-4 pt-0 sm:p-6 sm:pt-0">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Bus times</h2>
        <p className="mt-1 text-sm text-slate-500">How the arrival times parents see are worked out for your school.</p>
      </div>

      {loadError && <p role="alert" className="max-w-xl rounded-lg bg-red-50 p-3 text-sm text-red-700">{loadError}</p>}

      <form onSubmit={save} className="max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
          <Bus size={15} /> Wait at each stop
        </h3>
        {done && (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            <Check size={15} /> Saved.
          </p>
        )}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div>
          <label htmlFor="stop-wait" className="mb-1 block text-sm font-semibold text-slate-700">Minutes</label>
          <input
            id="stop-wait"
            type="number"
            inputMode="decimal"
            min={0}
            max={10}
            step={0.5}
            placeholder={String(defaultWait)}
            value={value}
            disabled={saving || !school}
            onChange={(e) => { setValue(e.target.value); setError(''); setDone(false); }}
            className={field}
          />
          <p className="mt-1 text-xs text-slate-500">
            How long a bus usually stands at a stop while children get on or off. Every arrival
            time adds this for each stop before it. Leave empty for the default ({defaultWait} min).
          </p>
        </div>
        <div className="flex justify-end border-t border-slate-100 pt-4">
          <button
            type="submit"
            disabled={saving || !school}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      {school && (
        <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
            <MapPin size={15} /> School location
          </h3>
          {located ? (
            <p className="mt-3 text-sm text-slate-700">
              Set. Morning trips end here and afternoon trips start here, so parents of a child
              on board see when the bus reaches school.
            </p>
          ) : (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Not set. Without it, the drive between the last stop and school is missing from every
              bus time. Ask Voltava support to add your school&apos;s location.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
