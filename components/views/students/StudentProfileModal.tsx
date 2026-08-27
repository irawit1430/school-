import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { useClickOutside } from '@/hooks/useClickOutside';

interface StudentProfileModalProps {
  viewStudent: any;
  onClose: () => void;
}

export function StudentProfileModal({ viewStudent, onClose }: StudentProfileModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useClickOutside(modalRef, onClose);

  if (!viewStudent) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div ref={modalRef} className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-lg">Student Profile</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <img src={viewStudent.avatar} alt={viewStudent.name} className="w-16 h-16 rounded-full bg-slate-200 object-cover" />
            <div>
              <h4 className="font-bold text-xl text-slate-900">{viewStudent.name}</h4>
              <p className="text-sm font-medium text-slate-500">Grade: {viewStudent.grade || 'N/A'}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500 font-semibold text-sm">RFID Tag</span>
              <span className="text-slate-900 font-bold text-sm font-mono">{viewStudent.tag}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500 font-semibold text-sm">Assigned Route</span>
              <span className="text-slate-900 font-bold text-sm">{viewStudent.route}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500 font-semibold text-sm">Guardian Phone</span>
              <span className="text-slate-900 font-bold text-sm">{viewStudent.guardianPhone || 'N/A'}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500 font-semibold text-sm">Status</span>
              <span className={clsx(
                "px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider border",
                viewStudent.status === 'Boarded' && "bg-emerald-50 text-emerald-700 border-emerald-100",
                viewStudent.status === 'Not scanned' && "bg-slate-100 text-slate-600 border-slate-200",
                viewStudent.status === 'Dropped off' && "bg-orange-50 text-orange-700 border-orange-100"
              )}>{viewStudent.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-semibold text-sm">Last Check-In</span>
              <span className="text-slate-900 font-medium text-sm font-mono">{viewStudent.time}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
