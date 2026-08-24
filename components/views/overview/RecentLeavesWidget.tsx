import React from 'react';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

export function RecentLeavesWidget({ displayLeaves, handleApproveLeave, handleRejectLeave }: any) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="p-3 md:p-4 border-b border-slate-100 flex items-center justify-between gap-2">
        <h3 className="text-sm md:text-base font-bold text-slate-800 flex items-center gap-2 min-w-0">
          <CalendarDays size={18} className="text-orange-600 shrink-0" /> 
          <span className="truncate">Recent Leave Applications</span>
        </h3>
        <span className="shrink-0 text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded uppercase tracking-wider">Needs Review</span>
      </div>
      <div className="flex-1 p-0 overflow-auto">
        <div className="w-full">
          <table className="w-full text-sm text-left block md:table">
            <thead className="hidden md:table-header-group text-xs text-slate-500 bg-slate-50/80 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 font-semibold">Student</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Reason</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group divide-y md:divide-y divide-slate-100">
              {displayLeaves.length === 0 ? (
                <tr className="block md:table-row">
                  <td colSpan={4} className="block md:table-cell px-4 py-8 text-center text-slate-500">No pending leave applications.</td>
                </tr>
              ) : (
                displayLeaves.map((leave: any) => (
                  <tr key={leave.id} className="block md:table-row hover:bg-slate-50/50 transition-colors p-4 md:p-0 border-b border-slate-100 md:border-b-0 last:border-b-0">
                    <td className="block md:table-cell px-0 py-2 md:px-4 md:py-3">
                      <div className="flex items-center justify-between md:justify-start">
                        <div className="flex items-center gap-3">
                          <div className={"w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-xs md:text-sm font-bold bg-slate-100 text-slate-700"}>
                            {leave.initials}
                          </div>
                          <span className="font-medium text-slate-900">{leave.student}</span>
                        </div>
                        <span className="md:hidden text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-md">{leave.date}</span>
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-slate-600">{leave.date}</td>
                    <td className="block md:table-cell px-0 py-2 md:px-4 md:py-3 text-slate-600">
                      <div className="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Reason</div>
                      <span className="block text-sm md:truncate md:max-w-[200px] lg:max-w-[250px]">{leave.reason}</span>
                    </td>
                    <td className="block md:table-cell px-0 pt-3 pb-1 md:px-4 md:py-3">
                      <div className="flex items-center justify-start md:justify-end gap-2 md:gap-3">
                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={() => handleApproveLeave(leave.rawId)}
                          className="flex-1 md:flex-none text-emerald-600 border-emerald-200 hover:bg-emerald-50 py-2 md:py-1 h-auto min-h-[36px] md:min-h-0"
                        >
                          Approve
                        </Button>
                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={() => handleRejectLeave(leave.rawId)}
                          className="flex-1 md:flex-none text-slate-600 border-slate-200 hover:bg-slate-50 py-2 md:py-1 h-auto min-h-[36px] md:min-h-0"
                        >
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-3 md:p-4 border-t border-slate-100 text-center bg-slate-50/30">
           <Link 
             href="/leaves"
             className="inline-block text-[11px] md:text-xs font-bold text-orange-600 hover:text-orange-700 uppercase tracking-wider"
           >
             View All Applications
           </Link>
        </div>
      </div>
    </div>
  );
}