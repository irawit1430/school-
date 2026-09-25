"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { Bell, Settings, Filter, Layers, Bus, X, PhoneCall, Focus, MessageSquare, AlertTriangle, Eye, EyeOff, Navigation, CheckCircle2, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import {
  fetchBuses, fetchDrivers, fetchDeviceLocations, fetchStudents, fetchTodayAttendance,
  fetchRoutes, connectSocket, apiErrorMessage,
} from '@/lib/api';
import polyline from '@mapbox/polyline';
import { getBusDisplayName } from '@/lib/buses';
import {
  subscribeToBusPositions, mergeBusPosition, reconcileFleet, trackerState, isMoving,
  describeFixAge, describeFreshness,
  resolveBusDriver, resolveBusTrip, busPosition, metresFromPath, isOffRoute,
  OFF_ROUTE_METRES, ALERT_ENTER_KMH, type TrackerState,
} from '@/lib/liveBuses';
import { processStudents, rosterForRoute, EMPTY_ROSTER, type RouteRoster } from '@/lib/students';
import DynamicMap from '@/components/map/DynamicMap';
import { BroadcastModal } from './BroadcastModal';
import toast from 'react-hot-toast';

// One vocabulary for tracker health, shared by the legend, the badges and the tabs.
// Each of those used to compute its own answer, and they disagreed on screen.
const TRACKER_COPY: Record<TrackerState, { label: string; dot: string; chip: string }> = {
  live:    { label: 'Reporting',     dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700' },
  stale:   { label: 'Delayed fix',   dot: 'bg-amber-500',   chip: 'bg-amber-100 text-amber-700' },
  silent:  { label: 'Not reporting', dot: 'bg-red-500',     chip: 'bg-red-100 text-red-700' },
  unknown: { label: 'Awaiting fix',  dot: 'bg-slate-400',   chip: 'bg-slate-100 text-slate-600' },
};

export function LiveFleetMap() {
  const [buses, setBuses] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [filterSingleBus, setFilterSingleBus] = useState(false);
  // Deep-link support: /routes page sends /map?route=<name> — prefill search.
  const [searchQuery, setSearchQuery] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('route') || '';
  });
  // Overview's GPS metric cards deep-link here with ?filter=, so an alarming number on
  // the dashboard leads to the vehicles behind it instead of dead-ending.
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'REPORTING' | 'SILENT' | 'MOVING'>(() => {
    if (typeof window === 'undefined') return 'ALL';
    const wanted = (new URLSearchParams(window.location.search).get('filter') || '').toUpperCase();
    return wanted === 'REPORTING' || wanted === 'SILENT' || wanted === 'MOVING' ? wanted : 'ALL';
  });
  const [loadError, setLoadError] = useState('');
  // Bound to the real socket rather than animating unconditionally: the pulsing dot used
  // to look identical whether telemetry was flowing or the connection had silently died.
  const [socketLive, setSocketLive] = useState(false);
  const [lastPacketAt, setLastPacketAt] = useState<number | null>(null);
  const [showBroadcast, setShowBroadcast] = useState(false);
  // A school does not track buses because it cares about buses. "40 seats" was displayed
  // where "22 aboard" is the number anyone actually needs.
  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [rosterError, setRosterError] = useState('');
  // Routes carry the stored polyline and stops. Without them a marker's position cannot be
  // judged at all, and nothing could tell whether a bus had left its route.
  const [routes, setRoutes] = useState<any[]>([]);
  // Ages are read from timestamps, so the screen must re-render as time passes even when
  // no packet arrives - that is the whole point of showing staleness.
  const [now, setNow] = useState(() => Date.now());
  // Who is driving each bus, keyed by busId. Comes from REST, not the socket: the
  // location_update event is position-only and its two emitters disagree — the TCP
  // path the real hardware trackers use has never carried driver identity at all, so
  // reading a name off the socket works with a phone in testing and says "Unassigned"
  // for every actual bus in production. REST also resolves the running trip in a
  // defined order, which matters once a bus has two legs in a day.
  const [driverByBus, setDriverByBus] = useState<Record<string, any>>({});

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(tick);
  }, []);

  const loadFleet = () => {
    setLoading(true);
    Promise.all([fetchBuses(), fetchDrivers()])
      .then(([busesData, driversData]) => {
        // Folded in, not assigned: a plain assignment threw away every socket position
        // and snapped each marker back to the REST row's minutes-old fix.
        setBuses(prev => reconcileFleet(prev, Array.isArray(busesData) ? busesData : []));
        setDrivers(Array.isArray(driversData) ? driversData : []);
        setLoadError('');
      })
      // An empty vehicle list on a tracking screen reads as "no buses are running",
      // which at 07:30 is either a false alarm or, worse, accepted as normal.
      .catch(err => setLoadError(apiErrorMessage(err, 'Could not load the fleet.')))
      .finally(() => setLoading(false));
  };

  const loadRoster = () => {
    Promise.all([fetchStudents(), fetchTodayAttendance()])
      .then(([rows, logs]) => {
        setStudents(Array.isArray(rows) ? rows : []);
        setAttendance(Array.isArray(logs) ? logs : []);
        setRosterError('');
      })
      // Onboard counts are additive context, so a failure here must not take the map
      // down with it — it just stops claiming numbers it cannot back up.
      .catch(err => setRosterError(apiErrorMessage(err, 'Onboard counts unavailable.')));
  };

  useEffect(() => {
    // Geometry changes only when someone edits a route, so this is fetched once.
    fetchRoutes()
      .then(rows => setRoutes(Array.isArray(rows) ? rows : []))
      .catch(() => { /* The map still works without the overlay; it just draws no route. */ });
  }, []);

  /** routeId → decoded path and stops, decoded once rather than per render. */
  const routeShapes = useMemo(() => {
    const out = new Map<string, { path: [number, number][]; stops: any[] }>();
    for (const route of routes) {
      let path: [number, number][] = [];
      if (typeof route.geometry === 'string' && route.geometry) {
        try {
          path = polyline.decode(route.geometry) as [number, number][];
        } catch {
          // A malformed stored polyline must not take the whole map down.
        }
      }
      out.set(route.id, { path, stops: route.stops ?? [] });
    }
    return out;
  }, [routes]);

  const routeIdFor = (bus: any): string | null =>
    resolveBusTrip(bus, drivers)?.routeId ?? bus?.routeId ?? null;

  /**
   * How far this bus is from the route it is supposed to be driving, in metres, or null
   * when either the position or the route shape is missing.
   */
  const offRouteMetres = (bus: any): number | null => {
    const position = busPosition(bus);
    if (!position) return null;
    const routeId = routeIdFor(bus);
    const path = routeId ? routeShapes.get(routeId)?.path : null;
    return path && path.length > 1 ? metresFromPath(position, path) : null;
  };

  useEffect(() => {
    loadRoster();
    // Scans arrive through the same hardware as positions but over REST, so poll.
    const rosterPoll = setInterval(loadRoster, 60_000);
    return () => clearInterval(rosterPoll);
     
  }, []);

  const processedStudents = useMemo(
    () => processStudents(students, attendance),
    [students, attendance],
  );

  /** routeId → who that route is carrying today, computed once per render pass. */
  const rosterByRoute = useMemo(() => {
    const ids = new Set<string>();
    for (const student of processedStudents) {
      for (const mapping of student.mappings) if (mapping.routeId) ids.add(mapping.routeId);
      if (student.routeId) ids.add(student.routeId);
    }
    const out = new Map<string, RouteRoster>();
    for (const id of ids) out.set(id, rosterForRoute(processedStudents, id));
    return out;
  }, [processedStudents]);

  const rosterFor = (bus: any): RouteRoster => {
    const routeId = resolveBusTrip(bus, drivers)?.routeId ?? bus?.routeId ?? null;
    return (routeId && rosterByRoute.get(routeId)) || EMPTY_ROSTER;
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFleet();

    // Socket.io connection for real-time telemetry
    const socket = connectSocket();
    const onConnect = () => setSocketLive(true);
    const onDisconnect = () => setSocketLive(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);


    // Batched, not per-packet: one state update a second regardless of fleet size.
    let warnedUnmatched = false;
    const stopPositions = subscribeToBusPositions(socket, batch => {
      setBuses(prev => {
        // Telemetry is keyed by the id the server calls busId; the markers are keyed by
        // the bus id from REST. If those ever diverge every lookup misses silently and
        // the markers sit exactly where the initial fetch put them.
        if (!warnedUnmatched) {
          const known = new Set(prev.map(b => b.id));
          const unmatched = [...batch.keys()].filter(id => !known.has(id));
          if (unmatched.length > 0) {
            warnedUnmatched = true;
            console.warn('[telemetry] updates for buses not on screen — markers will not move', {
              unmatched, knownBusIds: [...known],
            });
          }
        }
        return prev.map(b => {
          const data = batch.get(b.id);
          return data ? mergeBusPosition(b, data) : b;
        });
      });
      setLastPacketAt(Date.now());
      setNow(Date.now());
    });

    // Identity changes only when a trip starts or ends — a few times a day — so a slow
    // poll is enough. Position comes from the socket above.
    const loadDriverIdentity = () => {
      fetchDeviceLocations()
        .then((locations: any) => {
          const rows = Array.isArray(locations) ? locations : (locations?.data ?? []);
          setDriverByBus(Object.fromEntries(rows.map((r: any) => [r.busId, r])));
        })
        .catch(err => console.warn('Failed to refresh driver identity', err));
    };
    loadDriverIdentity();
    const identityPoll = setInterval(loadDriverIdentity, 60000);

    return () => {
      clearInterval(identityPoll);
      stopPositions();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.disconnect();
    };
  }, []);

  // Motion and connectivity are counted separately because they are different questions.
  // The old single count stood in for both and was labelled "On Schedule", which was a
  // third thing again and related to neither.
  const fleetCounts = useMemo(() => {
    let moving = 0, stopped = 0, notReporting = 0, overspeed = 0, offRoute = 0;
    for (const bus of buses) {
      if (trackerState(bus, now) === 'silent') notReporting++;
      else if (isMoving(bus)) moving++;
      else stopped++;
      if (bus.speeding) overspeed++;
      // Only meaningful while the tracker is live: a stale fix compared against a route
      // says where the bus was, not where it is.
      if (trackerState(bus, now) !== 'silent' && isOffRoute(offRouteMetres(bus))) offRoute++;
    }
    return { moving, stopped, notReporting, overspeed, offRoute };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buses, now, routeShapes, drivers]);

  const selectedBus = useMemo(
    () => buses.find(b => b.id === selectedBusId),
    [buses, selectedBusId],
  );
  const selectedTracker = selectedBus ? trackerState(selectedBus, now) : 'unknown';
  const selectedDriver = selectedBus
    ? resolveBusDriver(selectedBus, driverByBus[selectedBus.id], drivers)
    : { name: 'Unassigned', phone: null, assigned: false };
  const selectedTrip = selectedBus ? resolveBusTrip(selectedBus, drivers) : null;
  const selectedRoster = selectedBus ? rosterFor(selectedBus) : EMPTY_ROSTER;
  const selectedRouteId = selectedBus ? routeIdFor(selectedBus) : null;
  const selectedShape = selectedRouteId ? routeShapes.get(selectedRouteId) ?? null : null;
  const selectedOffRoute = selectedBus ? offRouteMetres(selectedBus) : null;

  const filteredBuses = useMemo(() => {
    return buses.filter(bus => {
      const q = searchQuery.toLowerCase().trim();
      const nameMatch = (bus.name || bus.licensePlate || bus.registrationNumber || '').toLowerCase().includes(q);
      const routeMatch = (bus.routeName || '').toLowerCase().includes(q);
      // Same resolution as the card renders, or searching a driver's name misses the
      // bus they are actually on.
      const driverMatch = resolveBusDriver(bus, driverByBus[bus.id], drivers).name.toLowerCase().includes(q);
      if (q && !(nameMatch || routeMatch || driverMatch)) return false;

      const state = trackerState(bus, now);
      if (statusFilter === 'SILENT') return state === 'silent';
      if (statusFilter === 'REPORTING') return state === 'live' || state === 'stale';
      if (statusFilter === 'MOVING') return state !== 'silent' && isMoving(bus);
      return true;
    });
  }, [buses, searchQuery, statusFilter, driverByBus, drivers, now]);

  const handleSelectBus = (busId: string | null) => {
    setSelectedBusId(busId);
    if (!busId) {
      setFilterSingleBus(false);
    }
  };


  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden bg-slate-100">
      {/* Map Area */}
      <div className="flex-1 relative flex flex-col">
        {/* Real-time interactive smooth map */}
        <DynamicMap 
          buses={buses} 
          selectedBusId={selectedBusId}
          onSelectBus={handleSelectBus}
          filterSingleBus={filterSingleBus}
          className="absolute inset-0 z-0" 
        />

        {/* Top-Left: Fleet Status Legend
            Was "On Schedule / Delayed / Standby", none of which this data knows: the
            first count was simply the buses that happened to be moving. These three
            rows now name exactly what they measure. */}
        <div className="absolute top-4 left-4 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-lg p-3.5 w-64 transition-all">
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <span className={clsx('w-2 h-2 rounded-full', socketLive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500')}></span>
              {socketLive ? 'Live Fleet Status' : 'Reconnecting…'}
            </h4>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
              {buses.length} Vehicles
            </span>
          </div>
          <div className="space-y-1.5 text-xs text-slate-600 font-medium">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></div>
                Moving
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 rounded">
                {fleetCounts.moving}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-sky-500"></div>
                Stopped, reporting
              </div>
              <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-1.5 rounded">
                {fleetCounts.stopped}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={clsx('w-2.5 h-2.5 rounded-full bg-red-500', fleetCounts.notReporting > 0 && 'animate-pulse')}></div>
                Not reporting
              </div>
              <span className="text-[11px] font-bold text-red-600">
                {fleetCounts.notReporting}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <div className={clsx('w-2.5 h-2.5 rounded-full bg-orange-500', fleetCounts.overspeed > 0 && 'animate-pulse')}></div>
                Overspeed (&gt;{ALERT_ENTER_KMH})
              </div>
              {/* Counts the same `speeding` flag the badges read. The old `> 60` here
                  disagreed with the hysteresis, so the legend could report two
                  overspeeding buses while every card in the list stayed green. */}
              <span className="text-[11px] font-bold text-orange-600">
                {fleetCounts.overspeed}
              </span>
            </div>
            {fleetCounts.offRoute > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-fuchsia-600 animate-pulse"></div>
                  Off route (&gt;{OFF_ROUTE_METRES}m)
                </div>
                <span className="text-[11px] font-bold text-fuchsia-700">
                  {fleetCounts.offRoute}
                </span>
              </div>
            )}
            {lastPacketAt && (
              <p className="pt-1.5 border-t border-slate-100 text-[10px] font-normal text-slate-400">
                Last telemetry {describeFixAge({ gpsLogs: [{ timestamp: new Date(lastPacketAt).toISOString() }] }, now)}
              </p>
            )}
          </div>
        </div>

        {/* Top-Center / Single Vehicle Focus Mode HUD */}
        {selectedBus && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900/95 text-white backdrop-blur-md rounded-2xl border border-slate-700/60 shadow-2xl px-5 py-3 flex items-center gap-5 transition-all duration-300 animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-md">
                <Bus size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-orange-400 font-bold uppercase tracking-wider">Tracking Vehicle</span>
                  {/* Bound to the socket. This used to ping green unconditionally, so a
                      dead connection looked exactly like a live one. */}
                  <span className={clsx('w-1.5 h-1.5 rounded-full', socketLive ? 'bg-emerald-400 animate-ping' : 'bg-red-400')}></span>
                </div>
                <h3 className="font-bold text-sm text-white leading-tight">
                  {getBusDisplayName(selectedBus)}
                </h3>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-700/80"></div>

            <div className="flex items-center gap-6 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Last fix</span>
                <span className={clsx('font-bold text-sm', selectedTracker === 'silent' ? 'text-red-400' : selectedTracker === 'stale' ? 'text-amber-300' : 'text-emerald-400')}>
                  {describeFreshness(selectedBus, now)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Speed</span>
                <span className="font-bold text-slate-100 text-sm">
                  {isMoving(selectedBus) ? `${(selectedBus.gpsLogs?.[0]?.speed ?? 0).toFixed(1)} km/h` : 'Stopped'}
                </span>
              </div>
              {isOffRoute(selectedOffRoute) && selectedTracker !== 'silent' && (
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Off route</span>
                  <span className="font-bold text-sm text-fuchsia-300">
                    {Math.round(selectedOffRoute!)} m
                  </span>
                </div>
              )}
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Onboard</span>
                <span className="font-bold text-sm text-white">
                  {selectedRoster.expected > 0
                    ? `${selectedRoster.aboard} of ${selectedRoster.expected}`
                    : rosterError ? '—' : 'No roster'}
                </span>
                {selectedRoster.awaited > 0 && (
                  <span className="block text-[10px] font-semibold text-amber-300">
                    {selectedRoster.awaited} not yet boarded
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Route</span>
                <span className="font-semibold text-slate-200">
                  {selectedBus.routeName || selectedTrip?.route?.name || 'No active trip'}
                </span>
                {/* Trips have carried currentEtaMessage and progressPercent all along;
                    the Overview widget read both and the tracking screen read neither. */}
                {(selectedTrip?.currentEtaMessage || typeof selectedTrip?.progressPercent === 'number') && (
                  <span className="block text-[10px] text-slate-400">
                    {selectedTrip.currentEtaMessage
                      || `${selectedTrip.progressPercent}% of the route done`}
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Driver</span>
                {/* Resolved through the same helper as the sidebar card. These two used
                    to disagree: the card named the driver, the HUD said "Unassigned". */}
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  {selectedDriver.name}
                  {selectedDriver.phone && (
                    <a
                      href={`tel:${selectedDriver.phone}`}
                      className="text-orange-400 hover:text-orange-300"
                      title={`Call ${selectedDriver.name} on ${selectedDriver.phone}`}
                      aria-label={`Call ${selectedDriver.name}`}
                    >
                      <PhoneCall size={13} />
                    </a>
                  )}
                </span>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-700/80"></div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterSingleBus(prev => !prev)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm",
                  filterSingleBus 
                    ? "bg-orange-600 text-white hover:bg-orange-700" 
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                )}
                title="Hide other vehicles to see only this bus"
              >
                {filterSingleBus ? <EyeOff size={14} /> : <Eye size={14} />}
                {filterSingleBus ? 'Showing Solo' : 'Isolate Vehicle'}
              </button>

              <button
                onClick={() => handleSelectBus(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                title="Exit Focus Mode"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Bottom Floating Controls
            "My Location" asked for GPS permission, discarded the coordinates and
            toasted "Location centered." while the map stayed put. "Map Layers" and
            "Settings" were toasts only, and the settings one announced a 5 second
            telemetry interval when the real flush is 1000ms. All three are gone
            rather than faked — the subject of this map is buses, not the operator. */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
          <button
            onClick={() => handleSelectBus(null)}
            className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl shadow-lg font-bold transition-all flex items-center gap-2 text-sm active:scale-95"
          >
            <Focus size={16} /> Recenter Fleet (View All)
          </button>
        </div>
      </div>

      {/* Right Sidebar: Fleet Explorer & Vehicle Focus List */}
      <div className="w-96 bg-white border-l border-slate-200 flex flex-col relative z-10 shadow-sm">
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Fleet Explorer</h3>
              <p className="text-xs text-slate-500">Click any vehicle to focus & track</p>
            </div>
            <span className={clsx(
              'text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1',
              fleetCounts.notReporting > 0
                ? 'text-red-700 bg-red-50 border-red-100'
                : 'text-emerald-700 bg-emerald-50 border-emerald-100',
            )}>
              <span className={clsx('w-2 h-2 rounded-full', fleetCounts.notReporting > 0 ? 'bg-red-500' : 'bg-emerald-500')}></span>
              {fleetCounts.notReporting > 0
                ? `${fleetCounts.notReporting} not reporting`
                : `${buses.length} reporting`}
            </span>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Filter size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by bus, route, or driver..." 
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/10 transition-all font-medium"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status Tabs
              "Active Only" used to mean "currently moving", which hid every bus parked
              at a stop with children boarding. Reporting and Moving are now separate. */}
          <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl text-[11px] font-bold">
            {([
              { key: 'ALL', label: 'All' },
              { key: 'MOVING', label: 'Moving' },
              { key: 'REPORTING', label: 'Reporting' },
              { key: 'SILENT', label: 'Silent' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                aria-pressed={statusFilter === tab.key}
                className={clsx(
                  "flex-1 py-1 rounded-lg transition-all text-center",
                  statusFilter === tab.key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                {tab.label}
                {tab.key === 'SILENT' && fleetCounts.notReporting > 0 && (
                  <span className="ml-1 text-red-600">{fleetCounts.notReporting}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        
        {/* Buses List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* A failed fleet fetch used to fall through to "No vehicles matching your
              filter" — an outage rendered as a confident statement that nothing is
              running, on the one screen where that reads as an emergency. */}
          {loadError && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <p className="font-semibold">Couldn&apos;t load the fleet.</p>
              <p className="mt-0.5">{loadError}</p>
              {buses.length > 0 && <p className="mt-1">Showing the last known positions. They may be out of date.</p>}
              <button onClick={loadFleet} disabled={loading} className="mt-2 font-semibold underline disabled:opacity-50">
                Retry
              </button>
            </div>
          )}
          {loading && buses.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
              Loading fleet vehicles...
            </div>
          ) : filteredBuses.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              {loadError ? 'No positions available.'
                : buses.length === 0 ? 'No buses in this school yet.'
                : 'No vehicles match your search or filter.'}
            </div>
          ) : (
            filteredBuses.map((bus) => {
              const speed = bus.gpsLogs?.[0]?.speed || 0;
              const isAlert = Boolean(bus.speeding);
              const tracker = trackerState(bus, now);
              const moving = isMoving(bus);
              const fixAge = describeFreshness(bus, now);
              const isSelected = selectedBusId === bus.id;
              // One resolution path, shared with the focus HUD above the map.
              const driver = resolveBusDriver(bus, driverByBus[bus.id], drivers);
              const roster = rosterFor(bus);
              const strayed = tracker !== 'silent' && isOffRoute(offRouteMetres(bus));

              return (
                <div
                  key={bus.id}
                  onClick={() => handleSelectBus(isSelected ? null : bus.id)}
                  className={clsx(
                    "p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer relative group",
                    isSelected
                      ? "border-orange-500 bg-orange-50/40 ring-2 ring-orange-500/20 shadow-md scale-[1.01]"
                      : isAlert ? "border-orange-200 bg-orange-50/40 hover:border-orange-300 shadow-sm" :
                        tracker === 'silent' ? "border-red-200 bg-red-50/40 hover:border-red-300 shadow-sm" :
                        tracker === 'stale' ? "border-amber-200 bg-amber-50/30 hover:border-amber-300 shadow-sm" :
                        moving ? "border-emerald-200 bg-emerald-50/30 hover:border-emerald-300 shadow-sm" :
                        "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className={clsx(
                        "p-2 rounded-xl text-white shadow-sm transition-transform group-hover:scale-105",
                        isAlert ? "bg-orange-500" :
                        tracker === 'silent' ? "bg-red-500" :
                        tracker === 'stale' ? "bg-amber-500" :
                        moving ? "bg-emerald-500" : "bg-sky-500"
                      )}>
                        {isAlert || tracker === 'silent' ? <AlertTriangle size={15} /> : <Bus size={15} />}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm leading-tight group-hover:text-orange-600 transition-colors">
                          {getBusDisplayName(bus)}
                        </h4>
                        <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1 mt-0.5">
                          <span className="truncate max-w-[150px]">{bus.routeName || 'No active trip'}</span>
                        </p>
                      </div>
                    </div>

                    {/* Connectivity and motion are two badges because they are two facts.
                        A stopped bus with a healthy tracker used to read "Offline". */}
                    <div className="flex flex-col items-end gap-1">
                      <span className={clsx("text-[9px] font-bold uppercase px-2 py-0.5 rounded-full tracking-wider", TRACKER_COPY[tracker].chip)}>
                        {TRACKER_COPY[tracker].label}
                      </span>
                      <span className={clsx(
                        "text-[9px] font-bold uppercase px-2 py-0.5 rounded-full tracking-wider",
                        isAlert ? "bg-orange-100 text-orange-700" : moving ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
                      )}>
                        {isAlert ? 'Overspeed' : moving ? 'Moving' : 'Stopped'}
                      </span>
                      {strayed && (
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full tracking-wider bg-fuchsia-100 text-fuchsia-700">
                          Off route
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs mt-3 pt-2.5 border-t border-slate-100/80">
                    <div className="min-w-0">
                      <p className="text-slate-400 uppercase tracking-wider text-[9px] font-bold">Driver / Onboard</p>
                      <p className="font-semibold text-slate-800 text-xs truncate max-w-[150px]">
                        {driver.name}
                        {roster.expected > 0 ? (
                          <span className="text-slate-500 font-normal">
                            {' · '}{roster.aboard}/{roster.expected} aboard
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">{' · '}{bus.capacity} seats</span>
                        )}
                      </p>
                      {roster.awaited > 0 && (
                        <p className="text-[10px] font-semibold text-amber-600">
                          {roster.awaited} not yet boarded
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="text-slate-400 uppercase tracking-wider text-[9px] font-bold">Speed · Last fix</p>
                      <p className={clsx("font-bold text-xs", isAlert ? "text-orange-600" : moving ? "text-emerald-600" : "text-slate-600")}>
                        {moving ? `${speed.toFixed(1)} km/h` : '0 km/h'}
                        <span className={clsx(
                          "ml-1.5 font-medium",
                          tracker === 'silent' ? 'text-red-600' : tracker === 'stale' ? 'text-amber-600' : 'text-slate-400',
                        )}>
                          · {fixAge}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 flex items-center justify-between gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectBus(isSelected ? null : bus.id);
                      }}
                      className={clsx(
                        "flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm",
                        isSelected
                          ? "bg-orange-600 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-orange-50 hover:text-orange-600"
                      )}
                    >
                      <Focus size={13} />
                      {isSelected ? 'Shown on map · Clear' : 'Show on Map'}
                    </button>

                    {/* Was a toast that said "Contacting driver…" and placed no call. During a
                        breakdown that reads as success and nobody has been reached. Now it dials,
                        or says plainly that it can't. */}
                    {driver.assigned && (
                      driver.phone ? (
                        <a
                          href={`tel:${driver.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:text-orange-600 hover:bg-orange-50 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500"
                          title={`Call ${driver.name} on ${driver.phone}`}
                          aria-label={`Call ${driver.name}`}
                        >
                          <PhoneCall size={14} />
                        </a>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toast.error(`No phone number on file for ${driver.name}. Add one on the Drivers page.`);
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-300 cursor-not-allowed"
                          title={`No phone number for ${driver.name}`}
                          aria-label={`No phone number for ${driver.name}`}
                        >
                          <PhoneCall size={14} />
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Broadcast
            This button used to call prompt(), throw the message away and toast
            "Message broadcasted to all drivers!" — no request was ever made. It is the
            control an operator reaches for during a breakdown, so the confirmation was
            the dangerous part. It now opens the dialog that actually posts. */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={() => setShowBroadcast(true)}
            className="w-full bg-slate-900 hover:bg-black text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all text-xs shadow-md active:scale-98"
          >
            <Bell size={15} className="text-orange-500" /> Broadcast Message to Fleet
          </button>
        </div>
      </div>

      <BroadcastModal
        isOpen={showBroadcast}
        onClose={() => setShowBroadcast(false)}
        defaultAudience="DRIVERS"
      />
    </div>
  );
}
