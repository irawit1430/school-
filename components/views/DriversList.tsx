/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useState, useEffect } from 'react';
import { fetchDrivers, createDriver, updateDriver, deleteDriver, fetchBuses, fetchRoutes, createTrip, updateTripStatus, updateTrip, apiErrorMessage } from '@/lib/api';
import { activeTripsSoonestFirst, describeTrip } from '@/lib/trips';
import { User, Mail, Bus, Clock, MoreVertical, X, CheckCircle, Copy, Edit2, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

export function DriversList() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editDriverId, setEditDriverId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({ name: '', email: '', phone: '', password: '' });

  const handleOpenEdit = (driver: any) => {
    setEditDriverId(driver.id);
    setEditFormData({ name: driver.name, email: driver.email, phone: driver.phone || '', password: '' });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDriverId) return;
    setIsSubmitting(true);
    try {
      const dataToUpdate: any = { name: editFormData.name, email: editFormData.email };
      if (editFormData.phone !== undefined) dataToUpdate.phone = editFormData.phone;
      if (editFormData.password) dataToUpdate.password = editFormData.password;
      await updateDriver(editDriverId, dataToUpdate);
      setIsEditModalOpen(false);
      loadData();
      toast.success('Driver updated successfully');
    } catch (error: any) {
      toast.error(apiErrorMessage(error, 'Failed to update driver.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDriver = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this driver?')) return;
    try {
      await deleteDriver(id);
      loadData();
      toast.success('Driver deleted successfully');
    } catch (error: any) {
      toast.error(apiErrorMessage(error, 'Failed to delete driver.'));
    }
  };
  
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignFormData, setAssignFormData] = useState({ driverId: '', busId: '', routeId: '' });
  const [assignDriverName, setAssignDriverName] = useState('');
  const [isAssignSubmitting, setIsAssignSubmitting] = useState(false);

  const [createdCredentials, setCreatedCredentials] = useState<{email: string, tempPassword: string} | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([fetchDrivers(), fetchBuses(), fetchRoutes()])
      .then(([driversData, busesData, routesData]) => {
        setDrivers(driversData);
        setBuses(busesData);
        setRoutes(routesData);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load data:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await createDriver(formData);
      setCreatedCredentials({
        email: response.driver.email,
        tempPassword: response.tempPassword
      });
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      console.error('Failed to create driver', err);
      toast.error(apiErrorMessage(err, 'Failed to create driver.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenAssign = (driver: any) => {
    setAssignDriverName(driver.name);
    setAssignFormData({ driverId: driver.id, busId: '', routeId: '' });
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
      loadData(); // Refresh to show assignment
    } catch (err) {
      console.error('Failed to assign trip', err);
      toast.error(apiErrorMessage(err, 'Failed to assign trip.'));
    } finally {
      setIsAssignSubmitting(false);
    }
  };

  // Takes the trip, not just its id: the confirmation has to name what it is about to
  // cancel. A driver can have more than one live trip, and this button acts on whichever
  // one the row happens to be showing.
  const handleUnassignTrip = async (trip: any) => {
    if (!trip?.id) {
      toast.error("Error: No Trip ID found for this assignment.");
      return;
    }
    if (!window.confirm(`Cancel this trip?\n\n${describeTrip(trip)}\n\nThe driver and bus are freed for other trips.`)) return;
    try {
      await updateTripStatus(trip.id, 'CANCELLED');
      loadData();
      toast.success('Trip cancelled');
    } catch (err) {
      console.error('Failed to unassign trip', err);
      toast.error(apiErrorMessage(err, 'Failed to unassign trip.'));
    }
  };
  
  const copyCredentials = () => {
    if (createdCredentials) {
      navigator.clipboard.writeText(`Email: ${createdCredentials.email}\nPassword: ${createdCredentials.tempPassword}`);
      toast.success("Copied to clipboard!");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Driver Management</h2>
          <p className="text-sm text-slate-500 mt-1">Manage fleet drivers and assignments</p>
        </div>
        <button 
          onClick={() => {
            setFormData({ name: '', email: '' });
            setIsModalOpen(true);
          }}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 shadow-sm text-sm"
        >
          <User size={16} /> Add Driver
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 border-b border-slate-100">Driver Name</th>
                <th className="px-4 py-3 border-b border-slate-100">Email</th>
                <th className="px-4 py-3 border-b border-slate-100">Status</th>
                <th className="px-4 py-3 border-b border-slate-100">Current Bus</th>
                <th className="px-4 py-3 border-b border-slate-100">Current Route</th>
                <th className="px-4 py-3 border-b border-slate-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                    Loading drivers...
                  </td>
                </tr>
              ) : drivers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No drivers found. Create one to get started.
                  </td>
                </tr>
              ) : drivers.map((driver: any) => {
                // Soonest-first, and DELAYED counts as live — a driver whose bus is
                // running late is not free. Both were wrong here, and together they
                // pointed Unassign at a trip the admin was not looking at.
                const activeTrips = activeTripsSoonestFirst(driver.driverTrips);
                const isActive = activeTrips.length > 0;
                const currentTrip = activeTrips[0] ?? null;
                
                return (
                <tr key={driver.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-100 text-slate-600 p-1.5 rounded flex-shrink-0">
                        <User size={14} />
                      </div>
                      <span className="font-bold text-slate-900 text-sm">{driver.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-slate-600 text-xs">
                      <Mail size={12} />
                      {driver.email}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5",
                      isActive ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    )}>
                      <div className={clsx("w-1.5 h-1.5 rounded-full", isActive ? "bg-emerald-500" : "bg-amber-500")}></div>
                      {isActive ? 'Active' : 'Idle'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold text-slate-700">
                      {currentTrip && currentTrip.bus ? currentTrip.bus.registrationNumber : 'Unassigned'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-600">
                      {currentTrip && currentTrip.route ? currentTrip.route.name : '—'}
                      {activeTrips.length > 1 && (
                        <span className="ml-1.5 text-[10px] font-semibold text-amber-700" title={activeTrips.slice(1).map(describeTrip).join('\n')}>
                          +{activeTrips.length - 1} more
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isActive && currentTrip ? (
                        <button 
                          onClick={() => handleUnassignTrip(currentTrip)}
                          className="text-xs font-semibold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md transition-colors"
                        >
                          Unassign Trip
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleOpenAssign(driver)}
                          className="text-xs font-semibold text-orange-600 hover:orange-800 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-md transition-colors"
                        >
                          Assign Trip
                        </button>
                      )}
                      <button onClick={() => handleOpenEdit(driver)} className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-md transition-colors" title="Edit Driver">
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteDriver(driver.id)} 
                        disabled={isActive}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-transparent rounded-md transition-colors" 
                        title={isActive ? "Cannot delete active driver" : "Delete Driver"}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">Assign Trip to {assignDriverName}</h3>
              <button 
                onClick={() => setIsAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAssignSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Select Bus <span className="text-red-500">*</span>
                </label>
                <select 
                  required
                  value={assignFormData.busId}
                  onChange={(e) => setAssignFormData({...assignFormData, busId: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                >
                  <option value="">Select a Bus</option>
                  {buses.map(bus => (
                    <option key={bus.id} value={bus.id}>{bus.registrationNumber} ({bus.capacity} seats)</option>
                  ))}
                </select>
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
                  <option value="">Select a Route</option>
                  {routes.map(route => (
                    <option key={route.id} value={route.id}>{route.name}</option>
                  ))}
                </select>
              </div>
              <div className="pt-4 flex justify-end gap-3">
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
                  className="px-4 py-2 rounded-lg font-medium text-white bg-orange-600 hover:bg-orange-700 transition-colors text-sm disabled:opacity-70"
                >
                  {isAssignSubmitting ? 'Assigning...' : 'Confirm Assignment'}
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
              <h3 className="font-bold text-slate-900 text-lg">Add New Driver</h3>
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
                  Driver Name <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                  placeholder="e.g. Raju Kumar"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input 
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                  placeholder="e.g. raju@yourfleet.com"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3">
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
                  className="px-4 py-2 rounded-lg font-medium text-white bg-orange-600 hover:bg-orange-700 transition-colors text-sm disabled:opacity-70"
                >
                  {isSubmitting ? 'Creating...' : 'Add Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">Edit Driver</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Driver Name <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text"
                  required
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input 
                  type="email"
                  required
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Phone Number
                </label>
                <input 
                  type="tel" pattern="[0-9]{10}" title="Must be 10 digits"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({...editFormData, phone: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                  placeholder="e.g. 9876543210"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  New Password <span className="text-slate-400 font-normal text-xs">(leave blank to keep current)</span>
                </label>
                <input 
                  type="text"
                  value={editFormData.password}
                  onChange={(e) => setEditFormData({...editFormData, password: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                  placeholder="Enter new password"
                  minLength={8}
                />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors text-sm border border-slate-200"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg font-medium text-white bg-orange-600 hover:bg-orange-700 transition-colors text-sm disabled:opacity-70"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createdCredentials && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden p-6 text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={24} />
            </div>
            <h3 className="font-bold text-slate-900 text-lg mb-2">Driver Created Successfully!</h3>
            <p className="text-sm text-slate-500 mb-6">Share these credentials with the driver immediately. This password cannot be recovered later.</p>
            
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 text-left">
              <div className="mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Email</span>
                <span className="text-sm font-semibold text-slate-800">{createdCredentials.email}</span>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Temporary Password</span>
                <span className="text-sm font-mono font-bold text-slate-800 bg-white px-2 py-1 border border-slate-200 rounded">{createdCredentials.tempPassword}</span>
              </div>
            </div>
            
            <button 
              onClick={copyCredentials}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 mb-3"
            >
              <Copy size={16} /> Copy to Clipboard
            </button>
            <button 
              onClick={() => setCreatedCredentials(null)}
              className="w-full text-slate-500 hover:text-slate-700 font-medium text-sm transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
