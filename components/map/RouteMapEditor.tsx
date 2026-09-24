"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import GoogleRouteMap from './GoogleRouteMap';
import { fetchOsrmRoute, reverseGeocode, searchLocation, Stop } from '@/lib/osrm';
import { hasMapsKey, geocodeLatLng, geocodeAddress } from '@/lib/googleMaps';
import { fetchGoogleTrafficRoute } from '@/lib/googleRoutes';
import { createRoute, updateRoute, connectSocket, createStop, updateStop, deleteStop, reorderStops } from '@/lib/api';
import { CONFIG } from '@/lib/config';
import toast from 'react-hot-toast';
import { Search, Loader2, Map as MapIcon, AlertTriangle, RefreshCw, X as XIcon } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { activeTripsSoonestFirst } from '@/lib/trips';

// ─── Stable unique id per stop (fixes duplicate lat/lng collisions) ───
let uidCounter = 0;
const makeUid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `stop_${Date.now()}_${uidCounter++}`;

const stopSignature = (list: Stop[]) => list.map((s) => `${s.lat},${s.lng}`).join('|');

// ─── Extended Stop type with editor metadata ──────────────────────────
type EditorStop = Stop & {
  /** True once the user has manually typed in the stop-name field. Prevents
   *  late reverse-geocode responses from overwriting an intentional name. */
  nameEdited?: boolean;
};

// ─── Reconcile an existing route's stops via granular endpoints ───
// Backend requires: POST (add), DELETE (remove), updateStop (edit),
// PUT .../reorder (set all orderIdx). PUT /routes/:id itself only takes metadata.
// `currentStops` carry a backend `id` when they came from the loaded route;
// newly-added stops have no `id` (only a client `uid`).
export async function syncRouteStops(
  routeId: string,
  initialStops: any[],
  currentStops: EditorStop[],
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
      const changed =
        !orig ||
        orig.name !== s.name ||
        orig.lat !== s.lat ||
        orig.lng !== s.lng ||
        (orig.address ?? null) !== (s.address ?? null) ||
        // Issue 4a: reordering must update arrival offsets
        (orig.orderIdx ?? null) !== i ||
        // Moving one stop changes the minutes of every stop after it. Comparing only
        // the stop's own fields left those later stops on their old times, and the
        // parents' ETA is built from them.
        (orig.expectedArrivalMinutes ?? null) !== body.expectedArrivalMinutes;
      if (changed) await updateStop(routeId, s.id, body);
      finalOrder.push({ id: s.id, orderIdx: i });
    } else {
      // Issue 4b: backfill the server id into the stop object so that a
      // retry after a partial failure treats this stop as existing.
      const created: any = await createStop(routeId, body);
      const newId = created?.id ?? created?.data?.id;
      if (newId) {
        s.id = newId; // mutate in place — intentional retry guard
        finalOrder.push({ id: newId, orderIdx: i });
      }
    }
  }

  // 3. Commit the final ordering for all stops in one call
  if (finalOrder.length) {
    await reorderStops(routeId, finalOrder);
  }
}

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

export default function RouteMapEditor({ schoolId, initialRoute, onSaved, onCancel }:
  { schoolId: string; initialRoute?: any; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(initialRoute?.name || '');
  const [stops, setStops] = useState<EditorStop[]>(
    (initialRoute?.stops || []).map((s: any) => ({ ...s, uid: makeUid() }))
  );

  // This editor edits the route: its name, its stops, its shape. Crew and direction
  // belong to a trip and are set where trips are made, so that a save here can never
  // surprise the admin by starting one.
  //
  // The route's live trip is still read — not to edit, but so the map can follow the
  // bus that is on this route right now while its stops are being moved.
  const liveBusId = activeTripsSoonestFirst(initialRoute?.trips)[0]?.busId ?? '';

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
  // Recompute existing routes when the editor opens so their stop times reflect
  // school-morning traffic (see nextSchoolMorning).
  const computedSigRef = useRef<string>('');

  // Issue 5: Dirty-state snapshot — captures the initial form state so any
  // rename, move, or reorder is correctly detected as an unsaved change.
  const initialSnapshot = useRef(
    JSON.stringify({
      name: initialRoute?.name || '',
      stops: (initialRoute?.stops || []).map((s: any) => ({
        id: s.id, name: s.name, lat: s.lat, lng: s.lng,
      })),
    })
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

  // Live position of whichever bus is currently running this route
  useEffect(() => {
    if (liveBusId) {
      const socket = connectSocket();
      hasCenteredOnBusRef.current = false;
      socket.on('location_update', (data: any) => {
        if (data.busId === liveBusId) {
          setLiveBusPosition([data.lat, data.lng]);
          if (!hasCenteredOnBusRef.current) {
            setLastAddedPos([data.lat, data.lng]);
            hasCenteredOnBusRef.current = true;
          }
        }
      });
      return () => { socket.disconnect(); };
    } else {
      setLiveBusPosition(null);
    }
  }, [liveBusId]);

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
  // Issue 16e: call setOsrmLoading(false) in the cleanup so the spinner never
  // persists if the effect is torn down before the fetch resolves.
  useEffect(() => {
    let cancelled = false;
    const sig = stopSignature(stops);

    if (stops.length < 2) {
      setOsrm(null);
      setOsrmError(false);
      computedSigRef.current = sig;
      return;
    }
    if (sig === computedSigRef.current) return;

    setOsrmLoading(true);
    setOsrmError(false);
    const calculateRoute = async () => {
      if (hasMapsKey) {
        try {
          const googleRoute = await fetchGoogleTrafficRoute(stops);
          if (googleRoute) return googleRoute;
        } catch {
          // Keep the route editor usable if Routes API is disabled for this key.
        }
      }
      return fetchOsrmRoute(stops);
    };

    calculateRoute().then(r => {
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

    return () => {
      cancelled = true;
      // Issue 16e: don't leave the spinner running after unmount/re-run
      setOsrmLoading(false);
    };
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

  // Issue 16b: mark the stop as manually edited so geocode can't overwrite it
  const handleRename = (index: number, value: string) => {
    setStops(prev => prev.map((s, i) => (i === index ? { ...s, name: value, nameEdited: true } : s)));
  };

  const handleAdd = async (lat: number, lng: number) => {
    const uid = makeUid();
    setStops(prev => [...prev, { uid, lat, lng, name: `Stop ${prev.length + 1}` }]);
    setLastAddedPos([lat, lng]);

    if (!hasMapsKey) {
      const now = Date.now();
      if (now - lastGeocodeRef.current < 1100) return;
      lastGeocodeRef.current = now;
    }

    const address = hasMapsKey
      ? await geocodeLatLng(lat, lng)
      : await reverseGeocode(lat, lng);
    if (address) {
      setStops(prev => prev.map(s =>
        // Issue 16b: only overwrite the name if the user hasn't edited it yet
        s.uid === uid && !s.nameEdited ? { ...s, name: address.split(',')[0], address } : s
      ));
    }
  };

  // Issue 16c: re-geocode when the user drags a pin to a new location
  const handleMarkerDragEnd = useCallback(async (uid: string, lat: number, lng: number) => {
    setStops(prev => prev.map(s => (s.uid === uid ? { ...s, lat, lng } : s)));

    const address = hasMapsKey
      ? await geocodeLatLng(lat, lng)
      : await reverseGeocode(lat, lng);
    if (address) {
      setStops(prev => prev.map(s =>
        s.uid === uid
          ? { ...s, address, ...(s.nameEdited ? {} : { name: address.split(',')[0] }) }
          : s
      ));
    }
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = hasMapsKey ? await geocodeAddress(searchQuery) : await searchLocation(searchQuery);
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

  // Issue 16d: explicit retry — reset the computed signature so the effect fires again
  const handleRetryOsrm = () => {
    computedSigRef.current = '';
    setOsrmError(false);
    setStops(s => [...s]); // trigger the effect
  };

  // Issue 5: compare full snapshot so rename / move / reorder is caught
  const isDirty = () => {
    const current = JSON.stringify({
      name,
      stops: stops.map(s => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng })),
    });
    return current !== initialSnapshot.current;
  };

  const handleCancel = () => {
    if (isDirty() && !window.confirm('Discard changes to this route?')) return;
    onCancel();
  };

  const handleSave = async () => {
    if (!name.trim() || stops.length < 2) {
      toast.error('Route needs a name and at least 2 stops.');
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

      let routeId: string | undefined = initialRoute?.id || createdRouteIdRef.current || undefined;

      if (initialRoute?.id) {
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

      toast.success(initialRoute?.id ? 'Route updated' : 'Route created');
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
            <div className="mt-auto bg-rose-50 border border-rose-200 px-4 py-3 rounded-lg flex items-center justify-between gap-2 text-sm text-rose-700 shrink-0">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>Couldn&apos;t calculate the route.</span>
              </div>
              {/* Issue 16d: explicit retry button */}
              <button
                onClick={handleRetryOsrm}
                className="flex items-center gap-1 text-xs font-bold underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-rose-500 rounded"
              >
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          )}
          {!osrmLoading && !osrmError && osrm && (
            <div className="mt-auto bg-orange-50 border border-orange-100 px-4 py-3 rounded-lg flex items-center justify-between shrink-0">
              <div>
                <p className="text-xs text-primary font-bold uppercase tracking-wide">Total Distance</p>
                <p className="text-lg font-bold text-slate-900">{osrm.distanceKm.toFixed(1)} km</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-primary font-bold uppercase tracking-wide">
                  {osrm.trafficAware ? 'Traffic-aware ETA' : 'Est. Duration'}
                </p>
                <p className="text-lg font-bold text-slate-900">{osrm.durationMin} min</p>
                {osrm.trafficAware && <p className="text-[10px] text-slate-500">Google traffic, school morning</p>}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Map */}
        <div className="md:col-span-2 rounded-xl border border-slate-200 overflow-hidden relative h-[400px] md:h-[600px]">
          <GoogleRouteMap
            stops={stops}
            path={osrm?.latLngs ?? null}
            liveBusPosition={liveBusPosition}
            centerPos={lastAddedPos}
            defaultCenter={[CONFIG.MAP_CENTER.lat, CONFIG.MAP_CENTER.lng]}
            defaultZoom={13}
            disabled={saving}
            onAdd={handleAdd}
            onDragEnd={handleMarkerDragEnd}
          />

          <div className="absolute top-4 right-4 z-[400] bg-white px-3 py-2 rounded-lg shadow-md border border-slate-200 text-xs font-semibold text-slate-700 pointer-events-none">
            Click map to add • drag pins to adjust
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
        <button
          onClick={handleCancel}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
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
