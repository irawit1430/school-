"use client";
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { connectSocket, getUser, fetchNotifications, resolveAlert, apiErrorMessage } from '@/lib/api';
import {
  isActiveEmergency, mergeNotification, normalizeNotification, notificationSeverity,
  type AppNotification,
} from '@/lib/notifications';
import toast from 'react-hot-toast';

/**
 * Live emergencies, backed by the server rather than by component state.
 *
 * This used to hold socket events in a `useState` array and nothing else. Reloading the
 * tab, navigating, or clicking the ✕ destroyed the only copy of an SOS — so nobody could
 * later answer "when did we know, and what did we do", which is the first question asked
 * after any incident. Alerts now come from the notifications API, which means they survive
 * a refresh, and the close button resolves the alert instead of hiding it. Collapsing is
 * the only way to get it off the screen, and the collapsed pill stays until it is handled.
 */
export function EmergencyAlertBanner() {
  const [alerts, setAlerts] = useState<AppNotification[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchNotifications()
      .then((rows: unknown) => {
        if (!Array.isArray(rows)) return;
        setAlerts(rows.map(row => normalizeNotification(row)).filter(isActiveEmergency));
      })
      // A failed poll must not clear the banner: an emergency vanishing because a request
      // timed out is the exact failure this rewrite exists to remove.
      .catch(() => {});
  }, []);

  useEffect(() => {
    const user = getUser();
    if (!user) return;

    load();
    const poll = setInterval(load, 60_000);

    const socket = connectSocket();
    socket.on('emergency_alert', (alert: any) => {
      if (alert?.schoolId && alert.schoolId !== user.schoolId && user.role !== 'SUPER_ADMIN') return;
      const incoming = normalizeNotification(alert, 'emergency');
      setAlerts(prev => mergeNotification(prev, incoming).filter(isActiveEmergency));
      setCollapsed(false);
      // The socket event may arrive before the row is readable; reconcile shortly after
      // so the id we hold is the one the resolve endpoint expects.
      setTimeout(load, 3_000);
    });

    return () => {
      clearInterval(poll);
      socket.disconnect();
    };
  }, [load]);

  const resolve = async (alert: AppNotification) => {
    if (resolving) return;
    setResolving(alert.id);
    try {
      await resolveAlert(alert.id);
      setAlerts(prev => prev.filter(item => item.id !== alert.id));
      toast.success('Emergency marked as handled.');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not mark this as handled. It stays open.'));
    } finally {
      setResolving(null);
    }
  };

  if (alerts.length === 0) return null;

  const critical = alerts.some(alert => notificationSeverity(alert.type) === 'critical');

  if (collapsed) {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4">
        <button
          onClick={() => setCollapsed(false)}
          className={clsx(
            'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white shadow-2xl border-2',
            critical ? 'bg-rose-600 border-rose-400 animate-pulse' : 'bg-orange-600 border-orange-400',
          )}
        >
          <AlertTriangle size={16} />
          {alerts.length} unresolved {alerts.length === 1 ? 'alert' : 'alerts'}
          <ChevronDown size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex w-full max-w-3xl flex-col gap-2 px-4">
      {alerts.map(alert => {
        const isCritical = notificationSeverity(alert.type) === 'critical';
        const busy = resolving === alert.id;
        return (
          <div
            key={alert.id}
            role="alert"
            className={clsx(
              'flex items-start gap-4 rounded-xl border-2 p-4 text-white shadow-2xl',
              isCritical ? 'bg-rose-600 border-rose-400' : 'bg-orange-600 border-orange-400',
            )}
          >
            <div className={clsx('shrink-0 rounded-lg p-2', isCritical ? 'bg-rose-500/50 animate-pulse' : 'bg-orange-500/50')}>
              <AlertTriangle size={24} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="flex flex-wrap items-center gap-2 text-lg font-bold leading-tight">
                {alert.title}
                <span className={clsx('rounded-full bg-white px-2 py-0.5 text-xs font-bold uppercase tracking-wider', isCritical ? 'text-rose-600' : 'text-orange-600')}>
                  {alert.type.replace(/_/g, ' ')}
                </span>
              </h3>
              <p className={clsx('mt-1 break-words text-sm font-medium', isCritical ? 'text-rose-100' : 'text-orange-100')}>
                {alert.message || 'An emergency was triggered from one of the active fleet vehicles.'}
              </p>
              {/* Time matters here more than anywhere else in the product. */}
              <p className={clsx('mt-1 text-xs', isCritical ? 'text-rose-200' : 'text-orange-200')}>
                Raised {new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' · '}
                <Link href="/map" className="underline hover:no-underline">Open live map</Link>
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              {/* Was a ✕ that deleted the alert locally. Handling an emergency and hiding
                  it are different acts, and only one of them should leave a record. */}
              <button
                onClick={() => void resolve(alert)}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/25 disabled:opacity-60"
              >
                <Check size={14} /> {busy ? 'Saving…' : 'Mark handled'}
              </button>
              <button
                onClick={() => setCollapsed(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/15"
                title="Collapse — the alert stays open until it is handled"
              >
                <ChevronUp size={14} /> Collapse
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
