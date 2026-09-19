import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadGoogleMaps } = vi.hoisted(() => ({ loadGoogleMaps: vi.fn() }));

vi.mock('./googleMaps', () => ({ loadGoogleMaps }));

import { fetchGoogleTrafficRoute } from './googleRoutes';

describe('fetchGoogleTrafficRoute', () => {
  beforeEach(() => loadGoogleMaps.mockReset());

  it('requests the supplied stops in order with optimal live-traffic routing', async () => {
    const computeRoutes = vi.fn().mockResolvedValue({
      routes: [{
        path: [{ lat: 12.9, lng: 77.5 }, { lat: 13, lng: 77.6 }],
        distanceMeters: 12_500,
        durationMillis: 1_800_000,
        legs: [{ durationMillis: 600_000 }, { durationMillis: 1_200_000 }],
      }],
    });
    loadGoogleMaps.mockResolvedValue({
      importLibrary: vi.fn().mockResolvedValue({ Route: { computeRoutes } }),
    });

    const departureTime = new Date('2026-09-08T08:00:00.000Z');
    const result = await fetchGoogleTrafficRoute([
      { lat: 12.9, lng: 77.5 },
      { lat: 12.95, lng: 77.55 },
      { lat: 13, lng: 77.6 },
    ], departureTime);

    expect(computeRoutes).toHaveBeenCalledWith({
      origin: { lat: 12.9, lng: 77.5 },
      destination: { lat: 13, lng: 77.6 },
      intermediates: [{ location: { lat: 12.95, lng: 77.55 } }],
      travelMode: 'DRIVING',
      routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      trafficModel: 'BEST_GUESS',
      departureTime,
      fields: ['path', 'distanceMeters', 'durationMillis', 'legs.durationMillis'],
    });
    expect(result).toMatchObject({
      distanceKm: 12.5,
      durationMin: 30,
      legMinutes: [0, 10, 30],
      provider: 'google',
      trafficAware: true,
      latLngs: [[12.9, 77.5], [13, 77.6]],
    });
    expect(result?.geometry).toBeTruthy();
  });

  it('returns null when fewer than two stops are supplied', async () => {
    await expect(fetchGoogleTrafficRoute([{ lat: 12.9, lng: 77.5 }])).resolves.toBeNull();
    expect(loadGoogleMaps).not.toHaveBeenCalled();
  });
});
