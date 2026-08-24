/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useState, useEffect } from 'react';
import { fetchRoutes, deleteRoute, createTrip, updateTripStatus, fetchBuses, fetchDrivers, fetchStats, getUser } from '@/lib/api';
import { Clock, CheckCircle, Zap, SlidersHorizontal, Download, Edit3, MoreVertical, Map, Trash2, X, Users, Route as RouteIcon, Plus, XCircle } from 'lucide-react';
import { clsx } from 'clsx';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

const RouteMapEditor = dynamic(() => import('@/components/map/RouteMapEditor'), { ssr: false });

// Single source of truth for "trip is live" — used by the Active tab filter,
// the cancel action's visibility AND its trip selection.
const ACTIVE_TRIP_STATUSES = ['PLANNED', 'ON_SCHEDULE', 'DELAYED'];

// Known trip statuses get a colored pill; anything else falls back to slate.
const TRIP_TONES: Record<string, { badge: string; dot: string }> = {
  ON_SCHEDULE: { badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  DELAYED: { badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  PLANNED: { badge: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' },
  CANCELLED: { badge: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
};
const FALLBACK_TONE = { badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-500' };

// Escape for RFC-4180 CSV and neutralize Excel formula injection (=+-@ prefixes).
const csvCell = (v: any) => {
  const s = String(v ?? '').replace(/"/g, '""');
  return `"${/^[=+\-@]/.test(s) ? `'${s}` : s}"`;
};

export function ManageRoutes() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState('All Routes');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<any>(null);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignFormData, setAssignFormData] = useState({ routeId: '', busId: '', driverId: '' });
  const [assignRouteName, setAssignRouteName] = useState('');
  const [isAssignSubmitting, setIsAssignSubmitting] = useState(false);

  const loadRoutes = () => {
    setLoading(true);
    setLoadError(null);
    Promise.all([fetchRoutes(), fetchBuses(), fetchDrivers(), fetchStats()])
      .then(([routesData, busesData, driversData, statsData]) => {
        setRoutes(routesData);
        setBuses(busesData);
        setDrivers(driversData);
        setStats(statsData);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load data:', err);
        setLoadError(err?.message || 'Failed to load routes');
        toast.error('Failed to load routes');
        setLoading(false);
      });
  };

  useEffect(() => {
    loadRoutes();
  }, []);

  const handleOpenCreate = () => {
    setEditingRoute(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (route: any) => {
    setEditingRoute(route);
    setIsModalOpen(true);
  };

  const handleOpenAssign = (route: any) => {
    const latestTrip = route.trips && route.trips.length > 0 ? route.trips[route.trips.length - 1] : null;
    setAssignRouteName(route.name);
    setAssignFormData({ routeId: route.id, busId: latestTrip?.busId || '', driverId: latestTrip?.driverId || '' });
    setIsAssignModalOpen(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAssignSubmitting(true);
    try {
      await createTrip({
        routeId: assignFormData.routeId,
        busId: assignFormData.busId,
        driverId: assignFormData.driverId
      });
      setIsAssignModalOpen(false);
      loadRoutes(); // Refresh to show assignment
    } catch (err: any) {
      console.error('Failed to assign trip', err);
      // Backend rejects double-booking with 400 + a specific message.
      toast.error(err?.message || 'Failed to assign driver and bus. Please try again.');
    } finally {
      setIsAssignSubmitting(false);
    }
  };

  const handleDelete = async (routeId: string) => {
    if (!window.confirm('Are you sure you want to delete this route?')) return;
    try {
      await deleteRoute(routeId);
      loadRoutes();
    } catch (err: any) {
      console.error('Failed to delete route', err);
      toast.error(err.message || 'Failed to delete route');
    }
  };

  const handleCancelActiveTrips = async (route: any) => {
    if (!route.trips || route.trips.length === 0) return;
    const activeTrips = route.trips.filter((t: any) => ACTIVE_TRIP_STATUSES.includes(t.status));
    if (activeTrips.length === 0) return;
    
    if (!window.confirm(`Are you sure you want to cancel ${activeTrips.length} active trip(s)?`)) return;
    
    try {
      await Promise.all(activeTrips.map((t: any) => updateTripStatus(t.id, 'CANCELLED')));
      loadRoutes();
    } catch (err: any) {
      console.error('Failed to cancel trips', err);
      toast.error(err.message || 'Failed to cancel trips');
    }
  };

  // Filter logic
  const filteredRoutes = routes.filter((route: any) => {
    if (activeTab === 'All Routes') return true;
    
    // Route has no status field in the DB — derive it from the latest trip.
    const latestTrip = route.trips && route.trips.length > 0 ? route.trips[route.trips.length - 1] : null;
    const statusStr = latestTrip?.status || 'INACTIVE';

    if (activeTab === 'Active') {
      return ACTIVE_TRIP_STATUSES.includes(statusStr);
    }
    if (activeTab === 'Inactive') {
      return ['COMPLETED', 'CANCELLED', 'INACTIVE'].includes(statusStr);
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredRoutes.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayRoutes = filteredRoutes.slice(startIndex, startIndex + itemsPerPage);

  // Reset page when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const handleExportCSV = () => {
    if (filteredRoutes.length === 0) { toast.error('No routes to export'); return; }
    const header = ['Route Name', 'Assigned Bus', 'Assigned Driver', 'Stops', 'Est Time', 'Status'].map(csvCell).join(',');
    const rows = filteredRoutes.map((route: any) => {
      const latestTrip = route.trips && route.trips.length > 0 ? route.trips[route.trips.length - 1] : null;
      const assignedBus = latestTrip ? buses.find(b => b.id === latestTrip.busId) : null;
      const assignedDriver = latestTrip ? drivers.find(d => d.id === latestTrip.driverId) : null;
      const statusStr = latestTrip?.status || 'INACTIVE';
      const stopsCount = Array.isArray(route.stops) ? route.stops.length : route.stops || 0;

      const busName = assignedBus?.licensePlate || route.bus?.name || 'Unassigned';
      const driverName = assignedDriver?.name || route.bus?.driver?.user?.name || 'No driver';

      return [route.name, busName, driverName, stopsCount, route.estimatedDuration || route.time || '', statusStr].map(csvCell).join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8," + [header, ...rows].join('\r\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "routes_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
          <span>+</span> Create New Route
        </button>
      </div>

      {loadError && (
        <div className="flex items-center justify-between bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
          <span>Couldn&apos;t load routes: {loadError}</span>
          <button onClick={loadRoutes} className="font-bold underline hover:no-underline focus:outline-none">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-orange-50 p-2.5 rounded-lg text-orange-600">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Average Route Duration</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 leading-none">{stats?.averageRouteDuration ? `${stats.averageRouteDuration}m` : '—'}</span>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-emerald-50 p-2.5 rounded-lg text-emerald-600">
            <CheckCircle size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Most Efficient Route</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 leading-none">{stats?.mostEfficientRoute || '—'}</span>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-amber-50 p-2.5 rounded-lg text-amber-600">
            <Zap size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Pending Optimizations</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 leading-none">{stats?.pendingOptimizations ?? '—'}</span>
              {stats?.pendingOptimizations > 0 && <span className="text-[10px] uppercase font-bold text-amber-600">Requires review</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-6">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex space-x-1">
            {['All Routes', 'Active', 'Inactive'].map((tab) => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={clsx(
                  "px-3 py-1.5 text-xs font-bold rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500",
                  activeTab === tab ? "text-orange-700 bg-orange-50" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button disabled title="Advanced filters coming soon" className="flex items-center gap-2 text-xs font-bold text-slate-400 px-3 py-1.5 border border-slate-200 rounded-md bg-slate-50 cursor-not-allowed">
              <SlidersHorizontal size={14} /> Filters
            </button>
            <button onClick={handleExportCSV} className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500">
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 border-b border-slate-100">Route Name</th>
                <th className="px-4 py-3 border-b border-slate-100">Assigned Bus & Driver</th>
                <th className="px-4 py-3 border-b border-slate-100">Stops</th>
                <th className="px-4 py-3 border-b border-slate-100">Est. Time</th>
                <th className="px-4 py-3 border-b border-slate-100">Status</th>
                <th className="px-4 py-3 border-b border-slate-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayRoutes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                    {activeTab === 'All Routes' ? 'No routes found. Create one to get started.' : `No ${activeTab.toLowerCase()} routes.`}
                  </td>
                </tr>
              ) : displayRoutes.map((route: any) => {
                const latestTrip = route.trips && route.trips.length > 0 ? route.trips[route.trips.length - 1] : null;
                const assignedBus = latestTrip ? buses.find(b => b.id === latestTrip.busId) : null;
                const assignedDriver = latestTrip ? drivers.find(d => d.id === latestTrip.driverId) : null;

                const statusStr = latestTrip?.status || 'INACTIVE';
                const stopsCount = Array.isArray(route.stops) ? route.stops.length : route.stops || 0;
                
                return (
                <tr key={route.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-orange-50 text-orange-600 p-2 rounded flex-shrink-0">
                        <Map size={14} />
                      </div>
                      <span className="font-bold text-slate-900 text-xs">{route.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900 text-xs">{assignedBus?.licensePlate || route.bus?.name || 'Unassigned'}</p>
                    <p className="text-[10px] text-slate-500">{assignedDriver?.name || route.bus?.driver?.user?.name || 'No driver'}</p>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700 text-xs">{stopsCount} Stops</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-700">{route.estimatedDuration || route.time} mins</td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-2",
                      (TRIP_TONES[statusStr] || FALLBACK_TONE).badge
                    )}>
                      <div className={clsx("w-1.5 h-1.5 rounded-full", (TRIP_TONES[statusStr] || FALLBACK_TONE).dot)}></div>
                      {statusStr === 'INACTIVE' ? 'No Trip' : statusStr.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2 transition-opacity">
                      {ACTIVE_TRIP_STATUSES.includes(statusStr) && (
                        <button 
                          onClick={() => handleCancelActiveTrips(route)}
                          className="p-2 text-amber-600 hover:bg-amber-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500" 
                          title="Cancel Active Trip"
                          aria-label="Cancel Active Trip"
                        >
                          <XCircle size={14} />
                        </button>
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
                        onClick={() => handleDelete(route.id)}
                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-red-500" 
                        title="Delete Route"
                        aria-label="Delete Route"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {displayRoutes.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + itemsPerPage, filteredRoutes.length)} of {filteredRoutes.length} routes</span>
          <div className="flex gap-1">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-orange-500"
              aria-label="Previous page"
            >
              &lt;
            </button>
            {Array.from({ length: totalPages }).map((_, i) => {
              const pageNum = i + 1;
              // Only show pages around current page (simple pagination)
              if (totalPages > 5 && Math.abs(currentPage - pageNum) > 1 && pageNum !== 1 && pageNum !== totalPages) {
                if (pageNum === 2 || pageNum === totalPages - 1) return <span key={pageNum} className="px-1 flex items-center justify-center">...</span>;
                return null;
              }
              return (
                <button 
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  aria-label={`Page ${pageNum}`}
                  aria-current={currentPage === pageNum ? 'page' : undefined}
                  className={clsx(
                    "w-7 h-7 flex items-center justify-center rounded font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500",
                    currentPage === pageNum ? "bg-orange-600 text-white font-bold" : "hover:bg-slate-50 border border-transparent hover:border-slate-200"
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
            >
              &gt;
            </button>
          </div>
        </div>
      </div>

      {isAssignModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">
                Start a Trip
              </h3>
              <button 
                onClick={() => setIsAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAssignSubmit} className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-2">
                <p className="text-xs text-slate-500 font-medium">Selected Route</p>
                <p className="text-sm font-bold text-slate-900">{assignRouteName}</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Assign Bus <span className="text-red-500">*</span>
                </label>
                <SearchableSelect 
                  options={buses.map((bus: any) => ({
                    value: bus.id,
                    label: bus.licensePlate,
                    subLabel: bus.capacity ? `${bus.capacity} seats` : undefined
                  }))}
                  value={assignFormData.busId}
                  onChange={(val) => setAssignFormData({...assignFormData, busId: val})}
                  placeholder="Select a bus"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Assign Driver <span className="text-red-500">*</span>
                </label>
                <SearchableSelect 
                  options={drivers.map((driver: any) => ({
                    value: driver.id,
                    label: driver.name,
                    subLabel: driver.email
                  }))}
                  value={assignFormData.driverId}
                  onChange={(val) => setAssignFormData({...assignFormData, driverId: val})}
                  placeholder="Select a driver"
                />
              </div>
              
              <div className="pt-4 flex gap-3 justify-end">
                <button 
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors text-sm border border-slate-200"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isAssignSubmitting}
                  className="px-4 py-2 rounded-lg font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors text-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {isAssignSubmitting ? 'Starting...' : 'Assign & Start Trip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden p-6 max-h-[90vh] overflow-y-auto">
            <RouteMapEditor 
              schoolId={getUser()?.schoolId || ''} 
              initialRoute={editingRoute}
              buses={buses}
              drivers={drivers}
              onSaved={() => {
                setIsModalOpen(false);
                loadRoutes();
              }}
              onCancel={() => setIsModalOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
