import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';

interface AssignBusModalProps {
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  assignStudent: any;
  assignFormData: any;
  setAssignFormData: (data: any) => void;
  isAssignSubmitting: boolean;
  routes: any[];
}

export function AssignBusModal({
  onClose,
  onSubmit,
  assignStudent,
  assignFormData,
  setAssignFormData,
  isAssignSubmitting,
  routes
}: AssignBusModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useClickOutside(modalRef, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div ref={modalRef} className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-lg">
            Assign Bus / Route
          </h3>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Student Name
            </label>
            <input 
              type="text"
              disabled
              value={assignStudent?.name || ''}
              className="w-full px-3 py-2 border border-slate-200 bg-slate-50 text-slate-500 rounded-lg outline-none text-sm cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Select Route <span className="text-red-500">*</span>
            </label>
            <select 
              required
              value={assignFormData.routeId}
              onChange={(e) => setAssignFormData({...assignFormData, routeId: e.target.value, routeStopId: ''})}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
            >
              <option value="">Select a Route</option>
              {routes.map(route => (
                <option key={route.id} value={route.id}>{route.name}</option>
              ))}
            </select>
          </div>
          
          {assignFormData.routeId && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Select Stop <span className="text-red-500">*</span>
              </label>
              <select 
                required
                value={assignFormData.routeStopId}
                onChange={(e) => setAssignFormData({...assignFormData, routeStopId: e.target.value})}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
              >
                <option value="">Select a Stop</option>
                {routes.find((r: any) => r.id === assignFormData.routeId)?.stops?.map((stop: any) => (
                  <option key={stop.id} value={stop.id}>{stop.name} ({stop.stopTime})</option>
                ))}
              </select>
            </div>
          )}
          
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
              disabled={isAssignSubmitting || !assignFormData.routeStopId}
              className="px-4 py-2 rounded-lg font-medium text-white bg-orange-600 hover:bg-orange-700 transition-colors text-sm disabled:opacity-70 flex items-center gap-2"
            >
              {isAssignSubmitting ? 'Assigning...' : 'Confirm Assignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
