"use client";
import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { apiErrorMessage, decideAttendanceReview, fetchAttendanceReview, type AttendanceReviewCase } from '@/lib/api';
import { Dialog } from '@/components/ui/Dialog';

const WHAT: Record<string, string> = { BOARDED: 'Boarded', ALIGHTED: 'Dropped off', NO_SHOW: 'Did not board' };

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' IST'
    : 'Time unknown';
};

/**
 * Check-ins the server refused, sent in by drivers.
 *
 * A refused scan used to be deleted on the driver's phone, so a child who really rode the
 * bus had no record of it and nobody at school ever knew. Now each one waits here until
 * someone at the office checks with the driver or the family and decides: record it as
 * an office correction, or close it with the reason.
 */
export function AttendanceReviewModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cases, setCases] = useState<AttendanceReviewCase[] | null>(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setCases(await fetchAttendanceReview('PENDING'));
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not load the check-ins to review.'));
      setCases([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // Opening is what fetches the list: clear the last one, then load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCases(null);
    setNotes({});
    void load();
  }, [open, load]);

  if (!open) return null;

  const decide = async (c: AttendanceReviewCase, record: boolean) => {
    const reason = (notes[c.id] || '').trim();
    if (busyId || !reason) return;
    setBusyId(c.id);
    try {
      const res = await decideAttendanceReview(c.id, { status: record ? 'RESOLVED' : 'REJECTED', reason, record });
      setCases(prev => prev?.filter(x => x.id !== c.id) ?? prev);
      toast.success(record ? `Recorded ${res.recorded} ${res.recorded === 1 ? 'check-in' : 'check-ins'} in attendance.` : 'Closed without recording.');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Could not save the decision.'));
      // Someone else may have decided it already: show the list as it is now.
      void load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog
      title={<span className="flex items-center gap-2"><ClipboardCheck size={20} className="shrink-0 text-amber-600" aria-hidden="true" />Attendance to review</span>}
      onClose={onClose}
      size="lg"
      busy={busyId !== null}
    >
      <p className="mb-4 text-sm text-slate-600">
        Check-ins the system refused, sent in by drivers. Call the driver or the family first.
        If it really happened, record it. Otherwise close it and say why. The driver sees your answer in the app.
      </p>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {cases === null ? (
        <p className="text-sm text-slate-500" role="status">Loading…</p>
      ) : cases.length === 0 ? (
        !error && <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nothing to review.</p>
      ) : (
        <ul className="space-y-4" aria-label="Refused check-ins to review">
          {cases.map(c => {
            const note = notes[c.id] || '';
            const noteId = `review-note-${c.id}`;
            return (
              <li key={c.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4" data-testid="review-case">
                <p className="font-semibold text-slate-900">{c.driverName || 'A driver'} <span className="font-normal text-slate-500">· sent {when(c.createdAt)}</span></p>
                {c.note && <p className="mt-1 text-sm text-slate-700">&ldquo;{c.note}&rdquo;</p>}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-slate-500"><tr>
                      {['Child', 'What', 'When', 'Route', 'Why it was refused'].map(h => <th key={h} scope="col" className="py-1 pr-3">{h}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-200">
                      {c.scans.map(s => <tr key={s.idempotencyKey} className="align-top">
                        <td className="py-2 pr-3 font-medium">{s.studentName}{s.grade ? <span className="text-slate-500"> · {s.grade}</span> : null}</td>
                        <td className="py-2 pr-3">{WHAT[s.type] || s.type}{s.source === 'MANUAL' ? <span className="text-slate-500"> (by name)</span> : null}</td>
                        <td className="whitespace-nowrap py-2 pr-3">{when(s.occurredAt)}</td>
                        <td className="py-2 pr-3">{s.routeName || '—'}</td>
                        <td className="py-2 pr-3 text-slate-600">{s.reason || '—'}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
                <label htmlFor={noteId} className="mt-3 block text-xs font-semibold text-slate-700">What you found (the driver sees this)</label>
                <input id={noteId} value={note} maxLength={500} disabled={busyId !== null}
                  onChange={event => setNotes(prev => ({ ...prev, [c.id]: event.target.value }))}
                  placeholder="e.g. Called the parent: she did board at Gate"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => void decide(c, false)} disabled={busyId !== null || !note.trim()}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    Close without recording
                  </button>
                  <button type="button" onClick={() => void decide(c, true)} disabled={busyId !== null || !note.trim()}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50">
                    {busyId === c.id ? 'Saving…' : 'Record in attendance'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
