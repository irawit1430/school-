import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';

/**
 * A brand-new school opened this dashboard to a row of zeroes, an empty map and an empty
 * trips panel, with nothing saying what to do first. The order is not obvious and it is
 * strict: a trip needs a bus, a driver and a route; a child can only be assigned to a stop
 * that exists. Doing it out of order meant hitting empty dropdowns three screens deep and
 * not knowing which missing thing they were waiting on.
 *
 * Built only from what Overview already loads, so it costs no request.
 */
export type SetupInput = {
  totalBuses?: number;
  totalStudents?: number;
  drivers: unknown[];
  routes: { stops?: unknown[]; trips?: unknown[] }[];
};

export type SetupStep = { key: string; label: string; detail: string; href: string; done: boolean };

export function setupSteps({ totalBuses, totalStudents, drivers, routes }: SetupInput): SetupStep[] {
  return [
    { key: 'buses', label: 'Add your buses', detail: 'Each bus with its GPS device.', href: '/buses', done: (totalBuses ?? 0) > 0 },
    { key: 'drivers', label: 'Add drivers', detail: 'They sign in to the driver app to run trips.', href: '/drivers', done: drivers.length > 0 },
    { key: 'routes', label: 'Draw a route with its stops', detail: 'Students are assigned to stops, so stops come first.', href: '/routes', done: routes.some(r => (r.stops?.length ?? 0) > 0) },
    { key: 'students', label: 'Add students and their pickup stop', detail: 'One at a time or by CSV import.', href: '/students', done: (totalStudents ?? 0) > 0 },
    // Any trip at all, historical included: this asks whether the school has ever put a
    // bus on a route, not whether one is running this minute.
    { key: 'schedules', label: 'Schedule the daily trips', detail: 'Pick bus, driver and direction for each run.', href: '/schedules', done: routes.some(r => (r.trips?.length ?? 0) > 0) },
  ];
}

export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const remaining = steps.filter(step => !step.done).length;
  if (remaining === 0) return null;
  const next = steps.find(step => !step.done);

  return (
    <section aria-labelledby="setup-heading" className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="setup-heading" className="text-base font-bold text-slate-900">Finish setting up tracking</h3>
        <p className="text-xs font-semibold text-slate-600">
          {steps.length - remaining} of {steps.length} done
        </p>
      </div>
      <p className="mt-1 text-sm text-slate-600">In this order — each step needs the one before it.</p>
      <ol className="mt-3 space-y-1.5">
        {steps.map((step, index) => {
          const isNext = step === next;
          return (
            <li key={step.key}>
              <Link
                href={step.href}
                className={clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isNext ? 'border border-orange-300 bg-white shadow-sm hover:bg-orange-50' : 'hover:bg-white/70',
                )}
              >
                {step.done
                  ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600" aria-hidden />
                  : <Circle size={18} className={clsx('shrink-0', isNext ? 'text-orange-500' : 'text-slate-300')} aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className={clsx('font-semibold', step.done ? 'text-slate-500 line-through' : 'text-slate-900')}>
                    {index + 1}. {step.label}
                  </span>
                  {!step.done && <span className="block text-xs text-slate-500">{step.detail}</span>}
                </span>
                <span className="sr-only">{step.done ? '(done)' : isNext ? '(next step)' : '(not done)'}</span>
                {isNext && <ArrowRight size={16} className="shrink-0 text-orange-600" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
