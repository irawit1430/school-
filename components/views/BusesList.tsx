"use client";
import React, { useState, useEffect } from 'react';
import { fetchBuses, createBus, deleteBus, fetchRoutes, fetchDrivers, createTrip, apiErrorMessage } from '@/lib/api';
import { Bus, Plus, Trash2, X, Route as RouteIcon } from 'lucide-react';
import { getBusDisplayName, getBusOperationalStatus, getBusRegistration } from '@/lib/buses';
import toast from 'react-hot-toast';

export function BusesList() {
  const [buses, setBuses] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ registrationNumber: '', capacity: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignFormData, setAssignFormData] = useState({ busId: '', routeId: '', driverId: '' });
  const [assignBusName, setAssignBusName] = useState('');
  const [isAssignSubmitting, setIsAssignSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [bData, rData, dData] = await Promise.all([
        fetchBuses(),
        fetchRoutes({ summary: true }),
        fetchDrivers()
      ]);
      setBuses(bData);
      setRoutes(rData);
      setDrivers(dData);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      toast.error(apiErrorMessage(err, 'Failed to load buses data.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.registrationNumber || !formData.capacity) {
      toast.error('Please fill all fields');
      return;
    }
    if (parseInt(formData.capacity) <= 0) {
      toast.error('Capacity must be greater than 0');
      return;
    }
    setIsSubmitting(true);
    try {
      await createBus({
        registrationNumber: formData.registrationNumber,
        capacity: parseInt(formData.capacity)
      });
      toast.success('Bus created successfully');
      setIsModalOpen(false);
      setFormData({ registrationNumber: '', capacity: '' });
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create bus');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (bus: any) => {
    const busName = getBusDisplayName(bus);
    if (!confirm(`Delete ${busName}?\n\nThis permanently removes the bus from your fleet.`)) return;
    try {
      await deleteBus(bus.id);
      toast.success('Bus deleted');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete bus');
    }
  };

  const handleOpenAssign = (bus: any) => {
    setAssignBusName(bus.registrationNumber);
    setAssignFormData({ busId: bus.id, routeId: '', driverId: '' });
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
      toast.success('Trip created successfully');
      setIsAssignModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create trip');
    } finally {
      setIsAssignSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Buses</h2>
          <p className="text-sm text-slate-500 mt-1">View your school buses and create trips</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 transition-colors"
        >
          <Plus size={16} /> Add Bus
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                <th className="px-6 py-4">Bus</th>
                <th className="px-6 py-4">Capacity</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500 font-medium">Loading buses...</td>
                </tr>
              ) : buses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500 font-medium">No buses found. Add one to get started.</td>
                </tr>
              ) : (
                buses.map((bus) => {
                  const displayName = getBusDisplayName(bus);
                  const registration = getBusRegistration(bus);
                  const operationalStatus = getBusOperationalStatus(bus);
                  const statusTone = {
                    success: 'bg-emerald-100 text-emerald-700',
                    warning: 'bg-amber-100 text-amber-700',
                    danger: 'bg-red-100 text-red-700',
                    neutral: 'bg-slate-100 text-slate-600',
                  }[operationalStatus.tone];

                  return <tr key={bus.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                          <Bus size={16} />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{displayName}</div>
                          {registration && registration !== displayName && (
                            <div className="text-xs text-slate-500 mt-0.5">{registration}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {bus.capacity} seats
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusTone}`}>
                        {operationalStatus.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      <button 
                        onClick={() => handleOpenAssign(bus)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        title="Create Trip"
                        aria-label={`Create trip for ${displayName}`}
                      >
                        <RouteIcon size={16} />
                        Create trip
                      </button>
                      <button 
                        onClick={() => handleDelete(bus)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                        title="Delete Bus"
                        aria-label="Delete Bus"
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
                    </td>
                  </tr>;
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">Add New Bus</h3>
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
                  Registration Number <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text"
                  required
                  value={formData.registrationNumber}
                  onChange={(e) => setFormData({...formData, registrationNumber: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                  placeholder="e.g. DL 1P 1234"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Seating Capacity <span className="text-red-500">*</span>
                </label>
                <input 
                  type="number"
                  required
                  min="1"
                  value={formData.capacity}
                  onChange={(e) => setFormData({...formData, capacity: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                  placeholder="e.g. 40"
                />
              </div>
              <div className="pt-4 flex gap-3 justify-end">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg font-medium text-white bg-orange-600 hover:bg-orange-700 transition-colors text-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {isSubmitting ? 'Saving...' : 'Add Bus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAssignModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">Create Trip</h3>
              <button 
                onClick={() => setIsAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAssignSubmit} className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-2">
                <p className="text-xs text-slate-500 font-medium">Bus for this trip</p>
                <p className="text-sm font-bold text-slate-900">{assignBusName}</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Select Route <span className="text-red-500">*</span>
                </label>
                <select 
                  required
                  value={assignFormData.routeId}
                  onChange={(e) => setAssignFormData({...assignFormData, routeId: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                >
                  <option value="" disabled>Select a route</option>
                  {routes.map((route: any) => (
                    <option key={route.id} value={route.id}>
                      {route.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Select Driver <span className="text-red-500">*</span>
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
                  className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isAssignSubmitting}
                  className="px-4 py-2 rounded-lg font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors text-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {isAssignSubmitting ? 'Creating trip...' : 'Create Trip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
