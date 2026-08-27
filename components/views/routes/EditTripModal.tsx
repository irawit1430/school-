import React, { useState, useEffect, useRef } from 'react';
import { updateTrip } from '@/lib/api';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useClickOutside } from '@/hooks/useClickOutside';

interface EditTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: any;
  buses: any[];
  drivers: any[];
  onSuccess: () => void;
}

export function EditTripModal({ isOpen, onClose, trip, buses, drivers, onSuccess }: EditTripModalProps) {
  const [busId, setBusId] = useState(trip?.busId || '');
  const [driverId, setDriverId] = useState(trip?.driverId || '');
  const [scheduledStart, setScheduledStart] = useState(
    trip?.scheduledStart ? new Date(trip.scheduledStart).toISOString().slice(0, 16) : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  useClickOutside(modalRef, onClose);

  useEffect(() => {
    if (trip) {
      setBusId(trip.busId || '');
      setDriverId(trip.driverId || '');
      setScheduledStart(
        trip.scheduledStart ? new Date(trip.scheduledStart).toISOString().slice(0, 16) : ''
      );
    }
  }, [trip]);

  if (!isOpen) return null;

  const formatOptions = (items: any[], labelField: string) => {
    const available = items.filter(item => item.isAvailable !== false);
    const unavailable = items.filter(item => item.isAvailable === false);

    const mapOption = (item: any, isAvail: boolean) => ({
      value: item.id,
      label: (
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isAvail ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className={!isAvail ? 'text-slate-400' : ''}>{item[labelField]}</span>
        </div>
      ),
      searchValue: item[labelField]
    });

    return [
      ...available.map(item => mapOption(item, true)),
      ...unavailable.map(item => mapOption(item, false))
    ];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip) return;

    const data: any = {};
    if (busId !== trip.busId) data.busId = busId;
    if (driverId !== trip.driverId) data.driverId = driverId;
    
    // Only compare if scheduledStart is different
    const currentStart = trip.scheduledStart ? new Date(trip.scheduledStart).toISOString().slice(0, 16) : '';
    if (scheduledStart !== currentStart) {
      data.scheduledStart = scheduledStart ? new Date(scheduledStart).toISOString() : undefined;
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
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Bus
            </label>
            <SearchableSelect 
              options={formatOptions(buses, 'registrationNumber')}
              value={busId}
              onChange={setBusId}
              placeholder="Select a bus"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Driver
            </label>
            <SearchableSelect 
              options={formatOptions(drivers, 'name')}
              value={driverId}
              onChange={setDriverId}
              placeholder="Select a driver"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Scheduled Start
            </label>
            <input 
              type="datetime-local" 
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)}
            />
          </div>
          <div className="pt-4 flex gap-3 justify-end">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors text-sm border border-slate-200"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg font-medium text-white bg-orange-600 hover:bg-orange-700 transition-colors text-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
