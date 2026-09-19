import React, { useState, useEffect, useRef } from 'react';
import { updateTrip } from '@/lib/api';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useClickOutside } from '@/hooks/useClickOutside';
import { getBusDisplayName } from '@/lib/buses';
import { DirectionToggle } from '@/components/ui/DirectionToggle';
import type { Direction } from '@/lib/runs';

interface EditTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: any;
  buses: any[];
  drivers: any[];
  onSuccess: () => void;
}

// ─── Datetime-local helpers ──────────────────────────────────────────────────
//
// `datetime-local` inputs work in *local* wall-clock time. Putting a UTC ISO
// string like "2024-09-08T01:45" straight into the value field shows 01:45 to
// an Indian user instead of 07:15 — and the browser saves edits as that
// displayed (wrong) time. Always convert to/from local.

function toLocalDatetimeLocal(utcString: string): string {
  const d = new Date(utcString);
  const pad = (n: number) => String(n).padStart(2, '0');
  // Build YYYY-MM-DDTHH:mm from local date parts (not UTC)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function fromDatetimeLocalToISO(local: string): string {
  // Split manually so the Date constructor treats components as local time,
  // not as a UTC midnight string (what `new Date("2024-09-08T07:15")` does).
  const [datePart, timePart] = local.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, min] = timePart.split(':').map(Number);
  return new Date(y, mo - 1, d, h, min).toISOString();
}

// ────────────────────────────────────────────────────────────────────────────

export function EditTripModal({ isOpen, onClose, trip, buses, drivers, onSuccess }: EditTripModalProps) {
  const [busId, setBusId] = useState(trip?.busId || '');
  const [driverId, setDriverId] = useState(trip?.driverId || '');
  const [direction, setDirection] = useState<Direction | ''>(trip?.direction ?? '');
  const [directionError, setDirectionError] = useState('');
  const [scheduledStart, setScheduledStart] = useState(
    trip?.scheduledStart ? toLocalDatetimeLocal(trip.scheduledStart) : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Timezone abbreviation shown beside the input so the user knows what "07:15" means.
  const tzLabel = (() => {
    try {
      return Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
        .formatToParts(new Date())
        .find(p => p.type === 'timeZoneName')?.value ?? '';
    } catch {
      return '';
    }
  })();

  const modalRef = useRef<HTMLDivElement>(null);
  useClickOutside(modalRef, onClose);

  useEffect(() => {
    if (trip) {
      setBusId(trip.busId || '');
      setDriverId(trip.driverId || '');
      setDirection(trip.direction ?? '');
      setDirectionError('');
      setScheduledStart(
        trip.scheduledStart ? toLocalDatetimeLocal(trip.scheduledStart) : ''
      );
    }
  }, [trip]);

  if (!isOpen) return null;

  const formatOptions = (items: any[], labelFn: (item: any) => string) => {
    const available = items.filter(item => item.isAvailable !== false);
    const unavailable = items.filter(item => item.isAvailable === false);

    const mapOption = (item: any, isAvail: boolean) => ({
      value: item.id,
      label: (
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isAvail ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className={!isAvail ? 'text-slate-400' : ''}>{labelFn(item)}</span>
        </div>
      ),
      searchValue: labelFn(item),
    });

    return [
      ...available.map(item => mapOption(item, true)),
      ...unavailable.map(item => mapOption(item, false)),
    ];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip) return;

    // Legacy trips predate `direction` and come back null. Making the admin pick one
    // here is the only place that data gets fixed.
    if (!direction) {
      setDirectionError('Choose a direction.');
      return;
    }

    const data: any = {};
    if (direction !== trip.direction) data.direction = direction;
    if (busId !== trip.busId) data.busId = busId || null;
    if (driverId !== trip.driverId) data.driverId = driverId || null;

    // Compare in local-space so we don't spuriously mark unchanged
    const currentStart = trip.scheduledStart ? toLocalDatetimeLocal(trip.scheduledStart) : '';
    if (scheduledStart !== currentStart) {
      // Cleared field → explicit null (API supports it); non-empty → local→UTC
      data.scheduledStart = scheduledStart ? fromDatetimeLocalToISO(scheduledStart) : null;
    }

    if (Object.keys(data).length === 0) {
      toast.success('No changes made');
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      await updateTrip(trip.id, data);
      toast.success('Trip updated successfully');
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update trip');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div ref={modalRef} className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-lg">Edit Trip</h3>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Bus</label>
            <SearchableSelect
              options={formatOptions(buses, b => getBusDisplayName(b))}
              value={busId}
              onChange={setBusId}
              placeholder="Select a bus"
              disabled={isSubmitting}
              clearable
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Driver</label>
            <SearchableSelect
              options={formatOptions(drivers, d => d.name)}
              value={driverId}
              onChange={setDriverId}
              placeholder="Select a driver"
              disabled={isSubmitting}
              clearable
            />
          </div>
          <DirectionToggle
            name="edit-trip-direction"
            value={direction}
            error={directionError}
            disabled={isSubmitting}
            onChange={(next) => { setDirection(next); setDirectionError(''); }}
          />
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
              Scheduled Start
              {tzLabel && (
                <span className="text-[10px] font-normal text-slate-400">({tzLabel})</span>
              )}
            </label>
            <input
              type="datetime-local"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              value={scheduledStart}
              onChange={e => setScheduledStart(e.target.value)}
              disabled={isSubmitting}
            />
            <p className="text-[10px] text-slate-400 mt-1">Clear the field to remove the scheduled time.</p>
          </div>
          <div className="pt-4 flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors text-sm border border-slate-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg font-medium text-white bg-orange-600 hover:bg-orange-700 transition-colors text-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
