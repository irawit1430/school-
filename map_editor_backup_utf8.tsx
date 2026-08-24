"use client";
import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchOsrmRoute, reverseGeocode, searchLocation, Stop } from '@/lib/osrm';
import { createRoute, updateRoute, connectSocket, createTrip } from '@/lib/api';
import toast from 'react-hot-toast';
import { Search, Loader2 } from 'lucide-react';
import { useRef } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/SearchableSelect';


// Fix Leaflet default icon in bundlers
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

// Live Bus Icon
const busIcon = typeof window !== 'undefined' ? L.divIcon({
  html: `<div style="background-color: #ea580c; color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); z-index: 999;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>
         </div>`,
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
}) : null;

function SortableStopItem({ id, index, stop, onRemove }: any) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2 bg-slate-50 gap-2 bg-white"
    >
      <div className="flex items-center gap-2 overflow-hidden">
        <button {...attributes} {...listeners} className="text-slate-400 hover:text-slate-600 cursor-grab shrink-0">
          <GripVertical size={16} />
        </button>
        <span className="text-sm font-medium text-slate-700 truncate">
          {index + 1}. {stop.name}
        </span>
      </div>
      <button 
        onClick={() => onRemove(index)}
        className="text-rose-500 hover:text-rose-700 font-bold px-2 py-1 shrink-0"
      >├ù</button>
    </li>
  );
}

function ClickToAdd({ onAdd }: { onAdd: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onAdd(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function MapController({ centerPos }: { centerPos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (centerPos) {
      map.flyTo(centerPos, 15, { animate: true, duration: 1 });
    }
  }, [centerPos, map]);
  return null;
}

export default function RouteMapEditor({ schoolId, initialRoute, buses, drivers, onSaved, onCancel }:
  { schoolId: string; initialRoute?: any; buses?: any[]; drivers?: any[]; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(initialRoute?.name || '');
  const [stops, setStops] = useState<Stop[]>(
    initialRoute?.stops?.map((s: any) => ({ ...s })) || []
  );
  
  // Assigment state for new routes
  const [selectedBusId, setSelectedBusId] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');

  const [osrm, setOsrm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [lastAddedPos, setLastAddedPos] = useState<[number, number] | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{lat: number, lng: number, name: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Live Bus Tracking state
  const [liveBusPosition, setLiveBusPosition] = useState<[number, number] | null>(null);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchResults([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);


  useEffect(() => {
    const latestTrip = initialRoute?.trips?.[initialRoute.trips.length - 1];
    const busId = latestTrip?.busId;
    
    if (busId) {
      const socket = connectSocket();
      socket.on('location_update', (data: any) => {
        if (data.busId === busId || data.id === busId) {
          setLiveBusPosition([data.lat, data.lng]);
        }
      });
      return () => {
        socket.disconnect();
      };
    }
  }, [initialRoute]);

  // Initialize OSRM if editing an existing route with coordinates
  useEffect(() => {
    if (initialRoute?.geometry && initialRoute?.distanceKm) {
      import('@mapbox/polyline').then(polyline => {
        setOsrm({
          geometry: initialRoute.geometry,
          latLngs: polyline.default.decode(initialRoute.geometry) as [number, number][],
          distanceKm: initialRoute.distanceKm,
          durationMin: initialRoute.estimatedDuration || 0,
          legMinutes: initialRoute.stops?.map((s: any) => s.expectedArrivalMinutes || 0) || [],
        });
        if (initialRoute.stops?.length > 0) {
           setLastAddedPos([initialRoute.stops[0].lat, initialRoute.stops[0].lng]);
        }
      });
    }
  }, [initialRoute]);

  // Recompute path whenever stops change
  useEffect(() => {
    let cancelled = false;
    if (stops.length < 2) { setOsrm(null); return; }
    
    if (!initialRoute || stops.length !== initialRoute.stops?.length) {
      fetchOsrmRoute(stops).then(r => { if (!cancelled) setOsrm(r); });
    }
    return () => { cancelled = true; };
  }, [stops, initialRoute]);

  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setStops((items) => {
        const oldIndex = items.findIndex((item) => item.lat + '-' + item.lng === active.id);
        const newIndex = items.findIndex((item) => item.lat + '-' + item.lng === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleAdd = async (lat: number, lng: number) => {
    const address = await reverseGeocode(lat, lng);
    setStops(prev => [...prev, {
      lat, lng,
      name: address?.split(',')[0] || `Stop ${prev.length + 1}`,
      address: address ?? undefined,
    }]);
    setLastAddedPos([lat, lng]);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchLocation(searchQuery);
      setSearchResults(results);
    } catch (e) {
      toast.error('Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (result: {lat: number, lng: number, name: string}) => {
    setStops(prev => [...prev, {
      lat: result.lat, 
      lng: result.lng,
      name: result.name.split(',')[0],
      address: result.name
    }]);
    setLastAddedPos([result.lat, result.lng]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSave = async () => {
    if (!name.trim() || stops.length < 2) {
      toast.error('Route needs a name and at least 2 stops.');
      return;
    }
    if ((selectedBusId && !selectedDriverId) || (!selectedBusId && selectedDriverId)) {
      toast.error('Please select both a bus and a driver to assign.');
      return;
    }
    setSaving(true);
    try {
      if (initialRoute?.id) {
        await updateRoute(initialRoute.id, {
          name,
          estimatedDuration: osrm?.durationMin ?? null,
          distanceKm: osrm?.distanceKm ?? null,
          geometry: osrm?.geometry ?? null,
        });
        toast.success('Route updated');
      } else {
        const newRoute = await createRoute(schoolId, {
          name,
          estimatedDuration: osrm?.durationMin ?? null,
          distanceKm: osrm?.distanceKm ?? null,
          geometry: osrm?.geometry ?? null,
          stops: stops.map((s, i) => ({
            name: s.name!,
            address: s.address ?? null,
            lat: s.lat,
            lng: s.lng,
            orderIdx: i,
            expectedArrivalMinutes: osrm?.legMinutes[i] ?? null,
          })),
        });
        
        // Optional assignment
        if (selectedBusId && selectedDriverId && newRoute?.id) {
          await createTrip({
            routeId: newRoute.id,
            busId: selectedBusId,
            driverId: selectedDriverId
          });
          toast.success('Route created & assigned successfully!');
        } else {
          toast.success('Route created successfully');
        }
      }
      onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="text-xl font-bold text-slate-900">{initialRoute ? 'Edit Route' : 'Create New Route'}</h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-colors">
          Γ£ò
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col gap-2 md:col-span-1">
          <label className="text-sm font-semibold text-slate-700">Route Name</label>
          <input
            className="w-full border border-slate-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm font-medium transition-all shadow-sm"
            placeholder="e.g. Morning Route A"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        {buses && drivers && (
          <>
            <div className="flex flex-col gap-2 relative">
              <SearchableSelect 
                  label="Assign Bus (Optional)"
                  options={buses.map((bus: any) => ({
                    value: bus.id,
                    label: bus.licensePlate,
                    subLabel: bus.capacity ? `${bus.capacity} seats` : undefined
                  }))}
                  value={selectedBusId}
                  onChange={(val) => setSelectedBusId(val)}
                  placeholder="Select a bus"
                />
            </div>
            <div className="flex flex-col gap-2 relative">
              <SearchableSelect 
                  label="Assign Driver (Optional)"
                  options={drivers.map((driver: any) => ({
                    value: driver.id,
                    label: driver.name,
                    subLabel: driver.email
                  }))}
                  value={selectedDriverId}
                  onChange={(val) => setSelectedDriverId(val)}
                  placeholder="Select a driver"
                />
            </div>
          </>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={stops.map(s => s.lat + '-' + s.lng)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {stops.map((s, i) => (
                <SortableStopItem 
                  key={s.lat + '-' + s.lng} 
                  id={s.lat + '-' + s.lng}
                  index={i} 
                  stop={s} 
                  onRemove={(idx: number) => setStops(p => p.filter((_, j) => j !== idx))} 
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {osrm && (
          <p className="mt-3 text-sm font-medium text-slate-600 bg-slate-100 px-3 py-2 rounded-lg inline-block">
            Distance: <span className="text-slate-900">{osrm.distanceKm.toFixed(1)} km</span> ┬╖ Duration: <span className="text-slate-900">{osrm.durationMin} min</span>
          </p>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || stops.length < 2 || !name.trim()}
          className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg text-sm font-bold disabled:opacity-50 transition-colors shadow-sm"
        >
          {saving ? 'Saving...' : 'Save Route'}
        </button>
      </div>
    </div>
  );
}
