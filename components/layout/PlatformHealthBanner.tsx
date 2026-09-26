"use client";
import React, { useEffect, useState } from 'react';
import { ServerCrash } from 'lucide-react';
import { fetchReadiness, type Readiness } from '@/lib/api';

const REFRESH_MS = 3 * 60_000;

/**
 * When Voltava itself is in trouble, the school hears it from us.
 *
 * A school watching thirty buses go quiet at once should read "Voltava is not receiving
 * bus positions", not suspect thirty phones and ring thirty drivers. Only the platform
 * alarms show here (no GPS from any school, phone alerts failing everywhere); a failure to
 * load this banner shows nothing, because it is not itself an outage.
 */
export function PlatformHealthBanner({ load = fetchReadiness }: { load?: () => Promise<Readiness> }) {
  const [alarms, setAlarms] = useState<Readiness['platform']['alarms']>([]);

  useEffect(() => {
    let cancelled = false;
    const check = () => load().then(r => { if (!cancelled) setAlarms(r.platform?.alarms ?? []); }, () => {});
    check();
    const timer = setInterval(check, REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [load]);

  if (!alarms.length) return null;
  return (
    <div role="alert" className="flex items-start gap-3 border-b border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-950">
      <ServerCrash size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="space-y-1">
        {alarms.map(a => (
          <p key={a.check}>
            <span className="font-semibold">Voltava service problem</span> since{' '}
            {new Date(a.since).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}: {a.message}
          </p>
        ))}
      </div>
    </div>
  );
}
