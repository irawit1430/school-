import { test, expect } from '@playwright/test';
import { describeDays, validateRun, selectedDays, toRunPayload } from '../lib/runs';

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
