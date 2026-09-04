/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import React, { useState, useEffect } from 'react';
import {
  fetchClosures, createClosure, deleteClosure, getSchoolId, apiErrorMessage,
  type ClosureImpact,
} from '@/lib/api';
import { datesBetween, isPlatformClosure, describeClosureImpact } from '@/lib/runs';
import toast from 'react-hot-toast';
import { CalendarOff, Trash2, Lock, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';

const today = () => new Date().toISOString().slice(0, 10);

// scope SCHOOL requires a schoolId. Failing here says which piece is missing; sending
// undefined gets a 400 that reads as though the date were wrong.
const requireSchoolId = async () => {
  const id = await getSchoolId();
  if (!id) throw new Error('No school is associated with this account.');
  return id;
};

export function SchoolCalendar() {
  const [closures, setClosures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState(today());
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [impact, setImpact] = useState<{ runCount: number; tripCount: number; days: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetchClosures()
      .then(c => setClosures(Array.isArray(c) ? c : []))
      .catch(err => toast.error(apiErrorMessage(err, 'Failed to load the calendar.')))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Any edit invalidates the answer on screen. A stale count is worse than none — it is
  // the number the closure gets decided on.
  const edit = (fn: () => void) => { fn(); setImpact(null); };

  const days = datesBetween(date, endDate || date);
  const rangeInvalid = Boolean(endDate) && endDate < date;
  const missingReason = !reason.trim();

  // One request per date: the API has no endDate and deliberately no bulk write.
  const forEachDate = async (dryRun: boolean): Promise<ClosureImpact[]> => {
    const schoolId = await requireSchoolId();
    const out: ClosureImpact[] = [];
    for (const d of days) {
      out.push(await createClosure(
        { scope: 'SCHOOL', schoolId, date: d, reason: reason.trim() },
        dryRun,
      ));
    }
    return out;
  };

  const check = async () => {
    setChecking(true);
    try {
      const results = await forEachDate(true);
      setImpact({
        runCount: results.reduce((n, r) => n + (r.runCount ?? 0), 0),
        tripCount: results.reduce((n, r) => n + (r.tripCount ?? 0), 0),
        days: results.length,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not work out what this would cancel.'));
    } finally {
      setChecking(false);
    }
  };

  const save = async () => {
    setSaving(true);
    // Written one date at a time, so a failure halfway leaves the earlier dates closed.
    // Reporting how far it got beats a bare "failed" that hides a half-applied week.
    const done: string[] = [];
    try {
      const schoolId = await requireSchoolId();
      let cancelled = 0;
      for (const d of days) {
        const res = await createClosure({ scope: 'SCHOOL', schoolId, date: d, reason: reason.trim() });
        cancelled += res.tripsCancelled ?? 0;
        done.push(d);
      }
      toast.success(
        `${done.length} ${done.length === 1 ? 'day' : 'days'} closed.` +
        (cancelled > 0 ? ` ${cancelled} existing ${cancelled === 1 ? 'trip was' : 'trips were'} cancelled.` : ''),
      );
      setReason(''); setEndDate(''); setImpact(null);
    } catch (err) {
      const msg = apiErrorMessage(err, 'Failed to save the closure.');
      toast.error(done.length > 0
        ? `${msg} ${done.length} of ${days.length} ${days.length === 1 ? 'day was' : 'days were'} closed before this — the rest were not.`
        : msg);
    } finally {
      setSaving(false);
      load();
    }
  };

  const remove = async (c: any) => {
    if (!window.confirm(`Reopen ${c.date}?\n\nSchedules will operate on this date again.`)) return;
    try {
      const res = await deleteClosure(c.id);
      const n = res?.tripsRestored ?? 0;
      toast.success(n > 0
        ? `Closure removed. ${n} ${n === 1 ? 'trip was' : 'trips were'} restored.`
        : 'Closure removed. Upcoming trips will be created automatically.');
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to remove the closure.'));
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">School calendar</h2>
        <p className="text-sm text-slate-500 mt-1">
          Days the school is closed. No schedule operates on a closed day, on any route.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="cl-from" className="block text-sm font-semibold text-slate-700 mb-1">From</label>
            <input
              id="cl-from" type="date" value={date}
              onChange={e => edit(() => setDate(e.target.value))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label htmlFor="cl-to" className="block text-sm font-semibold text-slate-700 mb-1">
              To <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="cl-to" type="date" value={endDate} min={date}
              onChange={e => edit(() => setEndDate(e.target.value))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label htmlFor="cl-reason" className="block text-sm font-semibold text-slate-700 mb-1">Reason</label>
            <input
              id="cl-reason" value={reason} placeholder="e.g. Diwali break" maxLength={200}
              onChange={e => edit(() => setReason(e.target.value))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        {rangeInvalid && <p className="text-sm text-red-700">The last day is before the first day.</p>}
        {!rangeInvalid && days.length > 1 && (
          <p className="text-xs text-slate-500">
            {days.length} days — saved one at a time, so this takes a moment.
          </p>
        )}

        {impact && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2.5">
            <AlertTriangle size={15} className="text-amber-700 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900">{describeClosureImpact(impact)}</p>
          </div>
        )}

        <div className="flex gap-2 flex-wrap items-center">
          <button
            type="button" onClick={check} disabled={checking || rangeInvalid || days.length === 0 || missingReason}
            className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg disabled:opacity-40"
          >
            {checking ? 'Checking…' : 'What does this cancel?'}
          </button>
          <button
            type="button" onClick={save} disabled={saving || rangeInvalid || days.length === 0 || missingReason}
            className="px-4 py-2 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Close the school on these dates'}
          </button>
          {missingReason && (
            <span className="text-xs text-slate-500">A reason is required — it is what parents and staff see.</span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {closures.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <CalendarOff size={28} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-700">No closures yet</p>
            <p className="text-xs text-slate-500 mt-1">Buses will run on every day the schedules cover.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {closures.map(c => {
              // A platform closure has no school attached and only a super-admin may remove
              // it. Offering a delete that the server refuses teaches the admin the button
              // is broken.
              const central = isPlatformClosure(c);
              return (
                <li key={c.id ?? c.date} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                  <span className="font-mono font-bold tabular-nums text-sm text-slate-800">{c.date}</span>
                  <span className="text-sm text-slate-600">{c.reason || 'Closed'}</span>
                  {central && (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded">
                      <Lock size={10} /> Set centrally
                    </span>
                  )}
                  {!central && (
                    <button
                      onClick={() => remove(c)}
                      className="ml-auto p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      aria-label={`Reopen ${c.date}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
