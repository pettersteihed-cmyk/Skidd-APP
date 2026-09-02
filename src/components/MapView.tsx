import { useEffect, useRef, type MutableRefObject } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN } from '@/data/resorts';
import type { Resort } from '@/types';

interface MapViewProps {
  resorts: Resort[];
  activeId: string | null;
  onSelect: (resort: Resort) => void;
  flyTarget: { lat: number; lng: number; zoom?: number; nonce: number } | null;
  showSnowMap: boolean;
  resizeTrigger: number;
  isLanding: boolean;
}

const CENTER: [number, number] = [6.5, 45.4];
const ZOOM_LANDING = 6.8;
const ZOOM_MAP = 7.5;

// Regex för lager som ska döljas på startsidan (etiketter + vägar + gränser)
const HIDE_LINE_PATTERN = /road|tunnel|bridge|ferry|admin|country|border|boundary/;

export default function MapView({ resorts, activeId, onSelect, flyTarget, showSnowMap, resizeTrigger, isLanding }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const hiddenLayersRef = useRef<string[]>([]);
  const onSelectRef = useRef(onSelect);
  const isLandingRef = useRef(isLanding);
  onSelectRef.current = onSelect;
  isLandingRef.current = isLanding;

  // Karta-initialisering
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: mapboxgl.Map;
    try {
      mapboxgl.accessToken = MAPBOX_TOKEN;
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/outdoors-v12',
        center: CENTER,
        zoom: isLandingRef.current ? ZOOM_LANDING : ZOOM_MAP,
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'bottom-right');
      map.on('load', () => {
        map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');
        map.on('zoomend', () => console.log('zoom:', map.getZoom()));
        map.setPaintProperty('aerialway', 'line-color', '#444444');
        map.setPaintProperty('aerialway', 'line-width', [
          'interpolate', ['exponential', 1.5], ['zoom'],
          10, 1.5,
          16, 2.5,
        ]);
        map.setPaintProperty('aerialway', 'line-dasharray', undefined);
        map.setLayerZoomRange('aerialway', 9, 24);
        map.addSource('opensnowmap', {
          type: 'raster',
          tiles: ['https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 16,
          attribution: '© <a href="https://www.opensnowmap.org">www.opensnowmap.org</a>',
        });
        map.addLayer({
          id: 'opensnowmap-layer',
          type: 'raster',
          source: 'opensnowmap',
          minzoom: 10,
          paint: {
            'raster-opacity': [
              'interpolate', ['linear'], ['zoom'],
              10, 0,
              10.5, 1.0,
              12.5, 1.0,
              14, 0.45,
            ],
          },
        });
        // Dölj etiketter/vägar direkt om startsidan är aktiv vid laddning
        if (isLandingRef.current) {
          applyLayerVisibility(map, true, hiddenLayersRef);
        }
      });
      mapRef.current = map;
    } catch (err) {
      console.error('Mapbox GL kunde inte initialiseras:', err);
      return;
    }
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

  // Markörer: skapa/uppdatera/ta bort, och dölj på startsidan
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const present = new Set(resorts.map((r) => r.name));
    Object.keys(markersRef.current).forEach((name) => {
      if (!present.has(name)) {
        markersRef.current[name].remove();
        delete markersRef.current[name];
      }
    });

    resorts.forEach((resort) => {
      let marker = markersRef.current[resort.name];
      const isActive = activeId === resort.name;
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'ski-marker';
        el.innerHTML = `
          <div class="ski-pin">
            <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 0C6.27 0 0 6.27 0 14c0 9.5 12.5 21.5 13 22 .4.4 1 .4 1.4 0 .5-.5 13-12.5 13-22C27.4 6.27 21.13 0 14 0z" fill="currentColor"/>
              <circle cx="14" cy="13.5" r="6.5" fill="white"/>
            </svg>
          </div>`;
        el.addEventListener('click', () => onSelectRef.current(resort));
        marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([resort.lng, resort.lat]);
        markersRef.current[resort.name] = marker;
        marker.addTo(map);
      }
      const el = marker.getElement();
      el.classList.toggle('is-active', isActive);
      // Dölj markörer på startsidan
      el.style.opacity = isLanding ? '0' : '1';
      el.style.pointerEvents = isLanding ? 'none' : '';
    });
  }, [resorts, activeId, isLanding]);

  // Kör map.resize() på varje frame i 300 ms under panelanimationen
  useEffect(() => {
    if (resizeTrigger === 0) return;
    const map = mapRef.current;
    if (!map) return;
    const start = performance.now();
    let rafId: number;
    const tick = (now: number) => {
      map.resize();
      if (now - start < 300) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [resizeTrigger]);

  // Slå av/på OpenSnowMap-lagret
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource('opensnowmap')) return;
    map.setLayoutProperty('opensnowmap-layer', 'visibility', showSnowMap ? 'visible' : 'none');
  }, [showSnowMap]);

  // Fly to target när ort väljs
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTarget) return;
    map.flyTo({
      center: [flyTarget.lng, flyTarget.lat],
      zoom: flyTarget.zoom ?? Math.max(map.getZoom(), 11),
      duration: 1400,
      essential: true,
    });
  }, [flyTarget]);

  // Lås/lås-upp interaktion, dölj/visa lager och flyTo vid rutte-växling
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handlers = [
      map.dragPan, map.scrollZoom, map.boxZoom,
      map.dragRotate, map.keyboard, map.doubleClickZoom,
      map.touchZoomRotate,
    ] as Array<{ enable(): void; disable(): void }>;

    if (isLanding) {
      handlers.forEach((h) => h.disable());
      map.flyTo({ center: CENTER, zoom: ZOOM_LANDING, duration: 1600, essential: true });
    } else {
      handlers.forEach((h) => h.enable());
      map.flyTo({ center: CENTER, zoom: ZOOM_MAP, duration: 1000, essential: true });
    }

    // Hantera lagerdöljning (kräver att stilen är laddad)
    if (map.isStyleLoaded()) {
      applyLayerVisibility(map, isLanding, hiddenLayersRef);
    }
    // Om stilen inte är laddad än hanteras det i on('load')-callbacken ovan
  }, [isLanding]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sky-200/10 via-transparent to-blue-300/15 mix-blend-multiply" />
    </>
  );
}

// Döljer eller återställer etiketter, vägar och landsgränser
function applyLayerVisibility(
  map: mapboxgl.Map,
  hide: boolean,
  hiddenRef: MutableRefObject<string[]>,
) {
  if (hide) {
    const toHide = map.getStyle().layers
      .filter((l) => {
        if (l.type === 'symbol') return true;
        if (l.type === 'line' && HIDE_LINE_PATTERN.test(l.id)) return true;
        return false;
      })
      .filter((l) => {
        try { return map.getLayoutProperty(l.id, 'visibility') !== 'none'; }
        catch { return false; }
      })
      .map((l) => l.id);
    hiddenRef.current = toHide;
    toHide.forEach((id) => map.setLayoutProperty(id, 'visibility', 'none'));
  } else {
    hiddenRef.current.forEach((id) => {
      try { map.setLayoutProperty(id, 'visibility', 'visible'); } catch (_) {}
    });
    hiddenRef.current = [];
  }
}
