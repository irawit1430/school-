"use client";
import dynamic from 'next/dynamic';

const LiveFleetMap = dynamic(() => import('@/components/views/LiveFleetMap').then(mod => mod.LiveFleetMap), { ssr: false });

export default function MapPage() {
  return <LiveFleetMap />;
}
