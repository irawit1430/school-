import { test, expect } from 'vitest';
import { subscribeToBusPositions, mergeBusPosition, reconcileFleet, trackerState, describeFreshness } from '../lib/liveBuses';

// A fake socket that just records handlers and lets a test fire packets.
function fakeSocket() {
  const handlers: Record<string, ((d: any) => void)[]> = {};
  return {
    on(event: string, fn: (d: any) => void) { (handlers[event] ||= []).push(fn); },
    off(event: string, fn: (d: any) => void) {
      handlers[event] = (handlers[event] || []).filter(h => h !== fn);
    },
    emit(event: string, data: any) { (handlers[event] || []).forEach(h => h(data)); },
    count(event: string) { return (handlers[event] || []).length; },
  };
}

test('a burst of packets becomes one flush, newest position per bus', async () => {
  const socket = fakeSocket();
  const flushes: Map<string, any>[] = [];
  const stop = subscribeToBusPositions(socket as any, b => flushes.push(b), 50);

  // 30 packets across two buses — what a real fleet produces between flushes.
  for (let i = 0; i < 15; i++) {
    socket.emit('location_update', { busId: 'a', lat: i, lng: 0, speed: i });
    socket.emit('location_update', { busId: 'b', lat: i, lng: 1, speed: i });
  }
  expect(flushes.length).toBe(0); // nothing applied yet — that's the whole point

  await new Promise(r => setTimeout(r, 90));
  stop();

  expect(flushes.length).toBe(1);
  expect(flushes[0].size).toBe(2);
  expect(flushes[0].get('a').lat).toBe(14); // last position wins
  expect(flushes[0].get('b').lat).toBe(14);
});

test('an idle fleet never flushes, and unsubscribing detaches the handler', async () => {
  const socket = fakeSocket();
  const flushes: Map<string, any>[] = [];
  const stop = subscribeToBusPositions(socket as any, b => flushes.push(b), 20);

  await new Promise(r => setTimeout(r, 70));
  expect(flushes.length).toBe(0);

  expect(socket.count('location_update')).toBe(1);
  stop();
  expect(socket.count('location_update')).toBe(0);
});

test('a parked bus that is still reporting gets fresher, not staler', () => {
  // The case this file used to get backwards. Children board at stops, so a bus sitting
  // still is the one most worth watching — and it reports the same coordinates every few
  // seconds. Keeping the held row meant keeping its old timestamp, so after ten minutes
  // of healthy reporting the fleet screen called it 'Not reporting'.
  const bus = { id: 'a', capacity: 40, gpsLogs: [{ lat: 1, lng: 2, speed: 0, timestamp: '2026-09-25T04:00:00.000Z' }] };
  const later = mergeBusPosition(bus, { busId: 'a', lat: 1, lng: 2, speed: 0, timestamp: '2026-09-25T04:10:00.000Z' });

  expect(later.gpsLogs[0].timestamp).toBe('2026-09-25T04:10:00.000Z');
  expect(trackerState(later, Date.parse('2026-09-25T04:10:30.000Z'))).toBe('live');
  // And the same reading before the fix, to show what it cost:
  expect(trackerState(bus, Date.parse('2026-09-25T04:10:30.000Z'))).toBe('silent');

  const moved = mergeBusPosition(bus, { busId: 'a', lat: 9, lng: 2, speed: 30, timestamp: '2026-09-25T04:01:00.000Z' });
  expect(moved.gpsLogs[0].lat).toBe(9);
});

test('a late packet cannot drag a marker back in time', () => {
  const bus = { id: 'a', gpsLogs: [{ lat: 5, lng: 5, speed: 20, timestamp: '2026-09-25T04:05:00.000Z' }] };

  // Retransmit of an older fix, arriving after the newer one.
  const stale = mergeBusPosition(bus, { busId: 'a', lat: 1, lng: 1, speed: 0, timestamp: '2026-09-25T04:02:00.000Z' });
  expect(stale).toBe(bus);

  // Duplicate delivery of the fix we already hold.
  const dupe = mergeBusPosition(bus, { busId: 'a', lat: 5, lng: 5, speed: 20, timestamp: '2026-09-25T04:05:00.000Z' });
  expect(dupe).toBe(bus);
});

test('a packet with no fix time never claims one', () => {
  const bus = { id: 'a', gpsLogs: [] };
  const merged = mergeBusPosition(bus, { busId: 'a', lat: 1, lng: 2, speed: 0 });

  // `new Date().toISOString()` used to go in here, which made this indistinguishable
  // from a fresh fix.
  expect(merged.gpsLogs[0].timestamp).toBeNull();
  expect(trackerState(merged)).toBe('unknown');
  expect(merged.gpsLogs[0].receivedAt).toBeTruthy();
  expect(describeFreshness(merged)).toMatch(/no fix time/);
});

test('freshness unknown is said out loud, not left blank', () => {
  expect(describeFreshness({ gpsLogs: [{ lat: 1, lng: 2 }] })).toBe('Freshness unknown');
  expect(describeFreshness({ gpsLogs: [] })).toBe('Freshness unknown');
});

test('refreshing the fleet does not revert markers to the REST position', () => {
  // Refresh replaced the whole array, so every socket position was thrown away and each
  // marker snapped back to the minutes-old gpsLogs the REST row carried.
  const onScreen = [{ id: 'a', name: 'Old name', gpsLogs: [{ lat: 9, lng: 9, speed: 30, timestamp: '2026-09-25T04:10:00.000Z' }], speeding: true }];
  const fromRest = [{ id: 'a', name: 'New name', gpsLogs: [{ lat: 1, lng: 1, speed: 0, timestamp: '2026-09-25T04:00:00.000Z' }] }];

  const [bus] = reconcileFleet(onScreen, fromRest);
  expect(bus.gpsLogs[0].lat).toBe(9);      // newer observation kept
  expect(bus.speeding).toBe(true);
  expect(bus.name).toBe('New name');       // identity still comes from REST

  // A REST row that really is newer does win.
  const newerRest = [{ id: 'a', gpsLogs: [{ lat: 2, lng: 2, speed: 0, timestamp: '2026-09-25T04:20:00.000Z' }] }];
  expect(reconcileFleet(onScreen, newerRest)[0].gpsLogs[0].lat).toBe(2);

  // A bus we have never seen arrives as-is.
  expect(reconcileFleet([], fromRest)[0].name).toBe('New name');
});

test('a position-only packet does not blank the fields it omits', () => {
  // The TCP path real hardware uses sends no driver, route or capacity.
  const bus = { id: 'a', capacity: 40, driverName: 'Asha', routeName: 'Route 4', gpsLogs: [{ lat: 1, lng: 2, speed: 0 }] };
  const merged = mergeBusPosition(bus, { busId: 'a', lat: 5, lng: 6, speed: 20 });

  expect(merged.driverName).toBe('Asha');
  expect(merged.routeName).toBe('Route 4');
  expect(merged.capacity).toBe(40);
});
