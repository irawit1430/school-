/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, Plus, Upload, Eye, Mail, AlertTriangle, RefreshCw, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { clsx } from 'clsx';
import { ApiError, apiErrorMessage, assignStudentToStop, createStudent, fetchRoutes, importStudentsCSV, sendMessageToParent, updateStudentMapping } from '@/lib/api';
import { isEmergencyNotification, notificationSeverity } from '@/lib/notifications';
import { attendanceDate, buildAttendanceGradient, countStudentStatuses, formatSchoolTime, processStudents, STUDENT_STATUSES, STUDENT_STATUS_META, type ProcessedStudent, type StudentStatus } from '@/lib/students';
import { SummaryCards } from './students/SummaryCards';
import { AddStudentModal } from './students/AddStudentModal';
import { ImportStudentsModal } from './students/ImportStudentsModal';
import { CredentialsPopup } from './students/CredentialsPopup';
import { AssignBusModal } from './students/AssignBusModal';
import { StudentProfileModal } from './students/StudentProfileModal';
import { MessageParentModal } from './students/MessageParentModal';
import { useStudentsData } from './students/useStudentsData';
import { Skeleton } from '@/components/ui/Skeleton';

type Route = { id: string; name: string; stops?: { id: string; name: string; stopTime?: string }[] };
const emptyStudentForm = { rfidTag: '', name: '', grade: '', parentEmail: '', parentName: '', guardianPhone: '', routeId: '', routeStopId: '' };
const tabs: { label: string; status?: StudentStatus }[] = [
  { label: 'All Students' }, { label: 'Currently Boarded', status: 'Boarded' },
  { label: 'Dropped Off', status: 'Dropped off' }, { label: 'Did Not Board', status: 'Did not board' },
  { label: 'On Leave', status: 'On leave' }, { label: 'Not Scanned', status: 'Not scanned' },
];
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50';

/**
 * Two of the mapping endpoints' failures mean something specific to the person at the
 * desk and the server's own wording doesn't say it. Everything else it writes is already
 * written for humans, so pass it straight through.
 */
const mappingErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'This student was changed somewhere else and this assignment no longer exists. The roster is being refreshed.';
    if (error.status === 409 && error.data?.code === 'MAPPING_EXISTS') {
      return 'This student is already assigned to that stop. Choose a different stop, or change that other assignment instead.';
    }
  }
  return apiErrorMessage(error, 'Could not save this route and stop.');
};

export function StudentsAttendance() {
  const data = useStudentsData();
  const externalQuery = useSearchParams().get('q') || '';
  const [previousQuery, setPreviousQuery] = useState(externalQuery);
  const [searchQuery, setSearchQuery] = useState(externalQuery);
  const [activeTab, setActiveTab] = useState('All Students');
  const [gradeFilter, setGradeFilter] = useState('');
  const [routeFilter, setRouteFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [formData, setFormData] = useState({ ...emptyStudentForm });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ data: unknown; operation: 'create' | 'import'; count?: number } | null>(null);

  const [assignStudent, setAssignStudent] = useState<ProcessedStudent | null>(null);
  const [assignFormData, setAssignFormData] = useState({ routeId: '', routeStopId: '', mappingId: '' });
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [isAssignSubmitting, setIsAssignSubmitting] = useState(false);
  // A successful create must stay blocked even if the following roster refresh fails.
  const [createdAssignmentIds, setCreatedAssignmentIds] = useState<Set<string>>(() => new Set());
  // Rows already reloaded once without the roster producing an assignment record. The
  // stop is real, but there is no id to edit it by, so stop offering a button that
  // cannot change anything and say what is actually missing.
  const [reloadedAssignmentIds, setReloadedAssignmentIds] = useState<Set<string>>(() => new Set());
  const routeRequest = useRef(0);

  const [viewStudentId, setViewStudentId] = useState<string | null>(null);
  const [messageStudent, setMessageStudent] = useState<ProcessedStudent | null>(null);
  const [messageForm, setMessageForm] = useState({ subject: '', body: '' });
  const [messageError, setMessageError] = useState<string | null>(null);
  const [isMessageSubmitting, setIsMessageSubmitting] = useState(false);
  const writing = useRef(false);

  if (previousQuery !== externalQuery) {
    setPreviousQuery(externalQuery);
    setSearchQuery(externalQuery);
    setActiveTab('All Students');
    setGradeFilter('');
    setRouteFilter('');
    setCurrentPage(1);
  }
  useEffect(() => () => { routeRequest.current++; }, []);

  // Keep an old snapshot associated with its original school day if refresh fails.
  const students = useMemo(() => processStudents(data.students, data.attendance, data.lastUpdated || new Date()),
    [data.students, data.attendance, data.lastUpdated]);
  const counts = useMemo(() => countStudentStatuses(students), [students]);
  const totalStudents = students.length;
  const boardedPercentage = totalStudents ? Math.round(counts.Boarded / totalStudents * 100) : 0;
  const reportDate = attendanceDate(data.lastUpdated || new Date());
  const grades = [...new Set(students.map(student => student.grade).filter(Boolean))].sort();
  const routeNames = [...new Set(students.map(student => student.route))].sort();
  const filteredStudents = useMemo(() => {
    const status = tabs.find(tab => tab.label === activeTab)?.status;
    const query = searchQuery.trim().toLocaleLowerCase();
    return students.filter(student => (!status || student.status === status)
      && (!gradeFilter || student.grade === gradeFilter)
      && (!routeFilter || student.route === routeFilter)
      && (!query || [student.name, student.tag, student.route, student.stopName].some(value => value.toLocaleLowerCase().includes(query))))
      .sort((a, b) => {
        const field = sortBy as 'name' | 'grade' | 'route';
        return String(a[field] || '').localeCompare(String(b[field] || ''), undefined, { numeric: true }) || a.name.localeCompare(b.name);
      });
  }, [students, activeTab, searchQuery, gradeFilter, routeFilter, sortBy]);
  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / itemsPerPage));
  const page = Math.min(currentPage, pageCount);
  if (currentPage !== page) setCurrentPage(page);
  const visibleStudents = filteredStudents.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const hasFilters = !!(searchQuery.trim() || gradeFilter || routeFilter || activeTab !== 'All Students');

  const clearFilters = () => {
    setSearchQuery(''); setGradeFilter(''); setRouteFilter(''); setActiveTab('All Students'); setCurrentPage(1);
  };
  const openCreate = () => {
    if (writing.current) return;
    setFormData({ ...emptyStudentForm }); setCreateError(null); setIsModalOpen(true);
    void loadRoutes();
  };
  const loadRoutes = async () => {
    const request = ++routeRequest.current;
    setRoutesLoading(true); setRoutesError(null);
    try {
      const full = await fetchRoutes();
      if (request === routeRequest.current) setRoutes(full);
    } catch (error) {
      if (request === routeRequest.current) setRoutesError(apiErrorMessage(error, 'Could not load routes and stops.'));
    } finally {
      if (request === routeRequest.current) setRoutesLoading(false);
    }
  };
  const openAssign = (student: ProcessedStudent) => {
    // Without a mapping id there is nothing to change, and creating a second mapping for
    // an already-assigned child is what puts them on two driver rosters. That applies to
    // an assignment saved this session and to a payload that carries only the flattened
    // fields, which name the stop but not the row.
    if (writing.current || (!student.mappings.length
      && (student.hasAssignment || createdAssignmentIds.has(student.id)))) return;
    const mapping = student.mappings[0] ?? null;
    setAssignStudent(student); setAssignError(null);
    setAssignFormData({
      mappingId: mapping?.id ?? '',
      routeId: mapping?.routeId ?? student.routeId ?? '',
      routeStopId: mapping?.routeStopId ?? student.routeStopId ?? '',
    });
    void loadRoutes();
  };
  const closeAssign = () => { if (!writing.current) { routeRequest.current++; setAssignStudent(null); } };
  // "Refresh to change this assignment" used to be plain text, which told the admin to do
  // something the row gave them no way to do. Fetching the roster again is the only thing
  // that can turn a flattened stop into an editable record, so make it the button.
  //
  // The created-this-session set is deliberately not cleared: if this refresh fails too,
  // that entry is all that still stands between a second POST and a child on two rosters.
  const reloadAssignment = async (studentId: string) => {
    await data.refresh(true, true);
    setReloadedAssignmentIds(previous => new Set(previous).add(studentId));
  };
  const handleAssignSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!assignStudent || writing.current || routesLoading || routesError) return;
    const latestStudent = students.find(student => student.id === assignStudent.id);
    if (!latestStudent) {
      setAssignError('This student is no longer in the roster. Refresh to see the current list.');
      return;
    }
    const mappingId = assignFormData.mappingId;
    // Re-checked against the latest roster, not the snapshot the dialog opened from:
    // polling can reveal an assignment made elsewhere while this dialog sat open.
    if (!mappingId && (latestStudent.hasAssignment || createdAssignmentIds.has(assignStudent.id))) {
      setAssignError('This student already has a route assignment. Refresh the roster to change it.');
      return;
    }
    const route = routes.find(item => item.id === assignFormData.routeId);
    const stop = route?.stops?.find(item => item.id === assignFormData.routeStopId);
    if (!stop) { setAssignError('Select a route and one of its pickup stops.'); return; }
    writing.current = true; setIsAssignSubmitting(true); setAssignError(null);
    try {
      if (mappingId) {
        // One call: a failure leaves the existing mapping exactly as it was. `direction`
        // is omitted so a drop-off-only mapping is not silently widened to both legs.
        await updateStudentMapping(mappingId, { routeStopId: stop.id });
        toast.success('Moved to ' + route!.name + ' · ' + stop.name + '.');
      } else {
        await assignStudentToStop({ studentId: assignStudent.id, routeStopId: stop.id });
        setCreatedAssignmentIds(previous => new Set(previous).add(assignStudent.id));
        toast.success('Saved ' + route!.name + ' · ' + stop.name + '.');
      }
      setAssignStudent(null);
      void data.refresh(true, true);
    } catch (error) {
      setAssignError(mappingErrorMessage(error));
      // A 404 means someone else changed this student while the dialog was open; the
      // roster on screen is already stale, so go and get the real state.
      if (error instanceof ApiError && error.status === 404) void data.refresh(true, true);
    } finally { writing.current = false; setIsAssignSubmitting(false); }
  };
  const openMessage = (student: ProcessedStudent) => {
    if (writing.current || !student.parentId) return;
    setMessageForm({ subject: '', body: '' }); setMessageError(null); setMessageStudent(student);
  };
  const closeMessage = () => {
    if (writing.current) return;
    setMessageStudent(null); setMessageForm({ subject: '', body: '' }); setMessageError(null);
  };
  const handleMessageSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (writing.current || !messageStudent?.parentId) return;
    const subject = messageForm.subject.trim(), body = messageForm.body.trim();
    if (!subject || !body) { setMessageError('Enter a subject and message.'); return; }
    writing.current = true; setIsMessageSubmitting(true); setMessageError(null);
    try {
      await sendMessageToParent(messageStudent.parentId, subject, body);
      setMessageStudent(null); setMessageForm({ subject: '', body: '' });
      toast.success('Message sent to parent.');
    } catch (error) { setMessageError(apiErrorMessage(error, 'Could not send this message.')); }
    finally { writing.current = false; setIsMessageSubmitting(false); }
  };
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (writing.current) return;
    const name = formData.name.trim(), parentName = formData.parentName.trim(), parentEmail = formData.parentEmail.trim();
    if (!name || !parentName || !parentEmail) { setCreateError('Enter the student name, parent name, and parent email.'); return; }
    writing.current = true; setIsSubmitting(true); setCreateError(null);
    try {
      const result = await createStudent({ name, parentName, parentEmail,
        rfidTag: formData.rfidTag.trim() || undefined, grade: formData.grade.trim() || undefined,
        guardianPhone: formData.guardianPhone.trim() || undefined });
      setIsModalOpen(false);
      if (result.parentCredentials) setCredentials({ data: result.parentCredentials, operation: 'create', count: 1 });

      // The stop is a second call \u2014 the create endpoint takes no routeStopId. So the
      // child is registered either way, and only the stop can fail. Say which happened
      // rather than reporting one success for two writes.
      const newId = result?.id ?? result?.student?.id ?? null;
      const stopId = formData.routeStopId;
      if (stopId && newId) {
        const route = routes.find(item => item.id === formData.routeId);
        const stop = route?.stops?.find((item: any) => item.id === stopId);
        try {
          await assignStudentToStop({ studentId: newId, routeStopId: stopId });
          setCreatedAssignmentIds(previous => new Set(previous).add(newId));
          toast.success('Registered ' + name + ' \u00b7 ' + (route?.name ?? 'route') + ' \u00b7 ' + (stop?.name ?? 'stop') + '.');
        } catch (assignFailure) {
          toast.error('Registered ' + name + ', but the pickup stop was not saved: '
            + mappingErrorMessage(assignFailure) + ' Assign it from the roster.');
        }
      } else if (stopId && !newId) {
        // No id came back, so there is nothing to attach the stop to. Do not pretend.
        toast.error('Registered ' + name + ', but the pickup stop was not saved. Assign it from the roster.');
      } else {
        toast.success('Student registered successfully!');
      }
      void data.refresh(true, true);
    } catch (error) { setCreateError(apiErrorMessage(error, 'Could not register this student.')); }
    finally { writing.current = false; setIsSubmitting(false); }
  };
  const handleImportCSV = async (file: File) => {
    if (writing.current) return;
    writing.current = true; setIsSubmitting(true); setImportError(null);
    try {
      const result = await importStudentsCSV(file);
      setIsImportModalOpen(false);
      if (Array.isArray(result.parentCredentials) && result.parentCredentials.length) {
        const count = typeof result.importedCount === 'number' ? result.importedCount : undefined;
        setCredentials({ data: result.parentCredentials, operation: 'import', count });
      }
      toast.success(result.message || 'Student import completed.');
      void data.refresh(true, true);
    } catch (error) { setImportError(apiErrorMessage(error, 'Could not import students.')); }
    finally { writing.current = false; setIsSubmitting(false); }
  };
  const exportCSV = (scope: 'all' | 'filtered') => {
    const rows = scope === 'all' ? students : filteredStudents;
    if (!rows.length) return;
    const cell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const headers = ['Attendance Date (IST)', 'Name', 'Grade', 'RFID Tag', 'Assigned Route', 'Pickup Stop', 'Status', 'Last Event (IST)'];
    const content = [headers, ...rows.map(student => [reportDate, student.name, student.grade, student.tag,
      student.route, student.stopName, student.status, student.time])].map(row => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'students_attendance_' + reportDate + '_' + scope + '.csv';
    document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    toast.success('Attendance report downloaded.');
  };

  const sortedAlerts = [...data.notifications].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const visibleAlerts = showAllAlerts ? sortedAlerts : sortedAlerts.slice(0, 4);
  const viewStudent = students.find(student => student.id === viewStudentId) || null;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">Students & Attendance</h1>
          <p className="mt-1 text-sm text-slate-600">Boarding activity and pickup assignments for {reportDate} (IST).</p>
          <p className="mt-1 text-xs text-slate-500" role="status">
            {data.lastUpdated ? 'Updated ' + formatSchoolTime(data.lastUpdated.toISOString()) + ' IST · Refreshes every 30 seconds while visible' : 'Loading the latest attendance…'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={secondaryButton} onClick={() => void data.refresh(true, true)} disabled={data.refreshing} aria-label="Refresh">
            <RefreshCw size={16} className={data.refreshing ? 'animate-spin' : ''} />{data.refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className={secondaryButton} onClick={() => exportCSV('all')} disabled={!students.length}><Download size={16} />Export all</button>
          <button className={secondaryButton} onClick={() => { setImportError(null); setIsImportModalOpen(true); }}><Upload size={16} />Bulk Import</button>
          <button className={primaryButton} onClick={openCreate}><Plus size={16} />Add New Student</button>
        </div>
      </div>

      {data.error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle size={18} /><span>{data.error} {data.lastUpdated ? 'Showing the last loaded roster and attendance.' : 'The student roster is unavailable.'}</span>
        <button className={secondaryButton} disabled={data.refreshing} onClick={() => void data.refresh(true, true)}>Retry</button>
      </div>}
      {data.statsError && <p role="alert" className="text-sm text-amber-800">{data.statsError} Late-arrival statistics are unavailable.</p>}

      {data.loading ? <div className="space-y-4" aria-label="Loading students" aria-busy="true">
        <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /></div>
        <Skeleton className="h-96 rounded-xl" />
      </div> : data.lastUpdated && <>
        <SummaryCards totalStudents={totalStudents} stats={data.stats} statsError={data.statsError}
          presentCount={counts.Boarded} boardedPercentage={boardedPercentage} notScannedCount={counts['Not scanned']} />
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <section aria-label="Student roster" className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-4 border-b border-slate-100 p-4">
              <div className="flex flex-wrap gap-2" aria-label="Boarding status filters">
                {tabs.map(tab => <button key={tab.label} type="button" aria-label={tab.label} aria-pressed={activeTab === tab.label}
                  onClick={() => { setActiveTab(tab.label); setCurrentPage(1); }}
                  className={clsx('rounded-lg border px-3 py-2 text-xs font-semibold', activeTab === tab.label
                    ? 'border-primary bg-primary-soft text-primary' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                  {tab.label} <span className="ml-1" aria-hidden="true">{tab.status ? counts[tab.status] : totalStudents}</span>
                </button>)}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="relative">
                  <label htmlFor="student-search" className="sr-only">Search students by name, RFID, route or stop</label>
                  <Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                  <input id="student-search" type="search" value={searchQuery} placeholder="Search students, RFID, route or stop…"
                    onChange={event => { setSearchQuery(event.target.value); setCurrentPage(1); }}
                    className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="sr-only" htmlFor="student-grade">Filter by grade</label>
                  <select id="student-grade" value={gradeFilter} onChange={event => { setGradeFilter(event.target.value); setCurrentPage(1); }} className="min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-sm">
                    <option value="">All grades</option>{grades.map(grade => <option key={grade} value={grade}>{grade}</option>)}
                  </select>
                  <label className="sr-only" htmlFor="student-route">Filter by route</label>
                  <select id="student-route" value={routeFilter} onChange={event => { setRouteFilter(event.target.value); setCurrentPage(1); }} className="min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-sm">
                    <option value="">All routes</option>{routeNames.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <div className="flex items-center gap-2"><label htmlFor="student-sort">Sort by</label>
                  <select id="student-sort" value={sortBy} onChange={event => { setSortBy(event.target.value); setCurrentPage(1); }} className="rounded border border-slate-200 p-1.5">
                    <option value="name">Name</option><option value="grade">Grade</option><option value="route">Route</option>
                  </select>
                </div>
                {hasFilters && <div className="flex flex-wrap gap-3"><button onClick={clearFilters} className="font-semibold text-primary underline">Clear filters</button>
                  <button disabled={!filteredStudents.length} onClick={() => exportCSV('filtered')} className="font-semibold text-primary underline disabled:opacity-40">Export filtered ({filteredStudents.length})</button>
                </div>}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Students and their attendance on {reportDate}</caption>
                <thead className="bg-slate-50 text-xs text-slate-600"><tr>
                  {['Student Name', 'Grade', 'Pickup Route & Stop', 'Boarding Status', 'Last Event', 'Actions'].map(label => <th scope="col" key={label} className="px-4 py-3">{label}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleStudents.map(student => <tr key={student.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-3"><div className="flex items-center gap-3">
                      <img src={student.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                      <div className="min-w-0"><p className="font-semibold text-slate-900">{student.name}</p><p className="break-all text-xs text-slate-500">RFID: {student.tag}</p></div>
                    </div></td>
                    <td className="px-4 py-3">{student.grade || '—'}</td>
                    <td className="px-4 py-3"><p className="font-medium">{student.route}</p><p className="mt-1 text-xs text-slate-500">{student.stopName || (student.route !== 'Unassigned' ? 'Stop details unavailable' : 'No pickup stop')}{student.stopTime ? ' · ' + student.stopTime : ''}</p></td>
                    <td className="px-4 py-3"><span className={clsx('inline-flex rounded border px-2 py-1 text-xs font-semibold', STUDENT_STATUS_META[student.status].className)}>{student.status}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">{student.time}</td>
                    <td className="px-4 py-3"><div className="flex flex-wrap items-center gap-1">
                      {student.mappings.length
                        ? <button onClick={() => openAssign(student)} className="rounded px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary-soft">Change Route & Stop</button>
                        : student.hasAssignment || createdAssignmentIds.has(student.id)
                        ? reloadedAssignmentIds.has(student.id)
                        ? <span className="max-w-48 text-xs text-slate-500" title="The roster returns this child's stop but not the assignment record behind it, so there is no id to change. Changing it needs that record in the students API; creating a new one instead would put the child on a second driver roster.">
                            Assigned &middot; no editable record
                          </span>
                        : <button onClick={() => void reloadAssignment(student.id)} disabled={data.refreshing}
                            className="rounded px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary-soft disabled:opacity-50">
                            {data.refreshing ? 'Reloading…' : 'Reload to change'}
                          </button>
                        : <button onClick={() => openAssign(student)} className="rounded px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary-soft">Assign Route & Stop</button>}
                      <button onClick={() => setViewStudentId(student.id)} aria-label={'View Student ' + student.name} className="rounded p-2 text-slate-600 hover:bg-slate-100"><Eye size={18} /></button>
                      <button onClick={() => openMessage(student)} disabled={!student.parentId} title={student.parentId ? 'Message parent' : 'No parent account linked. View the profile for guardian contact details.'}
                        aria-label={'Message Parent of ' + student.name} className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"><Mail size={18} /></button>
                    </div></td>
                  </tr>)}
                  {!visibleStudents.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-600">
                    <p className="font-semibold">{students.length ? 'No students match these filters.' : 'No students registered yet.'}</p>
                    <p className="mt-1 text-sm">{students.length ? 'Try a different name or clear your filters.' : 'Add a student or import your roster to get started.'}</p>
                    <div className="mt-4 flex justify-center gap-3">{students.length
                      ? <button className={secondaryButton} onClick={clearFilters}>Clear filters</button>
                      : <><button className={primaryButton} onClick={openCreate}>Add New Student</button><button className={secondaryButton} onClick={() => { setImportError(null); setIsImportModalOpen(true); }}>Bulk Import</button></>}
                    </div>
                  </td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4 text-xs text-slate-600">
              <span role="status">Showing {filteredStudents.length ? (page - 1) * itemsPerPage + 1 : 0} to {Math.min(page * itemsPerPage, filteredStudents.length)} of {filteredStudents.length} students</span>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="student-page-size">Rows</label><select id="student-page-size" value={itemsPerPage} onChange={event => { setItemsPerPage(Number(event.target.value)); setCurrentPage(1); }} className="rounded border p-1.5">{[8, 16, 32].map(size => <option key={size} value={size}>{size}</option>)}</select>
                <button aria-label="Previous page" disabled={page === 1} onClick={() => setCurrentPage(page - 1)} className="rounded border p-2 disabled:opacity-40">Previous</button>
                <span>Page {page} of {pageCount}</span>
                <button aria-label="Next page" disabled={page === pageCount} onClick={() => setCurrentPage(page + 1)} className="rounded border p-2 disabled:opacity-40">Next</button>
              </div>
            </div>
          </section>
          <aside className="grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-1" aria-label="Attendance and alerts">
            <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold text-slate-900">Attendance Summary</h2>
              <p className="mt-1 text-xs text-slate-500">All students · {reportDate}</p>
              {totalStudents ? <div className="mx-auto my-5 flex aspect-square w-40 max-w-full items-center justify-center rounded-full" style={{ background: buildAttendanceGradient(counts) }} aria-hidden="true">
                <div className="flex aspect-square w-4/5 items-center justify-center rounded-full bg-white text-center"><div><p className="text-3xl font-bold">{boardedPercentage}%</p><p className="text-xs text-slate-600">Currently boarded</p></div></div>
              </div> : <p className="my-5 text-sm text-slate-500">No attendance to summarize yet.</p>}
              <dl className="space-y-2">{STUDENT_STATUSES.map(status => <div key={status} className="flex items-center justify-between gap-2 text-sm">
                <dt className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STUDENT_STATUS_META[status].color }} />{status}</dt><dd className="font-semibold">{counts[status]}</dd>
              </div>)}</dl>
            </section>
            <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold text-slate-900">Recent Alerts</h2>
              {data.notificationsError && <div role="alert" className="mt-3 text-sm text-amber-800"><p>{data.notificationsError}{data.notifications.length ? ' Showing the last loaded alerts.' : ''}</p><button disabled={data.refreshing} onClick={() => void data.refresh(true, true)} className="mt-2 font-semibold underline">Retry alerts</button></div>}
              {data.notificationsLoading && <p role="status" className="mt-3 text-xs text-slate-500">Updating alerts…</p>}
              <ul className={clsx('mt-4 space-y-3', showAllAlerts && 'max-h-96 overflow-y-auto pr-1')}>
                {visibleAlerts.map(alert => <li key={alert.id} className={clsx('break-words rounded-lg border p-3', notificationSeverity(alert.type) === 'critical' ? 'border-red-100 bg-red-50' : notificationSeverity(alert.type) === 'warning' ? 'border-amber-100 bg-amber-50' : 'border-slate-200 bg-slate-50')}>
                  <div className="flex flex-wrap items-start justify-between gap-1"><h3 className="text-sm font-semibold">{alert.title}</h3>{isEmergencyNotification(alert) && <span className="text-xs font-semibold">{alert.status === 'RESOLVED' ? 'Resolved' : 'Active'}</span>}</div>
                  <p className="mt-1 text-xs text-slate-700">{alert.message}</p>
                  <p className="mt-2 text-xs text-slate-500">{Number.isNaN(Date.parse(alert.createdAt)) ? 'Time unavailable' : new Date(alert.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' IST'}</p>
                </li>)}
              </ul>
              {!data.notificationsError && !data.notificationsLoading && !data.notifications.length && <p className="py-4 text-sm text-slate-500">No recent alerts</p>}
              {sortedAlerts.length > 4 && <button className="mt-4 text-sm font-semibold text-primary underline" aria-expanded={showAllAlerts} onClick={() => setShowAllAlerts(value => !value)}>{showAllAlerts ? 'Show fewer alerts' : 'View all loaded alerts (' + sortedAlerts.length + ')'}</button>}
            </section>
          </aside>
        </div>
      </>}

      {assignStudent && <AssignBusModal onClose={closeAssign} onSubmit={handleAssignSubmit} assignStudent={assignStudent}
        assignFormData={assignFormData} setAssignFormData={setAssignFormData} isAssignSubmitting={isAssignSubmitting}
        mappings={assignStudent.mappings}
        routes={routes} routesLoading={routesLoading} routesError={routesError} onRetryRoutes={() => void loadRoutes()} error={assignError} />}
      {isModalOpen && <AddStudentModal
        routes={routes} routesLoading={routesLoading} routesError={routesError} onRetryRoutes={() => void loadRoutes()}
        onClose={() => { if (!writing.current) setIsModalOpen(false); }} onSubmit={handleSubmit}
        formData={formData} setFormData={setFormData} isSubmitting={isSubmitting} error={createError} />}
      {isImportModalOpen && <ImportStudentsModal onClose={() => { if (!writing.current) setIsImportModalOpen(false); }}
        onImport={handleImportCSV} isSubmitting={isSubmitting} error={importError} />}
      <CredentialsPopup credentialsPopup={credentials?.data || null} setCredentialsPopup={() => setCredentials(null)}
        operation={credentials?.operation} importedCount={credentials?.count} />
      <StudentProfileModal viewStudent={viewStudent} onClose={() => setViewStudentId(null)} />
      <MessageParentModal messageStudent={messageStudent} onClose={closeMessage} onSubmit={handleMessageSubmit}
        messageForm={messageForm} setMessageForm={setMessageForm} isMessageSubmitting={isMessageSubmitting} error={messageError} />
    </div>
  );
}
