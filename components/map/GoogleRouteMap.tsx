"use client";
import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMaps';
import { AlertTriangle } from 'lucide-react';
import type { Stop } from '@/lib/osrm';

interface Props {
  stops: Stop[];
  path: [number, number][] | null;
  liveBusPosition: [number, number] | null;
  centerPos: [number, number] | null;
  defaultCenter: [number, number];
  defaultZoom: number;
  disabled?: boolean;
  onAdd: (lat: number, lng: number) => void;
  onDragEnd: (uid: string, lat: number, lng: number) => void;
}

// Built lazily: google.maps.SymbolPath does not exist until the SDK has loaded.
const stopIcon = (): google.maps.Symbol => ({
  path: google.maps.SymbolPath.CIRCLE,
  scale: 11,
  fillColor: '#ea580c',
  fillOpacity: 1,
  strokeColor: '#ffffff',
  strokeWeight: 2,
  labelOrigin: new google.maps.Point(0, 0),
});

/**
 * The route editor's map.
 *
 * Imperative rather than a React wrapper on purpose: the map instance must outlive every
 * re-render. Maps JS is billed per load, so recreating it when a stop moves would charge
 * for each edit, and the camera would jump back to centre every time.
 */
export default function GoogleRouteMap({
  stops, path, liveBusPosition, centerPos, defaultCenter, defaultZoom,
  disabled, onAdd, onDragEnd,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const lineRef = useRef<google.maps.Polyline | null>(null);
  const busRef = useRef<google.maps.Marker | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Handlers change identity every render; the map listener is bound once, so it reads
  // the current one from a ref instead of being torn down and rebound each time.
  const addRef = useRef(onAdd);
  const dragRef = useRef(onDragEnd);
  const disabledRef = useRef(disabled);
  useEffect(() => {
    addRef.current = onAdd;
    dragRef.current = onDragEnd;
    disabledRef.current = disabled;
  }, [onAdd, onDragEnd, disabled]);

  useEffect(() => {
    let cancelled = false;
    const onAuthFail = () => setError('Google rejected this key for this website. The key’s allowed referrers need to include this domain.');
    window.addEventListener('gm-auth-failure', onAuthFail);

    loadGoogleMaps()
      .then(maps => {
        if (cancelled || !hostRef.current) return;
        const map = new maps.Map(hostRef.current, {
          center: { lat: defaultCenter[0], lng: defaultCenter[1] },
          zoom: defaultZoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (disabledRef.current || !e.latLng) return;
          addRef.current(e.latLng.lat(), e.latLng.lng());
        });
        mapRef.current = map;
        setReady(true);
      })
      .catch(err => !cancelled && setError(err?.message ?? 'The map could not be loaded.'));

    return () => {
      cancelled = true;
      window.removeEventListener('gm-auth-failure', onAuthFail);
    };
    // Mounted once. defaultCenter/defaultZoom are the initial camera only — re-running
    // this would rebuild the map and bill another load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Markers are diffed by uid rather than cleared and rebuilt, so dragging one stop does
  // not make every other marker blink.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const seen = new Set<string>();
    stops.forEach((stop, i) => {
      const uid = stop.uid ?? String(i);
      seen.add(uid);
      const pos = { lat: stop.lat, lng: stop.lng };
      let marker = markersRef.current.get(uid);

      if (!marker) {
        marker = new google.maps.Marker({ map, position: pos, draggable: !disabled });
        marker.addListener('dragend', (e: google.maps.MapMouseEvent) => {
          if (e.latLng) dragRef.current(uid, e.latLng.lat(), e.latLng.lng());
        });
        markersRef.current.set(uid, marker);
      } else {
        const at = marker.getPosition();
        if (!at || at.lat() !== stop.lat || at.lng() !== stop.lng) marker.setPosition(pos);
        marker.setDraggable(!disabled);
      }
      marker.setIcon(stopIcon());
      marker.setLabel({ text: String(i + 1), color: '#ffffff', fontSize: '11px', fontWeight: '700' });
      marker.setTitle(stop.name || `Stop ${i + 1}`);
    });

    markersRef.current.forEach((marker, uid) => {
      if (seen.has(uid)) return;
      marker.setMap(null);
      markersRef.current.delete(uid);
    });
  }, [stops, disabled, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!path || path.length === 0) {
      lineRef.current?.setMap(null);
      lineRef.current = null;
      return;
    }
    const coords = path.map(([lat, lng]) => ({ lat, lng }));
    if (lineRef.current) lineRef.current.setPath(coords);
    else lineRef.current = new google.maps.Polyline({
      map, path: coords, strokeColor: '#ea580c', strokeWeight: 4, strokeOpacity: 0.85,
    });
  }, [path, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!liveBusPosition) {
      busRef.current?.setMap(null);
      busRef.current = null;
      return;
    }
    const pos = { lat: liveBusPosition[0], lng: liveBusPosition[1] };
    if (busRef.current) busRef.current.setPosition(pos);
    else busRef.current = new google.maps.Marker({
      map, position: pos, zIndex: 999, title: 'Live bus',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 9, fillColor: '#0284c7', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3,
      },
    });
  }, [liveBusPosition, ready]);

  useEffect(() => {
    if (!mapRef.current || !ready || !centerPos) return;
    mapRef.current.panTo({ lat: centerPos[0], lng: centerPos[1] });
    if ((mapRef.current.getZoom() ?? 0) < 15) mapRef.current.setZoom(15);
  }, [centerPos, ready]);

  if (error) {
    return (
      <div className="h-full w-full rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center p-6">
        <div className="flex items-start gap-3 max-w-sm">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-800">The map could not load</p>
            <p className="text-xs text-slate-600 mt-1">{error}</p>
            <p className="text-xs text-slate-500 mt-2">
              Stops can still be added by searching for an address — only the map view is affected.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full rounded-lg" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-lg text-slate-500 text-sm font-medium gap-3">
          <span className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          Loading map…
        </div>
      )}
    </div>
  );
}
