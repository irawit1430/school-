"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { fetchDrivers, deleteDriver, fetchBuses, fetchRoutes, updateTripStatus, apiErrorMessage, clearApiCache } from '@/lib/api';
import { getBusDisplayName } from '@/lib/buses';
import { formatDeparture, getDriverTrips, matchesDriverSearch, type DriverBus, type DriverFilter, type DriverRecord, type DriverTrip } from '@/lib/drivers';
import { DriverDialog } from './drivers/DriverDialog';
import { DriverFormDialog, type DriverCredentials } from './drivers/DriverFormDialog';
import { DriverTripDialog } from './drivers/DriverTripDialog';
import { User, Mail, Phone, Search, RefreshCw, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import toast from 'react-hot-toast';

const requireList = <T,>(data: unknown): T[] => {
  if (!Array.isArray(data)) throw new Error('The server returned an unexpected response. Please retry.');
  return data;
};

export function DriversList() {
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [buses, setBuses] = useState<DriverBus[]>([]);
  const [routes, setRoutes] = useState<{ id: string; name: string; estimatedDuration?: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [driverError, setDriverError] = useState('');
  const [busError, setBusError] = useState('');
  const [routeError, setRouteError] = useState('');
  const loadRequest = useRef(0);
  // Seeded from ?q= so a header search result arrives filtered to the driver clicked.
  const [search, setSearch] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('q') || '';
  });
  const [filter, setFilter] = useState<DriverFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [driverForm, setDriverForm] = useState<DriverRecord | 'new' | null>(null);
  const [tripEditor, setTripEditor] = useState<{ driver: DriverRecord; trip?: DriverTrip } | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const actionLock = useRef(false);
  const [credentials, setCredentials] = useState<DriverCredentials | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState('');

  const loadData = useCallback(async (force = false) => {
    if (force) clearApiCache();
    const request = ++loadRequest.current;
    const current = () => request === loadRequest.current;
    setRefreshing(true);
    setOptionsLoading(true);
    // Each result updates independently: a routes outage must not hide the drivers.
    await Promise.allSettled([
      fetchDrivers().then(data => {
        const list = requireList<DriverRecord>(data);
        if (current()) { setDrivers(list); setDriverError(''); }
      }).catch(err => {
        if (current()) setDriverError(apiErrorMessage(err, 'Could not load drivers.'));
      }).finally(() => { if (current()) setLoading(false); }),
      fetchBuses().then(data => {
        const list = requireList<DriverBus>(data);
        if (current()) { setBuses(list); setBusError(''); }
      }).catch(err => { if (current()) setBusError(apiErrorMessage(err, 'Could not load buses.')); }),
      fetchRoutes({ summary: true }).then(data => {
        const list = requireList<{ id: string; name: string }>(data);
        if (current()) { setRoutes(list); setRouteError(''); }
      }).catch(err => { if (current()) setRouteError(apiErrorMessage(err, 'Could not load routes.')); }),
    ]);
    if (current()) { setRefreshing(false); setOptionsLoading(false); }
  }, []);

  useEffect(() => {
    // Start the initial request; later renders are driven by its independent results.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
    // This ref is a request generation counter, not a DOM node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { loadRequest.current++; };
  }, [loadData]);

  const cancelTrip = async (driver: DriverRecord, trip: DriverTrip) => {
    if (actionLock.current) return;
    const description = `${driver.name}\n${trip.route?.name ?? 'Route unavailable'} · ${trip.bus ? getBusDisplayName(trip.bus) : 'Bus unavailable'}\n${formatDeparture(trip.scheduledStart)}`;
    if (!window.confirm(`Cancel this trip?\n\n${description}\n\nThis cancels the whole trip, not just the driver assignment. Other planned trips will remain.`)) return;
    actionLock.current = true;
    setPendingAction(trip.id);
    try {
      await updateTripStatus(trip.id, 'CANCELLED');
      setDrivers(list => list.map(item => item.id === driver.id ? { ...item, driverTrips: item.driverTrips?.filter(t => t.id !== trip.id) } : item));
      toast.success('Trip cancelled');
      await loadData();
    } catch (err) { toast.error(apiErrorMessage(err, 'Could not cancel the trip.')); }
    finally { actionLock.current = false; setPendingAction(null); }
  };

  const removeDriver = async (driver: DriverRecord) => {
    if (actionLock.current) return;
    if (!window.confirm(`Permanently delete ${driver.name} (${driver.email})?\n\nThis removes their driver account and cannot be undone.`)) return;
    actionLock.current = true;
    setPendingAction(driver.id);
    try {
      await deleteDriver(driver.id);
      setDrivers(list => list.filter(item => item.id !== driver.id));
      setExpandedId(null);
      toast.success('Driver deleted');
      await loadData();
    } catch (err) { toast.error(apiErrorMessage(err, 'Could not delete the driver.')); }
    finally { actionLock.current = false; setPendingAction(null); }
  };

  const copyCredentials = async () => {
    if (!credentials || copying) return;
    setCopying(true);
    setCopyError('');
    try {
      await navigator.clipboard.writeText(`Email: ${credentials.email}\nPassword: ${credentials.tempPassword}`);
      toast.success('Login details copied');
    } catch {
      setCopyError('Could not copy automatically. Select and copy the login details below, or try again.');
    } finally { setCopying(false); }
  };

  const visibleDrivers = drivers.filter(driver => matchesDriverSearch(driver, search) && (filter === 'all' || getDriverTrips(driver).activity === filter));
  const optionsError = [busError && `Buses: ${busError}`, routeError && `Routes: ${routeError}`].filter(Boolean).join(' ');

  return <div className="space-y-5 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-2xl font-bold tracking-tight text-slate-900">Drivers</h2><p className="mt-1 text-sm text-slate-500">Contact drivers and manage current and planned trips.</p></div>
      <button onClick={() => setDriverForm('new')} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"><User size={16} /> Add driver</button>
    </div>
    {driverError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p>Couldn’t load drivers. {driverError}</p>
      {drivers.length > 0 && <p className="mt-1">Showing the last loaded list. Refresh before changing assignments.</p>}
      <button disabled={refreshing} onClick={() => void loadData(true)} className="mt-2 font-semibold underline disabled:opacity-50">Retry loading drivers</button>
    </div>}
    <div className="flex flex-wrap items-end gap-3">
      <label htmlFor="driver-search" className="min-w-0 flex-1 basis-64 text-sm font-medium text-slate-700">Search drivers
        <div className="relative mt-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" aria-hidden="true" /><input id="driver-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, phone, bus or route" className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></div>
      </label>
      <label htmlFor="driver-filter" className="text-sm font-medium text-slate-700">Trip status
        <select id="driver-filter" value={filter} onChange={e => setFilter(e.target.value as DriverFilter)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="all">All drivers</option><option value="running">On trip</option><option value="planned">Trip planned (not running)</option><option value="unassigned">No trip assigned</option>
        </select>
      </label>
      <button disabled={refreshing} onClick={() => void loadData(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />{refreshing ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    {!loading && <p role="status" className="text-sm text-slate-500">Showing {visibleDrivers.length} of {drivers.length} drivers{driverError ? ' · last loaded data' : ''}</p>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600"><tr>
            <th scope="col" className="px-4 py-3">Driver</th><th scope="col" className="px-4 py-3">Contact</th><th scope="col" className="px-4 py-3">Trip status</th><th scope="col" className="px-4 py-3">Current / next trip</th><th scope="col" className="px-4 py-3 text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading drivers…</td></tr>
              : visibleDrivers.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">
                {driverError && !drivers.length ? 'Driver data is unavailable. Use Retry above.' : !drivers.length ? 'No drivers yet. Add a driver to get started.' : <><p>No drivers match your search or filter.</p><button onClick={() => { setSearch(''); setFilter('all'); }} className="mt-2 text-orange-700 underline">Clear search and filters</button></>}
              </td></tr>
                : visibleDrivers.map(driver => {
                  const { running, planned, primary, activity } = getDriverTrips(driver);
                  const trips = [...running, ...planned];
                  const expanded = expandedId === driver.id;
                  const isDelayed = running.some(trip => trip.status === 'DELAYED');
                  return <React.Fragment key={driver.id}>
                    <tr className="align-top hover:bg-slate-50/50">
                      <td className="px-4 py-4 font-semibold text-slate-900">{driver.name}</td>
                      <td className="px-4 py-4 text-slate-600">
                        {driver.phone ? <a href={`tel:${driver.phone.replace(/[^+\d]/g, '')}`} className="mb-1 inline-flex items-center gap-1.5 whitespace-nowrap text-orange-700 hover:underline"><Phone size={14} />{driver.phone}</a> : <p className="mb-1 text-xs text-slate-500">No phone number</p>}
                        <a href={`mailto:${driver.email}`} className="flex items-center gap-1.5 text-xs hover:underline"><Mail size={13} className="shrink-0" />{driver.email}</a>
                      </td>
                      <td className="px-4 py-4"><span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${isDelayed ? 'bg-amber-100 text-amber-800' : activity === 'running' ? 'bg-emerald-100 text-emerald-800' : activity === 'planned' ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>
                        {isDelayed ? 'On trip · delayed' : activity === 'running' ? 'On trip' : activity === 'planned' ? 'Trip planned' : 'No trip assigned'}
                      </span>{running.length > 0 && planned.length > 0 && <p className="mt-1 text-xs text-slate-500">{planned.length} planned</p>}</td>
                      <td className="px-4 py-4">{primary ? <>
                        <p className="font-medium text-slate-800">{primary.route?.name ?? 'Route unavailable'}</p>
                        <p className="mt-1 text-xs text-slate-600">{primary.bus ? getBusDisplayName(primary.bus) : 'Bus unavailable'}</p>
                        <p className="mt-1 text-xs text-slate-500">{activity === 'running' ? 'Running now' : formatDeparture(primary.scheduledStart)}</p>
                      </> : <span className="text-slate-500">No current or planned trips</span>}</td>
                      <td className="px-4 py-4"><div className="flex flex-wrap justify-end gap-2">
                        <button aria-expanded={expanded} aria-controls={`driver-trips-${driver.id}`} onClick={() => setExpandedId(expanded ? null : driver.id)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">{expanded ? 'Hide details' : trips.length ? `View trips (${trips.length})` : 'Details'}{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
                        <button onClick={() => setDriverForm(driver)} className="rounded-md px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-50">Edit driver</button>
                      </div></td>
                    </tr>
                    {expanded && <tr id={`driver-trips-${driver.id}`}><td colSpan={5} className="bg-slate-50 p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900">Trips for {driver.name}</h3>
                        <button disabled={running.length > 0 || !!driverError || !!pendingAction} onClick={() => setTripEditor({ driver })} className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Plan a trip</button>
                      </div>
                      {running.length > 0 && <p className="mb-3 text-xs text-slate-600">This driver is on a trip. You can plan another one after it finishes.</p>}
                      {!trips.length && <p className="py-2 text-sm text-slate-500">No current or planned trips. Choose “Plan a trip” to assign a bus and route.</p>}
                      <ul className="space-y-2">{trips.map(trip => <li key={trip.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                        <div><p className="font-medium text-slate-800">{trip.route?.name ?? 'Route unavailable'} · {trip.bus ? getBusDisplayName(trip.bus) : 'Bus unavailable'}</p>
                          <p className="mt-1 text-xs text-slate-600">{trip.status === 'PLANNED' ? 'Planned' : trip.status === 'DELAYED' ? 'On trip · delayed' : 'On trip'} · {formatDeparture(trip.scheduledStart)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {trip.status === 'PLANNED' && <button disabled={!!pendingAction || !!driverError} onClick={() => setTripEditor({ driver, trip })} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-50">Edit planned trip</button>}
                          <button disabled={!!pendingAction || !!driverError} onClick={() => void cancelTrip(driver, trip)} className="rounded-md px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">{pendingAction === trip.id ? 'Cancelling…' : 'Cancel trip'}</button>
                        </div>
                      </li>)}</ul>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                        <Link href="/schedules" className="text-xs text-orange-700 underline">Manage repeating schedules</Link>
                        <div className="text-right"><button disabled={trips.length > 0 || !!pendingAction || !!driverError} onClick={() => void removeDriver(driver)} className="rounded-md px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40">{pendingAction === driver.id ? 'Deleting…' : 'Delete driver permanently'}</button>
                          {trips.length > 0 && <p className="text-xs text-slate-500">Drivers with current or planned trips cannot be deleted.</p>}
                        </div>
                      </div>
                    </td></tr>}
                  </React.Fragment>;
                })}
          </tbody>
        </table>
      </div>
    </div>
    {driverForm && <DriverFormDialog driver={driverForm === 'new' ? undefined : driverForm} onClose={() => setDriverForm(null)} onSaved={details => {
      toast.success(driverForm === 'new' ? 'Driver added' : 'Driver updated');
      if (details) { setCredentials(details); setCopyError(''); }
      setDriverForm(null);
      void loadData();
    }} />}
    {tripEditor && <DriverTripDialog driver={drivers.find(driver => driver.id === tripEditor.driver.id) ?? tripEditor.driver} trip={tripEditor.trip} buses={buses} routes={routes}
      loading={optionsLoading} loadError={[driverError, optionsError].filter(Boolean).join(' ')} onRetry={() => void loadData(true)} onClose={() => setTripEditor(null)} onSaved={() => {
        toast.success(tripEditor.trip ? 'Planned trip updated' : 'Trip planned');
        setExpandedId(tripEditor.driver.id);
        setTripEditor(null);
        void loadData();
      }} />}
    {credentials && <DriverDialog title="Driver login details" busy={copying} onClose={() => setCredentials(null)}>
      <div className="space-y-4 p-6">
        <p className="text-sm text-slate-600">Share these details with the driver before closing. The temporary password is only shown now.</p>
        {copyError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{copyError}</p>}
        <dl className="select-text space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <div><dt className="text-slate-500">Email</dt><dd className="break-all font-semibold">{credentials.email}</dd></div>
          <div><dt className="text-slate-500">Temporary password</dt><dd className="break-all font-mono font-semibold">{credentials.tempPassword}</dd></div>
        </dl>
        <button disabled={copying} onClick={() => void copyCredentials()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Copy size={16} />{copying ? 'Copying…' : 'Copy login details'}</button>
        <button disabled={copying} onClick={() => setCredentials(null)} className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm">Done</button>
      </div>
    </DriverDialog>}
  </div>;
}
