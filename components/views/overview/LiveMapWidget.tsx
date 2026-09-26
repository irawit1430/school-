import React from 'react';
import { Map } from 'lucide-react';
import Link from 'next/link';
import DynamicMap from '@/components/map/DynamicMap';

export function LiveMapWidget({ buses }: { buses: any[] }) {
  return (
    <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Map size={18} className="text-orange-600" /> Live Bus Tracking
        </h3>
        {/* Was a "Real-time" badge and an "On Schedule / Delayed" legend. Neither was true:
            markers are coloured by how old each bus's last GPS fix is, and a map full of
            hour-old positions carried the same badge as a live one. */}
        <Link href="/map" className="text-xs font-semibold text-orange-700 hover:underline">Open full map</Link>
      </div>
      <div className="flex-1 p-0 relative min-h-[400px]">
         <DynamicMap buses={buses} zoom={11} className="absolute inset-0 z-0 h-full w-full" />
      </div>
      
      <div className="absolute bottom-4 left-4 flex gap-3 text-xs font-medium bg-white/80 backdrop-blur-sm px-3 py-2 rounded-lg border border-slate-200">
        <span className="flex items-center gap-1.5 text-slate-700"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Reporting</span>
        <span className="flex items-center gap-1.5 text-slate-700"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Fix 2+ min old</span>
        <span className="flex items-center gap-1.5 text-slate-700"><span className="w-2 h-2 rounded-full bg-red-600"></span> Not reporting</span>
      </div>
    </div>
  );
}
