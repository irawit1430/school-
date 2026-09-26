"use client";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import { AlertTriangle, BellRing, CheckCircle2, Mail, Printer, RefreshCw, Search, Send, UserX, XCircle } from 'lucide-react';
import {
  apiErrorMessage, fetchParentActivation, revokeParentInvite, sendParentInvites,
  type ActivationParent, type ParentActivation as Activation, type ParentPushState, type ParentStage,
} from '@/lib/api';
import { inviteDetail, printInviteLetters, PUSH_META, STAGE_META } from '@/lib/invites';
import { InviteDialog, type InviteTarget } from './parents/InviteDialog';
import { Skeleton } from '@/components/ui/Skeleton';

const TONE = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  blue: 'bg-sky-50 text-sky-800 border-sky-200',
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
} as const;

const badge = 'inline-flex w-max items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold';
const btn = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const BATCH = 50;

const STAGES = Object.keys(STAGE_META) as ParentStage[];
const PUSHES = Object.keys(PUSH_META) as ParentPushState[];

/** Who can be sent an invite now: anyone who has not chosen their own password. */
const invitable = (p: ActivationParent) => p.stage !== 'ACTIVATED';

/**
 * Spec: "shared the app with parents" must mean something the school can check.
 *
 * Each family's path, in order: child linked → invite made → signed in → own password →
 * alerts reaching the phone. The tiles count each step; the list says where every family
 * is and what to do about it. Invites go one at a time (WhatsApp, SMS, email, letter), or
 * for a selection by email or printed letters.
 */
export function ParentActivation() {
  const params = useSearchParams();
  const [data, setData] = useState<Activation | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<ParentStage | 'ALL'>(() => (STAGES.includes(params.get('stage') as ParentStage) ? params.get('stage') as ParentStage : 'ALL'));
  const [push, setPush] = useState<ParentPushState | 'ALL'>(() => (PUSHES.includes(params.get('push') as ParentPushState) ? params.get('push') as ParentPushState : 'ALL'));
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState<InviteTarget | null>(null);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchParentActivation());
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load parents.'));
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load once on mount; setState happens after the await
  useEffect(() => { void load(); }, [load]);

  const parents = useMemo(() => data?.parents ?? [], [data]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parents
      .filter(p => stage === 'ALL' || p.stage === stage)
      .filter(p => push === 'ALL' || (p.stage === 'ACTIVATED' && p.push.state === push))
      .filter(p => !q || [p.name, p.email, p.phone ?? '', ...p.children.map(c => c.name)].join(' ').toLowerCase().includes(q))
      .sort((a, b) => STAGE_META[a.stage].order - STAGE_META[b.stage].order || a.name.localeCompare(b.name));
  }, [parents, stage, push, query]);

  const selectedParents = visible.filter(p => selected.has(p.id) && invitable(p));
  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = () => {
    const pickable = visible.filter(invitable);
    const all = pickable.length > 0 && pickable.every(p => selected.has(p.id));
    setSelected(all ? new Set() : new Set(pickable.map(p => p.id)));
  };

  // Batches of 50: each invite is a hash and, by email, a send. Progress is shown so an
  // import of 600 families does not look frozen.
  const bulk = async (channel: 'EMAIL' | 'PRINT') => {
    const ids = selectedParents.map(p => p.id);
    if (!ids.length || bulkBusy) return;
    const verb = channel === 'EMAIL' ? `Email invites to ${ids.length} ${ids.length === 1 ? 'family' : 'families'}?` : `Print invite letters for ${ids.length} ${ids.length === 1 ? 'family' : 'families'}?`;
    if (!window.confirm(`${verb}\n\nAny earlier code for them stops working.`)) return;
    let sent = 0;
    const failed: string[] = [];
    const letters: Awaited<ReturnType<typeof sendParentInvites>>['letters'] = [];
    try {
      for (let i = 0; i < ids.length; i += BATCH) {
        setBulkBusy(`${Math.min(i + BATCH, ids.length)} of ${ids.length}…`);
        const res = await sendParentInvites(ids.slice(i, i + BATCH), channel);
        sent += res.sent;
        failed.push(...res.failed.map(f => f.parentId), ...res.skipped.map(s => s.parentId));
        if (res.letters) letters.push(...res.letters);
      }
      if (channel === 'PRINT' && letters.length && !printInviteLetters(letters)) {
        toast.error('The browser blocked the print window. Allow pop-ups for this site, then print again (new codes will be made).');
      }
      if (failed.length) toast.error(`${sent} done. ${failed.length} could not be ${channel === 'EMAIL' ? 'emailed' : 'made'}; they are marked in the list.`);
      else toast.success(channel === 'EMAIL' ? `${sent} invite emails sent.` : `${sent} letters ready to print.`);
      setSelected(new Set());
    } catch (err) {
      toast.error(apiErrorMessage(err, 'The invites stopped part-way. Check the list and send the rest again.'));
    } finally {
      setBulkBusy(null);
      void load();
    }
  };

  const revoke = async (p: ActivationParent) => {
    if (!window.confirm(`Cancel ${p.name}'s invite? The code stops working at once. You can send a new one later.`)) return;
    try {
      await revokeParentInvite(p.id);
      toast.success('Invite cancelled.');
      void load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not cancel the invite.'));
    }
  };

  if (loading) {
    return <div className="space-y-4 p-6"><Skeleton className="h-8 w-72" /><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  const totals = data?.totals;
  const stages = totals?.stages ?? {};
  const count = (...keys: ParentStage[]) => keys.reduce((n, k) => n + (stages[k] ?? 0), 0);
  const alertsOn = (totals?.push.DELIVERING ?? 0) + (totals?.push.REGISTERED ?? 0);
  const funnel = totals ? [
    { label: 'Children with a parent linked', value: totals.students - totals.studentsWithoutParent, of: totals.students },
    { label: 'Families invited', value: count('INVITE_SENT', 'SIGNED_IN', 'ACTIVATED', 'INVITE_EXPIRED'), of: totals.parents },
    { label: 'Signed in', value: count('SIGNED_IN', 'ACTIVATED'), of: totals.parents },
    { label: 'Chose their own password', value: count('ACTIVATED'), of: totals.parents },
    { label: 'Alerts reaching a phone', value: alertsOn, of: totals.parents },
  ] : [];

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Parents &amp; app activation</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Where every family is on the way into the parent app, and the invites that get them there. Each family gets their own
            one-time code; nobody shares a password.
          </p>
        </div>
        <button className={btn} onClick={() => { setLoading(true); void load(); }}><RefreshCw size={15} /> Refresh</button>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}

      {data && (
        <>
          <ol aria-label="Activation steps" className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {funnel.map((step, i) => (
              <li key={step.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Step {i + 1}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{step.value}<span className="text-sm font-semibold text-slate-400"> / {step.of}</span></p>
                <p className="text-xs text-slate-600">{step.label}</p>
              </li>
            ))}
          </ol>

          {(!data.emailConfigured || !data.appLinks.android || !data.iphonePushConfigured) && (
            <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} aria-hidden /> Before you invite everyone</p>
              {!data.emailConfigured && <p>Email invites are not set up on the server, so invites go by WhatsApp, SMS or printed letter.</p>}
              {!data.appLinks.android && <p>No Play Store link is set, so invites tell families to search for &ldquo;Voltava&rdquo; in the store.</p>}
              {!data.iphonePushConfigured && <p>Alerts on iPhones are not switched on yet. iPhone families see every update in the app, but get no phone alerts.</p>}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <span className="sr-only">Search parents</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Parent, email, phone or child"
                className="w-64 rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm" />
            </label>
            <label className="text-sm text-slate-700">
              <span className="sr-only">Stage</span>
              <select value={stage} onChange={e => setStage(e.target.value as ParentStage | 'ALL')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="ALL">Every stage ({parents.length})</option>
                {STAGES.map(s => <option key={s} value={s}>{STAGE_META[s].label} ({stages[s] ?? 0})</option>)}
              </select>
            </label>
            <label className="text-sm text-slate-700">
              <span className="sr-only">Alerts</span>
              <select value={push} onChange={e => setPush(e.target.value as ParentPushState | 'ALL')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="ALL">Any alert state</option>
                {PUSHES.map(s => <option key={s} value={s}>{PUSH_META[s].label} ({totals?.push[s] ?? 0})</option>)}
              </select>
            </label>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {bulkBusy && <span role="status" className="text-sm text-slate-600">Working: {bulkBusy}</span>}
              <button className={btn} disabled={!selectedParents.length || !data.emailConfigured || !!bulkBusy} onClick={() => void bulk('EMAIL')}
                title={data.emailConfigured ? undefined : 'Email is not set up on the server'}>
                <Mail size={15} /> Email invites ({selectedParents.length})
              </button>
              <button className={btn} disabled={!selectedParents.length || !!bulkBusy} onClick={() => void bulk('PRINT')}>
                <Printer size={15} /> Print letters ({selectedParents.length})
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <caption className="sr-only">Parents and where each is in activation</caption>
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th scope="col" className="p-3"><input type="checkbox" aria-label="Select every family that can be invited"
                    checked={visible.some(invitable) && visible.filter(invitable).every(p => selected.has(p.id))} onChange={toggleAll} /></th>
                  <th scope="col" className="p-3 font-semibold">Parent</th>
                  <th scope="col" className="p-3 font-semibold">Children</th>
                  <th scope="col" className="p-3 font-semibold">Stage</th>
                  <th scope="col" className="p-3 font-semibold">Alerts</th>
                  <th scope="col" className="p-3 font-semibold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-500">{parents.length ? 'No family matches these filters.' : 'No parent accounts yet. Import your roster with parent emails first.'}</td></tr>
                )}
                {visible.map(p => {
                  const meta = STAGE_META[p.stage];
                  const pushMeta = PUSH_META[p.push.state];
                  return (
                    <tr key={p.id} className="align-top">
                      <td className="p-3"><input type="checkbox" aria-label={`Select ${p.name}`} disabled={!invitable(p)} checked={selected.has(p.id)} onChange={() => toggle(p.id)} /></td>
                      <td className="p-3">
                        <p className="font-semibold text-slate-900">{p.name}</p>
                        <p className="break-all text-xs text-slate-600">{p.email}</p>
                        {p.phone && <p className="text-xs text-slate-500">{p.phone}</p>}
                      </td>
                      <td className="p-3 text-xs text-slate-700">
                        {p.children.length ? p.children.map(c => (
                          <p key={c.id}>{c.name}{c.grade ? ` · ${c.grade}` : ''}{!c.hasStop && <span className="ml-1 font-semibold text-amber-700">· no stop</span>}</p>
                        )) : <span className="text-slate-400">No child linked</span>}
                      </td>
                      <td className="p-3">
                        <span className={clsx(badge, TONE[meta.tone])}>{meta.label}</span>
                        <p className="mt-1 text-xs text-slate-500">{inviteDetail(p)}</p>
                      </td>
                      <td className="p-3">
                        {p.stage === 'ACTIVATED'
                          ? <span className={clsx(badge, TONE[pushMeta.tone])}><BellRing size={11} className="mr-1" aria-hidden />{pushMeta.label}</span>
                          : <span className="text-xs text-slate-400">After they sign in</span>}
                      </td>
                      <td className="p-3">
                        {invitable(p) ? (
                          <div className="flex flex-col items-end gap-1">
                            <button className={clsx(btn, 'py-1.5')} onClick={() => setInviting({ id: p.id, name: p.name, email: p.email, phone: p.phone })}>
                              <Send size={14} /> {p.stage === 'NOT_INVITED' ? 'Invite' : 'Send again'}
                            </button>
                            {(p.stage === 'INVITE_SENT' || p.stage === 'SIGNED_IN') && (
                              <button className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-700" onClick={() => void revoke(p)}>
                                <XCircle size={12} /> Cancel invite
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={13} /> Active</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <section id="unlinked" aria-labelledby="unlinked-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 id="unlinked-heading" className="flex items-center gap-2 text-base font-bold text-slate-900">
              <UserX size={17} aria-hidden /> Children with no parent account ({data.studentsWithoutParent.length})
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Nobody is told when these children board. Add the parent&apos;s email (import the roster again with a parentEmail column,
              or edit the child on the <Link className="font-semibold text-orange-700 underline" href="/students">Students</Link> page).
            </p>
            {data.studentsWithoutParent.length > 0 && (
              <ul className="mt-3 grid grid-cols-1 gap-1 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                {data.studentsWithoutParent.slice(0, 60).map(s => (
                  <li key={s.id}>{s.name} <span className="text-xs text-slate-500">· {s.rfidTag}{s.grade ? ` · ${s.grade}` : ''}</span></li>
                ))}
                {data.studentsWithoutParent.length > 60 && <li className="text-slate-500">and {data.studentsWithoutParent.length - 60} more</li>}
              </ul>
            )}
          </section>
        </>
      )}

      {inviting && data && (
        <InviteDialog parent={inviting} emailConfigured={data.emailConfigured} onClose={() => setInviting(null)} onInvited={() => void load()} />
      )}
    </div>
  );
}
