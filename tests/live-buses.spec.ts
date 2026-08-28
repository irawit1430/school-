import { test, expect } from '@playwright/test';
import { subscribeToBusPositions, mergeBusPosition } from '../lib/liveBuses';

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

test('a bus that has not moved keeps its identity so React can skip it', () => {
  const bus = { id: 'a', capacity: 40, gpsLogs: [{ lat: 1, lng: 2, speed: 0 }] };
  const same = mergeBusPosition(bus, { busId: 'a', lat: 1, lng: 2, speed: 0 });
  expect(same).toBe(bus); // same reference, not a copy

  const moved = mergeBusPosition(bus, { busId: 'a', lat: 9, lng: 2, speed: 30 });
  expect(moved).not.toBe(bus);
  expect(moved.gpsLogs[0].lat).toBe(9);
});

test('a position-only packet does not blank the fields it omits', () => {
  // The TCP path real hardware uses sends no driver, route or capacity.
  const bus = { id: 'a', capacity: 40, driverName: 'Asha', routeName: 'Route 4', gpsLogs: [{ lat: 1, lng: 2, speed: 0 }] };
  const merged = mergeBusPosition(bus, { busId: 'a', lat: 5, lng: 6, speed: 20 });

  expect(merged.driverName).toBe('Asha');
  expect(merged.routeName).toBe('Route 4');
  expect(merged.capacity).toBe(40);
});
