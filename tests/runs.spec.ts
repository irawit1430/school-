import { test, expect } from '@playwright/test';
import { describeDays, validateRun, selectedDays, toRunPayload, previewDatesFor, describeClosureImpact, datesBetween, isPlatformClosure } from '../lib/runs';

const base = {
  name: 'Morning A', direction: 'TO_SCHOOL' as const, departure: '07:15',
  busId: 'b1', driverId: 'd1', startDate: '2026-06-01', endDate: '2027-03-31',
  mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false,
};

test('a weekday pattern reads as a range, not seven checkboxes', () => {
  expect(describeDays(base)).toBe('Mon–Fri');
  expect(describeDays({ ...base, sat: true, sun: true })).toBe('Every day');
  expect(describeDays({ mon: false, sat: true, sun: true })).toBe('Weekends');
  expect(describeDays({ mon: true, wed: true, fri: true })).toBe('Mon, Wed, Fri');
  expect(describeDays({ mon: true, tue: true, wed: true })).toBe('Mon–Wed');
  expect(describeDays({})).toBe('Never');
});

test('a valid run has nothing to report', () => {
  expect(validateRun(base)).toEqual([]);
});

test('a run without crew is refused — it would silently produce no trips', () => {
  const noBus = validateRun({ ...base, busId: '' });
  expect(noBus.join(' ')).toContain('bus');

  const noDriver = validateRun({ ...base, driverId: '' });
  expect(noDriver.join(' ')).toContain('driver');

  // The message has to say why, or an admin reads it as a pointless field.
  expect(noBus.join(' ')).toContain('cannot become a trip');
});

test('a run on no days is refused', () => {
  const problems = validateRun({ ...base, mon: false, tue: false, wed: false, thu: false, fri: false });
  expect(problems.join(' ')).toContain('at least one day');
});

test('departure must be a wall clock time, never a timestamp', () => {
  expect(validateRun({ ...base, departure: '7:15' }).join(' ')).toContain('07:15');
  expect(validateRun({ ...base, departure: '25:00' }).join(' ')).toContain('07:15');
  expect(validateRun({ ...base, departure: '2026-06-01T07:15:00Z' }).join(' ')).toContain('07:15');
  expect(validateRun({ ...base, departure: '07:15' })).toEqual([]);
});

test('an end date before the start date is caught', () => {
  const problems = validateRun({ ...base, startDate: '2026-09-01', endDate: '2026-06-01' });
  expect(problems.join(' ')).toContain('end date is before');

  // Same day is a legitimate single-day run.
  expect(validateRun({ ...base, startDate: '2026-09-01', endDate: '2026-09-01' })).toEqual([]);
});

test('the payload carries only what the API accepts', () => {
  const payload = toRunPayload({ ...base, ...{ id: 'r1', hasCrew: true, active: true } } as any);
  expect(payload).not.toHaveProperty('id');
  expect(payload).not.toHaveProperty('hasCrew');
  expect(payload).not.toHaveProperty('active');
  expect(payload.sat).toBe(false); // absent days are sent as false, not omitted
  expect(payload.departure).toBe('07:15');
});

test('selectedDays keeps calendar order regardless of how they were set', () => {
  expect(selectedDays({ fri: true, mon: true, wed: true })).toEqual(['mon', 'wed', 'fri']);
});

test('previewDatesFor reads flat and grouped payloads, and never mixes runs', () => {
  const flat = [
    { runId: 'a', date: '2026-09-03', status: 'RUNNING' },
    { runId: 'b', date: '2026-09-03', status: 'OFF_PATTERN' },
  ];
  expect(previewDatesFor(flat, 'a').map(d => d.status)).toEqual(['RUNNING']);

  const grouped = [
    { runId: 'a', dates: [{ date: '2026-09-03', status: 'RUNNING' }] },
    { runId: 'b', dates: [{ date: '2026-09-03', status: 'OFF_PATTERN' }] },
  ];
  expect(previewDatesFor(grouped, 'b').map(d => d.status)).toEqual(['OFF_PATTERN']);

  // A payload with no run identity at all belongs to the run that was asked for.
  expect(previewDatesFor([{ date: '2026-09-03', status: 'RUNNING' }], 'a')).toHaveLength(1);
  expect(previewDatesFor(null, 'a')).toEqual([]);
});

test('a future holiday with no trips yet does not read as "no impact"', () => {
  // The trap: tripCount is 0 because nothing has materialised, not because nothing runs.
  const future = describeClosureImpact({ runCount: 3, tripCount: 0 });
  expect(future).toContain('3 schedules will not operate');
  expect(future).toContain('will not be created');

  expect(describeClosureImpact({ runCount: 1, tripCount: 2 }))
    .toBe('1 schedule will not operate. 2 trips have already been created and will be cancelled now.');

  // Genuinely nothing scheduled — the only case that may say nothing changes.
  expect(describeClosureImpact({ runCount: 0, tripCount: 0 }))
    .toBe('No schedules operate on these dates, so nothing changes.');
  expect(describeClosureImpact(null)).toContain('nothing changes');
});

test('a closure range expands to one date per day, DST included', () => {
  expect(datesBetween('2026-10-19', '2026-10-23'))
    .toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);

  // Single day, and a backwards range is not a silent 365-day loop.
  expect(datesBetween('2026-10-19', '2026-10-19')).toEqual(['2026-10-19']);
  expect(datesBetween('2026-10-23', '2026-10-19')).toEqual([]);

  // Across a DST boundary in most northern-hemisphere zones: no repeated or skipped day.
  const week = datesBetween('2026-10-30', '2026-11-03');
  expect(week).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
  expect(new Set(week).size).toBe(week.length);

  expect(datesBetween('2026-01-01', '2027-01-01').length).toBe(62);
});

test('a platform closure is the one with no school on it', () => {
  expect(isPlatformClosure({ schoolId: null })).toBe(true);
  expect(isPlatformClosure({ schoolId: 'school-1' })).toBe(false);
});
