/**
 * Google Maps JS SDK loader and geocoding.
 *
 * The browser key is HTTP-referrer restricted, which means the REST web services
 * (maps.googleapis.com/maps/api/geocode/json and friends) reject it — those need an
 * unrestricted or IP-restricted key. Everything here therefore goes through the JS SDK's
 * own classes, which authenticate by referrer and work with the key we have.
 */

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
export const hasMapsKey = Boolean(KEY);

/** Set when Google rejects the key — a wrong referrer otherwise renders blank, silently. */
export let mapsAuthFailed = false;

let loader: Promise<typeof google.maps> | null = null;

// One script tag per page for the lifetime of the tab. Maps JS is billed per load, so a
// second injection is both a duplicate global and a duplicate charge.
export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (!KEY) return Promise.reject(new Error('No Google Maps API key configured.'));
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('Maps requires a browser.'));
    if (window.google?.maps) return resolve(window.google.maps);

    // Google calls this instead of throwing when the key or referrer is wrong. Without it
    // the failure is an empty grey box and no console error worth reading.
    (window as any).gm_authFailure = () => {
      mapsAuthFailed = true;
      window.dispatchEvent(new Event('gm-auth-failure'));
    };

    // Readiness comes from Google's own callback, not from the script's onload. Under
    // loading=async, onload fires while google.maps is still a stub — importLibrary may
    // not exist yet and google.maps.Map certainly does not, which is what produced both
    // "Map is not a constructor" and "loaded without its map library". The callback fires
    // only once the API is genuinely usable.
    const CB = '__voltavaMapsReady';
    (window as any)[CB] = async () => {
      const maps = (window as any).google?.maps;
      try {
        if (!maps) throw new Error('Google Maps loaded but is unavailable.');
        // Geocoding is a separate library; the map itself is ready by the callback.
        if (typeof maps.importLibrary === 'function') await maps.importLibrary('geocoding');
        if (typeof maps.Map !== 'function') throw new Error('Google Maps loaded without its map library.');
        resolve(maps);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Google Maps failed to initialise.'));
      } finally {
        delete (window as any)[CB];
      }
    };

    const el = document.createElement('script');
    el.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&loading=async&v=weekly&callback=${CB}`;
    el.async = true;
    el.onerror = () => reject(new Error('Google Maps failed to load. Check the network connection.'));
    document.head.appendChild(el);
  });

  return loader;
}

let geocoder: google.maps.Geocoder | null = null;
const getGeocoder = async (): Promise<google.maps.Geocoder> => {
  const maps = (await loadGoogleMaps()) as any;
  if (!geocoder) {
    // Take the constructor from the namespace if it landed there, otherwise from the
    // library object itself — importLibrary is documented to return it, and only
    // documented as a side effect to populate google.maps.
    const Ctor = maps.Geocoder ?? (await maps.importLibrary('geocoding')).Geocoder;
    geocoder = new Ctor() as google.maps.Geocoder;
  }
  return geocoder!;
};

/**
 * An address for a dropped pin.
 *
 * Nominatim capped this at one request per second, so clicking out five stops quickly
 * left four of them named "Stop 3". Google has no such limit at this volume, which is the
 * whole reason the names now survive rapid placement.
 */
export async function geocodeLatLng(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await (await getGeocoder()).geocode({ location: { lat, lng } });
    return res.results?.[0]?.formatted_address ?? null;
  } catch {
    return null;
  }
}

export async function geocodeAddress(
  query: string,
): Promise<{ lat: number; lng: number; name: string }[]> {
  try {
    const res = await (await getGeocoder()).geocode({ address: query });
    return (res.results ?? []).slice(0, 5).map(r => ({
      lat: r.geometry.location.lat(),
      lng: r.geometry.location.lng(),
      name: r.formatted_address,
    }));
  } catch {
    return [];
  }
}
