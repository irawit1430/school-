"use client";

import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import 'leaflet-defaulticon-compatibility';
import { CONFIG } from '@/lib/config';
import { clsx } from 'clsx';

// Marker HTML used to be built with react-dom/server's renderToString, which shipped
// the whole server renderer (~86 KB) to the browser to produce a few divs. These are
// the same two lucide glyphs, inlined — identical output, none of the payload.
const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';

const BUS_SVG = SVG_OPEN +
  '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>' +
  '<path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/>' +
  '<circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>';

const ALERT_SVG = SVG_OPEN +
  '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>' +
  '<path d="M12 9v4"/><path d="M12 17h.01"/></svg>';

// Bus names come from user data and go straight into marker HTML.
const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface RealMapProps {
  buses: any[];
  zoom?: number;
  center?: [number, number];
  height?: string;
  className?: string;
  selectedBusId?: string | null;
  onSelectBus?: (busId: string | null) => void;
  filterSingleBus?: boolean;
}

// Component to dynamically fit bounds or smoothly fly to selected vehicle
function MapController({ 
  buses, 
  center, 
  selectedBusId 
}: { 
  buses: any[]; 
  center: [number, number]; 
  selectedBusId?: string | null;
}) {
  const map = useMap();
  
  const hasFitBounds = React.useRef(false);
  const prevSelectedBus = React.useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // If selected bus changed, we allow flying to it once
    if (selectedBusId !== prevSelectedBus.current) {
      hasFitBounds.current = false;
      prevSelectedBus.current = selectedBusId;
    }

    if (hasFitBounds.current) return;

    // If a specific bus is selected, smoothly fly to it
    if (selectedBusId) {
      const selectedBus = buses.find(b => b.id === selectedBusId);
      const lat = selectedBus?.gpsLogs?.[0]?.lat;
      const lng = selectedBus?.gpsLogs?.[0]?.lng;
      if (lat && lng) {
        map.flyTo([lat, lng], 16, {
          duration: 1.2,
          easeLinearity: 0.25
        });
        hasFitBounds.current = true;
        return;
      }
    }

    // Default bounds fitting for all buses
    const busesWithCoords = buses.filter(b => b.gpsLogs?.[0]?.lat && b.gpsLogs?.[0]?.lng);
    
    if (busesWithCoords.length === 0) {
      // Don't mark as fit if no buses, we might get them soon
      return;
    }

    if (busesWithCoords.length === 1) {
      map.flyTo([busesWithCoords[0].gpsLogs[0].lat, busesWithCoords[0].gpsLogs[0].lng], 15, { duration: 1.2 });
      hasFitBounds.current = true;
      return;
    }

    // Fit bounds for multiple buses
    const bounds = L.latLngBounds(busesWithCoords.map(b => [b.gpsLogs[0].lat, b.gpsLogs[0].lng]));
    map.fitBounds(bounds, { padding: [60, 60], animate: true, duration: 1 });
    hasFitBounds.current = true;
  }, [selectedBusId, buses, center, map]);

  useEffect(() => {
    // Disable marker transitions when panning/zooming to prevent them from flying around
    const handleMoveStart = () => {
      document.documentElement.style.setProperty('--marker-transition', 'none');
    };
    const handleMoveEnd = () => {
      document.documentElement.style.setProperty('--marker-transition', 'transform 1s linear');
    };
    
    // Set initial value
    document.documentElement.style.setProperty('--marker-transition', 'transform 1s linear');

    map.on('movestart', handleMoveStart);
    map.on('moveend', handleMoveEnd);
    
    return () => {
      map.off('movestart', handleMoveStart);
      map.off('moveend', handleMoveEnd);
    };
  }, [map]);

  return null;
}

export default function RealMap({ 
  buses, 
  zoom = CONFIG.MAP_DEFAULT_ZOOM, 
  center, 
  height = '100%', 
  className = '',
  selectedBusId = null,
  onSelectBus,
  filterSingleBus = false
}: RealMapProps) {
  const defaultCenter = center || [CONFIG.MAP_CENTER.lat, CONFIG.MAP_CENTER.lng] as [number, number];

  // Filter buses if "Show Only Selected Bus" is enabled
  const displayedBuses = (filterSingleBus && selectedBusId) 
    ? buses.filter(b => b.id === selectedBusId)
    : buses;

  const iconCache = React.useRef<Record<string, L.DivIcon>>({});

  const getCustomIcon = (bus: any, isSelected: boolean) => {
    const speed = bus.gpsLogs?.[0]?.speed || 0;
    const isAlert = speed > 60;
    const isDelayed = bus.status === 'delayed';

    const cacheKey = `${bus.id}-${isSelected}-${isAlert}-${isDelayed}`;
    
    if (iconCache.current[cacheKey]) {
      return iconCache.current[cacheKey];
    }

    const bgColorClass = isAlert ? 'bg-red-500' : isDelayed ? 'bg-amber-500' : 'bg-emerald-500';
    const labelBgClass = isAlert ? 'bg-red-900' : isDelayed ? 'bg-amber-900' : 'bg-slate-900';

    const label = escapeHtml(String(bus.name || bus.licensePlate || bus.registrationNumber || 'Bus'));

    const ring = isSelected
      ? '<span class="absolute -inset-2.5 rounded-full bg-orange-500/40 animate-ping"></span>' +
        '<span class="absolute -inset-1.5 rounded-full border-2 border-orange-500 animate-pulse"></span>'
      : '';

    const puckClasses = clsx(
      "w-9 h-9 rounded-full text-white flex items-center justify-center shadow-xl border-2 transition-transform duration-300 relative z-10",
      isSelected ? "border-orange-500 scale-110 ring-4 ring-orange-500/20" : "border-white",
      bgColorClass
    );

    const labelClasses = clsx(
      "text-white px-2 py-0.5 rounded-md text-[10px] font-bold mt-1.5 shadow-lg whitespace-nowrap transition-all duration-200",
      isSelected ? "bg-orange-600 ring-1 ring-white/50 scale-105" : labelBgClass
    );

    const iconHtml =
      '<div class="flex flex-col items-center group cursor-pointer">' +
        '<div class="relative flex items-center justify-center">' +
          ring +
          '<div class="' + puckClasses + '">' + (isAlert ? ALERT_SVG : BUS_SVG) + '</div>' +
        '</div>' +
        '<div class="' + labelClasses + '">' + label + '</div>' +
      '</div>';

    const icon = L.divIcon({
      html: iconHtml,
      className: 'smooth-bus-marker',
      iconSize: [44, 65],
      iconAnchor: [22, 35],
      popupAnchor: [0, -35],
    });

    iconCache.current[cacheKey] = icon;
    return icon;
  };

  return (
    <div className={`w-full relative z-0 ${className}`} style={{ height }}>
      {/* Global CSS for Smooth Marker Transitions and Leaflet Styling */}
      <style jsx global>{`
        .leaflet-marker-icon.smooth-bus-marker {
          transition: var(--marker-transition, transform 1s linear) !important;
        }
        .leaflet-pane {
          z-index: 10 !important;
        }
        .leaflet-top, .leaflet-bottom {
          z-index: 20 !important;
        }
      `}</style>

      <MapContainer 
        center={defaultCenter} 
        zoom={zoom} 
        scrollWheelZoom={true} 
        style={{ height: '100%', width: '100%' }}
        className="rounded-lg z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {displayedBuses.map(bus => {
          const lat = bus.gpsLogs?.[0]?.lat;
          const lng = bus.gpsLogs?.[0]?.lng;
          
          if (!lat || !lng) return null;

          const isSelected = selectedBusId === bus.id;

          return (
            <Marker 
              key={bus.id} 
              position={[lat, lng]} 
              icon={getCustomIcon(bus, isSelected)}
              eventHandlers={{
                click: () => {
                  if (onSelectBus) {
                    onSelectBus(isSelected ? null : bus.id);
                  }
                }
              }}
            >
              <Popup className="rounded-xl overflow-hidden shadow-2xl border-none">
                <div className="p-2 min-w-[180px]">
                  <div className="flex items-center justify-between border-b pb-2 mb-2">
                    <h3 className="font-bold text-slate-900 text-sm">
                      {bus.name || bus.licensePlate || bus.registrationNumber}
                    </h3>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                      {bus.capacity ? `${bus.capacity} Seats` : ''}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Speed</span>
                      <span className="font-bold text-slate-800">
                        {bus.gpsLogs[0].speed ? `${bus.gpsLogs[0].speed.toFixed(1)} km/h` : '0 km/h'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Route</span>
                      <span className="font-semibold text-slate-700">
                        {bus.routeName || 'Unassigned'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Status</span>
                      <span className={clsx(
                        "font-bold uppercase text-[9px] px-2 py-0.5 rounded-full",
                        bus.gpsLogs[0].speed > 60 ? "bg-red-100 text-red-700" :
                        bus.status === 'delayed' ? "bg-amber-100 text-amber-700" :
                        "bg-emerald-100 text-emerald-700"
                      )}>
                        {bus.gpsLogs[0].speed > 60 ? 'OVERSPEED' : bus.status || 'ACTIVE'}
                      </span>
                    </div>
                  </div>

                  {onSelectBus && (
                    <button
                      onClick={() => onSelectBus(isSelected ? null : bus.id)}
                      className={clsx(
                        "w-full mt-3 py-1.5 px-3 rounded-lg text-xs font-bold transition-colors shadow-sm",
                        isSelected 
                          ? "bg-slate-100 text-slate-700 hover:bg-slate-200" 
                          : "bg-orange-600 text-white hover:bg-orange-700"
                      )}
                    >
                      {isSelected ? '✕ Exit Focus' : '🎯 Focus This Vehicle'}
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        <MapController buses={buses} center={defaultCenter} selectedBusId={selectedBusId} />
      </MapContainer>
    </div>
  );
}
