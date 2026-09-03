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

// Klustring: max zoom där punkter kan slås ihop till kluster. Måste vara lägre
// än golvet för flyTo-zoom (Math.max(map.getZoom(), 11) nedan) så att en ort
// som nås via flyTarget ALDRIG visas som ett kluster, bara som en enskild nål.
const CLUSTER_MAX_ZOOM = 10;
const CLUSTER_RADIUS = 40;

const RESORT_LAYER_IDS = ['clusters', 'cluster-count', 'unclustered-point'];

const PIN_COLOR_DEFAULT = '#1d4ed8';
const PIN_COLOR_ACTIVE = '#dc2626';

export default function MapView({ resorts, activeId, onSelect, flyTarget, showSnowMap, resizeTrigger, isLanding }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const hiddenLayersRef = useRef<string[]>([]);
  const resortsRef = useRef<Resort[]>(resorts);
  const activeIdRef = useRef(activeId);
  const onSelectRef = useRef(onSelect);
  const isLandingRef = useRef(isLanding);
  resortsRef.current = resorts;
  activeIdRef.current = activeId;
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
        void setupResortLayers(map, resortsRef, activeIdRef, onSelectRef, !isLandingRef.current);
      });
      mapRef.current = map;
    } catch (err) {
      console.error('Mapbox GL kunde inte initialiseras:', err);
      return;
    }
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Uppdatera GeoJSON-källan när den filtrerade ortslistan ändras
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource('resorts') as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(buildFeatureCollection(resorts));
  }, [resorts]);

  // Uppdatera vilken nål som visas som aktiv (röd ikon)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('unclustered-point')) return;
    map.setLayoutProperty('unclustered-point', 'icon-image', activeIconExpression(activeId));
  }, [activeId]);

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
    // Dölj/visa klustringslagren (nålar + kluster) på samma sätt som etiketter/vägar
    setResortLayersVisibility(map, !isLanding);
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

// Visar/döljer klustringslagren (kluster + enskilda nålar) som en enhet
function setResortLayersVisibility(map: mapboxgl.Map, visible: boolean) {
  RESORT_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  });
}

// Bygger GeoJSON-uttrycket som väljer aktiv (röd) eller vanlig (blå) pin-ikon
function activeIconExpression(activeId: string | null) {
  return ['case', ['==', ['get', 'name'], activeId ?? ''], 'ski-pin-active', 'ski-pin'];
}

// Bygger en GeoJSON FeatureCollection av orterna för klustringskällan
function buildFeatureCollection(resorts: Resort[]) {
  return {
    type: 'FeatureCollection' as const,
    features: resorts.map((resort) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [resort.lng, resort.lat] as [number, number],
      },
      properties: { name: resort.name },
    })),
  };
}

// Rasteriserar skidpin-SVG:n (samma form som tidigare DOM-markör) i given färg,
// med inbakad drop-shadow, till en bild som kan registreras med map.addImage.
function loadPinImage(color: string): Promise<HTMLImageElement> {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="56" height="72" viewBox="0 0 28 36">
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#000000" flood-opacity="0.35"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <path d="M14 0C6.27 0 0 6.27 0 14c0 9.5 12.5 21.5 13 22 .4.4 1 .4 1.4 0 .5-.5 13-12.5 13-22C27.4 6.27 21.13 0 14 0z" fill="${color}"/>
        <circle cx="14" cy="13.5" r="6.5" fill="#ffffff"/>
      </g>
    </svg>`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.width = 56;
    img.height = 72;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Kunde inte ladda pin-ikon'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

// Lägger till klustringskälla, kluster-/pin-lager och deras klick-/hover-hantering.
// Körs en gång från map.on('load', ...) — lyssnarna registreras bara här och
// läser alltid senaste data via refs, precis som övrig klick-hantering i filen.
async function setupResortLayers(
  map: mapboxgl.Map,
  resortsRef: MutableRefObject<Resort[]>,
  activeIdRef: MutableRefObject<string | null>,
  onSelectRef: MutableRefObject<(resort: Resort) => void>,
  visibleOnLoad: boolean,
) {
  const [defaultPin, activePin] = await Promise.all([
    loadPinImage(PIN_COLOR_DEFAULT),
    loadPinImage(PIN_COLOR_ACTIVE),
  ]);
  if (!map.hasImage('ski-pin')) map.addImage('ski-pin', defaultPin, { pixelRatio: 2 });
  if (!map.hasImage('ski-pin-active')) map.addImage('ski-pin-active', activePin, { pixelRatio: 2 });

  map.addSource('resorts', {
    type: 'geojson',
    data: buildFeatureCollection(resortsRef.current),
    cluster: true,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    clusterRadius: CLUSTER_RADIUS,
  });

  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'resorts',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['step', ['get', 'point_count'], '#60a5fa', 3, '#3b82f6', 6, '#1d4ed8'],
      'circle-radius': ['step', ['get', 'point_count'], 16, 3, 20, 6, 24],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  });

  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'resorts',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
      'text-size': 13,
    },
    paint: { 'text-color': '#ffffff' },
  });

  map.addLayer({
    id: 'unclustered-point',
    type: 'symbol',
    source: 'resorts',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': activeIconExpression(activeIdRef.current),
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
    },
  });

  setResortLayersVisibility(map, visibleOnLoad);

  // Tooltip som visar ortens namn vid hover över en enskild nål
  const tooltip = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    anchor: 'bottom',
    offset: [0, -36] as [number, number],
    className: 'resort-tooltip',
  });

  map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
  map.on('mouseenter', 'unclustered-point', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const feature = e.features?.[0];
    const name = feature?.properties?.name as string | undefined;
    if (!name) return;
    const coords = (feature.geometry as { coordinates: [number, number] }).coordinates;
    tooltip.setLngLat(coords).setText(name).addTo(map);
  });
  map.on('mouseleave', 'unclustered-point', () => {
    map.getCanvas().style.cursor = '';
    tooltip.remove();
  });

  // Klick på kluster: zooma in till nivån där klustret bryts upp
  map.on('click', 'clusters', (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const clusterId = feature.properties?.cluster_id as number;
    const source = map.getSource('resorts') as mapboxgl.GeoJSONSource;
    source.getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err || zoom == null) return;
      const coords = (feature.geometry as { coordinates: [number, number] }).coordinates;
      map.easeTo({ center: coords, zoom });
    });
  });

  // Klick på enskild nål: öppna detaljvyn precis som tidigare
  map.on('click', 'unclustered-point', (e) => {
    const feature = e.features?.[0];
    const name = feature?.properties?.name as string | undefined;
    if (!name) return;
    const resort = resortsRef.current.find((r) => r.name === name);
    if (resort) onSelectRef.current(resort);
  });
}
