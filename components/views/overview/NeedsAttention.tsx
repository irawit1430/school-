import React from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, SatelliteDish } from 'lucide-react';
import { clsx } from 'clsx';
import { describeFreshness, trackerState, SCHOOL_TIMEZONE } from '@/lib/liveBuses';

/**
 * Spec §7.2: which bus needs action now, in the order it needs it.
 *
 * Only what the data Command Centre already loads can honestly say: GPS silence on a bus
 * that is carrying a trip, a trip past its departure that has not started, and a trip
 * running late. SOS is not repeated here — the emergency banner holds it above every
 * screen. Scan exceptions (wrong bus, unscanned child) need an attendance-exception feed
 * the API does not have yet.
 */
export type AttentionItem = {
  key: string;
  severity: 'critical' | 'warning';
  title: string;
  detail: string;
  href: string;
  action: string;
  kind: 'gps' | 'late-start' | 'delay';
};

type Trip = { id: string; status?: string; busId?: string | null; driverId?: string | null; scheduledStart?: string | null; currentEtaMessage?: string };
type Input = {
  routes: { id: string; name: string; trips?: Trip[] }[];
  buses: any[];
  drivers: { id: string; name?: string; phone?: string | null }[];
  now?: number;
};

/** A departure this far past with the trip still PLANNED is a readiness problem. */
export const LATE_START_MS = 10 * 60_000;

const RANK: Record<AttentionItem['kind'], number> = { gps: 0, 'late-start': 1, delay: 2 };

const serviceDate = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: SCHOOL_TIMEZONE });
const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: SCHOOL_TIMEZONE });

export function needsAttention({ routes, buses, drivers, now = Date.now() }: Input): AttentionItem[] {
  const items: AttentionItem[] = [];
  const today = serviceDate(now);

  for (const route of routes) {
    const onMap = `/map?route=${encodeURIComponent(route.name)}`;
    for (const trip of route.trips ?? []) {
      const bus = buses.find(b => b.id === trip.busId);
      const busName = bus?.registrationNumber || bus?.name || 'Bus not assigned';

      if (trip.status === 'ON_SCHEDULE' || trip.status === 'DELAYED') {
        const state = bus ? trackerState(bus, now) : null;
        if (state === 'silent' || state === 'unknown') {
          items.push({
            key: `gps:${trip.id}`, kind: 'gps', severity: 'critical',
            title: `${busName} not reporting`,
            detail: `${route.name} is running · ${state === 'unknown' ? 'no GPS fix yet' : `last fix ${describeFreshness(bus, now)}`}`,
            href: onMap, action: 'Open on map',
          });
        }
        if (trip.status === 'DELAYED') {
          items.push({
            key: `delay:${trip.id}`, kind: 'delay', severity: 'warning',
            title: `${route.name} running late`,
            detail: `${busName}${trip.currentEtaMessage ? ` · ${trip.currentEtaMessage}` : ''}`,
            href: onMap, action: 'Open on map',
          });
        }
      }

      const due = Date.parse(trip.scheduledStart ?? '');
      // Today only (school calendar day): a PLANNED trip from last week is stale data,
      // not something anyone can act on this morning.
      if (trip.status === 'PLANNED' && Number.isFinite(due) && now - due >= LATE_START_MS && serviceDate(due) === today) {
        const driver = drivers.find(d => d.id === trip.driverId);
        items.push({
          key: `late:${trip.id}`, kind: 'late-start', severity: 'warning',
          title: `${route.name} has not started`,
          detail: `Due ${clock(due)} · ${busName}${driver?.name ? ` · ${driver.name}` : ''}`,
          href: driver?.phone ? `tel:${driver.phone}` : '/drivers',
          action: driver?.phone ? `Call ${driver.name || 'driver'}` : 'View drivers',
        });
      }
    }
  }

  return items.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}

const ICON = { gps: SatelliteDish, 'late-start': Clock, delay: AlertTriangle };

export function NeedsAttention({ items, error }: { items: AttentionItem[]; error?: string }) {
  return (
    <section aria-labelledby="attention-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="attention-heading" className="text-base font-bold text-slate-900">Needs attention</h3>
        <p className="text-xs text-slate-500">GPS and delays on running trips, and late starts today. SOS shows in the red banner.</p>
      </div>

      {/* A failed trips call must not read as an all-clear. */}
      {error ? (
        <p className="mt-3 text-sm font-semibold text-red-700">Unavailable — trips could not be loaded.</p>
      ) : items.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <CheckCircle2 size={16} className="text-emerald-600" aria-hidden /> Nothing needs action on running or due trips.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {items.map(item => {
            const Icon = ICON[item.kind];
            return (
              <li key={item.key} className="flex flex-wrap items-center gap-3 py-2.5">
                <Icon size={18} aria-hidden className={clsx('shrink-0', item.severity === 'critical' ? 'text-red-600' : 'text-amber-600')} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    <span className="sr-only">{item.severity === 'critical' ? 'Critical: ' : 'Warning: '}</span>
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-600">{item.detail}</p>
                </div>
                <Link href={item.href} className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 px-3 text-sm font-semibold text-orange-700 hover:bg-orange-50">
                  {item.action}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
