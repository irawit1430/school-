"use client";
import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  apiErrorMessage,
  approvePasswordReset,
  fetchPasswordResetRequests,
  rejectPasswordReset,
  type PasswordResetRequest,
} from '@/lib/api';
import { Dialog } from '@/components/ui/Dialog';
import { CredentialsPopup } from './students/CredentialsPopup';

const ROLE_LABEL: Record<string, string> = { PARENT: 'Parent', DRIVER: 'Driver' };

// A request can be days old, so the date matters as much as the time.
const askedAt = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'at an unknown time';
};

/**
 * Everyone waiting for a new password: parents and drivers who pressed "Forgot password".
 *
 * Before this the dashboard had no list at all, and the bell's reset button never showed,
 * so a request sat pending for good, and a pending request silently swallows the same
 * person's next one. The server makes each temporary password and returns it once.
 */
export function PasswordRequestsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [requests, setRequests] = useState<PasswordResetRequest[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; temporaryPassword: string } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setRequests(await fetchPasswordResetRequests());
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not load password requests.'));
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setRequests(null);
    setIssued(null);
    void load();
  }, [open, load]);

  if (!open) return null;
  if (issued) {
    return <CredentialsPopup credentialsPopup={issued} setCredentialsPopup={() => setIssued(null)} operation="reset" />;
  }

  const drop = (id: string) => setRequests((prev) => prev?.filter((r) => r.id !== id) ?? prev);

  const approve = async (r: PasswordResetRequest) => {
    if (busyId) return;
    if (!window.confirm(`Create a new temporary password for ${r.user.name} (${r.user.email})?\n\nTheir current password stops working straight away.`)) return;
    setBusyId(r.id);
    try {
      const res = await approvePasswordReset(r.id);
      drop(r.id);
      setIssued({ email: res.user.email, temporaryPassword: res.tempPassword });
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Could not reset the password.'));
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (r: PasswordResetRequest) => {
    if (busyId) return;
    if (!window.confirm(`Decline ${r.user.name}'s request? Their password stays as it is.`)) return;
    setBusyId(r.id);
    try {
      await rejectPasswordReset(r.id);
      drop(r.id);
      toast.success('Request declined');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Could not decline the request.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog
      title={<span className="flex items-center gap-2"><KeyRound size={20} className="shrink-0 text-orange-600" aria-hidden="true" />Password requests</span>}
      onClose={onClose}
      size="lg"
      busy={busyId !== null}
    >
      <p className="mb-4 text-sm text-slate-600">
        Parents and drivers who pressed &ldquo;Forgot password&rdquo;. Make sure it is really them (call the number on file),
        then create a temporary password and give it to them directly. They choose their own when they next sign in.
      </p>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {requests === null ? (
        <p className="text-sm text-slate-500" role="status">Loading requests…</p>
      ) : requests.length === 0 ? (
        !error && <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">No one is waiting for a new password.</p>
      ) : (
        <ul className="space-y-3" aria-label="Pending password requests">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  {r.user.name}
                  <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">{ROLE_LABEL[r.user.role] || r.user.role}</span>
                </p>
                <p className="break-all text-sm text-slate-700">{r.user.email}</p>
                <p className="text-xs text-slate-500">
                  {r.user.phone ? `${r.user.phone} · ` : ''}Asked {askedAt(r.createdAt)} IST
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => void decline(r)} disabled={busyId !== null}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Decline
                </button>
                <button type="button" onClick={() => void approve(r)} disabled={busyId !== null}
                  className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
                  {busyId === r.id ? 'Working…' : 'Create temporary password'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
