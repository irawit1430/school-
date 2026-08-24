import polyline from '@mapbox/polyline';

export type Stop = {
  uid?: string;      // stable client-side id (survives duplicate coordinates / reorder)
  id?: string;       // backend id (present when editing an existing route)
  lat: number;
  lng: number;
  name?: string;
  address?: string;
  orderIdx?: number;
  expectedArrivalMinutes?: number;
};
export type OsrmResult = {
  geometry: string;
  latLngs: [number, number][];
  distanceKm: number;
  durationMin: number;
  legMinutes: number[]; // per-stop arrival offset from origin
};

export async function fetchOsrmRoute(stops: Stop[]): Promise<OsrmResult | null> {
  if (stops.length < 2) return null;
  const coords = stops.map((s) => `${s.lng},${s.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=polyline`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) return null;

  const legMinutes = [0];
  route.legs.forEach((leg: any) => {
    legMinutes.push(legMinutes[legMinutes.length - 1] + Math.round(leg.duration / 60));
  });

  return {
    geometry: route.geometry,
    latLngs: polyline.decode(route.geometry) as [number, number][],
    distanceKm: route.distance / 1000,
    durationMin: Math.round(route.duration / 60),
    legMinutes,
  };
}

// Reverse-geocode (Nominatim) — 1 req/sec limit; debounce clicks.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.display_name ?? null;
}

// Forward-geocode (Nominatim) for Search functionality
export async function searchLocation(query: string): Promise<{lat: number, lng: number, name: string}[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((item: any) => ({
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    name: item.display_name
  }));
}
