// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { calendarDay, leaveDays, formatDay } from './leaves';

// One day of leave on 20 Aug in IST, exactly as GET /api/schools/:id/leaves returns it.
const oneDay = {
  startDate: '2026-08-19T18:30:00.000Z',
  endDate: '2026-08-20T18:29:59.999Z',
  startDay: '2026-08-20',
  endDay: '2026-08-20',
  timezone: 'Asia/Kolkata',
};

describe('leaveDays', () => {
  it('reads the school-calendar days the server sent', () => {
    expect(leaveDays(oneDay)).toEqual({ start: '2026-08-20', end: '2026-08-20' });
  });

  it('prefers the days over the instants, so the browser timezone has no say', () => {
    const disagreeing = { ...oneDay, startDate: '2026-08-17T18:30:00.000Z', endDate: '2026-08-18T18:29:59.999Z' };
    expect(leaveDays(disagreeing)).toEqual({ start: '2026-08-20', end: '2026-08-20' });
  });

  it("converts an older row's instants in the school's timezone, not the browser's", () => {
    const legacy = { ...oneDay, startDay: null, endDay: null, timezone: null };
    expect(leaveDays(legacy)).toEqual({ start: '2026-08-20', end: '2026-08-20' });
  });

  it("uses the row's own timezone when it has one", () => {
    // Midnight on the 20th in Tokyo. In IST that instant is still the evening of the 19th.
    const tokyo = { startDate: '2026-08-19T15:00:00.000Z', endDate: '2026-08-20T14:59:59.999Z', timezone: 'Asia/Tokyo' };
    expect(leaveDays(tokyo)).toEqual({ start: '2026-08-20', end: '2026-08-20' });
  });
});

describe('calendarDay', () => {
  it('returns null for an unreadable instant rather than "Invalid Date"', () => {
    expect(calendarDay('not a date', 'Asia/Kolkata')).toBeNull();
  });

  it('falls back to the default school timezone for an unknown zone name', () => {
    expect(calendarDay('2026-08-19T18:30:00.000Z', 'Not/AZone')).toBe('2026-08-20');
  });
});

describe('formatDay', () => {
  it('formats the given day, not the day before, whatever the timezone', () => {
    expect(formatDay('2026-08-20')).toBe(new Date(2026, 7, 20).toLocaleDateString());
  });

  it('says so when there is no usable day', () => {
    expect(formatDay(null)).toBe('Unknown date');
    expect(formatDay('2026-08-20T00:00:00Z')).toBe('Unknown date');
  });
});
