/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { fetchStudents, fetchTodayAttendance, createStudent, importStudentsCSV, fetchStats, fetchRoutes, assignStudentToStop, fetchNotifications, sendMessageToParent, apiErrorMessage } from '@/lib/api';
import { Download, Plus, Upload, Eye, Mail, AlertTriangle, Clock, Info, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import { SummaryCards } from './students/SummaryCards';
import { AddStudentModal } from './students/AddStudentModal';
import { ImportStudentsModal } from './students/ImportStudentsModal';
import { CredentialsPopup } from './students/CredentialsPopup';
import { AssignBusModal } from './students/AssignBusModal';
import { StudentProfileModal } from './students/StudentProfileModal';
import { MessageParentModal } from './students/MessageParentModal';
import { Skeleton } from '@/components/ui/Skeleton';
import { avatarFor } from '@/lib/avatar';

export function StudentsAttendance() {
  const [studentsData, setStudentsData] = useState<any[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [routes, setRoutes] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [formData, setFormData] = useState({ rfidTag: '', name: '', grade: '', parentEmail: '', parentName: '', guardianPhone: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [credentialsPopup, setCredentialsPopup] = useState<any>(null);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignStudent, setAssignStudent] = useState<any>(null);
  const [assignFormData, setAssignFormData] = useState({ routeId: '', routeStopId: '' });
  const [isAssignSubmitting, setIsAssignSubmitting] = useState(false);

  const [viewStudent, setViewStudent] = useState<any>(null);
  
  const [messageStudent, setMessageStudent] = useState<any>(null);
  const [messageForm, setMessageForm] = useState({ subject: '', body: '' });
  const [isMessageSubmitting, setIsMessageSubmitting] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  // Global search deep-links here as /students?q=<name>; same pattern the map uses.
  const [searchQuery, setSearchQuery] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('q') || '';
  });
  const [activeTab, setActiveTab] = useState('All Students');
  const itemsPerPage = 8;

  const loadData = () => {
    setLoading(true);
    setError(null);
    // Routes and notifications are not on the critical path — routes only fills the
    // Assign Bus dropdown, and the routes payload carries stops and trips. Waiting on
    // them held the whole table behind the slowest of five calls. They land when they
    // land; the table renders as soon as the students and their attendance are in.
    fetchRoutes().then(setRoutes).catch(err => console.warn('Failed to load routes', err));
    fetchNotifications().then(setNotifications).catch(err => console.warn('Failed to load alerts', err));

    Promise.all([fetchStudents(), fetchTodayAttendance(), fetchStats()])
      .then(([studentsRes, attendanceRes, statsRes]) => {
        setStudentsData(studentsRes);
        setAttendanceLogs(attendanceRes);
        setStats(statsRes);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load students/attendance:', err);
        setError('Failed to load data. Please refresh the page.');
        toast.error(apiErrorMessage(err, 'Failed to load students data.'));
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAssign = (student: any) => {
    setAssignStudent(student);
    setAssignFormData({ routeId: '', routeStopId: '' });
    setIsAssignModalOpen(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignStudent) return;
    
    setIsAssignSubmitting(true);
    try {
      await assignStudentToStop({
        studentId: assignStudent.id,
        routeStopId: assignFormData.routeStopId
      });
      toast.success('Bus assigned successfully!');
      setIsAssignModalOpen(false);
      loadData();
    } catch (err) {
      console.error('Failed to assign student', err);
      toast.error(apiErrorMessage(err, 'Failed to assign student.'));
    } finally {
      setIsAssignSubmitting(false);
    }
  };

  const handleMessageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageStudent) return;
    setIsMessageSubmitting(true);
    
    try {
      // Call actual backend API
      await sendMessageToParent(messageStudent.parentId, messageForm.subject, messageForm.body);
      
      setMessageStudent(null);
      setMessageForm({ subject: '', body: '' });
      toast.success('Message sent to parent successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send message');
    } finally {
      setIsMessageSubmitting(false);
    }
  };

  const handleOpenCreate = () => {
    setFormData({ rfidTag: '', name: '', grade: '', parentEmail: '', parentName: '', guardianPhone: '' });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        rfidTag: formData.rfidTag,
        name: formData.name,
        grade: formData.grade || undefined,
        parentEmail: formData.parentEmail || undefined,
        parentName: formData.parentName || undefined,
        guardianPhone: formData.guardianPhone || undefined
      };
      
      const res = await createStudent(payload);
      toast.success('Student registered successfully!');
      setIsModalOpen(false);
      loadData();
      
      if (res.parentCredentials) {
        setCredentialsPopup(res.parentCredentials);
      }
    } catch (err) {
      console.error('Failed to save student', err);
      toast.error(apiErrorMessage(err, 'Failed to register student.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportCSV = async (file: File) => {
    try {
      setIsSubmitting(true);
      const res = await importStudentsCSV(file);
      toast.success(res.message || 'Students imported successfully!');
      setIsImportModalOpen(false);
      loadData();
      if (res.parentCredentials && Array.isArray(res.parentCredentials) && res.parentCredentials.length > 0) {
        setCredentialsPopup(res.parentCredentials);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to import students');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportCSV = () => {
    if (studentsData.length === 0) return toast.error('No data to export');
    
    const headers = ['Name', 'Grade', 'RFID Tag', 'Assigned Route', 'Status', 'Last Check-In'];
    const escape = (v: any) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return `"${/^[=+\-@]/.test(s) ? `'${s}` : s}"`;
    };
    const rows = allProcessedStudents.map(s => [
      escape(s.name), 
      escape(s.grade || ''), 
      escape(s.tag), 
      escape(s.route), 
      escape(s.status), 
      escape(s.time)
    ]);
    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `students_attendance_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Export downloaded!');
  };

  // ─── DATA PROCESSING (Memoized) ─────────────────────────
  //
  // boardingStatus is 'BOARDED' | 'ALIGHTED' | null. Null means no scan yet today —
  // genuinely unknown, NOT absent. A child who has not boarded at 06:40 and a child who
  // failed to board at 08:20 are the same null, and calling either one "Absent" is a
  // claim the data does not support. (This column used to be the hardcoded string
  // 'Absent' for every student in every school, so it was never true at all.)
  const { allProcessedStudents, totalStudents, boardedCount, alightedCount, notScannedCount, noShowCount, onLeaveCount } = useMemo(() => {
    let bCount = 0;
    let aCount = 0;
    let unknownCount = 0;
    let noShow = 0;
    let leave = 0;

    const byStudent = new Map<string, any>();
    for (const log of attendanceLogs) {
      const key = log.studentId || log.student?.id;
      if (key) byStudent.set(key, log);
    }

    const processed = studentsData.map(s => {
      const todayLog = byStudent.get(s.id);

      // Prefer the row's own summary; fall back to today's log for older payloads.
      const raw = s.boardingStatus ?? todayLog?.type ?? null;
      // Approved leave is its own fact, not a kind of absence. A child the school
      // already excused must never read the same as one who failed to board — that
      // conflation is what the "Leave & Absences" tab used to do while never once
      // loading a leave.
      const status = raw === 'BOARDED' ? 'Boarded'
                   : raw === 'ALIGHTED' ? 'Dropped off'
                   : raw === 'NO_SHOW' ? 'Did not board'
                   : s.onLeave ? 'On leave'
                   : 'Not scanned';

      // Rendered in the viewer's timezone, while the server scopes "today" to its own
      // (TZ=Asia/Kolkata). Those agree for an admin sitting in the school, which is
      // every real user — but they are two assumptions, not one. If the platform ever
      // takes a school outside IST, this formatting moves with the server's day
      // boundary and the Run scheduler's weekday patterns, as one change.
      const stamp = s.lastCheckIn || todayLog?.timestamp || null;
      const parsed = stamp ? new Date(stamp) : null;
      const time = parsed && !isNaN(parsed.getTime())
        ? parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '—';

      const routeName = s.assignedRoute || s.routeMappings?.[0]?.routeStop?.route?.name || 'Unassigned';

      if (status === 'Boarded') bCount++;
      else if (status === 'Dropped off') aCount++;
      else if (status === 'Did not board') noShow++;
      else if (status === 'On leave') leave++;
      else unknownCount++;

      return {
        id: s.id,
        name: s.name,
        tag: s.rfidTag || 'N/A',
        grade: s.grade,
        route: routeName,
        status,
        onLeave: !!s.onLeave,
        parentId: s.parentId || s.parent?.id,
        // parentPhone is the primary number; guardianPhone is the schema's own fallback
        // for families with no parent account.
        guardianPhone: s.parentPhone || s.guardianPhone || '',
        parentName: s.parentName || '',
        time,
        avatar: s.photoUrl || avatarFor(s.name)
      };
    });

    return {
      allProcessedStudents: processed,
      totalStudents: stats?.totalStudents ?? studentsData.length ?? 0,
      boardedCount: bCount,
      alightedCount: aCount,
      notScannedCount: unknownCount,
      noShowCount: noShow,
      onLeaveCount: leave
    };
  }, [studentsData, attendanceLogs, stats]);

  const filteredStudents = useMemo(() => {
    return allProcessedStudents.filter(student => {
      // 1. Tab Filtering
      if (activeTab === 'Currently Boarded' && student.status !== 'Boarded') return false;
      if (activeTab === 'Not Scanned' && student.status !== 'Not scanned') return false;
      if (activeTab === 'Did Not Board' && student.status !== 'Did not board') return false;

      // 2. Search Filtering
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          String(student.name || '').toLowerCase().includes(query) ||
          String(student.tag || '').toLowerCase().includes(query) ||
          String(student.route || '').toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [allProcessedStudents, activeTab, searchQuery]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery]);

  // "Currently boarded" means on a bus right now — a child who has been dropped off is
  // not on one, so they are counted separately rather than folded in.
  const presentCount = boardedCount;
  const dynamicAttendanceData = [
    { name: 'Boarded', value: boardedCount, color: '#3b82f6' },
    { name: 'Dropped off', value: alightedCount, color: '#10b981' },
    { name: 'Did not board', value: noShowCount, color: '#ef4444' },
    { name: 'On leave', value: onLeaveCount, color: '#a855f7' },
    { name: 'Not scanned', value: notScannedCount, color: '#94a3b8' }
  ].filter(d => d.value > 0);
  const boardedPercentage = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-start mb-6">
          <div><Skeleton className="h-6 w-48 mb-2"/><Skeleton className="h-4 w-64"/></div>
          <div className="flex gap-3"><Skeleton className="h-10 w-48"/><Skeleton className="h-10 w-40"/></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Skeleton className="h-32 col-span-1 md:col-span-2 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-[60vh]">
        <div className="text-red-500 mb-4"><AlertTriangle size={48} /></div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
        <p className="text-slate-500 mb-6">{error}</p>
        <button onClick={loadData} className="px-6 py-2 bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-700 transition-colors">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Students & Attendance</h2>
          <p className="text-slate-500 mt-1">Monitor real-time boarding status and daily attendance records.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 px-4 py-2.5 border border-slate-200 rounded-lg transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <Download size={16} /> Export Attendance Report
          </button>
          <button 
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 px-4 py-2.5 border border-slate-200 rounded-lg transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <Upload size={16} /> Bulk Import
          </button>
          <button 
            onClick={handleOpenCreate}
            className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
          >
            <Plus size={18} /> Add New Student
          </button>
        </div>
      </div>

      <SummaryCards 
        totalStudents={totalStudents}
        stats={stats}
        presentCount={presentCount}
        boardedPercentage={boardedPercentage}
        notScannedCount={notScannedCount}
        dynamicAttendanceData={dynamicAttendanceData}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {/* Tabs & Search */}
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
             <div className="flex items-center gap-6 overflow-x-auto">
               {['All Students', 'Currently Boarded', 'Did Not Board', 'Not Scanned'].map((tab) => (
                  <button 
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={clsx(
                      "text-sm font-semibold pb-4 -mb-4 border-b-2 transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-orange-500 rounded",
                      activeTab === tab ? "text-orange-600 border-orange-600" : "text-slate-500 border-transparent hover:text-slate-900"
                    )}
                  >
                    {tab}
                  </button>
                ))}
             </div>
             <div className="relative w-full sm:w-64">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
               <input 
                 type="text"
                 placeholder="Search students..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
               />
             </div>
          </div>
          <div className="overflow-x-auto p-2 flex-1">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500 font-semibold text-xs tracking-wider">
                <tr>
                  <th className="px-4 py-3">Student Name</th>
                  <th className="px-4 py-3">Grade</th>
                  <th className="px-4 py-3">Assigned Route</th>
                  <th className="px-4 py-3">Boarding Status</th>
                  <th className="px-4 py-3">Last Check-In</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredStudents.length > 0 ? (
                  filteredStudents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((student: any) => (
                    <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img src={student.avatar} alt={student.name} className="w-10 h-10 rounded-full bg-slate-200 object-cover" />
                          <div>
                            <p className="font-bold text-slate-900">{student.name}</p>
                            <p className="text-[10px] text-slate-500 font-mono">ID: {student.tag}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-600">{student.grade}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{student.route}</td>
                      <td className="px-4 py-3">
                        <span className={clsx(
                          "px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider inline-flex items-center border",
                          student.status === 'Boarded' && "bg-emerald-50 text-emerald-700 border-emerald-100",
                          student.status === 'Not scanned' && "bg-slate-100 text-slate-600 border-slate-200",
                          student.status === 'Did not board' && "bg-red-50 text-red-700 border-red-100",
                          student.status === 'On leave' && "bg-purple-50 text-purple-700 border-purple-100",
                          student.status === 'Dropped off' && "bg-orange-50 text-orange-700 border-orange-100"
                        )}>
                          {student.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{student.time}</td>
                      <td className="px-4 py-3 text-right">
                         <div className="flex items-center justify-end gap-2 text-slate-500">
                           <button 
                             onClick={() => handleOpenAssign(student)}
                             className="text-xs font-semibold text-orange-600 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-md transition-colors mr-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                           >
                             Assign Bus
                           </button>
                           <button 
                             onClick={() => setViewStudent(student)}
                             aria-label="View Student" 
                             className="p-1.5 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500"
                           >
                             <Eye size={18} />
                           </button>
                           <button 
                             onClick={() => setMessageStudent(student)}
                             aria-label="Message Parent" 
                             className="p-1.5 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500"
                           >
                             <Mail size={18} />
                           </button>
                         </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                      No students found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-slate-50 flex items-center justify-between text-sm text-slate-500 mt-auto">
            <span>Showing {filteredStudents.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to {Math.min(currentPage * itemsPerPage, filteredStudents.length)} of {filteredStudents.length} students</span>
            <div className="flex gap-1">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-8 h-8 flex items-center justify-center rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-orange-500">&lt;</button>
              <button onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredStudents.length / itemsPerPage), p + 1))} disabled={currentPage >= Math.ceil(filteredStudents.length / itemsPerPage) || filteredStudents.length === 0} className="w-8 h-8 flex items-center justify-center rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-orange-500">&gt;</button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-6">Attendance Summary</h3>
            
            {/* CSS Donut Chart */}
            {(() => {
              const bPct = Math.round((boardedCount / totalStudents) * 100) || 0;
              const sPct = Math.round((alightedCount / totalStudents) * 100) || 0;
              const donutStyle = { background: `conic-gradient(#3b82f6 ${bPct}%, #10b981 0 ${bPct + sPct}%, #94a3b8 0)` };
              return (
                <div className="flex justify-center mb-6">
                  <div className="w-40 h-40 rounded-full flex items-center justify-center" style={donutStyle}>
                    <div className="w-32 h-32 bg-white rounded-full flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold text-slate-900">{boardedPercentage}%</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Boarded</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="mt-6 space-y-2">
               {dynamicAttendanceData.map((item: any, i: number) => (
                 <div key={i} className="flex items-center justify-between text-sm">
                   <div className="flex items-center gap-2">
                     <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></div>
                     <span className="font-medium text-slate-700">{item.name}</span>
                   </div>
                   <span className="font-bold text-slate-900">{item.value}</span>
                 </div>
               ))}
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4">Recent Alerts</h3>
            <div className="space-y-3">
              {notifications.length > 0 ? notifications.map((alert: any) => (
                <div key={alert.id} className={clsx(
                  "p-3 rounded-lg border flex gap-3",
                  alert.type === 'error' ? "bg-red-50/50 border-red-100" :
                  alert.type === 'warning' ? "bg-amber-50/50 border-amber-100" :
                  "bg-orange-50/50 border-orange-100"
                )}>
                   <div className={clsx(
                     "mt-0.5",
                     alert.type === 'error' ? "text-red-500" :
                     alert.type === 'warning' ? "text-amber-500" :
                     "text-orange-500"
                   )}>
                     {alert.type === 'error' ? <AlertTriangle size={16} /> :
                      alert.type === 'warning' ? <Clock size={16} /> :
                      <Info size={16} />}
                   </div>
                   <div>
                     <p className={clsx(
                       "text-sm font-bold",
                       alert.type === 'error' ? "text-red-900" :
                       alert.type === 'warning' ? "text-amber-900" :
                       "text-orange-900"
                     )}>{alert.title}</p>
                     <p className={clsx(
                       "text-xs font-medium mt-0.5",
                       alert.type === 'error' ? "text-red-700" :
                       alert.type === 'warning' ? "text-amber-700" :
                       "text-orange-700"
                     )}>{alert.message || alert.desc}</p>
                   </div>
                </div>
              )) : (
                <p className="text-sm text-slate-500 py-4 text-center">No recent alerts</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {isAssignModalOpen && (
        <AssignBusModal
          onClose={() => setIsAssignModalOpen(false)}
          onSubmit={handleAssignSubmit}
          assignStudent={assignStudent}
          assignFormData={assignFormData}
          setAssignFormData={setAssignFormData}
          isAssignSubmitting={isAssignSubmitting}
          routes={routes}
        />
      )}

      {isModalOpen && (
        <AddStudentModal
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleSubmit}
          formData={formData}
          setFormData={setFormData}
          isSubmitting={isSubmitting}
        />
      )}

      {isImportModalOpen && (
        <ImportStudentsModal
          onClose={() => setIsImportModalOpen(false)}
          onImport={handleImportCSV}
          isSubmitting={isSubmitting}
        />
      )}

      <CredentialsPopup
        credentialsPopup={credentialsPopup}
        setCredentialsPopup={setCredentialsPopup}
      />

      <StudentProfileModal
        viewStudent={viewStudent}
        onClose={() => setViewStudent(null)}
      />

      <MessageParentModal
        messageStudent={messageStudent}
        onClose={() => setMessageStudent(null)}
        onSubmit={handleMessageSubmit}
        messageForm={messageForm}
        setMessageForm={setMessageForm}
        isMessageSubmitting={isMessageSubmitting}
      />
    </div>
  );
}
