"use client";
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { apiErrorMessage, fetchReadiness, type Readiness, type ReadinessItem } from '@/lib/api';

const ICON = { critical: AlertOctagon, warning: AlertTriangle, info: Info };
const COLOR = { critical: 'text-red-600', warning: 'text-amber-600', info: 'text-slate-500' };
const REFRESH_MS = 2 * 60_000;

/**
 * The office's exception queue: everything waiting on someone, worst first, each with
 * where to fix it. Staff used to hold this in their heads across six screens: children
 * with no stop or no parent, families never invited, alerts not reaching phones, password
 * requests, a bus running with no GPS.
 *
 * Counted by the server (GET /readiness), so this list and the pages it links to agree.
 */
export function ReadinessPanel({ load = fetchReadiness }: { load?: () => Promise<Readiness> }) {
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setData(await load());
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load the list.'));
    }
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set after the await, not synchronously
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const items = data?.items ?? [];
  return (
    <section aria-labelledby="readiness-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="readiness-heading" className="text-base font-bold text-slate-900">Waiting on the office</h3>
        <p className="text-xs text-slate-500">Children, families, cards and schedules that are not ready, and anything wrong right now.</p>
      </div>
      {error ? (
        // A failed load must never read as an all-clear.
        <p role="alert" className="mt-3 text-sm font-semibold text-red-700">Unavailable: {error}</p>
      ) : !data ? (
        <p className="mt-3 text-sm text-slate-500">Checking…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <CheckCircle2 size={16} className="text-emerald-600" aria-hidden /> Nothing is waiting. Every child has a parent and a stop, and every family is in.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {items.map((item: ReadinessItem) => {
            const Icon = ICON[item.severity];
            return (
              <li key={item.key} className="flex flex-wrap items-center gap-3 py-2.5">
                <Icon size={18} aria-hidden className={clsx('shrink-0', COLOR[item.severity])} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    <span className="sr-only">{item.severity === 'critical' ? 'Critical: ' : item.severity === 'warning' ? 'Warning: ' : 'Note: '}</span>
                    {item.title} <span className="font-normal text-slate-500">({item.count})</span>
                  </p>
                  <p className="text-xs text-slate-600">{item.detail}</p>
                </div>
                <Link href={item.href} className="text-sm font-semibold text-orange-700 hover:underline">Open</Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
