import React, { useId } from 'react';

interface RouteStopPickerProps {
  routes: any[];
  routeId: string;
  routeStopId: string;
  onChange: (next: { routeId: string; routeStopId: string }) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Shown under the stop select — e.g. "this is the stop already assigned". */
  note?: React.ReactNode;
  required?: boolean;
}

/**
 * Route select plus its stop select, with the states that come with loading them.
 *
 * Shared by the registration form and the reassignment dialog. A child is attached to a
 * stop, never to a bus: the bus is whatever trip runs that route on the day, so there is
 * deliberately no bus field here to pick.
 */
export function RouteStopPicker({
  routes, routeId, routeStopId, onChange, loading = false, error, onRetry, note, required = false,
}: RouteStopPickerProps) {
  const id = useId();
  const selectedRoute = routes.find(route => route.id === routeId);
  const stops = selectedRoute?.stops || [];
  const star = required ? <span className="text-red-500" aria-hidden="true"> *</span> : null;

  if (loading) return <p role="status" className="text-sm text-slate-600">Loading pickup routes and stops...</p>;

  if (error) return (
    <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
      <p>{error}</p>
      {onRetry && <button type="button" onClick={onRetry} className="mt-2 font-semibold underline">Retry loading routes</button>}
    </div>
  );

  if (routes.length === 0) return (
    <div role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
      <p>No pickup routes are configured. Create a route with pickup stops in Routes, then reload this list.</p>
      {onRetry && <button type="button" onClick={onRetry} className="mt-2 font-semibold underline">Retry loading routes</button>}
    </div>
  );

  return (
    <>
      <div>
        <label htmlFor={id + '-route'} className="mb-1 block text-sm font-semibold text-slate-700">Select Route{star}</label>
        <select
          id={id + '-route'}
          name="routeId"
          required={required}
          value={routeId}
          onChange={event => onChange({ routeId: event.target.value, routeStopId: '' })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-50"
        >
          <option value="">Select a Route</option>
          {routes.map(route => <option key={route.id} value={route.id}>{route.name}</option>)}
        </select>
        {routeId && !selectedRoute && (
          <p role="status" className="mt-2 text-sm text-amber-800">The selected route is no longer available. Choose another route.</p>
        )}
      </div>

      {selectedRoute && (
        <div>
          <label htmlFor={id + '-stop'} className="mb-1 block text-sm font-semibold text-slate-700">Select Stop{star}</label>
          <select
            id={id + '-stop'}
            name="routeStopId"
            required={required}
            value={routeStopId}
            disabled={!stops.length}
            onChange={event => onChange({ routeId, routeStopId: event.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-50"
          >
            <option value="">Select a Stop</option>
            {stops.map((stop: any) => (
              <option key={stop.id} value={stop.id}>{stop.name}{stop.stopTime ? ' (' + stop.stopTime + ')' : ''}</option>
            ))}
          </select>
          {!stops.length && (
            <p role="status" className="mt-2 text-sm text-amber-800">No pickup stops are configured for this route. Add stops in Routes or select a different route.</p>
          )}
          {note}
        </div>
      )}
    </>
  );
}
