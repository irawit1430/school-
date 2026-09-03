/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchRoutes, fetchBuses, fetchDrivers,
  fetchRuns, createRun, updateRun, deleteRun, apiErrorMessage,
} from '@/lib/api';
import {
  DAY_KEYS, DAY_LABELS, DIRECTION_LABELS, describeDays, validateRun, toRunPayload,
  type RunDraft, type Direction,
} from '@/lib/runs';
import { RunOverrides } from '@/components/views/RunOverrides';
import { Plus, Clock, AlertTriangle, Trash2, Edit2, X, CalendarDays, ArrowRight, ArrowLeft, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Skeleton } from '@/components/ui/Skeleton';

const emptyDraft = (): RunDraft => ({
  name: '', direction: 'TO_SCHOOL', departure: '07:15',
  busId: '', driverId: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false,
});

export function Schedules() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [routeId, setRouteId] = useState('');
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(false);

  const [draft, setDraft] = useState<RunDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchRoutes({ summary: true }), fetchBuses(), fetchDrivers()])
      .then(([r, b, d]) => {
        setRoutes(r); setBuses(b); setDrivers(d);
        if (r.length > 0) setRouteId(r[0].id);
        setLoading(false);
      })
      .catch(err => {
        toast.error(apiErrorMessage(err, 'Failed to load routes.'));
        setLoading(false);
      });
  }, []);

  const loadRuns = (id: string) => {
    if (!id) return;
    setLoadingRuns(true);
    fetchRuns(id)
      .then(data => setRuns(Array.isArray(data) ? data : []))
      .catch(err => toast.error(apiErrorMessage(err, 'Failed to load schedules.')))
      .finally(() => setLoadingRuns(false));
  };

  useEffect(() => { setOpenRunId(null); loadRuns(routeId); }, [routeId]);

  // Soft-deleted runs are still returned so a recreation can't collide with something
  // invisible. The admin doesn't need to see them.
  const visibleRuns = useMemo(() => runs.filter(r => r.active !== false), [runs]);
  const crewless = useMemo(() => visibleRuns.filter(r => r.hasCrew === false), [visibleRuns]);

  const openCreate = () => { setEditingId(null); setDraft(emptyDraft()); setProblems([]); };

  const openEdit = (run: any) => {
    setEditingId(run.id);
    setProblems([]);
    setDraft({
      name: run.name ?? '', direction: run.direction, departure: run.departure,
      busId: run.busId ?? '', driverId: run.driverId ?? '',
      startDate: run.startDate ?? '', endDate: run.endDate ?? '',
      ...Object.fromEntries(DAY_KEYS.map(d => [d, Boolean(run[d])])),
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;

    const found = validateRun(draft);
    setProblems(found);
    if (found.length > 0) return;

    setSaving(true);
    try {
      const payload = toRunPayload(draft);
      if (editingId) {
        await updateRun(editingId, payload);
        toast.success('Schedule updated. Changes apply from the next materialisation.');
      } else {
        await createRun(routeId, payload);
        toast.success('Schedule created. Trips appear at the next materialisation.');
      }
      setDraft(null);
      loadRuns(routeId);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to save the schedule.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (run: any) => {
    if (!window.confirm(
      `Stop this schedule?\n\n${run.name} · ${DIRECTION_LABELS[run.direction as Direction] ?? run.direction} · ${run.departure}\n\n` +
      `Trips already created are left alone. No new ones will be generated.`
    )) return;
    try {
      await deleteRun(run.id);
      toast.success('Schedule stopped');
      loadRuns(routeId);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to stop the schedule.'));
    }
  };

  const setDay = (day: string, on: boolean) => setDraft(d => d && ({ ...d, [day]: on }));

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Schedules</h2>
          <p className="text-sm text-slate-500 mt-1">
            Recurring services on a route. Trips are generated automatically instead of being created by hand each morning.
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={!routeId}
          className="bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-colors"
        >
          <Plus size={16} /> New schedule
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <label htmlFor="route-picker" className="block text-xs font-semibold text-slate-600 mb-1">Route</label>
        <select
          id="route-picker"
          value={routeId}
          onChange={e => setRouteId(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-orange-500"
        >
          {routes.length === 0 && <option value="">No routes yet — create one first</option>}
          {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {crewless.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-900">
            <p className="font-semibold">
              {crewless.length} {crewless.length === 1 ? 'schedule has' : 'schedules have'} no bus or driver and will not run.
            </p>
            <p className="text-red-800 mt-0.5">
              This happens when a bus or driver is deleted after the schedule was made. Edit each one and reassign, or the route simply won&apos;t operate.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loadingRuns ? (
          <div className="p-6 space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
        ) : visibleRuns.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <CalendarDays size={28} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-700">No schedules on this route</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Without one, someone has to create this route&apos;s trips by hand every morning.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visibleRuns.map(run => (
              <li key={run.id}>
                <div className="px-4 py-3 flex items-center gap-4 flex-wrap hover:bg-slate-50/50 transition-colors">
                <div className={clsx(
                  "p-2 rounded-lg shrink-0",
                  run.direction === 'TO_SCHOOL' ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700"
                )}>
                  {run.direction === 'TO_SCHOOL' ? <ArrowRight size={15} /> : <ArrowLeft size={15} />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-900 text-sm">{run.name}</p>
                    {run.hasCrew === false && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded">
                        No crew
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {DIRECTION_LABELS[run.direction as Direction] ?? run.direction} · {describeDays(run)}
                    {run.startDate && run.endDate && <> · {run.startDate} to {run.endDate}</>}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 text-slate-700 font-mono font-bold text-sm tabular-nums">
                  <Clock size={14} className="text-slate-400" />
                  {run.departure}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOpenRunId(id => (id === run.id ? null : run.id))}
                    aria-expanded={openRunId === run.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-orange-700 hover:bg-orange-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    Exam days & closures
                    <ChevronDown size={13} className={clsx('transition-transform', openRunId === run.id && 'rotate-180')} />
                  </button>
                  <button
                    onClick={() => openEdit(run)}
                    className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500"
                    aria-label={`Edit ${run.name}`}
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(run)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                    aria-label={`Stop ${run.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                </div>
                {openRunId === run.id && <RunOverrides run={run} routeId={routeId} />}
              </li>
            ))}
          </ul>
        )}
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="font-bold text-slate-900 text-lg">
                {editingId ? 'Edit schedule' : 'New schedule'}
              </h3>
              <button onClick={() => setDraft(null)} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {problems.length > 0 && (
                <ul className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 space-y-1">
                  {problems.map(p => <li key={p}>• {p}</li>)}
                </ul>
              )}

              <div>
                <label htmlFor="run-name" className="block text-sm font-semibold text-slate-700 mb-1">Name</label>
                <input
                  id="run-name"
                  value={draft.name}
                  onChange={e => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Morning pickup"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="run-direction" className="block text-sm font-semibold text-slate-700 mb-1">Direction</label>
                  <select
                    id="run-direction"
                    value={draft.direction}
                    onChange={e => setDraft({ ...draft, direction: e.target.value as Direction })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="TO_SCHOOL">To school</option>
                    <option value="FROM_SCHOOL">From school</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="run-departure" className="block text-sm font-semibold text-slate-700 mb-1">Departure</label>
                  <input
                    id="run-departure"
                    type="time"
                    value={draft.departure}
                    onChange={e => setDraft({ ...draft, departure: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <span className="block text-sm font-semibold text-slate-700 mb-1.5">Runs on</span>
                <div className="flex gap-1.5 flex-wrap">
                  {DAY_KEYS.map(day => {
                    const on = Boolean(draft[day]);
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setDay(day, !on)}
                        className={clsx(
                          "w-11 h-9 rounded-lg text-xs font-bold transition-colors border focus:outline-none focus:ring-2 focus:ring-orange-500",
                          on
                            ? "bg-orange-600 text-white border-orange-600"
                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                        )}
                      >
                        {DAY_LABELS[day]}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500 mt-1.5">{describeDays(draft)}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="run-bus" className="block text-sm font-semibold text-slate-700 mb-1">Bus</label>
                  <select
                    id="run-bus"
                    value={draft.busId}
                    onChange={e => setDraft({ ...draft, busId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Select a bus</option>
                    {buses.map(b => (
                      <option key={b.id} value={b.id}>{b.registrationNumber || b.licensePlate || b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="run-driver" className="block text-sm font-semibold text-slate-700 mb-1">Driver</label>
                  <select
                    id="run-driver"
                    value={draft.driverId}
                    onChange={e => setDraft({ ...draft, driverId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Select a driver</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="run-start" className="block text-sm font-semibold text-slate-700 mb-1">First day</label>
                  <input
                    id="run-start" type="date" value={draft.startDate}
                    onChange={e => setDraft({ ...draft, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label htmlFor="run-end" className="block text-sm font-semibold text-slate-700 mb-1">Last day</label>
                  <input
                    id="run-end" type="date" value={draft.endDate}
                    onChange={e => setDraft({ ...draft, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-3">
                Trips are generated a few days ahead, so a new or edited schedule takes effect at the
                next generation rather than immediately. Trips already created are not rewritten.
              </p>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button" onClick={() => setDraft(null)} disabled={saving}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={saving}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
