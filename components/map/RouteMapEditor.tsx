"use client";
import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchOsrmRoute, reverseGeocode, searchLocation, Stop } from '@/lib/osrm';
import { createRoute, updateRoute, connectSocket, createTrip, createStop, updateStop, deleteStop, reorderStops } from '@/lib/api';
import { CONFIG } from '@/lib/config';
import toast from 'react-hot-toast';
import { Search, Loader2, Map as MapIcon, AlertTriangle } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

// ─── Stable unique id per stop (fixes duplicate lat/lng collisions) ───
let uidCounter = 0;
const makeUid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `stop_${Date.now()}_${uidCounter++}`;

const stopSignature = (list: Stop[]) => list.map((s) => `${s.lat},${s.lng}`).join('|');

// ─── Reconcile an existing route's stops via granular endpoints ───
// Backend requires: POST (add), DELETE (remove), updateStop (edit),
// PUT .../reorder (set all orderIdx). PUT /routes/:id itself only takes metadata.
// `currentStops` carry a backend `id` when they came from the loaded route;
// newly-added stops have no `id` (only a client `uid`).
async function syncRouteStops(
  routeId: string,
  initialStops: any[],
  currentStops: Stop[],
  legMinutes: number[] = []
) {
  // 1. Delete stops that were removed
  const currentIds = new Set(currentStops.filter(s => s.id).map(s => s.id));
  const toDelete = initialStops.filter(s => s.id && !currentIds.has(s.id));
  for (const s of toDelete) {
    await deleteStop(routeId, s.id);
  }

  // 2. Walk the current order: update changed existing stops, create new ones
  const initialById = new Map(initialStops.filter(s => s.id).map(s => [s.id, s]));
  const finalOrder: { id: string; orderIdx: number }[] = [];

  for (let i = 0; i < currentStops.length; i++) {
    const s = currentStops[i];
    const body = {
      name: s.name!,
      address: s.address ?? null,
      lat: s.lat,
      lng: s.lng,
      orderIdx: i,
      expectedArrivalMinutes: legMinutes[i] ?? null,
    };

    if (s.id) {
      const orig = initialById.get(s.id);
      const changed = !orig
        || orig.name !== s.name
        || orig.lat !== s.lat
        || orig.lng !== s.lng
        || (orig.address ?? null) !== (s.address ?? null);
      if (changed) await updateStop(routeId, s.id, body);
      finalOrder.push({ id: s.id, orderIdx: i });
    } else {
      const created: any = await createStop(routeId, body);
      const newId = created?.id ?? created?.data?.id;
      if (newId) finalOrder.push({ id: newId, orderIdx: i });
    }
  }

  // 3. Commit the final ordering for all stops in one call
  if (finalOrder.length) {
    await reorderStops(routeId, finalOrder);
  }
}

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

function SortableStopItem({ stop, index, onRemove, onRename, disabled }: any) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stop.uid });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2 bg-white gap-2"
    >
      <div className="flex items-center gap-2 overflow-hidden flex-1">
        <button {...attributes} {...listeners} className="text-slate-400 hover:text-slate-600 cursor-grab shrink-0 focus:outline-none focus:ring-2 focus:ring-primary rounded" aria-label="Drag to reorder stop">
          <GripVertical size={16} />
        </button>
        <span className="text-sm font-bold text-slate-400 shrink-0">{index + 1}.</span>
        <input
          value={stop.name || ''}
          disabled={disabled}
          onChange={(e) => onRename(index, e.target.value)}
          className="text-sm font-medium text-slate-700 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary outline-none flex-1 min-w-0 disabled:cursor-not-allowed"
          aria-label={`Stop ${index + 1} name`}
        />
      </div>
      <button
        onClick={() => onRemove(index)}
        disabled={disabled}
        className="text-rose-500 hover:text-rose-700 font-bold px-2 py-1 shrink-0 focus:outline-none focus:ring-2 focus:ring-rose-500 rounded disabled:opacity-50"
        aria-label="Remove stop"
      >×</button>
    </li>
  );
}

function ClickToAdd({ onAdd, disabled }: { onAdd: (lat: number, lng: number) => void; disabled?: boolean }) {
  useMapEvents({ click(e) { if (!disabled) onAdd(e.latlng.lat, e.latlng.lng); } });
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
    (initialRoute?.stops || []).map((s: any) => ({ ...s, uid: makeUid() }))
  );

  const latestTrip = initialRoute?.trips?.length > 0 ? initialRoute.trips[initialRoute.trips.length - 1] : null;
  // Assignment state
  const [selectedBusId, setSelectedBusId] = useState(latestTrip?.busId || '');
  const [selectedDriverId, setSelectedDriverId] = useState(latestTrip?.driverId || '');

  const [osrm, setOsrm] = useState<any>(null);
  const [osrmLoading, setOsrmLoading] = useState(false);
  const [osrmError, setOsrmError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastAddedPos, setLastAddedPos] = useState<[number, number] | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{lat: number, lng: number, name: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Live Bus Tracking state
  const [liveBusPosition, setLiveBusPosition] = useState<[number, number] | null>(null);
  const hasCenteredOnBusRef = useRef(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const lastGeocodeRef = useRef<number>(0);
  // Route id we created this session — prevents creating a duplicate route on retry
  const createdRouteIdRef = useRef<string | null>(null);
  // Signature of the last successfully-computed route. Seeded from the initial
  // route ONLY if it already has geometry, so legacy routes still get computed.
  const computedSigRef = useRef<string>(
    (initialRoute?.geometry && (initialRoute?.stops?.length ?? 0) >= 2)
      ? stopSignature(initialRoute.stops)
      : ''
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchResults([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Live bus tracking for the currently selected bus
  useEffect(() => {
    if (selectedBusId) {
      const socket = connectSocket();
      hasCenteredOnBusRef.current = false; // Reset centering flag for new bus
      // Payload shape: { busId, licensePlate, capacity, driverName, routeName, lat, lng, speed, timestamp }
      socket.on('location_update', (data: any) => {
        if (data.busId === selectedBusId) {
          setLiveBusPosition([data.lat, data.lng]);
          if (!hasCenteredOnBusRef.current) {
            // Center the map on the bus location on the first GPS ping
            setLastAddedPos([data.lat, data.lng]);
            hasCenteredOnBusRef.current = true;
          }
        }
      });
      return () => { socket.disconnect(); };
    } else {
      setLiveBusPosition(null);
    }
  }, [selectedBusId]);

  // Seed OSRM from an existing route that already has geometry
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

  // Recompute the path whenever the stops (or their order) actually change.
  // Uses a coordinate signature so add / remove / reorder / marker-drag all
  // trigger a recompute — even when the stop COUNT stays the same (fixes stale
  // distance/duration on edit).
  useEffect(() => {
    let cancelled = false;
    const sig = stopSignature(stops);

    if (stops.length < 2) {
      setOsrm(null);
      setOsrmError(false);
      computedSigRef.current = sig;
      return;
    }
    if (sig === computedSigRef.current) return; // unchanged (e.g. initial load)

    setOsrmLoading(true);
    setOsrmError(false);
    fetchOsrmRoute(stops).then(r => {
      if (cancelled) return;
      setOsrmLoading(false);
      if (r) {
        setOsrm(r);
        computedSigRef.current = sig;
      } else {
        setOsrm(null);
        setOsrmError(true);
      }
    }).catch(() => {
      if (cancelled) return;
      setOsrmLoading(false);
      setOsrm(null);
      setOsrmError(true);
    });

    return () => { cancelled = true; };
  }, [stops]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setStops((items) => {
        const oldIndex = items.findIndex((item) => item.uid === active.id);
        const newIndex = items.findIndex((item) => item.uid === over.id);
        if (oldIndex === -1 || newIndex === -1) return items;
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleRename = (index: number, value: string) => {
    setStops(prev => prev.map((s, i) => (i === index ? { ...s, name: value } : s)));
  };

  const handleAdd = async (lat: number, lng: number) => {
    const uid = makeUid();
    // Add immediately with a fallback name so the map feels responsive.
    setStops(prev => [...prev, { uid, lat, lng, name: `Stop ${prev.length + 1}` }]);
    setLastAddedPos([lat, lng]);

    // Respect Nominatim's ~1 req/sec policy: skip enrichment on rapid clicks.
    // (A custom User-Agent can't be set from the browser, so throttling is the
    // only lever we have here.)
    const now = Date.now();
    if (now - lastGeocodeRef.current < 1100) return;
    lastGeocodeRef.current = now;

    const address = await reverseGeocode(lat, lng);
    if (address) {
      setStops(prev => prev.map(s =>
        s.uid === uid ? { ...s, name: address.split(',')[0], address } : s
      ));
    }
  };

  const handleMarkerDragEnd = (uid: string, lat: number, lng: number) => {
    setStops(prev => prev.map(s => (s.uid === uid ? { ...s, lat, lng } : s)));
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchLocation(searchQuery);
      setSearchResults(results);
      if (results.length === 0) toast('No locations found', { icon: '🔍' });
    } catch (e) {
      toast.error('Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (result: {lat: number, lng: number, name: string}) => {
    setStops(prev => [...prev, {
      uid: makeUid(),
      lat: result.lat,
      lng: result.lng,
      name: result.name.split(',')[0],
      address: result.name,
    }]);
    setLastAddedPos([result.lat, result.lng]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const isDirty = () =>
    name.trim() !== (initialRoute?.name || '') ||
    stops.length !== (initialRoute?.stops?.length || 0) ||
    !!selectedBusId || !!selectedDriverId;

  const handleCancel = () => {
    if (isDirty() && !window.confirm('Discard changes to this route?')) return;
    onCancel();
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
    if (osrmLoading) {
      toast.error('Please wait — the route is still being calculated.');
      return;
    }
    if (!osrm) {
      toast.error('Could not calculate the route path. Check your connection and adjust a stop to retry.');
      return;
    }

    setSaving(true);
    try {
      const stopsPayload = stops.map((s, i) => ({
        name: s.name!,
        address: s.address ?? null,
        lat: s.lat,
        lng: s.lng,
        orderIdx: i,
        expectedArrivalMinutes: osrm?.legMinutes?.[i] ?? null,
      }));

      // Reuse a route we may have already created this session (prevents a
      // duplicate route if a previous assign step failed and the user retries).
      let routeId: string | undefined = initialRoute?.id || createdRouteIdRef.current || undefined;

      if (initialRoute?.id) {
        // Metadata only — stops are managed via granular endpoints.
        await updateRoute(initialRoute.id, {
          name,
          estimatedDuration: osrm?.durationMin ?? null,
          distanceKm: osrm?.distanceKm ?? null,
          geometry: osrm?.geometry ?? null,
        });
        await syncRouteStops(initialRoute.id, initialRoute.stops || [], stops, osrm?.legMinutes || []);
      } else if (!routeId) {
        const newRoute = await createRoute(schoolId, {
          name,
          estimatedDuration: osrm?.durationMin ?? null,
          distanceKm: osrm?.distanceKm ?? null,
          geometry: osrm?.geometry ?? null,
          stops: stopsPayload,
        });
        routeId = newRoute?.id;
        createdRouteIdRef.current = routeId ?? null;
      }

      // Optional assignment — works for both create and edit now.
      if (selectedBusId && selectedDriverId && routeId) {
        await createTrip({ routeId, busId: selectedBusId, driverId: selectedDriverId });
        toast.success(initialRoute?.id ? 'Route updated & trip started!' : 'Route created & assigned!');
      } else {
        toast.success(initialRoute?.id ? 'Route updated' : 'Route created successfully');
      }
      onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const canSave = !saving && !osrmLoading && stops.length >= 2 && !!name.trim() && !!osrm;

  return (
    <div className="flex flex-col gap-4 h-full max-h-[85vh]">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
        <h3 className="text-xl font-bold text-slate-900">{initialRoute ? 'Edit Route' : 'Create New Route'}</h3>
        <button onClick={handleCancel} disabled={saving} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary" aria-label="Close">
          ✕
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 overflow-hidden flex-1 min-h-[500px]">
        {/* LEFT PANEL: Form & Stops */}
        <div className="md:col-span-1 flex flex-col gap-4 overflow-y-auto pr-2 pb-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-slate-700">Route Name</label>
            <input
              disabled={saving}
              className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm font-medium transition-all shadow-sm disabled:bg-slate-50 disabled:text-slate-500"
              placeholder="e.g. Morning Route A"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {buses && drivers && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <SearchableSelect
                    disabled={saving}
                    label="Assign Bus"
                    options={buses.map((bus: any) => ({
                      value: bus.id,
                      label: bus.licensePlate,
                      subLabel: bus.capacity ? `${bus.capacity} seats` : undefined
                    }))}
                    value={selectedBusId}
                    onChange={(val) => setSelectedBusId(val)}
                    placeholder="Select bus"
                  />
              </div>
              <div className="flex flex-col gap-1">
                <SearchableSelect
                    disabled={saving}
                    label="Assign Driver"
                    options={drivers.map((driver: any) => ({
                      value: driver.id,
                      label: driver.name,
                      subLabel: driver.email
                    }))}
                    value={selectedDriverId}
                    onChange={(val) => setSelectedDriverId(val)}
                    placeholder="Select driver"
                  />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 mt-2">
            <label className="text-sm font-semibold text-slate-700 flex justify-between items-center">
              Stops ({stops.length})
              <span className="text-xs font-normal text-slate-500">Drag to reorder</span>
            </label>

            {/* Search Input for Stops */}
            <div className="relative" ref={searchContainerRef}>
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Search to add a stop..."
                disabled={saving}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || saving}
                className="absolute inset-y-1 right-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 rounded text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSearching ? <Loader2 size={14} className="animate-spin" /> : 'Find'}
              </button>

              {/* Search Results Dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute z-[100] mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {searchResults.map((res, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectSearchResult(res)}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0 focus:bg-slate-50 focus:outline-none"
                    >
                      <div className="font-semibold text-slate-800">{res.name.split(',')[0]}</div>
                      <div className="text-xs text-slate-500 truncate">{res.name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Draggable Stops List */}
            <div className="bg-slate-50 rounded-lg p-2 border border-slate-200 mt-1 flex-1 overflow-hidden flex flex-col min-h-[150px]">
              {stops.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-500 m-auto flex flex-col items-center">
                  <MapIcon className="mb-2 text-slate-300" size={32} />
                  <p className="font-semibold text-slate-600">No stops added yet.</p>
                  <p className="text-xs mt-1">Search above or click on the map.</p>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={stops.map(s => s.uid!)} strategy={verticalListSortingStrategy}>
                    <ul className="space-y-2 overflow-y-auto pr-1">
                      {stops.map((s, i) => (
                        <SortableStopItem
                          key={s.uid}
                          stop={s}
                          index={i}
                          disabled={saving}
                          onRename={handleRename}
                          onRemove={(idx: number) => setStops(p => p.filter((_, j) => j !== idx))}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>

          {/* Route computation status */}
          {osrmLoading && (
            <div className="mt-auto bg-slate-50 border border-slate-200 px-4 py-3 rounded-lg flex items-center gap-2 text-sm text-slate-600 shrink-0">
              <Loader2 size={16} className="animate-spin text-primary" /> Calculating route…
            </div>
          )}
          {!osrmLoading && osrmError && (
            <div className="mt-auto bg-rose-50 border border-rose-200 px-4 py-3 rounded-lg flex items-center gap-2 text-sm text-rose-700 shrink-0">
              <AlertTriangle size={16} /> Couldn&apos;t calculate the route. Adjust a stop to retry.
            </div>
          )}
          {!osrmLoading && !osrmError && osrm && (
            <div className="mt-auto bg-orange-50 border border-orange-100 px-4 py-3 rounded-lg flex items-center justify-between shrink-0">
              <div>
                <p className="text-xs text-primary font-bold uppercase tracking-wide">Total Distance</p>
                <p className="text-lg font-bold text-slate-900">{osrm.distanceKm.toFixed(1)} km</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-primary font-bold uppercase tracking-wide">Est. Duration</p>
                <p className="text-lg font-bold text-slate-900">{osrm.durationMin} min</p>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Map */}
        <div className="md:col-span-2 rounded-xl border border-slate-200 overflow-hidden relative h-[400px] md:h-[600px]">
          <MapContainer
            center={lastAddedPos || [CONFIG.MAP_CENTER.lat, CONFIG.MAP_CENTER.lng]}
            zoom={13}
            className="w-full h-full z-0"
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <ClickToAdd onAdd={handleAdd} disabled={saving} />
            <MapController centerPos={lastAddedPos} />

            {stops.map((stop) => (
              <Marker
                key={stop.uid}
                position={[stop.lat, stop.lng]}
                draggable={!saving}
                eventHandlers={{
                  dragend: (e) => {
                    const pos = (e.target as L.Marker).getLatLng();
                    handleMarkerDragEnd(stop.uid!, pos.lat, pos.lng);
                  },
                }}
              />
            ))}

            {osrm?.latLngs && (
              <Polyline positions={osrm.latLngs} color="#ea580c" weight={4} opacity={0.8} />
            )}

            {liveBusPosition && busIcon && (
              <Marker position={liveBusPosition} icon={busIcon!} zIndexOffset={1000} />
            )}
          </MapContainer>

          <div className="absolute top-4 right-4 z-[400] bg-white px-3 py-2 rounded-lg shadow-md border border-slate-200 text-xs font-semibold text-slate-700 pointer-events-none">
            Click map to add • drag pins to adjust
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
        <button
          onClick={handleCancel}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="bg-primary hover:bg-primary-hover text-white px-8 py-2 rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {saving ? 'Saving...' : 'Save Route'}
        </button>
      </div>
    </div>
  );
}
