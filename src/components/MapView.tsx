import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN } from '@/data/resorts';
import type { Resort } from '@/types';

interface MapViewProps {
  resorts: Resort[];
  activeId: string | null;
  onSelect: (resort: Resort) => void;
  flyTarget: { lat: number; lng: number; zoom?: number; nonce: number } | null;
}

const CENTER: [number, number] = [6.5, 45.4];

export default function MapView({ resorts, activeId, onSelect, flyTarget }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: mapboxgl.Map;
    try {
      mapboxgl.accessToken = MAPBOX_TOKEN;
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/outdoors-v12',
        center: CENTER,
        zoom: 7.5,
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'bottom-right');
      map.on('load', () => {
        map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');
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

  // Manage markers: create / update / fade filtered-out
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const present = new Set(resorts.map((r) => r.name));
    // remove markers no longer present
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
    });
  }, [resorts, activeId]);

  // Fly to target when requested
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTarget) return;
    map.flyTo({
      center: [flyTarget.lng, flyTarget.lat],
      zoom: flyTarget.zoom ?? 10,
      duration: 1400,
      essential: true,
    });
  }, [flyTarget]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sky-200/10 via-transparent to-blue-300/15 mix-blend-multiply" />
    </>
  );
}
