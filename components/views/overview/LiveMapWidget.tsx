import React from 'react';
import { Map } from 'lucide-react';
import DynamicMap from '@/components/map/DynamicMap';

export function LiveMapWidget({ buses }: { buses: any[] }) {
  return (
    <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Map size={18} className="text-orange-600" /> Live Fleet Map
        </h3>
        <div className="flex gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-700 bg-orange-50 px-2 py-0.5 rounded">Real-time</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 py-0.5">Heatmap</span>
        </div>
      </div>
      <div className="flex-1 p-0 relative min-h-[400px]">
         <DynamicMap buses={buses} zoom={11} className="absolute inset-0 z-0 h-full w-full" />
      </div>
      
      <div className="absolute bottom-4 left-4 flex gap-3 text-xs font-medium bg-white/80 backdrop-blur-sm px-3 py-2 rounded-lg border border-slate-200">
        <span className="flex items-center gap-1.5 text-slate-700"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> On Schedule</span>
        <span className="flex items-center gap-1.5 text-slate-700"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Delayed</span>
      </div>
    </div>
  );
}