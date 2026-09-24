/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  fetchRoutes, deleteRoute, createTrip, updateTripStatus,
  fetchBuses, fetchDrivers, getSchoolId, apiErrorMessage,
} from '@/lib/api';
import {
  Download, Edit3, Map, Trash2, X,
  Plus, XCircle, Search as SearchIcon,
  SlidersHorizontal, RefreshCw, ArrowUpDown, ArrowRight, ArrowLeft,
} from 'lucide-react';
import { clsx } from 'clsx';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { EditTripModal } from '@/components/views/routes/EditTripModal';
import { DriverClashWarning } from '@/components/ui/DriverClashWarning';
import { DirectionToggle } from '@/components/ui/DirectionToggle';
import type { Direction } from '@/lib/runs';
import { getBusDisplayName } from '@/lib/buses';
import { activeTripsSoonestFirst, isActiveTrip, describeTrip, routeDeleteBlock, nextDepartureAt, routeHasMatchingTrip, findDriverClashes } from '@/lib/trips';
import { DIRECTION_LABELS } from '@/lib/runs';

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

/**
 * One trip, rendered as itself.
 *
 * Every field here belongs to this trip and nothing else: the bus, the driver, the
 * direction and the status are the trip's own, not a route's. That is the whole point of
 * the split — the page used to hoist one trip's fields onto the route row and leave the
 * admin to guess which trip they were looking at.
 */
function TripRow({ trip, bus, driver, busy, muted, onEdit, onCancel }: {
  trip: any; bus?: any; driver?: any; busy?: boolean; muted?: boolean;
  onEdit?: () => void; onCancel?: () => void;
}) {
  const tone = TRIP_TONES[trip.status] || FALLBACK_TONE;
  const direction = trip.direction as Direction | null | undefined;

  return (
    <div className={clsx(
      'flex items-center justify-between gap-3 rounded border bg-white px-3 py-2',
      muted ? 'border-slate-100 opacity-75' : 'border-slate-200',
    )}>
      <div className="flex items-center gap-3 min-w-0 flex-wrap">
        <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5', tone.badge)}>
          <span className={clsx('w-1.5 h-1.5 rounded-full', tone.dot)} />
          {busy ? 'Cancelling…' : (trip.status?.replace('_', ' ') ?? 'UNKNOWN')}
        </span>

        {/* Direction is required to create a trip, so it is shown wherever a trip is.
            Legacy trips predate the field and read null — say so rather than guessing. */}
        {direction ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600">
            {direction === 'TO_SCHOOL' ? <ArrowRight size={12} /> : <ArrowLeft size={12} />}
            {DIRECTION_LABELS[direction]}
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-amber-600">Direction not set</span>
        )}

        <span className="font-mono text-[11px] text-slate-500">
          {trip.scheduledStart
            ? new Date(trip.scheduledStart).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'No scheduled time'}
        </span>

        <span className="text-[11px] text-slate-500 truncate">
          {bus ? getBusDisplayName(bus) : 'No bus'}
          {' · '}
          {driver?.name ?? 'No driver'}
        </span>
      </div>

      {(onEdit || onCancel) && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {onEdit && (
            <button
              onClick={onEdit}
              disabled={busy}
              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              title="Edit this trip"
              aria-label="Edit this trip"
            >
              <Edit3 size={13} />
            </button>
          )}
          {onCancel && (
            <button
              onClick={onCancel}
              disabled={busy}
              className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
              title="Cancel this trip"
              aria-label="Cancel this trip"
            >
              <XCircle size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ManageRoutes() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false); // overlay-only refresh
  const [loadError, setLoadError] = useState<string | null>(null);

  // Issue 17: super-admin has no schoolId in their JWT — resolve async
  const [resolvedSchoolId, setResolvedSchoolId] = useState('');
  useEffect(() => {
    getSchoolId().then(id => setResolvedSchoolId(id ?? ''));
  }, []);

  const [activeTab, setActiveTab] = useState('All Routes');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

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

    // Issue 9: load routes/buses/drivers independently; one failure never blanks the list
    Promise.allSettled([fetchRoutes(), fetchBuses(), fetchDrivers()])
      .then(([routesResult, busesResult, driversResult]) => {
        if (routesResult.status === 'fulfilled') {
          setRoutes(routesResult.value);
        } else {
          const msg = apiErrorMessage(routesResult.reason, 'Failed to load routes');
          setLoadError(msg);
          toast.error(msg);
        }
        if (busesResult.status === 'fulfilled') setBuses(busesResult.value);
        if (driversResult.status === 'fulfilled') setDrivers(driversResult.value);
      })
      .finally(() => {
        setLoading(false);
        setIsRefreshing(false);
      });
  }, []);

  // The first load; loadRoutes is also the refresh action, so it owns its loading flag.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadRoutes(); }, []);

  // ─── Maps for O(1) lookup ────────────────────────────────────────────────
  const busesMap = useMemo(() =>
    buses.reduce((acc, bus) => { acc[bus.id] = bus; return acc; }, {} as Record<string, any>),
  [buses]);

  const driversMap = useMemo(() =>
    drivers.reduce((acc, d) => { acc[d.id] = d; return acc; }, {} as Record<string, any>),
  [drivers]);

  // Routes no longer collapse to a single "representative" trip. Every trip a route has
  // is its own row, so nothing on screen refers to a trip the admin cannot see.

  // ─── Filter + sort ───────────────────────────────────────────────────────
  // Every predicate below reads the route's whole trip list. Testing one chosen trip
  // was what made a driver's own route disappear from their own filter.
  const stopCountOf = (route: any) =>
    Array.isArray(route.stops) ? route.stops.length : (route.stops || 0);

  const filteredRoutes = useMemo(() => {
    let list = routes.filter((route: any) => {
      const activeCount = activeTripsSoonestFirst(route.trips).length;

      if (activeTab === 'Running' && activeCount === 0) return false;
      if (activeTab === 'Idle' && activeCount > 0) return false;

      if (searchText && !route.name.toLowerCase().includes(searchText.toLowerCase())) return false;

      // "No active trips" is a negation over the whole route, so it cannot be expressed
      // as a per-trip predicate — it gates first, then bus/driver still narrow the rest.
      if (filterStatus === 'NONE' && activeCount > 0) return false;
      if (!routeHasMatchingTrip(route.trips, {
        busId: filterBusId || undefined,
        driverId: filterDriverId || undefined,
        status: (filterStatus === 'All' || filterStatus === 'NONE') ? undefined : filterStatus,
      })) return false;

      const stopCount = stopCountOf(route);
      if (filterStops === '2+' && stopCount < 2) return false;
      if (filterStops === '5+' && stopCount < 5) return false;
      if (filterStops === '10+' && stopCount < 10) return false;

      return true;
    });

    // Issue 13: column sorting
    list = [...list].sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'stops':
          av = stopCountOf(a); bv = stopCountOf(b);
          break;
        case 'duration':
          av = a.estimatedDuration ?? a.time ?? 0;
          bv = b.estimatedDuration ?? b.time ?? 0;
          break;
        case 'departure':
          av = nextDepartureAt(a.trips); bv = nextDepartureAt(b.trips);
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

  // Issue 12: a filter the admin cannot see is a filter they cannot undo.
  const activeFilterCount =
    (filterBusId ? 1 : 0) + (filterDriverId ? 1 : 0) +
    (filterStatus !== 'All' ? 1 : 0) + (filterStops !== 'any' ? 1 : 0);
  const clearFilters = () => {
    setFilterBusId(''); setFilterDriverId(''); setFilterStatus('All'); setFilterStops('any');
  };

  const totalPages = Math.max(1, Math.ceil(filteredRoutes.length / itemsPerPage));

  // Issue 11: a page past the end (after a delete or a filter) shows the last page.
  // Worked out here rather than written back from an effect, which rendered the empty
  // page first.
  const page = Math.min(currentPage, totalPages);

  const startIndex = (page - 1) * itemsPerPage;
  const displayRoutes = filteredRoutes.slice(startIndex, startIndex + itemsPerPage);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleOpenCreate = () => { setEditingRoute(null); setIsModalOpen(true); };
  const handleOpenEdit = (route: any) => { setEditingRoute(route); setIsModalOpen(true); };

  const handleOpenAssign = (route: any) => {
    // Starts empty on purpose: this creates a *new* trip, and prefilling it from some
    // other trip on the route is how an admin ends up duplicating a crew by accident.
    setAssignRouteName(route.name);
    setAssignFormData({
      routeId: route.id, busId: '', driverId: '', direction: '', scheduledStart: '',
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

  // Nielsen #5: prevent the error instead of recovering from it. A route with active
  // trips opens the picker straight away rather than firing a delete we already know the
  // server will refuse. The 409 handling stays as the backstop — another admin can
  // start a trip between this render and the click.
  const handleDelete = async (route: any, opts: { confirmed?: boolean } = {}) => {
    const routeId = route.id;
    if (!opts.confirmed) {
      const active = activeTripsSoonestFirst(route.trips).length;
      if (active > 0) {
        setCancelPickerRouteId(routeId);
        return;
      }
      if (!window.confirm('Are you sure you want to delete this route?')) return;
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

  // Each trip has its own cancel button now, so there is nothing to disambiguate and the
  // confirmation can name the exact trip it is about to cancel.
  const handleCancelTripConfirmed = (trip: any) => {
    if (!window.confirm(`Cancel trip: ${describeTrip(trip)}?`)) return;
    handleCancelTrip(trip);
  };

  const closeCancelPicker = () => setCancelPickerRouteId(null);

  // ─── Issue 15: CSV export ────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (filteredRoutes.length === 0) { toast.error('No routes to export'); return; }

    const dateStr = new Date().toISOString().slice(0, 10);
    const header = ['Route Name', 'Stops', 'Est Time (min)', 'Active Trips', 'Next Departure'].map(csvCell).join(',');
    const comment = csvCell(`# Exported ${new Date().toLocaleString()} · ${filteredRoutes.length} routes · Filter: ${activeTab}`);

    // Route-level only. Bus and driver belong to a trip, not a route — exporting one
    // arbitrary trip's crew under a route heading is the same lie the table used to tell.
    const rows = filteredRoutes.map((route: any) => {
      const active = activeTripsSoonestFirst(route.trips);
      const next = nextDepartureAt(route.trips);
      const duration = route.estimatedDuration ?? route.time ?? null;
      return [
        route.name,
        stopCountOf(route),
        duration !== null ? duration : '—',
        active.length,
        next ? new Date(next).toLocaleString() : '—',
      ].map(csvCell).join(',');
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
  // A plain function, not a component: declared inside this one, a component is a new
  // type on every render, so React threw each header away and rebuilt it.
  const sortHeader = (col: SortKey, label: string) => (
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
        <div className="bg-slate-100 h-96 rounded-xl border border-slate-200"></div>
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

      {/* Table card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-6">
        {/* Toolbar */}
        <div className="p-3 border-b border-slate-100 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex space-x-1">
              {['All Routes', 'Running', 'Idle'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setCurrentPage(1); }}
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
                  filterOpen || activeFilterCount > 0
                    ? 'text-orange-700 bg-orange-50 border-orange-200'
                    : 'text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-50',
                )}
              >
                <SlidersHorizontal size={14} /> Filters
                {activeFilterCount > 0 && (
                  <span className="bg-orange-600 text-white rounded-full px-1.5 text-[10px] leading-4">{activeFilterCount}</span>
                )}
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
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} applied` : 'No filters applied'}
                </span>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-[10px] font-bold text-orange-600 hover:text-orange-700 focus:outline-none">
                    Clear all
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
                    <option value="All">All statuses</option>
                    <option value="NONE">No active trips</option>
                    {['PLANNED', 'ON_SCHEDULE', 'DELAYED', 'COMPLETED', 'CANCELLED'].map(s => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
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
                  {sortHeader('name', 'Route')}
                </th>
                <th className="px-4 py-3 border-b border-slate-100">
                  {sortHeader('stops', 'Stops')}
                </th>
                <th className="px-4 py-3 border-b border-slate-100">
                  {sortHeader('duration', 'Est. Time')}
                </th>
                <th className="px-4 py-3 border-b border-slate-100">
                  {sortHeader('departure', 'Trips')}
                </th>
                <th className="px-4 py-3 border-b border-slate-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayRoutes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                    {/* The old test ignored the status and stop filters, so narrowing to an
                        empty result told the admin to "create one to get started". */}
                    {activeTab === 'All Routes' && !searchText && activeFilterCount === 0
                      ? 'No routes found. Create one to get started.'
                      : 'No routes match the current filters.'}
                  </td>
                </tr>
              ) : displayRoutes.map((route: any) => {
                const stopsCount = stopCountOf(route);
                const isDeleting = deletingRouteIds.has(route.id);
                const activeTrips = activeTripsSoonestFirst(route.trips);
                const pastTrips = (route.trips ?? []).filter((t: any) => !isActiveTrip(t));
                const isExpanded = expandedRouteIds.has(route.id);
                const nextAt = nextDepartureAt(route.trips);

                return (
                  <React.Fragment key={route.id}>
                    {/* Route row: only what actually belongs to the route. */}
                    <tr className={clsx('hover:bg-slate-50/50 transition-colors', isDeleting && 'opacity-50 pointer-events-none')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="bg-orange-50 text-orange-600 p-2 rounded flex-shrink-0">
                            <Map size={14} />
                          </div>
                          <span className="font-bold text-slate-900 text-xs">{route.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700 text-xs">{stopsCount} Stops</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-700">
                        {(route.estimatedDuration ?? route.time) != null ? `${route.estimatedDuration ?? route.time} mins` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {activeTrips.length === 0 ? (
                          <span className="text-slate-400">No active trips</span>
                        ) : (
                          <span className="text-slate-700">
                            <span className="font-semibold">{activeTrips.length} active</span>
                            {nextAt > 0 && (
                              <span className="ml-2 font-mono text-[10px] text-slate-500" title={new Date(nextAt).toLocaleString()}>
                                {new Date(nextAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                <span className="ml-1 text-slate-400">
                                  {new Date(nextAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                </span>
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      {/* Four actions, always the same four in the same places. The trip
                          actions moved onto the trip rows, so nothing shifts per row. */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenAssign(route)}
                            className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            <Plus size={13} /> Trip
                          </button>
                          <Link
                            href={`/map?route=${encodeURIComponent(route.name)}`}
                            className="inline-block p-2 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500"
                            title="View on map"
                            aria-label="View on map"
                          >
                            <Map size={14} />
                          </Link>
                          <button
                            onClick={() => handleOpenEdit(route)}
                            className="p-2 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500"
                            title="Edit route name and stops"
                            aria-label="Edit route name and stops"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(route)}
                            disabled={isDeleting}
                            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                            title="Delete route"
                            aria-label="Delete route"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Active trips are always visible, never behind a toggle: they are
                        what the admin came to see, and a route has one or two of them. */}
                    {activeTrips.map((trip: any) => (
                      <tr key={trip.id} className="bg-slate-50/60">
                        <td colSpan={5} className="px-4 py-2">
                          <TripRow
                            trip={trip}
                            bus={busesMap[trip.busId]}
                            driver={driversMap[trip.driverId]}
                            busy={cancellingTripIds.has(trip.id)}
                            onEdit={() => setEditingTrip(trip)}
                            onCancel={() => handleCancelTripConfirmed(trip)}
                          />
                        </td>
                      </tr>
                    ))}

                    {/* History stays behind a toggle and nothing acts on it. */}
                    {pastTrips.length > 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 pb-2 pt-0">
                          <button
                            onClick={() => setExpandedRouteIds(s => {
                              const n = new Set(s);
                              if (n.has(route.id)) n.delete(route.id); else n.add(route.id);
                              return n;
                            })}
                            className="text-[10px] text-slate-400 hover:text-orange-600 focus:outline-none"
                          >
                            {isExpanded
                              ? '▲ Hide past trips'
                              : `▼ ${pastTrips.length} past trip${pastTrips.length > 1 ? 's' : ''}`}
                          </button>
                          {isExpanded && (
                            <div className="mt-2 space-y-1">
                              {[...pastTrips]
                                .sort((a: any, b: any) => Date.parse(b.scheduledStart ?? b.createdAt ?? '') - Date.parse(a.scheduledStart ?? a.createdAt ?? ''))
                                .slice(0, 8)
                                .map((t: any) => (
                                  <TripRow
                                    key={t.id}
                                    trip={t}
                                    bus={busesMap[t.busId]}
                                    driver={driversMap[t.driverId]}
                                    muted
                                  />
                                ))}
                              {pastTrips.length > 8 && (
                                <p className="text-[10px] text-slate-400 pt-1">
                                  Showing the 8 most recent of {pastTrips.length}.
                                </p>
                              )}
                            </div>
                          )}
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
              onClick={() => setCurrentPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-orange-500"
              aria-label="Previous page"
            >&lt;</button>
            {Array.from({ length: totalPages }).map((_, i) => {
              const pageNum = i + 1;
              if (totalPages > 5 && Math.abs(page - pageNum) > 1 && pageNum !== 1 && pageNum !== totalPages) {
                if (pageNum === 2 || pageNum === totalPages - 1) return <span key={pageNum} className="px-1 flex items-center justify-center">…</span>;
                return null;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  aria-label={`Page ${pageNum}`}
                  aria-current={page === pageNum ? 'page' : undefined}
                  className={clsx(
                    'w-7 h-7 flex items-center justify-center rounded font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500',
                    page === pageNum ? 'bg-orange-600 text-white font-bold' : 'hover:bg-slate-50 border border-transparent hover:border-slate-200',
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-orange-500"
              aria-label="Next page"
            >&gt;</button>
          </div>
        </div>
      </div>

      {/* Clear-the-trips-then-delete modal. Only the delete flow opens this now —
          cancelling a single trip is a button on that trip's own row, so there is
          nothing left to disambiguate here. */}
      {cancelPickerRoute && (() => {
        const pickerTrips = activeTripsSoonestFirst(cancelPickerRoute.trips);
        const cleared = pickerTrips.length === 0;
        const deletingThis = deletingRouteIds.has(cancelPickerRoute.id);
        return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base">Cancel trips to delete this route</h3>
              <button onClick={closeCancelPicker} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-500 mb-3">
                {cleared
                  ? <>All active trips on <strong>{cancelPickerRoute.name}</strong> are cancelled. You can delete the route now.</>
                  : <><strong>{cancelPickerRoute.name}</strong> can&apos;t be deleted while {pickerTrips.length === 1 ? 'a trip is' : 'trips are'} still active. Cancel {pickerTrips.length === 1 ? 'it' : 'them'} here, then delete.</>}
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
              <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    onClick={closeCancelPicker}
                    disabled={deletingThis}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {cleared ? 'Keep route' : 'Close'}
                  </button>
                  <button
                    onClick={() => handleDelete(cancelPickerRoute, { confirmed: true })}
                    disabled={!cleared || deletingThis}
                    title={cleared ? undefined : 'Cancel the remaining active trips first'}
                    className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingThis ? 'Deleting…' : 'Delete route'}
                  </button>
                </div>
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
              {(() => {
                const driver = drivers.find((d: any) => d.id === assignFormData.driverId);
                if (!driver) return null;
                const minutesFor = (routeId?: string) => routes.find((r: any) => r.id === routeId)?.estimatedDuration;
                const clashes = findDriverClashes(driver.driverTrips, {
                  start: assignFormData.scheduledStart ? fromDatetimeLocalToISO(assignFormData.scheduledStart) : null,
                  durationMinutes: minutesFor(assignFormData.routeId),
                }, { durationOf: trip => minutesFor(trip.routeId) });
                return <DriverClashWarning driverName={driver.name} clashes={clashes} />;
              })()}
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
        routes={routes}
        onSuccess={() => {
          setEditingTrip(null);
          loadRoutes(true);
        }}
      />
    </div>
  );
}
