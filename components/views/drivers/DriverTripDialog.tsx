import React, { useState } from 'react';
import Link from 'next/link';
import { apiErrorMessage, createTrip, updateTrip } from '@/lib/api';
import { getBusDisplayName } from '@/lib/buses';
import { getDriverTrips, toLocalDateTime, type DriverBus, type DriverRecord, type DriverTrip } from '@/lib/drivers';
import { DriverDialog } from './DriverDialog';
import { DirectionToggle } from '@/components/ui/DirectionToggle';
import type { Direction } from '@/lib/runs';

export function DriverTripDialog({ driver, trip, buses, routes, loading, loadError, onRetry, onClose, onSaved }: {
  driver: DriverRecord; trip?: DriverTrip; buses: DriverBus[]; routes: { id: string; name: string }[];
  loading: boolean; loadError: string; onRetry: () => void; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<{ busId: string; routeId: string; direction: Direction | ''; departure: string }>({ busId: trip?.busId ?? trip?.bus?.id ?? '', routeId: trip?.routeId ?? trip?.route?.id ?? '', direction: trip?.direction ?? '', departure: toLocalDateTime(trip?.scheduledStart) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
  const blocked = loading || !!loadError || !buses.length || !routes.length;
  const plannedCount = getDriverTrips(driver).planned.length;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || blocked) return;
    if (!form.direction) { setError('Choose a direction for this trip.'); return; }
    setSaving(true);
    setError('');
    try {
      if (trip) {
        // Send only edits: an untouched date must not lose seconds or its timezone.
        const changes = {
          ...(form.busId !== trip.busId ? { busId: form.busId } : {}),
          ...(form.routeId !== trip.routeId ? { routeId: form.routeId } : {}),
          ...(form.direction !== trip.direction ? { direction: form.direction } : {}),
          ...(form.departure !== toLocalDateTime(trip.scheduledStart) ? { scheduledStart: form.departure ? new Date(form.departure).toISOString() : null } : {}),
        };
        if (!Object.keys(changes).length) { onClose(); return; }
        await updateTrip(trip.id, changes);
      } else {
        await createTrip({ busId: form.busId, routeId: form.routeId, driverId: driver.id, direction: form.direction,
          ...(form.departure ? { scheduledStart: new Date(form.departure).toISOString() } : {}) });
      }
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save the trip. Please try again.'));
    } finally { setSaving(false); }
  };

  return <DriverDialog title={trip ? 'Edit planned trip' : 'Plan a one-time trip'} busy={saving} onClose={onClose}>
    <form onSubmit={save} className="space-y-4 p-6">
      <p className="text-sm">Driver: <strong>{driver.name}</strong></p>
      {!trip && plannedCount > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This driver already has {plannedCount} planned {plannedCount === 1 ? 'trip' : 'trips'}. Check the departure times before adding another.</p>}
      {(error || loadError) && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error || loadError}{loadError && <button type="button" disabled={loading} onClick={onRetry} className="ml-2 underline">Retry loading options</button>}</div>}
      {loading && <p role="status" className="text-sm text-slate-500">Loading buses and routes…</p>}
      {!loading && !loadError && (!buses.length || !routes.length) && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        {!buses.length && <><Link href="/buses" className="underline">Add a bus</Link> before planning a trip. </>}
        {!routes.length && <><Link href="/routes" className="underline">Create a route</Link> before planning a trip.</>}
      </p>}
      <label htmlFor="trip-bus" className="block text-sm font-semibold">Bus
        <select id="trip-bus" required value={form.busId} disabled={saving || blocked} onChange={e => setForm({ ...form, busId: e.target.value })} className={inputClass}>
          <option value="">Choose a bus</option>
          {form.busId && !buses.some(bus => bus.id === form.busId) && <option value={form.busId}>{trip?.bus ? getBusDisplayName(trip.bus) : 'Previously selected bus'}</option>}
          {buses.map(bus => <option key={bus.id} value={bus.id}>{getBusDisplayName(bus)}{bus.capacity ? ` · ${bus.capacity} seats` : ''}{bus.isAvailable === false ? ' · Has trips assigned' : ''}</option>)}
        </select>
      </label>
      <label htmlFor="trip-route" className="block text-sm font-semibold">Route
        <select id="trip-route" required value={form.routeId} disabled={saving || blocked} onChange={e => setForm({ ...form, routeId: e.target.value })} className={inputClass}>
          <option value="">Choose a route</option>
          {form.routeId && !routes.some(route => route.id === form.routeId) && <option value={form.routeId}>{trip?.route?.name ?? 'Previously selected route'}</option>}
          {routes.map(route => <option key={route.id} value={route.id}>{route.name}</option>)}
        </select>
      </label>
      <DirectionToggle
        name="driver-trip-direction"
        value={form.direction}
        disabled={saving || blocked}
        onChange={direction => { setForm({ ...form, direction }); setError(''); }}
      />
      <label htmlFor="trip-departure" className="block text-sm font-semibold">Departure <span className="font-normal text-slate-500">(optional, local time)</span>
        <input id="trip-departure" type="datetime-local" value={form.departure} disabled={saving} onChange={e => setForm({ ...form, departure: e.target.value })} className={inputClass} />
      </label>
      <p className="text-sm text-slate-500">{form.departure ? 'The driver starts the trip from their app.' : 'No departure time is set. The trip will stay planned until the driver starts it.'} For repeating trips, use <Link href="/schedules" className="text-orange-700 underline">Schedules</Link>.</p>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={saving || blocked} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : trip ? 'Save trip' : 'Create planned trip'}</button>
      </div>
    </form>
  </DriverDialog>;
}
