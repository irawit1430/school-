"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { Bell, Settings, Filter, Layers, Bus, X, PhoneCall, Focus, MessageSquare, AlertTriangle, Eye, EyeOff, Navigation, CheckCircle2, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { fetchBuses, fetchDrivers, fetchDeviceLocations, connectSocket } from '@/lib/api';
import { isActiveTrip } from '@/lib/trips';
import { subscribeToBusPositions, mergeBusPosition } from '@/lib/liveBuses';
import DynamicMap from '@/components/map/DynamicMap';
import toast from 'react-hot-toast';

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
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'OFFLINE'>('ALL');
  // Who is driving each bus, keyed by busId. Comes from REST, not the socket: the
  // location_update event is position-only and its two emitters disagree — the TCP
  // path the real hardware trackers use has never carried driver identity at all, so
  // reading a name off the socket works with a phone in testing and says "Unassigned"
  // for every actual bus in production. REST also resolves the running trip in a
  // defined order, which matters once a bus has two legs in a day.
  const [driverByBus, setDriverByBus] = useState<Record<string, any>>({});

  useEffect(() => {
    // Initial fetch
    Promise.all([fetchBuses(), fetchDrivers()])
      .then(([busesData, driversData]) => {
        setBuses(busesData);
        setDrivers(driversData);
        setLoading(false);
      }).catch(err => {
        console.error('Failed to load fleet data:', err);
        setLoading(false);
      });

    // Socket.io connection for real-time telemetry
    const socket = connectSocket();


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
      socket.disconnect();
    };
  }, []);

  const activeBusesCount = useMemo(() => 
    buses.filter(b => b.status === 'active' || (b.gpsLogs?.[0]?.speed && b.gpsLogs[0].speed > 0)).length, 
    [buses]
  );

  const selectedBus = useMemo(() => 
    buses.find(b => b.id === selectedBusId), 
    [buses, selectedBusId]
  );

  const filteredBuses = useMemo(() => {
    return buses.filter(bus => {
      const q = searchQuery.toLowerCase().trim();
      const nameMatch = (bus.name || bus.licensePlate || bus.registrationNumber || '').toLowerCase().includes(q);
      const routeMatch = (bus.routeName || '').toLowerCase().includes(q);
      // Same resolution as the card renders, or searching a driver's name misses the
      // bus they are actually on.
      const driverMatch = (driverByBus[bus.id]?.driverName || bus.driverName || bus.driver?.name || '')
        .toLowerCase().includes(q);
      const matchesSearch = !q || nameMatch || routeMatch || driverMatch;

      const isActive = bus.status === 'active' || (bus.gpsLogs?.[0]?.speed && bus.gpsLogs[0].speed > 0);
      if (statusFilter === 'ACTIVE') return matchesSearch && isActive;
      if (statusFilter === 'OFFLINE') return matchesSearch && !isActive;
      return matchesSearch;
    });
  }, [buses, searchQuery, statusFilter, driverByBus]);

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

        {/* Top-Left: Fleet Status Legend */}
        <div className="absolute top-4 left-4 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-lg p-3.5 w-60 transition-all">
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Fleet Status
            </h4>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
              {buses.length} Vehicles
            </span>
          </div>
          <div className="space-y-1.5 text-xs text-slate-600 font-medium">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></div> 
                On Schedule
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                {activeBusesCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div> 
                Delayed / Standby
              </div>
              <span className="text-[11px] font-bold text-slate-500">
                {buses.length - activeBusesCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div> 
                Alert / Overspeed (&gt;60)
              </div>
              <span className="text-[11px] font-bold text-red-600">
                {buses.filter(b => (b.gpsLogs?.[0]?.speed || 0) > 60).length}
              </span>
            </div>
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
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                </div>
                <h3 className="font-bold text-sm text-white leading-tight">
                  {selectedBus.name || selectedBus.licensePlate || selectedBus.registrationNumber}
                </h3>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-700/80"></div>

            <div className="flex items-center gap-6 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Speed</span>
                <span className="font-bold text-emerald-400 text-sm">
                  {selectedBus.gpsLogs?.[0]?.speed ? `${selectedBus.gpsLogs[0].speed.toFixed(1)} km/h` : '0 km/h'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Route</span>
                <span className="font-semibold text-slate-200">
                  {selectedBus.routeName || 'Off-Route'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Driver</span>
                <span className="font-semibold text-slate-200">
                  {selectedBus.driverName || selectedBus.driver?.name || 'Unassigned'}
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

        {/* Bottom Floating Controls */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
          <div className="bg-white/95 backdrop-blur-md rounded-xl border border-slate-200/80 shadow-lg p-1.5 flex gap-1 text-slate-600">
            <button 
              onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    () => toast.success('Location centered.'),
                    () => toast.error('Location permission denied.')
                  );
                }
              }} 
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-700"
              title="My Location"
            >
              <Navigation size={18} />
            </button>
            <button onClick={() => toast.success('Map layers: OpenStreetMap Live (Default)')} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-700" title="Map Layers">
              <Layers size={18} />
            </button>
            <button onClick={() => toast.success('Map settings: Telemetry refresh interval is 5 seconds.')} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-700" title="Settings">
              <Settings size={18} />
            </button>
          </div>

          <button 
            onClick={() => handleSelectBus(null)} 
            className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl shadow-lg font-bold transition-all flex items-center gap-2 text-sm active:scale-95"
          >
            <Focus size={16} /> Recenter Fleet (View All)
          </button>
        </div>
      </div>

      {/* Right Sidebar: Fleet Explorer & Vehicle Focus List */}
      <div className="w-88 bg-white border-l border-slate-200 flex flex-col relative z-10 shadow-sm w-96">
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Fleet Explorer</h3>
              <p className="text-xs text-slate-500">Click any vehicle to focus & track</p>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {activeBusesCount} Online
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

          {/* Status Tabs */}
          <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl text-[11px] font-bold">
            {(['ALL', 'ACTIVE', 'OFFLINE'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={clsx(
                  "flex-1 py-1 rounded-lg transition-all text-center",
                  statusFilter === tab 
                    ? "bg-white text-slate-900 shadow-sm" 
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                {tab === 'ALL' ? 'All' : tab === 'ACTIVE' ? 'Active Only' : 'Offline'}
              </button>
            ))}
          </div>
        </div>
        
        {/* Buses List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
              Loading fleet vehicles...
            </div>
          ) : filteredBuses.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No vehicles matching your filter.
            </div>
          ) : (
            filteredBuses.map((bus) => {
              const speed = bus.gpsLogs?.[0]?.speed || 0;
              const isAlert = speed > 60;
              const isDelayed = bus.status === 'delayed';
              const isActive = bus.status === 'active' || speed > 0;
              const isSelected = selectedBusId === bus.id;
              
              // The API resolves this from the bus's running trip in a defined order.
              // The local find() below is only a fallback: it returns an arbitrary
              // driver when two share a bus across a two-leg day, which on a school run
              // means offering to phone the morning driver about an afternoon bus.
              const identity = driverByBus[bus.id];
              // DELAYED counts as live here too — without it a late bus loses its driver
              // match, which is exactly when someone needs to phone them.
              const activeDriver = drivers.find(d =>
                d.driverTrips?.some((t: any) => t.busId === bus.id && isActiveTrip(t))
              );
              const resolvedDriverName = identity?.driverName || activeDriver?.name || (bus.driverName !== 'Unassigned' ? bus.driverName : null) || bus.driver?.user?.name || 'Unassigned';
              const driverPhone = identity?.driverPhone || activeDriver?.phone || bus.driver?.phone || null;
              
              return (
                <div 
                  key={bus.id} 
                  onClick={() => handleSelectBus(isSelected ? null : bus.id)}
                  className={clsx(
                    "p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer relative group",
                    isSelected 
                      ? "border-orange-500 bg-orange-50/40 ring-2 ring-orange-500/20 shadow-md scale-[1.01]" 
                      : isAlert ? "border-red-200 bg-red-50/40 hover:border-red-300 shadow-sm" :
                        isDelayed ? "border-amber-200 bg-amber-50/30 hover:border-amber-300 shadow-sm" :
                        isActive ? "border-emerald-200 bg-emerald-50/30 hover:border-emerald-300 shadow-sm" : 
                        "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                  )}
                >
                  {/* Header info */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className={clsx(
                        "p-2 rounded-xl text-white shadow-sm transition-transform group-hover:scale-105",
                        isAlert ? "bg-red-500" :
                        isDelayed ? "bg-amber-500" :
                        isActive ? "bg-emerald-500" : "bg-slate-400"
                      )}>
                        {isAlert ? <AlertTriangle size={15} /> : <Bus size={15} />}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm leading-tight group-hover:text-orange-600 transition-colors">
                          {bus.name || bus.licensePlate || bus.registrationNumber}
                        </h4>
                        <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1 mt-0.5">
                          <span className="truncate max-w-[150px]">{bus.routeName || 'Off-Route'}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className={clsx(
                        "text-[9px] font-bold uppercase px-2 py-0.5 rounded-full tracking-wider",
                        isAlert ? "bg-red-100 text-red-700" :
                        isDelayed ? "bg-amber-100 text-amber-700" :
                        isActive ? "bg-emerald-100 text-emerald-700" :
                        "bg-slate-100 text-slate-500"
                      )}>
                        {isAlert ? 'Overspeed' : isDelayed ? 'Delayed' : isActive ? 'Active' : 'Offline'}
                      </span>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="flex justify-between items-center text-xs mt-3 pt-2.5 border-t border-slate-100/80">
                    <div>
                      <p className="text-slate-400 uppercase tracking-wider text-[9px] font-bold">Driver / Capacity</p>
                      <p className="font-semibold text-slate-800 text-xs truncate max-w-[130px]">
                        {resolvedDriverName} <span className="text-slate-400 font-normal">({bus.capacity} seats)</span>
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-slate-400 uppercase tracking-wider text-[9px] font-bold">Live Speed</p>
                      <p className={clsx(
                        "font-bold text-xs",
                        isAlert ? "text-red-600" : isActive ? "text-emerald-600" : "text-slate-600"
                      )}>
                        {speed > 0 ? `${speed.toFixed(1)} km/h` : '0 km/h'}
                      </p>
                    </div>
                  </div>

                  {/* Action Bar */}
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
                      {isSelected ? 'Focused (Click to unselect)' : 'Track / Focus on Map'}
                    </button>

                    {/* Was a toast that said "Contacting driver…" and placed no call. During a
                        breakdown that reads as success and nobody has been reached. Now it dials,
                        or says plainly that it can't. */}
                    {resolvedDriverName !== 'Unassigned' && (
                      driverPhone ? (
                        <a
                          href={`tel:${driverPhone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:text-orange-600 hover:bg-orange-50 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500"
                          title={`Call ${resolvedDriverName} on ${driverPhone}`}
                          aria-label={`Call ${resolvedDriverName}`}
                        >
                          <PhoneCall size={14} />
                        </a>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toast.error(`No phone number on file for ${resolvedDriverName}. Add one on the Drivers page.`);
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-300 cursor-not-allowed"
                          title={`No phone number for ${resolvedDriverName}`}
                          aria-label={`No phone number for ${resolvedDriverName}`}
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

        {/* Bottom Broadcast */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <button 
            onClick={() => {
              const msg = prompt('Enter emergency / general broadcast message to all drivers:');
              if (msg) toast.success('Message broadcasted to all drivers!');
            }}
            className="w-full bg-slate-900 hover:bg-black text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all text-xs shadow-md active:scale-98"
          >
            <Bell size={15} className="text-orange-500" /> Broadcast Message to Fleet
          </button>
        </div>
      </div>
    </div>
  );
}
