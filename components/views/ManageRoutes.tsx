/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  fetchRoutes, deleteRoute, createTrip, updateTripStatus,
  fetchBuses, fetchDrivers, fetchStats, getSchoolId, apiErrorMessage,
} from '@/lib/api';
import {
  Clock, CheckCircle, Zap, Download, Edit3, Map, Trash2, X, Users,
  Plus, XCircle, Search as SearchIcon,
  SlidersHorizontal, RefreshCw, ArrowUpDown,
} from 'lucide-react';
import { clsx } from 'clsx';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { EditTripModal } from '@/components/views/routes/EditTripModal';
import { DirectionToggle } from '@/components/ui/DirectionToggle';
import type { Direction } from '@/lib/runs';
import { getBusDisplayName } from '@/lib/buses';
import { activeTripsSoonestFirst, isActiveTrip, describeTrip, routeDeleteBlock, ACTIVE_TRIP_STATUSES } from '@/lib/trips';

const RouteMapEditor = dynamic(() => import('@/components/map/RouteMapEditor'), { ssr: false });

// Known trip statuses get a colored pill; anything else falls back to slate.
const TRIP_TONES: Record<string, { badge: string; dot: string }> = {
  ON_SCHEDULE: { badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  DELAYED:     { badge: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500' },
  PLANNED:     { badge: 'bg-sky-100 text-sky-700',       dot: 'bg-sky-500' },
  CANCELLED:   { badge: 'bg-rose-100 text-rose-700',     dot: 'bg-rose-500' },
};
const FALLBACK_TONE = { badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-500' };

// Escape for RFC-4180 CSV and neutralize Excel formula injection (=+-@ prefixes).
const csvCell = (v: any) => {
  const s = String(v ?? '').replace(/"/g, '""');
  return `"${/^[=+\-@]/.test(s) ? `'${s}` : s}"`;
};

// ─── Timezone label (e.g. "IST") ─────────────────────────────────────────────
const tzLabel = (() => {
  try {
    return (
      Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
        .formatToParts(new Date())
        .find(p => p.type === 'timeZoneName')?.value ?? ''
    );
  } catch { return ''; }
})();

// ─── Datetime-local helpers (same pair as EditTripModal) ──────────────────────
function toLocalDatetimeLocal(utcString: string): string {
  const d = new Date(utcString);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
function fromDatetimeLocalToISO(local: string): string {
  const [datePart, timePart] = local.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, min] = timePart.split(':').map(Number);
  return new Date(y, mo - 1, d, h, min).toISOString();
}

// ─── Sortable column helper ───────────────────────────────────────────────────
type SortKey = 'name' | 'stops' | 'duration' | 'departure';
type SortDir = 'asc' | 'desc';

export function ManageRoutes() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false); // overlay-only refresh
  const [stats, setStats] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Issue 17: super-admin has no schoolId in their JWT — resolve async
  const [resolvedSchoolId, setResolvedSchoolId] = useState('');
  useEffect(() => {
    getSchoolId().then(id => setResolvedSchoolId(id ?? ''));
  }, []);

  const [activeTab, setActiveTab] = useState('All Routes');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // ─── Editor / modal state ───────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<any>(null);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignFormData, setAssignFormData] = useState<{ routeId: string; busId: string; driverId: string; direction: Direction | ''; scheduledStart: string }>({ routeId: '', busId: '', driverId: '', direction: '', scheduledStart: '' });
  const [assignRouteName, setAssignRouteName] = useState('');
  const [isAssignSubmitting, setIsAssignSubmitting] = useState(false);
  const [assignErrors, setAssignErrors] = useState<{ busId?: string; driverId?: string; direction?: string }>({});

  const [editingTrip, setEditingTrip] = useState<any>(null);

  // ─── Issue 3: trip picker ───────────────────────────────────────────────
  const [cancelPickerRouteId, setCancelPickerRouteId] = useState<string | null>(null);
  const [cancellingTripIds, setCancellingTripIds] = useState<Set<string>>(new Set());
  const [deletingRouteIds, setDeletingRouteIds] = useState<Set<string>>(new Set());
  // Set when a delete was refused for active trips, so the picker it opens knows it is
  // the middle of a deletion and can finish the job instead of dead-ending.
  const [deleteBlockedRouteId, setDeleteBlockedRouteId] = useState<string | null>(null);

  // ─── Issue 12: filter panel ─────────────────────────────────────────────
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterBusId, setFilterBusId] = useState('');
  const [filterDriverId, setFilterDriverId] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterStops, setFilterStops] = useState('any');
  const [searchText, setSearchText] = useState('');

  // ─── Issue 13: column sorting ───────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // ─── Expanded trip history ──────────────────────────────────────────────
  const [expandedRouteIds, setExpandedRouteIds] = useState<Set<string>>(new Set());

  // ─── Load data ──────────────────────────────────────────────────────────
  // Read from the live list, not a snapshot: cancelling a trip refreshes `routes`, and
  // the open picker has to reflect that or it offers trips that are already cancelled.
  const cancelPickerRoute = cancelPickerRouteId
    ? routes.find((route: any) => route.id === cancelPickerRouteId) ?? null
    : null;

  const loadRoutes = useCallback((silent = false) => {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);

    // Issue 9: load routes/buses/drivers independently; stats never blocks the list
    Promise.allSettled([fetchRoutes(), fetchBuses(), fetchDrivers(), fetchStats()])
      .then(([routesResult, busesResult, driversResult, statsResult]) => {
        if (routesResult.status === 'fulfilled') {
          setRoutes(routesResult.value);
        } else {
          const msg = apiErrorMessage(routesResult.reason, 'Failed to load routes');
          setLoadError(msg);
          toast.error(msg);
        }
        if (busesResult.status === 'fulfilled') setBuses(busesResult.value);
        if (driversResult.status === 'fulfilled') setDrivers(driversResult.value);
        if (statsResult.status === 'fulfilled') setStats(statsResult.value);
      })
      .finally(() => {
        setLoading(false);
        setIsRefreshing(false);
      });
  }, []);

  useEffect(() => { loadRoutes(); }, []);

  // ─── Maps for O(1) lookup ────────────────────────────────────────────────
  const busesMap = useMemo(() =>
    buses.reduce((acc, bus) => { acc[bus.id] = bus; return acc; }, {} as Record<string, any>),
  [buses]);

  const driversMap = useMemo(() =>
    drivers.reduce((acc, d) => { acc[d.id] = d; return acc; }, {} as Record<string, any>),
  [drivers]);

  // ─── Derive "representative trip" per route ──────────────────────────────
  // Issue 2: use activeTripsSoonestFirst so an in-progress trip is never hidden
  // behind a later-created completed trip.
  const getRepresentativeTrip = (route: any) => {
    const active = activeTripsSoonestFirst(route.trips);
    if (active.length > 0) return active[0];
    // Fall back to the most-recently-scheduled overall trip for display
    return [...(route.trips ?? [])]
      .sort((a, b) =>
        Date.parse(b.scheduledStart ?? b.createdAt ?? '') -
        Date.parse(a.scheduledStart ?? a.createdAt ?? '')
      )[0] ?? null;
  };

  // ─── Filter + sort ───────────────────────────────────────────────────────
  const filteredRoutes = useMemo(() => {
    let list = routes.filter((route: any) => {
      const repTrip = getRepresentativeTrip(route);
      const statusStr = repTrip?.status ?? 'INACTIVE';

      // Tab filter
      if (activeTab === 'Active' && !ACTIVE_TRIP_STATUSES.includes(statusStr)) return false;
      if (activeTab === 'Inactive' && !['COMPLETED', 'CANCELLED', 'INACTIVE'].includes(statusStr)) return false;

      // Issue 12: client-side filters
      if (searchText && !route.name.toLowerCase().includes(searchText.toLowerCase())) return false;

      if (filterBusId && repTrip?.busId !== filterBusId) return false;
      if (filterDriverId && repTrip?.driverId !== filterDriverId) return false;

      if (filterStatus === 'Unassigned' && repTrip?.busId) return false;
      else if (filterStatus !== 'All' && filterStatus !== 'Unassigned') {
        if (statusStr !== filterStatus) return false;
      }

      const stopCount = Array.isArray(route.stops) ? route.stops.length : (route.stops || 0);
      if (filterStops === '2+' && stopCount < 2) return false;
      if (filterStops === '5+' && stopCount < 5) return false;
      if (filterStops === '10+' && stopCount < 10) return false;

      return true;
    });

    // Issue 13: column sorting
    list = [...list].sort((a, b) => {
      let av: any, bv: any;
      const aTrip = getRepresentativeTrip(a);
      const bTrip = getRepresentativeTrip(b);
      switch (sortKey) {
        case 'stops':
          av = Array.isArray(a.stops) ? a.stops.length : (a.stops || 0);
          bv = Array.isArray(b.stops) ? b.stops.length : (b.stops || 0);
          break;
        case 'duration':
          av = a.estimatedDuration ?? a.time ?? 0;
          bv = b.estimatedDuration ?? b.time ?? 0;
          break;
        case 'departure':
          av = aTrip?.scheduledStart ? Date.parse(aTrip.scheduledStart) : 0;
          bv = bTrip?.scheduledStart ? Date.parse(bTrip.scheduledStart) : 0;
          break;
        default: // name
          av = a.name?.toLowerCase() ?? '';
          bv = b.name?.toLowerCase() ?? '';
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [routes, activeTab, searchText, filterBusId, filterDriverId, filterStatus, filterStops, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredRoutes.length / itemsPerPage));

  // Issue 11: clamp page when list shrinks (delete or filter)
  useEffect(() => {
    setCurrentPage(p => Math.min(p, Math.max(1, Math.ceil(filteredRoutes.length / itemsPerPage))));
  }, [filteredRoutes.length]);

  // Reset page on tab change
  useEffect(() => { setCurrentPage(1); }, [activeTab]);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayRoutes = filteredRoutes.slice(startIndex, startIndex + itemsPerPage);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleOpenCreate = () => { setEditingRoute(null); setIsModalOpen(true); };
  const handleOpenEdit = (route: any) => { setEditingRoute(route); setIsModalOpen(true); };

  const handleOpenAssign = (route: any) => {
    const repTrip = getRepresentativeTrip(route);
    setAssignRouteName(route.name);
    setAssignFormData({
      routeId: route.id,
      busId: repTrip?.busId || '',
      driverId: repTrip?.driverId || '',
      direction: repTrip?.direction ?? '',
      scheduledStart: '',
    });
    setAssignErrors({});
    setIsAssignModalOpen(true);
  };

  // Issue 6: validate required fields before submit
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { busId?: string; driverId?: string; direction?: string } = {};
    if (!assignFormData.busId) errors.busId = 'Please select a bus.';
    if (!assignFormData.driverId) errors.driverId = 'Please select a driver.';
    if (!assignFormData.direction) errors.direction = 'Choose a direction.';
    if (Object.keys(errors).length) {
      setAssignErrors(errors);
      return;
    }

    setIsAssignSubmitting(true);
    try {
      const payload: any = {
        routeId: assignFormData.routeId,
        busId: assignFormData.busId,
        driverId: assignFormData.driverId,
        direction: assignFormData.direction,
      };
      if (assignFormData.scheduledStart) {
        payload.scheduledStart = fromDatetimeLocalToISO(assignFormData.scheduledStart);
      }
      await createTrip(payload);
      setIsAssignModalOpen(false);
      loadRoutes(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to assign driver and bus. Please try again.');
    } finally {
      setIsAssignSubmitting(false);
    }
  };

  const handleDelete = async (route: any, opts: { confirmed?: boolean } = {}) => {
    const routeId = route.id;
    if (!opts.confirmed) {
      // Warn with what we already know rather than letting them discover it from a failure.
      const active = activeTripsSoonestFirst(route.trips).length;
      const warning = active
        ? `

This route has ${active} active trip${active === 1 ? '' : 's'}. You will be asked to cancel ${active === 1 ? 'it' : 'them'} first.`
        : '';
      if (!window.confirm(`Are you sure you want to delete this route?${warning}`)) return;
    }
    setDeletingRouteIds(prev => new Set(prev).add(routeId));
    try {
      await deleteRoute(routeId);
      closeCancelPicker();
      toast.success('Route deleted');
      loadRoutes(true);
    } catch (err: any) {
      // "Cancel the active trips and retry" and "this route can never be deleted" are
      // both a 409; only the counts tell them apart.
      const blocked = routeDeleteBlock(err);
      if (blocked?.kind === 'active') {
        // Don't leave them hunting for the cancel action — open it, on this route.
        setDeleteBlockedRouteId(routeId);
        setCancelPickerRouteId(routeId);
        return;
      }
      toast.error(blocked?.message || apiErrorMessage(err, 'Failed to delete route'));
    } finally {
      setDeletingRouteIds(prev => { const s = new Set(prev); s.delete(routeId); return s; });
    }
  };

  // Issue 3: cancel a single specific trip (selected from picker)
  //
  // The picker deliberately stays open: it reads the live route, so clearing three trips
  // is three clicks instead of reopening it three times.
  const handleCancelTrip = async (trip: any) => {
    setCancellingTripIds(prev => new Set(prev).add(trip.id));
    try {
      await updateTripStatus(trip.id, 'CANCELLED');
      toast.success(`Trip cancelled: ${describeTrip(trip)}`);
      loadRoutes(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel trip');
    } finally {
      setCancellingTripIds(prev => { const s = new Set(prev); s.delete(trip.id); return s; });
    }
  };

  // When there is exactly one active trip, skip the picker and confirm directly.
  const handleCancelActiveTrips = (route: any) => {
    const active = activeTripsSoonestFirst(route.trips);
    if (active.length === 0) return;
    if (active.length === 1) {
      const trip = active[0];
      if (!window.confirm(`Cancel trip: ${describeTrip(trip)}?`)) return;
      handleCancelTrip(trip);
    } else {
      setCancelPickerRouteId(route.id);
    }
  };

  const closeCancelPicker = () => { setCancelPickerRouteId(null); setDeleteBlockedRouteId(null); };

  // ─── Issue 15: CSV export ────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (filteredRoutes.length === 0) { toast.error('No routes to export'); return; }

    const dateStr = new Date().toISOString().slice(0, 10);
    const header = ['Route Name', 'Assigned Bus', 'Assigned Driver', 'Stops', 'Est Time (min)', 'Status'].map(csvCell).join(',');
    const comment = csvCell(`# Exported ${new Date().toLocaleString()} · ${filteredRoutes.length} routes · Filter: ${activeTab}`);

    const rows = filteredRoutes.map((route: any) => {
      const repTrip = getRepresentativeTrip(route);
      const assignedBus = repTrip ? busesMap[repTrip.busId] : null;
      const assignedDriver = repTrip ? driversMap[repTrip.driverId] : null;
      const statusStr = repTrip?.status || 'INACTIVE';
      const stopCount = Array.isArray(route.stops) ? route.stops.length : (route.stops || 0);
      // Issue 8: use getBusDisplayName (same as table)
      const busName = assignedBus ? getBusDisplayName(assignedBus) : (route.bus?.name || 'Unassigned');
      const driverName = assignedDriver?.name || route.bus?.driver?.user?.name || 'No driver';
      // Issue 15: — instead of " mins" for missing duration
      const duration = route.estimatedDuration ?? route.time ?? null;
      return [route.name, busName, driverName, stopCount, duration !== null ? duration : '—', statusStr].map(csvCell).join(',');
    });

    const csvContent = [comment, header, ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `routes_export_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Issue 15: revoke the blob URL to free memory
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ─── Sort header helper ──────────────────────────────────────────────────
  const SortHeader = ({ col, label }: { col: SortKey; label: string }) => (
    <button
      onClick={() => {
        if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(col); setSortDir('asc'); }
      }}
      className="flex items-center gap-1 hover:text-slate-900 focus:outline-none group"
    >
      {label}
      <ArrowUpDown size={10} className={clsx('transition-opacity', sortKey === col ? 'opacity-100 text-orange-600' : 'opacity-0 group-hover:opacity-50')} />
    </button>
  );

  // ─── Loading skeleton ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-1/4 mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-slate-100 h-24 rounded-xl border border-slate-200"></div>
          ))}
        </div>
        <div className="bg-slate-100 h-96 rounded-xl border border-slate-200 mt-6"></div>
      </div>
    );
  }

  // ─── Assign modal button label (Issue 14) ────────────────────────────────
  const assignButtonLabel = (() => {
    if (!assignFormData.scheduledStart) return 'Assign & Start Trip';
    const t = fromDatetimeLocalToISO(assignFormData.scheduledStart);
    return new Date(t) > new Date() ? 'Schedule Trip' : 'Assign & Start Trip';
  })();

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Route Management</h2>
        </div>
        <button
          onClick={handleOpenCreate}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 transition-colors"
        >
          <Plus size={16} /> Create New Route
        </button>
      </div>

      {loadError && (
        <div className="flex items-center justify-between bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
          <span>Couldn&apos;t load routes: {loadError}</span>
          <button onClick={() => loadRoutes()} className="font-bold underline hover:no-underline focus:outline-none">
            Retry
          </button>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-orange-50 p-2.5 rounded-lg text-orange-600"><Clock size={20} /></div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Average Route Duration</p>
            <span className="text-2xl font-bold text-slate-900 leading-none">
              {stats?.averageRouteDuration ? `${stats.averageRouteDuration}m` : '—'}
            </span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-emerald-50 p-2.5 rounded-lg text-emerald-600"><CheckCircle size={20} /></div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Most Efficient Route</p>
            <span className="text-2xl font-bold text-slate-900 leading-none">{stats?.mostEfficientRoute || '—'}</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-amber-50 p-2.5 rounded-lg text-amber-600"><Zap size={20} /></div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Pending Optimizations</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 leading-none">{stats?.pendingOptimizations ?? '—'}</span>
              {stats?.pendingOptimizations > 0 && <span className="text-[10px] uppercase font-bold text-amber-600">Requires review</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-6">
        {/* Toolbar */}
        <div className="p-3 border-b border-slate-100 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex space-x-1">
              {['All Routes', 'Active', 'Inactive'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={clsx(
                    'px-3 py-1.5 text-xs font-bold rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500',
                    activeTab === tab ? 'text-orange-700 bg-orange-50' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50',
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {/* Issue 12: real filter toggle */}
              <button
                onClick={() => setFilterOpen(o => !o)}
                className={clsx(
                  'flex items-center gap-2 text-xs font-bold px-3 py-1.5 border rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500',
                  filterOpen
                    ? 'text-orange-700 bg-orange-50 border-orange-200'
                    : 'text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50',
                )}
              >
                <SlidersHorizontal size={14} /> Filters
              </button>
              {/* Issue 9: manual refresh */}
              <button
                onClick={() => loadRoutes(true)}
                disabled={isRefreshing}
                title="Refresh"
                className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
              >
                <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <Download size={14} /> Export CSV
              </button>
            </div>
          </div>

          {/* Issue 13: search row */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <SearchIcon size={14} className="text-slate-400" />
            </div>
            <input
              type="search"
              placeholder="Search routes…"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>

          {/* Issue 12: collapsible filter panel */}
          {filterOpen && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Bus</label>
                <SearchableSelect
                  options={[{ value: '', label: 'Any bus', searchValue: '' }, ...buses.map(b => ({ value: b.id, label: getBusDisplayName(b), searchValue: getBusDisplayName(b) }))]}
                  value={filterBusId}
                  onChange={setFilterBusId}
                  placeholder="Any bus"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Driver</label>
                <SearchableSelect
                  options={[{ value: '', label: 'Any driver', searchValue: '' }, ...drivers.map(d => ({ value: d.id, label: d.name, searchValue: d.name }))]}
                  value={filterDriverId}
                  onChange={setFilterDriverId}
                  placeholder="Any driver"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Status</label>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-md px-2 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {['All', 'Unassigned', 'PLANNED', 'ON_SCHEDULE', 'DELAYED', 'COMPLETED', 'CANCELLED'].map(s => (
                    <option key={s} value={s}>{s === 'All' ? 'All statuses' : s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Min stops</label>
                <select
                  value={filterStops}
                  onChange={e => setFilterStops(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-md px-2 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="any">Any</option>
                  <option value="2+">2 or more</option>
                  <option value="5+">5 or more</option>
                  <option value="10+">10 or more</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto relative">
          {/* Issue 9: non-blocking refresh overlay */}
          {isRefreshing && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
              <RefreshCw size={20} className="animate-spin text-orange-500" />
            </div>
          )}
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 border-b border-slate-100">
                  <SortHeader col="name" label="Route Name" />
                </th>
                <th className="px-4 py-3 border-b border-slate-100">Assigned Bus &amp; Driver</th>
                <th className="px-4 py-3 border-b border-slate-100">
                  <SortHeader col="stops" label="Stops" />
                </th>
                <th className="px-4 py-3 border-b border-slate-100">
                  <SortHeader col="duration" label="Est. Time" />
                </th>
                <th className="px-4 py-3 border-b border-slate-100">Status</th>
                <th className="px-4 py-3 border-b border-slate-100">
                  <SortHeader col="departure" label="Next Departure" />
                </th>
                <th className="px-4 py-3 border-b border-slate-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayRoutes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-sm">
                    {activeTab === 'All Routes' && !searchText && !filterBusId && !filterDriverId
                      ? 'No routes found. Create one to get started.'
                      : 'No routes match the current filters.'}
                  </td>
                </tr>
              ) : displayRoutes.map((route: any) => {
                const repTrip = getRepresentativeTrip(route);
                const assignedBus = repTrip ? busesMap[repTrip.busId] : null;
                const assignedDriver = repTrip ? driversMap[repTrip.driverId] : null;
                const statusStr = repTrip?.status || 'INACTIVE';
                const stopsCount = Array.isArray(route.stops) ? route.stops.length : (route.stops || 0);
                const isDeleting = deletingRouteIds.has(route.id);
                const activeTrips = activeTripsSoonestFirst(route.trips);
                const isExpanded = expandedRouteIds.has(route.id);

                // Issue 13: next departure — soonest future-scheduled trip
                const nextDep = [...(route.trips ?? [])]
                  .filter(t => t.scheduledStart && new Date(t.scheduledStart) > new Date() && ACTIVE_TRIP_STATUSES.includes(t.status))
                  .sort((a, b) => Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart))[0];

                return (
                  <React.Fragment key={route.id}>
                    <tr className={clsx('hover:bg-slate-50/50 transition-colors group', isDeleting && 'opacity-50 pointer-events-none')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="bg-orange-50 text-orange-600 p-2 rounded flex-shrink-0">
                            <Map size={14} />
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 text-xs">{route.name}</span>
                            {/* Expandable trip history toggle */}
                            {(route.trips?.length ?? 0) > 0 && (
                              <button
                                onClick={() => setExpandedRouteIds(s => {
                                  const n = new Set(s);
                                  n.has(route.id) ? n.delete(route.id) : n.add(route.id);
                                  return n;
                                })}
                                className="block text-[10px] text-slate-400 hover:text-orange-600 focus:outline-none mt-0.5"
                              >
                                {isExpanded ? '▲ Hide trips' : `▼ ${route.trips.length} trip${route.trips.length > 1 ? 's' : ''}`}
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {/* Issue 8: getBusDisplayName everywhere */}
                        <p className="font-semibold text-slate-900 text-xs">
                          {assignedBus ? getBusDisplayName(assignedBus) : (route.bus?.name || 'No bus assigned')}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {assignedDriver?.name || route.bus?.driver?.user?.name || 'No driver'}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700 text-xs">{stopsCount} Stops</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-700">
                        {/* Issue 15: — for missing duration */}
                        {(route.estimatedDuration ?? route.time) != null ? `${route.estimatedDuration ?? route.time} mins` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-2',
                          (TRIP_TONES[statusStr] || FALLBACK_TONE).badge,
                        )}>
                          <div className={clsx('w-1.5 h-1.5 rounded-full', (TRIP_TONES[statusStr] || FALLBACK_TONE).dot)}></div>
                          {statusStr === 'INACTIVE' ? 'No trip scheduled' : statusStr.replace('_', ' ')}
                        </span>
                      </td>
                      {/* Issue 13: next departure column */}
                      <td className="px-4 py-3 font-mono text-[10px] text-slate-500">
                        {nextDep ? (
                          <span title={new Date(nextDep.scheduledStart).toLocaleString()}>
                            {new Date(nextDep.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            <span className="ml-1 text-slate-400">
                              {new Date(nextDep.scheduledStart).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </span>
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {ACTIVE_TRIP_STATUSES.includes(statusStr) && (
                            <>
                              <button
                                onClick={() => setEditingTrip(repTrip)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                                title="Edit Trip"
                                aria-label="Edit Trip"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => handleCancelActiveTrips(route)}
                                disabled={activeTrips.some(t => cancellingTripIds.has(t.id))}
                                className="p-2 text-amber-600 hover:bg-amber-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
                                title="Cancel Active Trip"
                                aria-label="Cancel Active Trip"
                              >
                                <XCircle size={14} />
                              </button>
                            </>
                          )}
                          <Link
                            href={`/map?route=${encodeURIComponent(route.name)}`}
                            className="inline-block p-2 text-orange-600 hover:bg-orange-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500"
                            title="View on Map"
                            aria-label="View on Map"
                          >
                            <Map size={14} />
                          </Link>
                          <button
                            onClick={() => handleOpenAssign(route)}
                            className="p-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            title="Assign Bus & Driver"
                            aria-label="Assign Bus and Driver"
                          >
                            <Users size={14} />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(route)}
                            className="p-2 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500"
                            title="Edit Route"
                            aria-label="Edit Route"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(route)}
                            disabled={isDeleting}
                            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                            title="Delete Route"
                            aria-label="Delete Route"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Issue 13: expandable trip history */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="bg-slate-50 px-6 pb-3 pt-1">
                          <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Trip History</p>
                          <div className="space-y-1">
                            {[...(route.trips ?? [])]
                              .sort((a: any, b: any) => Date.parse(b.scheduledStart ?? b.createdAt ?? '') - Date.parse(a.scheduledStart ?? a.createdAt ?? ''))
                              .slice(0, 8)
                              .map((t: any) => {
                                const bus = busesMap[t.busId];
                                const driver = driversMap[t.driverId];
                                const isCancellingThis = cancellingTripIds.has(t.id);
                                return (
                                  <div key={t.id} className="flex items-center justify-between text-xs text-slate-600 bg-white rounded px-3 py-1.5 border border-slate-100">
                                    <div className="flex items-center gap-3">
                                      <span className={clsx(
                                        'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase',
                                        (TRIP_TONES[t.status] || FALLBACK_TONE).badge,
                                      )}>
                                        {t.status?.replace('_', ' ') ?? 'UNKNOWN'}
                                      </span>
                                      <span className="font-mono text-slate-500">
                                        {t.scheduledStart ? new Date(t.scheduledStart).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No schedule'}
                                      </span>
                                      {bus && <span className="text-slate-400">{getBusDisplayName(bus)}</span>}
                                      {driver && <span className="text-slate-400">{driver.name}</span>}
                                    </div>
                                    {isActiveTrip(t) && (
                                      <button
                                        onClick={() => handleCancelTrip(t)}
                                        disabled={isCancellingThis}
                                        className="text-amber-600 hover:text-amber-800 text-[10px] font-bold focus:outline-none disabled:opacity-50"
                                      >
                                        {isCancellingThis ? 'Cancelling…' : 'Cancel'}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {displayRoutes.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + itemsPerPage, filteredRoutes.length)} of {filteredRoutes.length} routes
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-orange-500"
              aria-label="Previous page"
            >&lt;</button>
            {Array.from({ length: totalPages }).map((_, i) => {
              const pageNum = i + 1;
              if (totalPages > 5 && Math.abs(currentPage - pageNum) > 1 && pageNum !== 1 && pageNum !== totalPages) {
                if (pageNum === 2 || pageNum === totalPages - 1) return <span key={pageNum} className="px-1 flex items-center justify-center">…</span>;
                return null;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  aria-label={`Page ${pageNum}`}
                  aria-current={currentPage === pageNum ? 'page' : undefined}
                  className={clsx(
                    'w-7 h-7 flex items-center justify-center rounded font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500',
                    currentPage === pageNum ? 'bg-orange-600 text-white font-bold' : 'hover:bg-slate-50 border border-transparent hover:border-slate-200',
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-orange-500"
              aria-label="Next page"
            >&gt;</button>
          </div>
        </div>
      </div>

      {/* ─── Issue 3: Trip picker modal ────────────────────────────────────────── */}
      {cancelPickerRoute && (() => {
        const pickerTrips = activeTripsSoonestFirst(cancelPickerRoute.trips);
        const finishingDelete = deleteBlockedRouteId === cancelPickerRoute.id;
        const empty = pickerTrips.length === 0;
        const cleared = finishingDelete && empty;
        const deletingThis = deletingRouteIds.has(cancelPickerRoute.id);
        return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base">
                {finishingDelete ? 'Cancel trips to delete this route' : 'Cancel a Trip'}
              </h3>
              <button onClick={closeCancelPicker} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-500 mb-3">
                {cleared
                  ? <>All active trips on <strong>{cancelPickerRoute.name}</strong> are cancelled. You can delete the route now.</>
                  : finishingDelete
                  ? <><strong>{cancelPickerRoute.name}</strong> can&apos;t be deleted while {pickerTrips.length === 1 ? 'a trip is' : 'trips are'} still active. Cancel {pickerTrips.length === 1 ? 'it' : 'them'} here, then delete.</>
                  : empty
                  ? <><strong>{cancelPickerRoute.name}</strong> has no active trips left.</>
                  : <>Route <strong>{cancelPickerRoute.name}</strong> has multiple active trips. Select which to cancel:</>}
              </p>
              <div className="space-y-2">
                {pickerTrips.map((trip: any) => {
                  const bus = busesMap[trip.busId];
                  const driver = driversMap[trip.driverId];
                  const isBusy = cancellingTripIds.has(trip.id);
                  return (
                    <button
                      key={trip.id}
                      disabled={isBusy}
                      onClick={() => handleCancelTrip(trip)}
                      className="w-full text-left border border-slate-200 rounded-lg px-4 py-3 hover:border-amber-300 hover:bg-amber-50 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {trip.scheduledStart
                              ? new Date(trip.scheduledStart).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                              : 'No scheduled time'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {bus ? getBusDisplayName(bus) : 'Unknown bus'}
                            {driver && ` · ${driver.name}`}
                          </p>
                        </div>
                        <span className={clsx('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', (TRIP_TONES[trip.status] || FALLBACK_TONE).badge)}>
                          {isBusy ? 'Cancelling…' : trip.status?.replace('_', ' ')}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* The whole point: finish the deletion here rather than sending them back
                  to hunt for the delete button they already pressed once. */}
              {(finishingDelete || empty) && (
                <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    onClick={closeCancelPicker}
                    disabled={deletingThis}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {cleared ? 'Keep route' : 'Close'}
                  </button>
                  {finishingDelete && <button
                    onClick={() => handleDelete(cancelPickerRoute, { confirmed: true })}
                    disabled={!cleared || deletingThis}
                    title={cleared ? undefined : 'Cancel the remaining active trips first'}
                    className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingThis ? 'Deleting…' : 'Delete route'}
                  </button>}
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* ─── Assign / Schedule trip modal ──────────────────────────────────────── */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">Start a Trip</h3>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                disabled={isAssignSubmitting}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAssignSubmit} noValidate className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-2">
                <p className="text-xs text-slate-500 font-medium">Selected Route</p>
                <p className="text-sm font-bold text-slate-900">{assignRouteName}</p>
              </div>
              <div>
                {/* Issue 6 & 8: required + getBusDisplayName */}
                <SearchableSelect
                  label="Assign Bus"
                  required
                  error={assignErrors.busId}
                  options={buses.map((bus: any) => ({
                    value: bus.id,
                    label: (
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${bus.isAvailable !== false ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className={bus.isAvailable === false ? 'text-slate-400' : ''}>{getBusDisplayName(bus)}</span>
                      </div>
                    ),
                    subLabel: bus.capacity ? `${bus.capacity} seats` : undefined,
                    searchValue: getBusDisplayName(bus),
                  })).sort((a, b) => {
                    const aAvail = buses.find((bus: any) => bus.id === a.value)?.isAvailable !== false;
                    const bAvail = buses.find((bus: any) => bus.id === b.value)?.isAvailable !== false;
                    return aAvail === bAvail ? 0 : aAvail ? -1 : 1;
                  })}
                  value={assignFormData.busId}
                  onChange={(val) => {
                    setAssignFormData({ ...assignFormData, busId: val });
                    if (val) setAssignErrors(e => ({ ...e, busId: undefined }));
                  }}
                  placeholder="Select a bus"
                  disabled={isAssignSubmitting}
                />
              </div>
              <div>
                <SearchableSelect
                  label="Assign Driver"
                  required
                  error={assignErrors.driverId}
                  options={drivers.map((driver: any) => ({
                    value: driver.id,
                    label: (
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${driver.isAvailable !== false ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className={driver.isAvailable === false ? 'text-slate-400' : ''}>{driver.name}</span>
                      </div>
                    ),
                    subLabel: driver.email,
                    searchValue: driver.name,
                  })).sort((a, b) => {
                    const aAvail = drivers.find((d: any) => d.id === a.value)?.isAvailable !== false;
                    const bAvail = drivers.find((d: any) => d.id === b.value)?.isAvailable !== false;
                    return aAvail === bAvail ? 0 : aAvail ? -1 : 1;
                  })}
                  value={assignFormData.driverId}
                  onChange={(val) => {
                    setAssignFormData({ ...assignFormData, driverId: val });
                    if (val) setAssignErrors(e => ({ ...e, driverId: undefined }));
                  }}
                  placeholder="Select a driver"
                  disabled={isAssignSubmitting}
                />
              </div>
              <DirectionToggle
                name="route-trip-direction"
                value={assignFormData.direction}
                error={assignErrors.direction}
                disabled={isAssignSubmitting}
                onChange={(direction) => {
                  setAssignFormData({ ...assignFormData, direction });
                  setAssignErrors(e => ({ ...e, direction: undefined }));
                }}
              />
              <div>
                {/* Issue 14: show timezone */}
                <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                  Scheduled Start
                  {tzLabel && <span className="text-[10px] font-normal text-slate-400">({tzLabel})</span>}
                </label>
                <input
                  type="datetime-local"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                  value={assignFormData.scheduledStart}
                  onChange={(e) => setAssignFormData({ ...assignFormData, scheduledStart: e.target.value })}
                  disabled={isAssignSubmitting}
                />
              </div>
              <div className="pt-4 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  disabled={isAssignSubmitting}
                  className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors text-sm border border-slate-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                {/* Issue 6: disabled during submit; Issue 14: dynamic label */}
                <button
                  type="submit"
                  disabled={isAssignSubmitting}
                  className="px-4 py-2 rounded-lg font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors text-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {isAssignSubmitting ? 'Saving…' : assignButtonLabel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ponytail: the editor unmounts on close, so Google bills a fresh map load each
          time it is opened (~$7 per 1,000). Keeping it mounted would need the editor's
          route-seeded state reworked, since it currently resets by remounting — not worth
          600 lines of risk for a few dollars a term. Revisit if map loads ever show up on
          the bill. */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden p-6 max-h-[90vh] overflow-y-auto">
            {/* Issue 17: pass resolved schoolId, not the raw sync getUser().schoolId */}
            <RouteMapEditor
              schoolId={resolvedSchoolId}
              initialRoute={editingRoute}
              buses={buses}
              drivers={drivers}
              onSaved={() => {
                setIsModalOpen(false);
                loadRoutes(true);
              }}
              onCancel={() => setIsModalOpen(false)}
            />
          </div>
        </div>
      )}

      <EditTripModal
        isOpen={!!editingTrip}
        onClose={() => setEditingTrip(null)}
        trip={editingTrip}
        buses={buses}
        drivers={drivers}
        onSuccess={() => {
          setEditingTrip(null);
          loadRoutes(true);
        }}
      />
    </div>
  );
}
