import React from 'react';


interface SummaryCardsProps {
  totalStudents: number;
  stats: any;
  presentCount: number;
  boardedPercentage: number;
  notScannedCount: number;
  dynamicAttendanceData: any[];
}

export function SummaryCards({
  totalStudents,
  stats,
  presentCount,
  boardedPercentage,
  notScannedCount,
  dynamicAttendanceData
}: SummaryCardsProps) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm col-span-1 md:col-span-2 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-semibold text-slate-500">Total Students</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-bold text-slate-900">{totalStudents}</span>
                {stats?.studentsGrowthPercent != null && (
                  <span className="text-sm font-bold text-emerald-500">
                    {(stats.studentsGrowthPercent > 0 ? '+' : '') + stats.studentsGrowthPercent + '%'}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-500">Currently Boarded</p>
              <div className="flex items-baseline gap-2 mt-1 justify-end">
                <span className="text-4xl font-bold text-slate-900">{presentCount}</span>
                <span className="text-sm font-medium text-slate-500">{boardedPercentage}% of total</span>
              </div>
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div className="bg-orange-600 h-2 rounded-full" style={{ width: `${boardedPercentage}%` }}></div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          {/* Was "Absent Today". No scan is not the same fact as absent — before the
              morning run every child is unscanned, and the system cannot tell a child
              who has not boarded yet from one who never will. */}
          <p className="text-sm font-semibold text-slate-500">Not Scanned Yet</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-4xl font-bold text-slate-900">{notScannedCount}</span>
          </div>
          <p className="text-xs text-slate-400 font-medium text-right">
            No boarding recorded today
          </p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm font-semibold text-slate-500">Late Arrivals</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-4xl font-bold text-slate-400">
              {stats?.lateArrivals ?? 0}
            </span>
          </div>
          <p className="text-xs text-red-500 font-bold text-right cursor-pointer hover:text-red-600 transition-colors">
            Route Flags
          </p>
        </div>
      </div>
    </>
  );
}
