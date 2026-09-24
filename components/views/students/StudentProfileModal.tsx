/* eslint-disable @next/next/no-img-element -- Avatars include locally generated data URLs. */
import React from 'react';
import { STUDENT_STATUS_META, type StudentStatus } from '@/lib/students';
import { StudentDialog } from './StudentDialog';

interface StudentProfileModalProps {
  viewStudent: any;
  onClose: () => void;
  /** Present when the student has a parent account the office can reset. */
  onResetParentPassword?: () => void;
  resettingParent?: boolean;
}

export function StudentProfileModal({ viewStudent, onClose, onResetParentPassword, resettingParent = false }: StudentProfileModalProps) {
  if (!viewStudent) return null;
  const statusStyle = STUDENT_STATUS_META[viewStudent.status as StudentStatus] || STUDENT_STATUS_META['Not scanned'];
  const details = [
    { label: 'Student ID', value: viewStudent.tag || 'Not provided' },
    { label: 'Assigned Route', value: viewStudent.route || 'Unassigned' },
    { label: 'Pickup Stop', value: viewStudent.stopName || 'Not assigned' },
    { label: 'Pickup Time', value: viewStudent.stopTime || 'Not provided' },
    { label: 'Parent / Guardian', value: viewStudent.parentName || viewStudent.guardianName || 'Not provided' },
    { label: 'Parent Email', value: viewStudent.parentEmail || 'Not provided' },
    { label: 'Guardian Phone', value: viewStudent.guardianPhone || 'Not provided' },
    { label: 'Status', value: <span className={'inline-block rounded border px-2 py-0.5 text-xs font-bold ' + statusStyle.className}>{viewStudent.status || 'Not scanned'}</span> },
    { label: 'Last Event (IST)', value: viewStudent.time || '—' },
  ];

  return (
    <StudentDialog title="Student Profile" onClose={onClose} busy={resettingParent}>
      <div className="mb-6 flex items-center gap-4">
        {viewStudent.avatar && <img src={viewStudent.avatar} alt="" className="h-16 w-16 shrink-0 rounded-full bg-slate-200 object-cover" />}
        <div className="min-w-0">
          <h3 className="break-words text-xl font-bold text-slate-900">{viewStudent.name}</h3>
          <p className="text-sm font-medium text-slate-500">Grade: {viewStudent.grade || 'Not provided'}</p>
        </div>
      </div>
      <dl className="space-y-3">
        {details.map(detail => (
          <div key={detail.label} className="grid min-w-0 grid-cols-1 gap-1 border-b border-slate-100 pb-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] sm:gap-4">
            <dt className="text-sm font-semibold text-slate-500">{detail.label}</dt>
            <dd className="min-w-0 text-sm font-medium break-words text-slate-900 [overflow-wrap:anywhere] sm:text-right">{detail.value}</dd>
          </div>
        ))}
      </dl>
      {onResetParentPassword && (
        <div className="mt-6 border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs text-slate-500">Parent locked out? The parent signs in with the email above.</p>
          <button type="button" onClick={onResetParentPassword} disabled={resettingParent}
            className="w-full rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50">
            {resettingParent ? 'Creating…' : 'Reset parent password'}
          </button>
        </div>
      )}
    </StudentDialog>
  );
}
