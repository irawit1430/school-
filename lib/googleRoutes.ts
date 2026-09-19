import polyline from '@mapbox/polyline';
import { loadGoogleMaps } from './googleMaps';
import type { OsrmResult, Stop } from './osrm';

export type TrafficRouteResult = OsrmResult & {
  provider: 'google';
  trafficAware: true;
};

type GoogleRouteShape = {
  path?: Array<{ lat: number | (() => number); lng: number | (() => number) }>;
  distanceMeters?: number;
  durationMillis?: number;
  legs?: Array<{ durationMillis?: number }>;
};

const coordinate = (value: number | (() => number)) =>
  typeof value === 'function' ? value() : value;

/**
 * Calculate the route that Google considers most accurate for current traffic.
 *
 * Sources:
 * https://developers.google.com/maps/documentation/javascript/routes/traffic-options
 * https://developers.google.com/maps/documentation/javascript/routes/intermediate-waypoints
 */
export async function fetchGoogleTrafficRoute(
  stops: Stop[],
  departureTime: Date = new Date(Date.now() + 60_000),
): Promise<TrafficRouteResult | null> {
  if (stops.length < 2) return null;

  const maps = (await loadGoogleMaps()) as any;
  const { Route } = await maps.importLibrary('routes');
  const { routes } = await Route.computeRoutes({
    origin: { lat: stops[0].lat, lng: stops[0].lng },
    destination: { lat: stops.at(-1)!.lat, lng: stops.at(-1)!.lng },
    intermediates: stops.slice(1, -1).map(stop => ({
      location: { lat: stop.lat, lng: stop.lng },
    })),
    travelMode: 'DRIVING',
    routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
    trafficModel: 'BEST_GUESS',
    departureTime,
    fields: ['path', 'distanceMeters', 'durationMillis', 'legs.durationMillis'],
  });

  const route = routes?.[0] as GoogleRouteShape | undefined;
  if (!route?.path?.length || route.distanceMeters == null || route.durationMillis == null) {
    return null;
  }

  const latLngs = route.path.map(point => [
    coordinate(point.lat),
    coordinate(point.lng),
  ] as [number, number]);
  const legMinutes = [0];
  for (const leg of route.legs ?? []) {
    const previousMinutes = legMinutes.at(-1) ?? 0;
    legMinutes.push(previousMinutes + Math.round((leg.durationMillis ?? 0) / 60_000));
  }

  return {
    geometry: polyline.encode(latLngs),
    latLngs,
    distanceKm: route.distanceMeters / 1000,
    durationMin: Math.round(route.durationMillis / 60_000),
    legMinutes,
    provider: 'google',
    trafficAware: true,
  };
}
