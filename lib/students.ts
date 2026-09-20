import { avatarFor } from './avatar';
import type { Direction } from './runs';

export const SCHOOL_TIME_ZONE = 'Asia/Kolkata';

export const STUDENT_STATUSES = ['Boarded', 'Dropped off', 'Did not board', 'On leave', 'Not scanned'] as const;
export type StudentStatus = typeof STUDENT_STATUSES[number];
export type StudentStatusCounts = Record<StudentStatus, number>;

export const STUDENT_STATUS_META: Record<StudentStatus, { color: string; className: string }> = {
  Boarded: { color: '#3b82f6', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  'Dropped off': { color: '#10b981', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'Did not board': { color: '#ef4444', className: 'bg-red-50 text-red-700 border-red-200' },
  'On leave': { color: '#a855f7', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  'Not scanned': { color: '#94a3b8', className: 'bg-slate-100 text-slate-700 border-slate-200' },
};

interface StudentRouteStop {
  id?: string | null;
  name?: string | null;
  stopTime?: string | null;
  routeId?: string | null;
  route?: { id?: string | null; name?: string | null } | null;
}

/**
 * One stop assignment. The `id` is what the change and unassign endpoints address, and
 * its absence from the payload is what made corrections impossible before.
 *
 * `direction: null` means the stop serves both legs; a child with separate morning and
 * afternoon stops has two of these.
 */
export interface StudentMapping {
  id: string;
  routeStopId: string;
  direction: Direction | null;
  stopName: string;
  lat?: number | null;
  lng?: number | null;
  routeId: string;
  routeName: string;
}

export interface StudentRecord {
  id: string;
  name: string;
  rfidTag?: string | null;
  grade?: string | null;
  boardingStatus?: string | null;
  lastCheckIn?: string | null;
  onLeave?: boolean | null;
  assignedRoute?: string | null;
  routeName?: string | null;
  routeId?: string | null;
  routeStopId?: string | null;
  routeStopName?: string | null;
  stopName?: string | null;
  stopTime?: string | null;
  routeMappings?: Array<{ routeStopId?: string | null; routeStop?: StudentRouteStop | null }> | null;
  mappings?: StudentMapping[] | null;
  parentId?: string | null;
  parentName?: string | null;
  guardianName?: string | null;
  parentEmail?: string | null;
  parentPhone?: string | null;
  guardianPhone?: string | null;
  parent?: { id?: string | null; name?: string | null; email?: string | null; phone?: string | null } | null;
  photoUrl?: string | null;
}

export interface AttendanceLog {
  id?: string;
  studentId?: string | null;
  student?: { id?: string | null } | null;
  type?: string | null;
  status?: string | null;
  timestamp?: string | null;
}

export interface ProcessedStudent {
  id: string;
  name: string;
  tag: string;
  grade: string;
  route: string;
  hasAssignment: boolean;
  routeId: string | null;
  routeStopId: string | null;
  /** Every assignment this student holds, each with the id needed to change it. */
  mappings: StudentMapping[];
  stopName: string;
  stopTime: string;
  status: StudentStatus;
  onLeave: boolean;
  parentId: string | null;
  guardianPhone: string;
  parentName: string;
  parentEmail: string;
  time: string;
  lastCheckIn: string | null;
  avatar: string;
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SCHOOL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false,
});

function parseDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The attendance API and the exported report use the school's day, including before dawn. */
export function attendanceDate(date: Date = new Date()): string {
  if (!parseDate(date)) return '';
  const parts = dayFormatter.formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}

export function formatSchoolTime(value: string | number | Date | null | undefined): string {
  const date = parseDate(value);
  return date ? timeFormatter.format(date) : '—';
}

function boardingType(value: string | null | undefined): 'BOARDED' | 'ALIGHTED' | 'NO_SHOW' | null {
  const type = value?.toUpperCase();
  return type === 'BOARDED' || type === 'ALIGHTED' || type === 'NO_SHOW' ? type : null;
}

export function processStudents(
  students: readonly StudentRecord[],
  attendanceLogs: readonly AttendanceLog[],
  now: Date = new Date(),
): ProcessedStudent[] {
  const today = attendanceDate(now);
  const todayDate = (stamp: string | null | undefined): Date | null => {
    const date = parseDate(stamp);
    return date && attendanceDate(date) === today ? date : null;
  };
  const latestLogs = new Map<string, { type: 'BOARDED' | 'ALIGHTED' | 'NO_SHOW'; date: Date }>();
  for (const log of attendanceLogs) {
    const id = log.studentId || log.student?.id;
    const date = todayDate(log.timestamp);
    const type = boardingType(log.type ?? log.status);
    if (!id || !date || !type) continue;
    const previous = latestLogs.get(id);
    if (!previous || date.getTime() > previous.date.getTime()) latestLogs.set(id, { type, date });
  }

  return students.map(student => {
    const log = latestLogs.get(student.id);
    // The student endpoint owns the current summary. Logs support older payloads;
    // they do not replace that summary merely because the requests resolved apart.
    const summaryType = boardingType(student.boardingStatus);
    const raw = summaryType ?? log?.type;
    const status: StudentStatus = raw === 'BOARDED' ? 'Boarded'
      : raw === 'ALIGHTED' ? 'Dropped off'
      : raw === 'NO_SHOW' ? 'Did not board'
      : student.onLeave ? 'On leave' : 'Not scanned';
    const summaryDate = todayDate(student.lastCheckIn);
    const scanDate = summaryType ? summaryDate ?? log?.date : log?.date ?? summaryDate;
    const mapping = student.routeMappings?.[0];
    const stop = mapping?.routeStop;
    const name = student.name || 'Unnamed student';
    // Documented as always present, but a `??` costs nothing and keeps older payloads
    // (and every fixture written before this field existed) rendering.
    const mappings = student.mappings ?? [];

    const routeLabel = student.assignedRoute || student.routeName || stop?.route?.name || mappings[0]?.routeName || 'Unassigned';

    /**
     * Whether creating a mapping for this child would duplicate one that already exists.
     *
     * This is a safety question, not a display one — it is the only thing the roster uses
     * to decide whether "Assign Route & Stop" is offered — so it must be answered from
     * evidence a mapping exists, never from a leftover label.
     *
     * A stop *name* is not evidence. It used to be, and a payload that returns any
     * non-empty placeholder there (an "N/A", a dash) told the roster a child was assigned
     * when they had never been, and then blocked the only control that could assign them.
     * A child registered with no stop at all could not be given one afterwards.
     *
     * A record, a stop id, or a route that resolved to something other than the
     * "Unassigned" fallback all are evidence, and all still block.
     */
    const hasAssignment = Boolean(
      mappings.length || student.routeMappings?.length || student.routeStopId || routeLabel !== 'Unassigned',
    );

    return {
      id: student.id,
      name,
      tag: student.rfidTag || 'N/A',
      grade: student.grade || '—',
      route: routeLabel,
      mappings,
      hasAssignment,
      routeId: student.routeId || stop?.routeId || stop?.route?.id || mappings[0]?.routeId || null,
      routeStopId: student.routeStopId || mapping?.routeStopId || stop?.id || mappings[0]?.routeStopId || null,
      stopName: student.routeStopName || student.stopName || stop?.name || mappings[0]?.stopName || '',
      stopTime: student.stopTime || stop?.stopTime || '',
      status,
      onLeave: Boolean(student.onLeave),
      parentId: student.parentId || student.parent?.id || null,
      guardianPhone: student.parentPhone || student.parent?.phone || student.guardianPhone || '',
      parentName: student.parentName || student.parent?.name || student.guardianName || '',
      parentEmail: student.parentEmail || student.parent?.email || '',
      time: formatSchoolTime(scanDate),
      lastCheckIn: scanDate?.toISOString() ?? null,
      avatar: student.photoUrl || avatarFor(name),
    };
  });
}

export function countStudentStatuses(students: readonly Pick<ProcessedStudent, 'status'>[]): StudentStatusCounts {
  const counts: StudentStatusCounts = { Boarded: 0, 'Dropped off': 0, 'Did not board': 0, 'On leave': 0, 'Not scanned': 0 };
  for (const student of students) counts[student.status]++;
  return counts;
}

/** Uses exactly the same categories and colors as the table and legend. */
export function buildAttendanceGradient(counts: StudentStatusCounts): string {
  const total = STUDENT_STATUSES.reduce((sum, status) => sum + counts[status], 0);
  if (total === 0) return 'conic-gradient(#e2e8f0 0% 100%)';
  let previous = 0;
  const segments: string[] = [];
  for (const status of STUDENT_STATUSES) {
    if (counts[status] === 0) continue;
    const next = previous + counts[status];
    segments.push(`${STUDENT_STATUS_META[status].color} ${(previous / total) * 100}% ${(next / total) * 100}%`);
    previous = next;
  }
  return `conic-gradient(${segments.join(', ')})`;
}

/**
 * What a bus is actually carrying, for a route.
 *
 * The live map showed "40 seats" where "22 aboard" is the number anyone needs. A school
 * does not track buses because it cares about buses; every question during an incident is
 * about who is inside. Capacity is a property of the vehicle and tells you nothing about
 * today.
 *
 * `awaited` is the operational number: children this route serves who have not scanned on,
 * have not scanned off, and are not on leave. At the end of a morning run a non-zero
 * `awaited` means somebody was left at a stop.
 */
export interface RouteRoster {
  expected: number;
  aboard: number;
  droppedOff: number;
  onLeave: number;
  awaited: number;
}

export const EMPTY_ROSTER: RouteRoster = {
  expected: 0, aboard: 0, droppedOff: 0, onLeave: 0, awaited: 0,
};

export function rosterForRoute(
  students: readonly ProcessedStudent[],
  routeId: string | null | undefined,
): RouteRoster {
  if (!routeId) return EMPTY_ROSTER;

  const roster = { ...EMPTY_ROSTER };
  for (const student of students) {
    // mappings[] is what says which route serves a child. The flattened routeId is a
    // fallback for payloads written before mappings existed.
    const serves = student.mappings.length
      ? student.mappings.some(mapping => mapping.routeId === routeId)
      : student.routeId === routeId;
    if (!serves) continue;

    roster.expected++;
    if (student.status === 'Boarded') roster.aboard++;
    else if (student.status === 'Dropped off') roster.droppedOff++;
    else if (student.onLeave) roster.onLeave++;
  }
  roster.awaited = roster.expected - roster.aboard - roster.droppedOff - roster.onLeave;
  return roster;
}
