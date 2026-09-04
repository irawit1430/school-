import React from 'react';
import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { clsx } from 'clsx';
import Link from 'next/link';

export function ActiveRoutesWidget({ activeTripsList }: { activeTripsList: any[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 md:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-4 sm:mb-5 lg:mb-6">
        <h3 className="text-sm sm:text-base md:text-lg font-bold text-slate-800">Trips in Progress</h3>
        <span className="text-[10px] sm:text-xs uppercase tracking-wider font-bold text-slate-500">{activeTripsList.length} Live</span>
      </div>
      
      <div className="space-y-3 sm:space-y-4">
        {activeTripsList.length === 0 ? (
          <div className="text-sm sm:text-base text-slate-500 text-center py-4 sm:py-6">No active trips currently.</div>
        ) : activeTripsList.map((route: any) => (
          <div key={route.id} className="p-3 sm:p-4 md:p-5 border border-slate-100 rounded-lg hover:border-slate-200 transition-colors">
            <div className="flex justify-between items-start mb-2 sm:mb-3 md:mb-4">
              <div>
                <h4 className="font-semibold text-sm sm:text-base text-slate-900">{route.name}</h4>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Driver: {route.driver}</p>
              </div>
              <div className="shrink-0 ml-2">
                <Badge tone={route.type === 'good' ? 'success' : 'warning'}>
                  {route.progress}% Done
                </Badge>
              </div>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 sm:h-2 mb-2 sm:mb-3 md:mb-4">
              <div 
                className={clsx("h-1.5 sm:h-2 rounded-full", route.type === 'good' ? "bg-emerald-500" : "bg-amber-500")} 
                style={{ width: `${route.progress}%` }}
              ></div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-medium text-slate-600">
              <Clock size={14} className={route.type === 'warning' ? "text-amber-500" : "text-slate-400"} />
              <span className={route.type === 'warning' ? "text-amber-600" : ""}>{route.eta}</span>
            </div>
          </div>
        ))}
      </div>
      
      <Link 
        href="/routes"
        className="block text-center w-full mt-4 sm:mt-5 md:mt-6 text-xs sm:text-sm font-bold text-orange-600 hover:bg-orange-50 hover:text-orange-700 py-2 sm:py-2.5 rounded-md transition-colors"
      >
        View All Routes
      </Link>
    </div>
  );
}
