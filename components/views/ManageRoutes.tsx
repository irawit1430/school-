"use client";
import React, { useState, useEffect } from 'react';
import { fetchRoutes, createRoute, updateRoute, deleteRoute, createTrip, fetchBuses, fetchDrivers } from '@/lib/api';
import { Clock, CheckCircle, Zap, SlidersHorizontal, Download, Edit3, MoreVertical, Map, Trash2, X, Users } from 'lucide-react';
import { clsx } from 'clsx';

export function ManageRoutes() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', estimatedDuration: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignFormData, setAssignFormData] = useState({ routeId: '', busId: '', driverId: '' });
  const [assignRouteName, setAssignRouteName] = useState('');
  const [isAssignSubmitting, setIsAssignSubmitting] = useState(false);

  const loadRoutes = () => {
    setLoading(true);
    Promise.all([fetchRoutes(), fetchBuses(), fetchDrivers()])
      .then(([routesData, busesData, driversData]) => {
        setRoutes(routesData);
        setBuses(busesData);
        setDrivers(driversData);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load data:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadRoutes();
  }, []);

  const handleOpenCreate = () => {
    setEditingRoute(null);
    setFormData({ name: '', estimatedDuration: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (route: any) => {
    setEditingRoute(route);
    setFormData({ 
      name: route.name, 
      estimatedDuration: route.estimatedDuration ? route.estimatedDuration.toString() : '' 
    });
    setIsModalOpen(true);
  };

  const handleOpenAssign = (route: any) => {
    setAssignRouteName(route.name);
    setAssignFormData({ routeId: route.id, busId: '', driverId: '' });
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
    } catch (err) {
      console.error('Failed to assign trip', err);
      alert('Failed to assign driver and bus. Check IDs and try again.');
    } finally {
      setIsAssignSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name,
        estimatedDuration: formData.estimatedDuration ? parseInt(formData.estimatedDuration) : undefined
      };
      
      if (editingRoute) {
        await updateRoute(editingRoute.id, payload);
      } else {
        await createRoute(payload);
      }
      setIsModalOpen(false);
      loadRoutes();
    } catch (err) {
      console.error('Failed to save route', err);
      alert('Failed to save route. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (routeId: string) => {
    if (!confirm('Are you sure you want to delete this route?')) return;
    try {
      await deleteRoute(routeId);
      loadRoutes();
    } catch (err) {
      console.error('Failed to delete route', err);
      alert('Failed to delete route');
    }
  };

  // Use real routes from the database
  const displayRoutes = routes;

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-orange-50 p-2.5 rounded-lg text-orange-600">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Average Route Duration</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 leading-none">42m 15s</span>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">+3%</span>
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
              <span className="text-2xl font-bold text-slate-900 leading-none">Loop 402B</span>
              <span className="text-[10px] uppercase font-bold text-emerald-600">98% On-time</span>
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
              <span className="text-2xl font-bold text-slate-900 leading-none">12</span>
              <span className="text-[10px] uppercase font-bold text-amber-600">Requires review</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-6">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex space-x-1">
            {['All Routes', 'Active', 'Inactive', 'Optimizing'].map((tab, i) => (
              <button 
                key={tab}
                className={clsx(
                  "px-3 py-1.5 text-xs font-bold rounded-md transition-colors",
                  i === 0 ? "text-orange-700 bg-orange-50" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-200 rounded-md transition-colors">
              <SlidersHorizontal size={14} /> Filters
            </button>
            <button className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-200 rounded-md transition-colors">
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
                    No routes found. Create one to get started.
                  </td>
                </tr>
              ) : displayRoutes.map((route: any) => {
                const latestTrip = route.trips && route.trips.length > 0 ? route.trips[route.trips.length - 1] : null;
                const assignedBus = latestTrip ? buses.find(b => b.id === latestTrip.busId) : null;
                const assignedDriver = latestTrip ? drivers.find(d => d.id === latestTrip.driverId) : null;

                const statusStr = latestTrip?.status || (typeof route.status === 'string' ? route.status.toUpperCase() : 'INACTIVE');
                const stopsCount = Array.isArray(route.stops) ? route.stops.length : route.stops || 0;
                
                return (
                <tr key={route.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-orange-50 text-orange-600 p-1.5 rounded flex-shrink-0">
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
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5",
                      (statusStr === 'ACTIVE' || statusStr === 'ON_SCHEDULE') && "bg-emerald-100 text-emerald-700",
                      statusStr === 'DELAYED' && "bg-amber-100 text-amber-700",
                      (statusStr === 'INACTIVE' || statusStr === 'PLANNED') && "bg-slate-100 text-slate-600",
                      statusStr === 'OPTIMIZING' && "bg-purple-100 text-purple-700"
                    )}>
                      {(statusStr === 'ACTIVE' || statusStr === 'ON_SCHEDULE') && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>}
                      {statusStr === 'DELAYED' && <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>}
                      {(statusStr === 'INACTIVE' || statusStr === 'PLANNED') && <div className="w-1.5 h-1.5 rounded-full bg-slate-500"></div>}
                      {statusStr === 'OPTIMIZING' && <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></div>}
                      {statusStr.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 text-orange-600 hover:bg-orange-50 rounded transition-colors" title="View on Map"><Map size={14} /></button>
                      <button 
                        onClick={() => handleOpenAssign(route)}
                        className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors" 
                        title="Assign Bus & Driver"
                      >
                        <Users size={14} />
                      </button>
                      <button 
                        onClick={() => handleOpenEdit(route)}
                        className="p-1.5 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors" 
                        title="Edit Route"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button 
                        onClick={() => handleDelete(route.id)}
                        className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors" 
                        title="Delete Route"
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
          <span>Showing 4 of 42 routes</span>
          <div className="flex gap-1">
            <button className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 hover:bg-slate-50">&lt;</button>
            <button className="w-7 h-7 flex items-center justify-center rounded bg-orange-600 text-white font-bold">1</button>
            <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-50 font-medium">2</button>
            <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-50 font-medium">3</button>
            <button className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 hover:bg-slate-50">&gt;</button>
          </div>
        </div>
      </div>

      {isAssignModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">
                Assign Trip
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
                <select 
                  required
                  value={assignFormData.busId}
                  onChange={(e) => setAssignFormData({...assignFormData, busId: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                >
                  <option value="" disabled>Select a bus</option>
                  {buses.map((bus: any) => (
                    <option key={bus.id} value={bus.id}>
                      {bus.licensePlate} {bus.capacity ? `(${bus.capacity} seats)` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Assign Driver <span className="text-red-500">*</span>
                </label>
                <select 
                  required
                  value={assignFormData.driverId}
                  onChange={(e) => setAssignFormData({...assignFormData, driverId: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                >
                  <option value="" disabled>Select a driver</option>
                  {drivers.map((driver: any) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name} ({driver.email})
                    </option>
                  ))}
                </select>
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
                  className="px-4 py-2 rounded-lg font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors text-sm disabled:opacity-70 flex items-center gap-2"
                >
                  {isAssignSubmitting ? 'Assigning...' : 'Assign & Create Trip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">
                {editingRoute ? 'Edit Route' : 'Create New Route'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Route Name <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                  placeholder="e.g. Morning Route A"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Estimated Duration (minutes)
                </label>
                <input 
                  type="number"
                  min="1"
                  value={formData.estimatedDuration}
                  onChange={(e) => setFormData({...formData, estimatedDuration: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                  placeholder="e.g. 45"
                />
              </div>
              
              <div className="pt-4 flex gap-3 justify-end">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors text-sm border border-slate-200"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg font-medium text-white bg-orange-600 hover:bg-orange-700 transition-colors text-sm disabled:opacity-70 flex items-center gap-2"
                >
                  {isSubmitting ? 'Saving...' : (editingRoute ? 'Save Changes' : 'Create Route')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
