import { test, expect } from 'vitest';
import { needsAttention } from '../components/views/overview/NeedsAttention';

// 08:00 IST on 27 Sep 2026.
const NOW = Date.parse('2026-09-27T02:30:00.000Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const bus = (id: string, fixMinAgo: number | null) => ({
  id, registrationNumber: id.toUpperCase(),
  gpsLogs: fixMinAgo === null ? [] : [{ lat: 25.6, lng: 85.1, timestamp: ago(fixMinAgo) }],
});

test('flags silence only on a bus carrying a running trip, most urgent first', () => {
  const items = needsAttention({
    now: NOW,
    buses: [bus('b1', 30), bus('b2', 1), bus('b3', 45)],
    drivers: [{ id: 'd1', name: 'Ravi', phone: '+919800000000' }],
    routes: [{
      id: 'r1', name: 'Kankarbagh',
      trips: [
        { id: 't1', status: 'DELAYED', busId: 'b1' },        // late AND silent
        { id: 't2', status: 'ON_SCHEDULE', busId: 'b2' },    // healthy → nothing
        { id: 't3', status: 'COMPLETED', busId: 'b3' },      // silent but parked → nothing
        { id: 't4', status: 'PLANNED', busId: 'b3', driverId: 'd1', scheduledStart: ago(15) },
      ],
    }],
  });
  expect(items.map(i => i.key)).toEqual(['gps:t1', 'late:t4', 'delay:t1']);
  expect(items[1].href).toBe('tel:+919800000000');
});

test('a bus with no fix at all on a running trip is not treated as fine', () => {
  const [item] = needsAttention({
    now: NOW, drivers: [], buses: [bus('b1', null)],
    routes: [{ id: 'r1', name: 'R', trips: [{ id: 't1', status: 'ON_SCHEDULE', busId: 'b1' }] }],
  });
  expect(item.detail).toContain('no GPS fix yet');
});

test('a planned trip is late only after the grace period, and only today', () => {
  const trips = [
    { id: 'soon', status: 'PLANNED', scheduledStart: ago(5) },
    { id: 'lastWeek', status: 'PLANNED', scheduledStart: ago(7 * 24 * 60) },
  ];
  expect(needsAttention({ now: NOW, drivers: [], buses: [], routes: [{ id: 'r', name: 'R', trips }] })).toEqual([]);
});
