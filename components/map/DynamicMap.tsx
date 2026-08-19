"use client";

import dynamic from 'next/dynamic';

// Dynamically import the real map component with SSR disabled.
// Leaflet heavily relies on the window object which is only available on the client.
const RealMap = dynamic(() => import('./RealMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-500 font-medium rounded-lg">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
        Loading interactive map...
      </div>
    </div>
  ),
});

interface DynamicMapProps {
  buses: any[];
  zoom?: number;
  center?: [number, number];
  height?: string;
  className?: string;
  selectedBusId?: string | null;
  onSelectBus?: (busId: string | null) => void;
  filterSingleBus?: boolean;
}

export default function DynamicMap(props: DynamicMapProps) {
  return <RealMap {...props} />;
}
