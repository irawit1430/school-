import React from 'react';

interface SummaryCardsProps {
  totalStudents: number;
  stats: { lateArrivals?: number | null; studentsGrowthPercent?: number | null } | null;
  statsError?: string | null;
  presentCount: number;
  boardedPercentage: number;
  notScannedCount: number;
}

export function SummaryCards({
  totalStudents,
  stats,
  statsError,
  presentCount,
  boardedPercentage,
  notScannedCount,
}: SummaryCardsProps) {
  const lateArrivals = !statsError && typeof stats?.lateArrivals === 'number'
    && Number.isFinite(stats.lateArrivals) && stats.lateArrivals >= 0
    ? stats.lateArrivals : null;
  const growth = !statsError && typeof stats?.studentsGrowthPercent === 'number'
    && Number.isFinite(stats.studentsGrowthPercent) ? stats.studentsGrowthPercent : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">Total Students</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900">{totalStudents}</span>
              {growth !== null && (
                <span className={`text-sm font-semibold ${growth < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {growth > 0 ? '+' : ''}{growth}%
                </span>
              )}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500">Currently Boarded</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900">{presentCount}</span>
              <span className="text-sm text-slate-600">{boardedPercentage}% of total</span>
            </div>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(100, Math.max(0, boardedPercentage))}%` }} />
        </div>
      </div>
      <div className="flex min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-500">Not Scanned Yet</p>
        <p className="mt-1 text-3xl font-bold text-slate-900">{notScannedCount}</p>
        <p className="mt-3 text-xs text-slate-600">Awaiting a scan or attendance update</p>
      </div>
      <div className="flex min-w-0 flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-500">Late Arrivals</p>
        <p className="mt-1 text-3xl font-bold text-slate-900" aria-label={lateArrivals === null ? 'Late arrivals unavailable' : undefined}>
          {lateArrivals ?? '—'}
        </p>
        <p className={`mt-3 text-xs ${statsError ? 'text-amber-800' : 'text-slate-600'}`}>
          {statsError ? 'Could not load late arrivals. Try refreshing.'
            : lateArrivals === null ? 'Late-arrival data is unavailable' : 'Recorded late arrivals today'}
        </p>
      </div>
    </div>
  );
}
