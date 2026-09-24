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

const IST_OFFSET_MS = 330 * 60_000; // India has no daylight saving
const DAY_MS = 86_400_000;

/**
 * The next school morning at 07:30 India time, Sunday skipped: when these buses drive.
 * Stop times used to be priced at the moment the admin pressed save, so a route edited
 * at 3 pm carried 3 pm traffic into every 7:30 am ETA.
 */
export function nextSchoolMorning(now: Date = new Date()): Date {
  const wall = new Date(now.getTime() + IST_OFFSET_MS); // UTC fields read India wall time
  let at = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), 7, 30) - IST_OFFSET_MS;
  // Google refuses a departure in the past; a minute's margin covers the round trip.
  if (at <= now.getTime() + 60_000) at += DAY_MS;
  if (new Date(at + IST_OFFSET_MS).getUTCDay() === 0) at += DAY_MS;
  return new Date(at);
}

/**
 * Calculate the route that Google considers most accurate for school-morning traffic.
 *
 * Sources:
 * https://developers.google.com/maps/documentation/javascript/routes/traffic-options
 * https://developers.google.com/maps/documentation/javascript/routes/intermediate-waypoints
 */
export async function fetchGoogleTrafficRoute(
  stops: Stop[],
  departureTime: Date = nextSchoolMorning(),
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
