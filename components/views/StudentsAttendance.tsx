"use client";
import React, { useState, useEffect } from 'react';
import { students as mockStudents, studentAlerts } from '@/lib/mock-data';
import { fetchStudents, fetchTodayAttendance, createStudent, fetchStats, fetchRoutes, assignStudentToStop } from '@/lib/api';
import { Download, Plus, Eye, Mail, AlertTriangle, Clock, Info, X, CheckCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

export function StudentsAttendance() {
  const [studentsData, setStudentsData] = useState<any[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ rfidTag: '', name: '', grade: '', parentEmail: '', parentName: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [credentialsPopup, setCredentialsPopup] = useState<{email: string, temporaryPassword: string} | null>(null);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignStudent, setAssignStudent] = useState<any>(null);
  const [assignFormData, setAssignFormData] = useState({ routeId: '', routeStopId: '' });
  const [isAssignSubmitting, setIsAssignSubmitting] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([fetchStudents(), fetchTodayAttendance(), fetchStats(), fetchRoutes()])
      .then(([studentsRes, attendanceRes, statsRes, routesRes]) => {
        setStudentsData(studentsRes);
        setAttendanceLogs(attendanceRes);
        setStats(statsRes);
        setRoutes(routesRes);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load students/attendance:', err);
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
      setIsAssignModalOpen(false);
      loadData();
    } catch (err) {
      console.error('Failed to assign student', err);
      alert('Failed to assign student. Please try again.');
    } finally {
      setIsAssignSubmitting(false);
    }
  };

  const handleOpenCreate = () => {
    setFormData({ rfidTag: '', name: '', grade: '', parentEmail: '', parentName: '' });
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
        parentName: formData.parentName || undefined
      };
      
      const res = await createStudent(payload);
      setIsModalOpen(false);
      loadData();
      
      if (res.parentCredentials) {
        setCredentialsPopup(res.parentCredentials);
      }
    } catch (err) {
      console.error('Failed to save student', err);
      alert('Failed to register student. Please check if RFID tag is unique and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine actual display data
  const totalStudents = stats?.totalStudents ?? studentsData.length ?? 450;
  
  // Pre-calculate attendance logs map to avoid O(n^2) lookup
  const attendanceLogsMap = new Map();
  if (attendanceLogs) {
    for (const log of attendanceLogs) {
      const sId = log.studentId || log.student?.id;
      if (sId && !attendanceLogsMap.has(sId)) {
        attendanceLogsMap.set(sId, log);
      }
    }
  }

  // Calculate attendance status per student
  const displayStudents = studentsData.map(s => {
    const todayLog = attendanceLogsMap.get(s.id);
    let status = 'Absent';
    let time = '--:--';
    if (todayLog) {
      status = todayLog.type === 'BOARDED' ? 'Boarded' : 'At School';
      time = new Date(todayLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const routeName = s.assignedRoute || s.routeMappings?.[0]?.routeStop?.route?.name || 'Unassigned';

    return {
      id: s.id,
      name: s.name,
      tag: s.rfidTag || 'N/A',
      grade: s.grade,
      route: routeName,
      status: s.boardingStatus || status,
      time: s.lastCheckIn !== '--:--' && s.lastCheckIn ? s.lastCheckIn : time,
      avatar: s.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&background=random`
    };
  });

  const boardedCount = displayStudents.filter(s => s.status === 'Boarded').length;
  const atSchoolCount = displayStudents.filter(s => s.status === 'At School').length;
  const absentCount = displayStudents.filter(s => s.status === 'Absent').length;
  const presentCount = boardedCount + atSchoolCount;

  const dynamicAttendanceData = [
    { name: 'Boarded', value: boardedCount, color: '#3b82f6' },
    { name: 'At School', value: atSchoolCount, color: '#10b981' },
    { name: 'Absent', value: absentCount, color: '#94a3b8' }
  ].filter(d => d.value > 0);

  const boardedPercentage = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Students & Attendance</h2>
          <p className="text-slate-500 mt-1">Monitor real-time boarding status and daily attendance records.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 px-4 py-2.5 border border-slate-200 rounded-lg transition-colors shadow-sm">
            <Download size={16} /> Export Attendance Report
          </button>
          <button 
            onClick={handleOpenCreate}
            className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus size={18} /> Add New Student
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm col-span-1 md:col-span-2 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-semibold text-slate-500">Total Students</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-bold text-slate-900">{totalStudents}</span>
                <span className="text-sm font-bold text-emerald-500">+12%</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-500">Currently Boarded</p>
              <div className="flex items-baseline gap-2 mt-1 justify-end">
                <span className="text-4xl font-bold text-slate-900">{presentCount || 382}</span>
                <span className="text-sm font-medium text-slate-500">{boardedPercentage}% of total</span>
              </div>
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div className="bg-orange-600 h-2 rounded-full" style={{ width: `${boardedPercentage}%` }}></div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
           <p className="text-sm font-semibold text-slate-500">Absent Today</p>
           <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl font-bold text-slate-900">{absentCount || 14}</span>
           </div>
           <p className="text-xs text-slate-400 font-medium text-right underline cursor-pointer">Leave Tracking</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
           <p className="text-sm font-semibold text-slate-500">Late Arrivals</p>
           <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl font-bold text-red-600">5</span>
           </div>
           <p className="text-xs text-red-500 font-bold text-right cursor-pointer">Route Flags</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center gap-6">
             {['All Students', 'Currently Boarded', 'Leave & Absences'].map((tab, i) => (
                <button 
                  key={tab}
                  className={clsx(
                    "text-sm font-semibold pb-4 -mb-4 border-b-2 transition-colors",
                    i === 0 ? "text-orange-600 border-orange-600" : "text-slate-500 border-transparent hover:text-slate-900"
                  )}
                >
                  {tab}
                </button>
              ))}
          </div>
          <div className="overflow-x-auto p-2">
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
                {displayStudents.map((student: any) => (
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
                        student.status === 'Absent' && "bg-slate-100 text-slate-600 border-slate-200",
                        student.status === 'Delayed' && "bg-amber-50 text-amber-700 border-amber-100",
                        student.status === 'At School' && "bg-orange-50 text-orange-700 border-orange-100"
                      )}>
                        {student.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{student.time}</td>
                    <td className="px-4 py-3 text-right">
                       <div className="flex items-center justify-end gap-2 text-slate-400">
                         <button 
                           onClick={() => handleOpenAssign(student)}
                           className="text-xs font-semibold text-orange-600 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-md transition-colors mr-2"
                         >
                           Assign Bus
                         </button>
                         <button className="p-1.5 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"><Eye size={18} /></button>
                         <button className="p-1.5 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"><Mail size={18} /></button>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-slate-50 flex items-center justify-between text-sm text-slate-500">
            <span>Showing 5 of 450 students</span>
            <div className="flex gap-1">
              <button className="w-8 h-8 flex items-center justify-center rounded border border-slate-200 hover:bg-slate-50">&lt;</button>
              <button className="w-8 h-8 flex items-center justify-center rounded border border-slate-200 hover:bg-slate-50">&gt;</button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-6">Attendance Summary</h3>
            <div className="h-48 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dynamicAttendanceData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {dynamicAttendanceData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-bold text-slate-900">{boardedPercentage}%</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Boarded</span>
              </div>
            </div>
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
              {studentAlerts.map((alert) => (
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
                     )}>{alert.desc}</p>
                   </div>
                </div>
              ))}
            </div>
            <button className="w-full mt-4 text-sm font-semibold text-orange-600 hover:text-orange-700 py-1 transition-colors">
              View All Alerts
            </button>
          </div>
        </div>
      </div>

      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">
                Assign Bus / Route
              </h3>
              <button 
                onClick={() => setIsAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAssignSubmit} className="p-6 space-y-4">
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
                    {routes.find(r => r.id === assignFormData.routeId)?.stops?.map((stop: any) => (
                      <option key={stop.id} value={stop.id}>{stop.name} ({stop.stopTime})</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div className="pt-4 flex gap-3 justify-end">
                <button 
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
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
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">
                Register New Student
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  RFID Tag <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text"
                  required
                  value={formData.rfidTag}
                  onChange={(e) => setFormData({...formData, rfidTag: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                  placeholder="e.g. RFID-123456789"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Student Name <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                  placeholder="e.g. John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Grade/Class
                </label>
                <input 
                  type="text"
                  value={formData.grade}
                  onChange={(e) => setFormData({...formData, grade: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                  placeholder="e.g. 10th"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Parent Name <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text"
                  required
                  value={formData.parentName}
                  onChange={(e) => setFormData({...formData, parentName: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                  placeholder="e.g. Mr. Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Parent Email <span className="text-red-500">*</span>
                </label>
                <input 
                  type="email"
                  required
                  value={formData.parentEmail}
                  onChange={(e) => setFormData({...formData, parentEmail: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm"
                  placeholder="e.g. alex.parent@example.com"
                />
              </div>
              
              <div className="pt-4 flex gap-3 justify-end">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors text-sm border border-slate-200"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg font-medium text-white bg-orange-600 hover:bg-orange-700 transition-colors text-sm disabled:opacity-70 flex items-center gap-2"
                >
                  {isSubmitting ? 'Registering...' : 'Register Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {credentialsPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <CheckCircle size={20} className="text-emerald-500" />
                Student Added!
              </h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                A new parent account was created. Please copy these credentials and share them with the parent:
              </p>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3 font-mono text-sm">
                <div>
                  <span className="text-slate-500 font-semibold block mb-1">Email:</span>
                  <div className="bg-white px-3 py-2 border border-slate-200 rounded font-medium text-slate-900">
                    {credentialsPopup.email}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block mb-1">Temporary Password:</span>
                  <div className="bg-white px-3 py-2 border border-slate-200 rounded font-medium text-slate-900">
                    {credentialsPopup.temporaryPassword}
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <button 
                  onClick={() => setCredentialsPopup(null)}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
