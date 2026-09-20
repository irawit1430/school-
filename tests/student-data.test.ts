// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  attendanceDate,
  buildAttendanceGradient,
  countStudentStatuses,
  formatSchoolTime,
  processStudents,
  rosterForRoute,
  EMPTY_ROSTER,
  STUDENT_STATUS_META,
} from '../lib/students';

const now = new Date('2026-09-09T05:00:00Z');

describe('student attendance processing', () => {
  it('uses the latest fallback scan regardless of the response order', () => {
    const students = [{ id: 's1', name: 'Anaya' }];
    const logs = [
      { studentId: 's1', type: 'ALIGHTED', timestamp: '2026-09-09T03:00:00Z' },
      { student: { id: 's1' }, type: 'BOARDED', timestamp: '2026-09-09T02:00:00Z' },
    ];

    for (const order of [logs, [...logs].reverse()]) {
      expect(processStudents(students, order, now)[0]).toMatchObject({
        status: 'Dropped off', time: '08:30', lastCheckIn: '2026-09-09T03:00:00.000Z',
      });
    }
  });

  it('keeps the student endpoint summary authoritative when the endpoints differ', () => {
    const [student] = processStudents([
      { id: 's1', name: 'Anaya', boardingStatus: 'ALIGHTED', lastCheckIn: '2026-09-09T03:00:00Z' },
    ], [
      { studentId: 's1', type: 'BOARDED', timestamp: '2026-09-09T04:00:00Z' },
    ], now);

    expect(student).toMatchObject({ status: 'Dropped off', time: '08:30' });
  });

  it('does not turn yesterday or malformed timestamps into a scan today', () => {
    const [student] = processStudents([
      { id: 's1', name: 'Anaya', lastCheckIn: '2026-09-08T03:00:00Z' },
    ], [
      { studentId: 's1', type: 'BOARDED', timestamp: '2026-09-08T03:00:00Z' },
      { studentId: 's1', type: 'ALIGHTED', timestamp: 'invalid' },
    ], now);

    expect(student).toMatchObject({ status: 'Not scanned', time: '—', lastCheckIn: null });
  });

  it('recognizes a scan after school midnight even when its UTC date is yesterday', () => {
    const [student] = processStudents([{ id: 's1', name: 'Anaya' }], [
      { studentId: 's1', type: 'BOARDED', timestamp: '2026-09-08T18:35:00Z' },
    ], new Date('2026-09-08T18:40:00Z'));

    expect(student).toMatchObject({ status: 'Boarded', time: '00:05' });
  });

  it('keeps unscanned, approved leave and a recorded no-show distinct', () => {
    const rows = processStudents([
      { id: 'unknown', name: 'Unknown' },
      { id: 'leave', name: 'Excused', onLeave: true },
      { id: 'no-show', name: 'No show', boardingStatus: 'NO_SHOW' },
      { id: 'boarded', name: 'Boarded', boardingStatus: 'BOARDED', onLeave: true },
    ], [], now);

    expect(rows.map(row => row.status)).toEqual(['Not scanned', 'On leave', 'Did not board', 'Boarded']);
    expect(rows[3].onLeave).toBe(true);
  });

  it('retains the assigned stop and guardian details needed by the profile', () => {
    const [student] = processStudents([{
      id: 's1', name: 'Anaya', guardianPhone: '9876543210',
      parent: { id: 'p1', name: 'Meera', email: 'meera@example.test' },
      routeMappings: [{ routeStop: {
        id: 'stop1', name: 'East Gate', stopTime: '07:15',
        route: { id: 'route1', name: 'East Route' },
      } }],
    }], [], now);

    expect(student).toMatchObject({
      route: 'East Route', routeId: 'route1', routeStopId: 'stop1',
      stopName: 'East Gate', stopTime: '07:15', parentId: 'p1',
      guardianPhone: '9876543210', parentName: 'Meera', parentEmail: 'meera@example.test',
      grade: '—', tag: 'N/A',
    });
  });
});

describe('school attendance reporting', () => {
  it('uses the school day for filenames on both sides of midnight', () => {
    expect(attendanceDate(new Date('2026-09-08T18:29:59Z'))).toBe('2026-09-08');
    expect(attendanceDate(new Date('2026-09-08T18:30:00Z'))).toBe('2026-09-09');
    expect(formatSchoolTime('2026-09-09T03:00:00Z')).toBe('08:30');
    expect(formatSchoolTime('invalid')).toBe('—');
  });

  it('counts every roster member once and draws the no-show and leave segments', () => {
    const rows = processStudents([
      { id: 'a', name: 'A', boardingStatus: 'BOARDED' },
      { id: 'b', name: 'B', boardingStatus: 'ALIGHTED' },
      { id: 'c', name: 'C', boardingStatus: 'NO_SHOW' },
      { id: 'd', name: 'D', onLeave: true },
      { id: 'e', name: 'E' },
    ], [], now);
    const counts = countStudentStatuses(rows);

    expect(counts).toEqual({ Boarded: 1, 'Dropped off': 1, 'Did not board': 1, 'On leave': 1, 'Not scanned': 1 });
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(rows.length);
    expect(buildAttendanceGradient(counts)).toBe(
      `conic-gradient(${STUDENT_STATUS_META.Boarded.color} 0% 20%, ` +
      `${STUDENT_STATUS_META['Dropped off'].color} 20% 40%, ` +
      `${STUDENT_STATUS_META['Did not board'].color} 40% 60%, ` +
      `${STUDENT_STATUS_META['On leave'].color} 60% 80%, ` +
      `${STUDENT_STATUS_META['Not scanned'].color} 80% 100%)`,
    );
  });

  it('draws an all-leave roster in its own color and handles an empty roster', () => {
    const rows = processStudents([{ id: 's1', name: 'Anaya', onLeave: true }], [], now);
    expect(buildAttendanceGradient(countStudentStatuses(rows)))
      .toBe(`conic-gradient(${STUDENT_STATUS_META['On leave'].color} 0% 100%)`);
    expect(buildAttendanceGradient(countStudentStatuses([]))).not.toMatch(/NaN|Infinity/);
  });
});

describe('stop assignments', () => {
  const mapping = {
    id: 'm1', routeStopId: 'stop-am', direction: 'TO_SCHOOL' as const, stopName: 'Oak St',
    lat: 12.9, lng: 77.6, routeId: 'r1', routeName: 'Route 1',
  };

  it('carries the mapping id through, since a correction is impossible without it', () => {
    const [student] = processStudents([{ id: 's1', name: 'Anaya', mappings: [mapping] }], [], now);
    expect(student.mappings).toEqual([mapping]);
    expect(student.hasAssignment).toBe(true);
    // Falls back to the mapping for display when the flattened fields are absent.
    expect(student.route).toBe('Route 1');
    expect(student.stopName).toBe('Oak St');
  });

  it('keeps both legs when a child has a separate morning and afternoon stop', () => {
    const afternoon = { ...mapping, id: 'm2', routeStopId: 'stop-pm', direction: 'FROM_SCHOOL' as const, stopName: 'Elm Rd' };
    const [student] = processStudents([{ id: 's1', name: 'Anaya', mappings: [mapping, afternoon] }], [], now);
    expect(student.mappings.map(entry => entry.id)).toEqual(['m1', 'm2']);
  });

  it('reports no assignment, and no mappings to act on, for an unassigned child', () => {
    const [student] = processStudents([{ id: 's1', name: 'Anaya', mappings: [] }], [], now);
    expect(student.mappings).toEqual([]);
    expect(student.hasAssignment).toBe(false);
    expect(student.route).toBe('Unassigned');
  });

  it('still renders a payload written before mappings existed', () => {
    const [student] = processStudents([{ id: 's1', name: 'Anaya', assignedRoute: 'Route 9', routeStopName: 'Gate' }], [], now);
    expect(student.mappings).toEqual([]);
    // Assigned, but with no id to change — the page must not offer a second assignment.
    expect(student.hasAssignment).toBe(true);
  });
});

describe('what a bus is actually carrying', () => {
  const onRoute = (id: string, extra: Record<string, unknown> = {}) => ({
    id, name: id,
    mappings: [{ id: 'm-' + id, routeStopId: 's1', direction: null, stopName: 'Gate', routeId: 'r1', routeName: 'North' }],
    ...extra,
  });

  it('counts children, not seats, and separates who is still awaited', () => {
    const roster = rosterForRoute(processStudents([
      onRoute('a', { boardingStatus: 'BOARDED' }),
      onRoute('b', { boardingStatus: 'ALIGHTED' }),
      onRoute('c', { onLeave: true }),
      onRoute('d'),
      // On another route entirely, so it must not be counted against this bus.
      { id: 'e', name: 'e', mappings: [{ id: 'm-e', routeStopId: 's9', direction: null, stopName: 'Elm', routeId: 'r2', routeName: 'South' }] },
    ], [], now), 'r1');

    expect(roster).toEqual({ expected: 4, aboard: 1, droppedOff: 1, onLeave: 1, awaited: 1 });
  });

  it('is empty rather than wrong when the bus has no route resolved', () => {
    const students = processStudents([onRoute('a', { boardingStatus: 'BOARDED' })], [], now);
    expect(rosterForRoute(students, null)).toEqual(EMPTY_ROSTER);
    expect(rosterForRoute(students, undefined)).toEqual(EMPTY_ROSTER);
  });

  it('still counts a child from a payload written before mappings existed', () => {
    const legacy = processStudents([{ id: 'z', name: 'z', routeId: 'r1', assignedRoute: 'North' }], [], now);
    expect(rosterForRoute(legacy, 'r1').expected).toBe(1);
  });
});

describe('whether a child can still be given a stop', () => {
  // The roster offers "Assign Route & Stop" only when hasAssignment is false, so anything
  // that sets it wrongly does not just mislabel a row — it removes the only way to fix it.
  const unassigned = (extra: Record<string, unknown>) =>
    processStudents([{ id: 's1', name: 'Anaya', ...extra }], [], now)[0];

  it('a placeholder stop name does not count as an assignment', () => {
    // A child registered with no stop came back carrying a placeholder here, which read
    // as "already assigned" and then blocked the control that would have assigned them.
    for (const placeholder of ['N/A', '—', 'None', 'No stop', '-']) {
      expect(unassigned({ stopName: placeholder }).hasAssignment).toBe(false);
      expect(unassigned({ routeStopName: placeholder }).hasAssignment).toBe(false);
    }
  });

  it('a child with nothing at all can be assigned', () => {
    const student = unassigned({});
    expect(student.hasAssignment).toBe(false);
    expect(student.route).toBe('Unassigned');
  });

  it('still refuses a second mapping on any real evidence of a first', () => {
    // Each of these is a record or an id, or a route that resolved to a real name.
    expect(unassigned({ routeStopId: 'rs1' }).hasAssignment).toBe(true);
    expect(unassigned({ routeMappings: [{ routeStopId: 'rs1' }] }).hasAssignment).toBe(true);
    expect(unassigned({ mappings: [{ id: 'm1', routeStopId: 'rs1', routeId: 'r1', routeName: 'North', stopName: 'Gate', direction: null }] }).hasAssignment).toBe(true);
    expect(unassigned({ assignedRoute: 'South', routeStopName: 'Library' }).hasAssignment).toBe(true);
    expect(unassigned({ routeName: 'North' }).hasAssignment).toBe(true);
  });

  it('an explicitly Unassigned route label is not evidence', () => {
    expect(unassigned({ assignedRoute: 'Unassigned', stopName: 'N/A' }).hasAssignment).toBe(false);
    expect(unassigned({ routeName: 'Unassigned' }).hasAssignment).toBe(false);
  });
});
