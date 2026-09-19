import React, { useId } from 'react';
import { StudentDialog } from './StudentDialog';
import type { StudentMapping } from '@/lib/students';

interface AssignBusModalProps {
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  assignStudent: any;
  assignFormData: any;
  setAssignFormData: (data: any) => void;
  isAssignSubmitting: boolean;
  routes: any[];
  /** The student's existing assignments. Empty means this is a new assignment. */
  mappings?: StudentMapping[];
  routesLoading?: boolean;
  routesError?: string | null;
  onRetryRoutes?: () => void;
  error?: string | null;
}

const legLabel = (direction: StudentMapping['direction']) =>
  direction === 'TO_SCHOOL' ? 'Morning (to school)'
  : direction === 'FROM_SCHOOL' ? 'Afternoon (from home)'
  : 'Both legs';

export function AssignBusModal({
  onClose, onSubmit, assignStudent, assignFormData, setAssignFormData, isAssignSubmitting, routes,
  mappings = [], routesLoading = false, routesError, onRetryRoutes, error,
}: AssignBusModalProps) {
  const id = useId();
  const selectedRoute = routes.find(route => route.id === assignFormData.routeId);
  const stops = selectedRoute?.stops || [];
  const selectedStop = stops.find((stop: any) => stop.id === assignFormData.routeStopId);

  const editing = mappings.find(mapping => mapping.id === assignFormData.mappingId) ?? null;
  // Moving to the stop the mapping already points at is a no-op write, not a change.
  const unchanged = !!editing && editing.routeStopId === assignFormData.routeStopId;
  const canSave = !!assignStudent?.id && !!selectedStop && !unchanged
    && !isAssignSubmitting && !routesLoading && !routesError;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (canSave) onSubmit(event);
  };

  const pickMapping = (mappingId: string) => {
    const next = mappings.find(mapping => mapping.id === mappingId);
    setAssignFormData({
      ...assignFormData,
      mappingId,
      routeId: next?.routeId ?? '',
      routeStopId: next?.routeStopId ?? '',
    });
  };

  return (
    <StudentDialog
      title={editing ? 'Change Pickup Route & Stop' : 'Assign Pickup Route & Stop'}
      onClose={onClose}
      busy={isAssignSubmitting}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-600">
          {editing
            ? 'Moves this assignment to another stop, on this route or a different one. The child keeps a single assignment — if the change fails, nothing moves.'
            : 'Creates a new stop assignment for journeys to and from school.'}
        </p>
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <p className="break-words font-semibold text-slate-900">{assignStudent?.name}</p>
          <p className="mt-1 break-all">
            Grade: {assignStudent?.grade || 'Not provided'}
            {assignStudent?.tag && assignStudent.tag !== 'N/A' ? ' · RFID: ' + assignStudent.tag : ''}
          </p>
        </div>
        {routesLoading && <p role="status" className="text-sm text-slate-600">Loading pickup routes and stops...</p>}
        {routesError && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <p>{routesError}</p>
          {onRetryRoutes && <button type="button" onClick={onRetryRoutes} disabled={isAssignSubmitting || routesLoading} className="mt-2 font-semibold underline disabled:opacity-50">Retry loading routes</button>}
        </div>}
        {!routesLoading && !routesError && routes.length === 0 && <div role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <p>No pickup routes are configured. Create a route with pickup stops in Routes, then reload this list.</p>
          {onRetryRoutes && <button type="button" onClick={onRetryRoutes} disabled={isAssignSubmitting} className="mt-2 font-semibold underline disabled:opacity-50">Retry loading routes</button>}
        </div>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <fieldset disabled={isAssignSubmitting || routesLoading || !!routesError} className="min-w-0 space-y-4">
          {/* A child with separate morning and afternoon stops holds two mappings; only
              one of them is being moved, so say which. */}
          {mappings.length > 1 && <div>
            <label htmlFor={id + '-mapping'} className="mb-1 block text-sm font-semibold text-slate-700">Which assignment</label>
            <select id={id + '-mapping'} value={assignFormData.mappingId || ''}
              onChange={event => pickMapping(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500">
              {mappings.map(mapping => <option key={mapping.id} value={mapping.id}>
                {legLabel(mapping.direction)} · {mapping.routeName} · {mapping.stopName}
              </option>)}
            </select>
          </div>}
          {editing && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <p>Currently: <span className="font-semibold text-slate-900">{editing.routeName} · {editing.stopName}</span></p>
            <p className="mt-1 text-xs text-slate-500">{legLabel(editing.direction)} — unchanged by this move.</p>
          </div>}
          <div>
            <label htmlFor={id + '-route'} className="mb-1 block text-sm font-semibold text-slate-700">Select Route <span className="text-red-500" aria-hidden="true">*</span></label>
            <select id={id + '-route'} required value={assignFormData.routeId} disabled={routes.length === 0}
              onChange={event => setAssignFormData({ ...assignFormData, routeId: event.target.value, routeStopId: '' })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-50">
              <option value="">Select a Route</option>
              {routes.map(route => <option key={route.id} value={route.id}>{route.name}</option>)}
            </select>
            {!routesLoading && !routesError && assignFormData.routeId && !selectedRoute && routes.length > 0 && <p role="status" className="mt-2 text-sm text-amber-800">The selected route is no longer available. Choose another route.</p>}
          </div>
          {selectedRoute && <div>
            <label htmlFor={id + '-stop'} className="mb-1 block text-sm font-semibold text-slate-700">Select Stop <span className="text-red-500" aria-hidden="true">*</span></label>
            <select id={id + '-stop'} required value={assignFormData.routeStopId} disabled={!stops.length}
              onChange={event => setAssignFormData({ ...assignFormData, routeStopId: event.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-50">
              <option value="">Select a Stop</option>
              {stops.map((stop: any) => <option key={stop.id} value={stop.id}>{stop.name}{stop.stopTime ? ' (' + stop.stopTime + ')' : ''}</option>)}
            </select>
            {!routesLoading && !routesError && !stops.length && <p role="status" className="mt-2 text-sm text-amber-800">No pickup stops are configured for this route. Add stops in Routes or select a different route.</p>}
            {unchanged && <p role="status" className="mt-2 text-sm text-slate-600">This is the stop already assigned. Pick a different one to move the child.</p>}
          </div>}
        </fieldset>
        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} disabled={isAssignSubmitting} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={!canSave} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-70">
            {isAssignSubmitting ? 'Saving...' : editing ? 'Move to This Stop' : 'Save Route & Stop'}
          </button>
        </div>
      </form>
    </StudentDialog>
  );
}
