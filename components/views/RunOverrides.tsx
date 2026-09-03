/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchSchedulePreview, fetchExceptions, createExceptions, deleteException, apiErrorMessage,
} from '@/lib/api';
import {
  previewDatesFor, isOperating, overrideBlockedReason,
  STATUS_LABELS, STATUS_TONES, type PreviewDate,
} from '@/lib/runs';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Trash2, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Parsed as parts, not `new Date(iso)`: the string form is UTC midnight, which is the
// previous day in every timezone west of Greenwich and the day the label is off by one.
const label = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return { day: WEEKDAY[dt.getDay()], num: d, month: dt.toLocaleString(undefined, { month: 'short' }) };
};

/**
 * Per-date overrides for one run, with the preview they act on in the same view.
 *
 * The preview is not a nicety here. An override only means something against the dates it
 * changes: shown separately, an admin sets 09:00 on a date the run does not fall on and
 * finds out never.
 */
export function RunOverrides({ run, routeId }: { run: any; routeId: string }) {
  const [dates, setDates] = useState<PreviewDate[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [departure, setDeparture] = useState(run.departure ?? '07:15');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([fetchSchedulePreview(routeId), fetchExceptions(run.id)])
      .then(([preview, exc]) => {
        setDates(previewDatesFor(preview, run.id));
        setExceptions(Array.isArray(exc) ? exc : []);
      })
      .catch(err => toast.error(apiErrorMessage(err, 'Failed to load the schedule preview.')))
      .finally(() => setLoading(false));
  };

  useEffect(load, [run.id, routeId]);

  const byDate = useMemo(() => new Map(dates.map(d => [d.date, d])), [dates]);
  const toggle = (iso: string) =>
    setPicked(p => (p.includes(iso) ? p.filter(x => x !== iso) : [...p, iso]));

  // Cancelling only makes sense for a date something happens on; the button says so
  // rather than failing at the server.
  const pickedOperating = picked.filter(iso => {
    const d = byDate.get(iso);
    return d ? isOperating(d.status) : false;
  }).length;

  const apply = async (type: 'ADDED' | 'REMOVED') => {
    setBusy(true);
    try {
      const res = await createExceptions(run.id, {
        dates: picked,
        type,
        ...(type === 'ADDED' ? { departure } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      const now = res?.appliedToExistingTrips ?? [];
      const n = picked.length;
      toast.success(
        now.length > 0
          ? `${n} ${n === 1 ? 'date' : 'dates'} saved. ${now.length} already had a trip and ${now.length === 1 ? 'it was' : 'they were'} updated now.`
          : `${n} ${n === 1 ? 'date' : 'dates'} saved. They take effect when trips are next generated.`,
      );
      setPicked([]);
      setReason('');
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to save the override.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (exc: any) => {
    try {
      await deleteException(exc.id);
      toast.success('Override removed');
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to remove the override.'));
    }
  };

  if (loading) {
    return <div className="px-4 pb-4"><Skeleton className="h-24 w-full rounded-lg" /></div>;
  }

  return (
    <div className="px-4 pb-4 space-y-4">
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-2">
          Next {dates.length} days — pick the dates to change
        </p>
        <div className="flex gap-1.5 flex-wrap">
          {dates.map(d => {
            const blocked = overrideBlockedReason(d);
            const on = picked.includes(d.date);
            const { day, num, month } = label(d.date);
            return (
              <button
                key={d.date}
                type="button"
                disabled={Boolean(blocked)}
                aria-pressed={on}
                title={blocked ?? d.reason ?? STATUS_LABELS[d.status]}
                onClick={() => toggle(d.date)}
                className={clsx(
                  'w-[74px] rounded-lg border px-1 py-1.5 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500',
                  STATUS_TONES[d.status],
                  blocked ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-95',
                  on && 'ring-2 ring-orange-500 ring-offset-1',
                )}
              >
                <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-70">{day}</span>
                <span className="block text-sm font-bold tabular-nums">{num} {month}</span>
                <span className="block text-[9px] leading-tight mt-0.5">{STATUS_LABELS[d.status]}</span>
                {d.departure && <span className="block text-[9px] font-mono">{d.departure}</span>}
              </button>
            );
          })}
        </div>
        {dates.length === 0 && (
          <p className="text-xs text-slate-500">No preview available for this schedule.</p>
        )}
      </div>

      {picked.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
          <p className="text-xs font-semibold text-slate-700">
            {picked.length} {picked.length === 1 ? 'date' : 'dates'} selected
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor={`ov-time-${run.id}`} className="block text-[11px] font-semibold text-slate-600 mb-1">
                Departure for these dates
              </label>
              <input
                id={`ov-time-${run.id}`}
                type="time"
                value={departure}
                onChange={e => setDeparture(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label htmlFor={`ov-reason-${run.id}`} className="block text-[11px] font-semibold text-slate-600 mb-1">
                Reason (optional)
              </label>
              <input
                id={`ov-reason-${run.id}`}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Half-day for exams"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              type="button" disabled={busy} onClick={() => apply('ADDED')}
              className="px-4 py-2 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg disabled:opacity-50"
            >
              Run at {departure} on these dates
            </button>
            <button
              type="button" disabled={busy || pickedOperating === 0} onClick={() => apply('REMOVED')}
              className="px-4 py-2 text-sm font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg disabled:opacity-40"
            >
              Cancel service on these dates
            </button>
            <button
              type="button" onClick={() => setPicked([])}
              className="px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
            >
              Clear
            </button>
          </div>

          {pickedOperating === 0 && (
            <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Info size={12} /> None of these dates run today, so there is nothing to cancel. Setting a departure creates service.
            </p>
          )}
        </div>
      )}

      {exceptions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-1.5">Existing overrides</p>
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {exceptions.map(e => (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-xs bg-white">
                <span className="font-mono font-bold tabular-nums text-slate-800">{e.date}</span>
                <span className={clsx(
                  'px-2 py-0.5 rounded font-semibold',
                  e.type === 'REMOVED' ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700',
                )}>
                  {e.type === 'REMOVED' ? 'Cancelled' : e.departure ? `Runs ${e.departure}` : 'Added'}
                </span>
                {e.reason && <span className="text-slate-500 truncate">{e.reason}</span>}
                <button
                  onClick={() => remove(e)}
                  className="ml-auto p-1 text-slate-400 hover:text-red-600 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={`Remove override on ${e.date}`}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
