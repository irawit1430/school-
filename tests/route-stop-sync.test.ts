import { beforeEach, describe, expect, it, vi } from 'vitest';

// Saving an edited route only rewrote the stops that themselves changed. Moving one pin
// changes the drive time to every stop after it, so those kept their old minutes, and the
// parents' ETA is built from them.

vi.mock('@/lib/api', () => ({
  createRoute: vi.fn(), updateRoute: vi.fn(), connectSocket: vi.fn(),
  createStop: vi.fn(), updateStop: vi.fn(), deleteStop: vi.fn(), reorderStops: vi.fn(),
}));
vi.mock('@/components/map/GoogleRouteMap', () => ({ default: () => null }));

import * as api from '@/lib/api';
import { syncRouteStops } from '@/components/map/RouteMapEditor';
import { nextSchoolMorning } from '@/lib/googleRoutes';

const saved = [
  { id: 's1', name: 'Gate', lat: 1, lng: 1, address: null, orderIdx: 0, expectedArrivalMinutes: 0 },
  { id: 's2', name: 'Park', lat: 2, lng: 2, address: null, orderIdx: 1, expectedArrivalMinutes: 8 },
  { id: 's3', name: 'Mall', lat: 3, lng: 3, address: null, orderIdx: 2, expectedArrivalMinutes: 15 },
];
const editing = () => saved.map((s) => ({ ...s, uid: s.id }));

describe('syncRouteStops', () => {
  beforeEach(() => vi.resetAllMocks());

  it('rewrites a later stop whose minutes changed, though the stop itself did not move', async () => {
    const stops = editing();
    stops[1] = { ...stops[1], lat: 2.5 }; // the admin drags the middle pin

    await syncRouteStops('r1', saved, stops, [0, 11, 19]);

    const updated = vi.mocked(api.updateStop).mock.calls.map(([, id, body]) => [id, body.expectedArrivalMinutes]);
    expect(updated).toEqual([['s2', 11], ['s3', 19]]);
  });

  it('leaves stops alone when nothing about them changed', async () => {
    await syncRouteStops('r1', saved, editing(), [0, 8, 15]);

    expect(api.updateStop).not.toHaveBeenCalled();
  });
});

describe('nextSchoolMorning', () => {
  it('is 07:30 India time the same day when asked before then', () => {
    // 06:00 IST on Tuesday 8 September
    expect(nextSchoolMorning(new Date('2026-09-08T00:30:00Z')).toISOString()).toBe('2026-09-08T02:00:00.000Z');
  });

  it('is the next morning when asked in the afternoon', () => {
    // 15:00 IST on Tuesday
    expect(nextSchoolMorning(new Date('2026-09-08T09:30:00Z')).toISOString()).toBe('2026-09-09T02:00:00.000Z');
  });

  it('skips Sunday', () => {
    // 15:00 IST on Saturday 12 September
    expect(nextSchoolMorning(new Date('2026-09-12T09:30:00Z')).toISOString()).toBe('2026-09-14T02:00:00.000Z');
  });
});
