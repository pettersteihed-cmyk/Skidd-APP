import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import mapboxgl, { type FilterSpecification } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Layers } from 'lucide-react';
import { MAPBOX_TOKEN, RESORTS } from '@/data/resorts';
import { SLOPE_LAYER_RESORT_IDS, SUN_SHADOW_LAYER_RESORT_IDS } from '@/data/terrainLayers';
import type { Resort } from '@/types';
import { useMapAtmosphere } from '@/hooks/useMapAtmosphere';

interface MapViewProps {
  resorts: Resort[];
  activeId: string | null;
  // Senast VALDA ortens Resort.id (kebab-case-slug, INTE namnet som activeId
  // ovan bär, och INTE samma som App.tsx:s activeResort/detaljmodal-state).
  // Till skillnad från modalens state nollställs den HÄR aldrig av att en
  // modal stängs — bara av App.tsx:s isLanding-effekt. Styr vilken orts
  // branthets-/sol-skugga-tiles som visas, se resolveTerrainResortId.
  focusedResortId: string | null;
  onSelect: (resort: Resort) => void;
  flyTarget: { lat: number; lng: number; zoom?: number; nonce: number } | null;
  showSnowMap: boolean;
  onToggleSnowMap: () => void;
  resizeTrigger: number;
  isLanding: boolean;
}

const CENTER: [number, number] = [6.5, 45.4];
const ZOOM_LANDING = 6.8;
const ZOOM_MAP = 7.5;
const MAP_PITCH = 60;
const MAP_BEARING = -20;
const TERRAIN_EXAGGERATION = 1.3;

type MapStyleId = 'outdoors' | 'satellite';

// Bas-stilarnas URL:er. Satellit har ingen säsongsgaranti (bilderna kan vara från
// sommarhalvåret), men fungerar som ett alternativ till outdoors-stilen.
const STYLE_URLS: Record<MapStyleId, string> = {
  outdoors: 'mapbox://styles/mapbox/outdoors-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};

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

// Branthetslager — förberäknade tiles från Copernicus GLO-30, hostade på
// Cloudflare R2, en mapp per ort (se SLOPE_LAYER_RESORT_IDS i
// @/data/terrainLayers för vilka orter som faktiskt har tiles). Se
// memory/pipeline-dokumentationen för hur tiles genereras.
function slopeTileUrl(resortId: string): string {
  return `https://pub-6d13387d7dcb4d59b77f9bb88cb0858e.r2.dev/slope-tiles/${resortId}/{z}/{x}/{y}.png`;
}
const SLOPE_ATTRIBUTION = 'produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved';

// Om aktiv ort saknar tiles för lagret (eller ingen ort är vald) faller vi
// tillbaka på den första tillgängliga orten i listan — källan behöver ALLTID
// en giltig URL, men lagret är i det läget ändå dolt och togglen inaktiverad
// (se disabled-läget i panelen), så vilken URL som faktiskt används spelar
// ingen roll förrän en ort med data väljs.
function resolveTerrainResortId(focusedResortId: string | null, availableIds: ReadonlySet<string>): string {
  if (focusedResortId && availableIds.has(focusedResortId)) return focusedResortId;
  const [fallback] = availableIds;
  return fallback ?? '';
}

// Legend-färgerna för branthetslagret — MÅSTE matcha pipelinens
// color-relief.txt exakt (gdaldem color-relief, se step4_color.py), annars
// ljuger teckenförklaringen om vad tiles faktiskt visar. 0-14° har alpha 0
// (helt genomskinlig) i själva kartan — `color: null` renderas som en tom,
// streckad ruta i legend-swatchen istället för en osynlig bakgrund.
const SLOPE_LEGEND = [
  { label: '0–14°', color: null },
  { label: '15–29°', color: '#FFFF00' },
  { label: '30–34°', color: '#FFA500' },
  { label: '35–45°', color: '#FF0000' },
  { label: '46°+', color: '#A020F0' },
] as const;

// Sol/skugga-lager (pilot: Alpe d'Huez) — "tidsavstånd till övergång"-kartor,
// förberäknade offline för 6 representativa datum (nov-apr) x 13 heltimmar
// (06-18). Färgen kodar signerad tid till narmaste sol/skugga-övergång
// (symmetrisk kring övergången, se pipeline-anteckningar), inte en live
// SunCalc-beräkning i webbläsaren. Samma R2-bucket och Cache-Control-mönster
// som branthet/horisont-tiles. Två av de 13 timbinsen visas samtidigt och
// korstonas via raster-opacity (se timeDistanceBins-effekterna nedan) för
// att undvika hopp mellan diskreta lägen.
const TIME_DISTANCE_HOUR_MIN = 6;
const TIME_DISTANCE_HOUR_MAX = 18;
function timeDistanceTileUrl(resortId: string, dateId: string, hour: number): string {
  const hh = String(hour).padStart(2, '0');
  return `https://pub-6d13387d7dcb4d59b77f9bb88cb0858e.r2.dev/time-distance-tiles/${resortId}/${dateId}/${hh}/{z}/{x}/{y}.png`;
}

// Legend-färgerna för sol/skugga-lagret — MÅSTE matcha SUN_COLOR/SHADOW_COLOR/
// NEVER_COLOR i pipeline/time-distance/build_final_rgba.py exakt, annars ljuger
// teckenförklaringen om vad tiles faktiskt visar.
const TIME_DISTANCE_LEGEND = [
  { label: 'Sol', color: '#fdb813' },
  { label: 'Skugga', color: '#2563eb' },
  { label: 'Aldrig sol', color: '#080e28' },
] as const;

// Etikett-densitet i 3D-läget: vid låg zoom + hög pitch (blick mot horisonten)
// visar Mapboxs egna zoom-baserade filter på settlement-/road-label ändå för
// många små ortnamn och vägnamn, eftersom filtret bara känner till kamerans
// zoom (ett skalärt tal) - inte hur stort geografiskt område som faktiskt
// syns vid den pitchen. Nedan är ett eget, striktare filter som bara
// aktiveras när is3D är sant (se applyLabelDensityFilters) - i 2D-läget
// lämnas Mapboxs egna, redan korrekta zoom-progression helt orörd.
const RESORT_PROXIMITY_METERS = 30_000; // ca 3 mil - "nära en av våra skidorter"
const SETTLEMENT_SYMBOLRANK_ALWAYS_MAX = 10; // <= detta = "stor stad" (Milano, Genève...), visas alltid

interface ResortMultiPoint {
  type: 'MultiPoint';
  coordinates: [number, number][];
}

// Statisk geometri av våra 15 skidorters koordinater - används av Mapboxs
// distance-uttryck för att avgöra om en ort/väg ligger nära nog för att visas
// även om den annars skulle rankas som "för liten" vid den aktuella zoomen.
const RESORT_POINTS_GEOJSON: ResortMultiPoint = {
  type: 'MultiPoint',
  coordinates: RESORTS.map((resort) => [resort.lng, resort.lat]),
};

// Klass/filterrank-vakten är kopierad rakt av från outdoors-v12:s egna
// settlement-major-label/settlement-minor-label (identisk i båda) - vi byter
// bara ut själva zoom/symbolrank-trappan, inte den här delen, så vi inte
// råkar rakka in disputed- eller subdivision-rader av misstag.
const SETTLEMENT_CLASS_GUARD: FilterSpecification = [
  'all',
  ['<=', ['get', 'filterrank'], 3],
  ['match', ['get', 'class'],
    ['settlement', 'disputed_settlement'],
    ['match', ['get', 'worldview'], ['all', 'US'], true, false],
    false],
];

// Stora städer (symbolrank <= 10) visas alltid, oavsett zoom.
const SETTLEMENT_MAJOR_FILTER_3D: FilterSpecification = [
  'all',
  SETTLEMENT_CLASS_GUARD,
  ['<=', ['get', 'symbolrank'], SETTLEMENT_SYMBOLRANK_ALWAYS_MAX],
];

// Mindre orter (symbolrank > 10) visas bara om de ligger inom
// RESORT_PROXIMITY_METERS från en av våra skidorter - relevant för
// skidåkare även om orten annars är för liten för att synas vid den zoomen.
const SETTLEMENT_MINOR_FILTER_3D: FilterSpecification = [
  'all',
  SETTLEMENT_CLASS_GUARD,
  ['>', ['get', 'symbolrank'], SETTLEMENT_SYMBOLRANK_ALWAYS_MAX],
  ['<', ['distance', RESORT_POINTS_GEOJSON], RESORT_PROXIMITY_METERS],
];

const ROAD_LABEL_MAJOR_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];
const ROAD_LABEL_MINOR_CLASSES = ['street', 'street_limited', 'track'];

// Samma princip för vägnamn: stora vägar (motorväg t.o.m. tertiär) visas
// alltid, mindre gator/stigar bara nära en skidort.
const ROAD_LABEL_FILTER_3D: FilterSpecification = [
  'all',
  ['has', 'name'],
  ['any',
    ['match', ['get', 'class'], ROAD_LABEL_MAJOR_CLASSES, true, false],
    ['all',
      ['match', ['get', 'class'], ROAD_LABEL_MINOR_CLASSES, true, false],
      ['<', ['distance', RESORT_POINTS_GEOJSON], RESORT_PROXIMITY_METERS]]],
];

// Motorväg/riksväg (samma nivå som Milano/Genève för orter) visas alltid.
// OBS: snävare än ROAD_LABEL_MAJOR_CLASSES ovan — en fransk "route
// départementale" (t.ex. D1089) klassas oftast som secondary/tertiary och
// ska filtreras bort här, även om den fortfarande får ett namn-label.
const ROAD_SHIELD_MAJOR_CLASSES = ['motorway', 'trunk'];

// Vägnummerskyltar (A47, D1089, ...) — ett enda lager (road-number-shield,
// source-layer "road", samma som road-label), inte uppdelat per vägklass.
// `reflen` är INTE ett betydelsefält (bara längden på vägnummer-strängen,
// styr vilken skyltgrafik som väljs) - det är `class` som avgör vikt, precis
// som för road-label. Vi behåller hela standardfiltrets `has reflen`/
// `reflen<=6`/pedestrian-service-uteslutning och zoom/längd-trappan (den
// sistnämnda är en anti-repetitions-mekanism för korta vägsegment, inte en
// betydelserangordning, och ska inte röras) — lägger bara till ett extra
// AND-villkor för vår 3D-densitet.
const ROAD_NUMBER_SHIELD_FILTER_3D: FilterSpecification = [
  'all',
  ['has', 'reflen'],
  ['<=', ['get', 'reflen'], 6],
  ['match', ['get', 'class'], ['pedestrian', 'service'], false, true],
  ['step', ['zoom'],
    ['==', ['geometry-type'], 'Point'],
    11, ['>', ['get', 'len'], 5000],
    12, ['>', ['get', 'len'], 2500],
    13, ['>', ['get', 'len'], 1000],
    14, true],
  ['any',
    ['match', ['get', 'class'], ROAD_SHIELD_MAJOR_CLASSES, true, false],
    ['<', ['distance', RESORT_POINTS_GEOJSON], RESORT_PROXIMITY_METERS]],
];

const LABEL_DENSITY_LAYER_IDS = [
  'settlement-major-label', 'settlement-minor-label', 'road-label', 'road-number-shield',
] as const;
type LabelDensityLayerId = (typeof LABEL_DENSITY_LAYER_IDS)[number];
const LABEL_DENSITY_FILTERS_3D: Record<LabelDensityLayerId, FilterSpecification> = {
  'settlement-major-label': SETTLEMENT_MAJOR_FILTER_3D,
  'settlement-minor-label': SETTLEMENT_MINOR_FILTER_3D,
  'road-label': ROAD_LABEL_FILTER_3D,
  'road-number-shield': ROAD_NUMBER_SHIELD_FILTER_3D,
};

interface TimeDistanceDate {
  id: string;
  label: string;
  month: number; // 1-12
  day: number;
}

// De 6 förberäknade datumen (nov-apr, täcker skidsäsongen). Året i id:t är
// bara pipelinens genereringsdatum — inget säsongsspecifikt data, samma
// karta återanvänds varje år tills en ny körning görs.
const TIME_DISTANCE_DATES: TimeDistanceDate[] = [
  { id: '2025-11-15', label: 'Nov', month: 11, day: 15 },
  { id: '2025-12-15', label: 'Dec', month: 12, day: 15 },
  { id: '2026-01-15', label: 'Jan', month: 1, day: 15 },
  { id: '2026-02-15', label: 'Feb', month: 2, day: 15 },
  { id: '2026-03-15', label: 'Mar', month: 3, day: 15 },
  { id: '2026-04-15', label: 'Apr', month: 4, day: 15 },
];

// Cirkulär dag-i-året-approximation (ignorerar årtal) för att hitta vilket
// av de 6 datumen som ligger närmast dagens datum, oavsett årsskifte
// (t.ex. 20 dec ska kunna hamna närmare "Dec" än "Nov" trots att den
// naiva skillnaden annars kan bli stor over ett arsskifte).
function dayOfYearApprox(month: number, day: number): number {
  return Math.floor((Date.UTC(2001, month - 1, day) - Date.UTC(2001, 0, 1)) / 86400000);
}
function nearestTimeDistanceDateId(now: Date): string {
  const todayDoy = dayOfYearApprox(now.getMonth() + 1, now.getDate());
  let best = TIME_DISTANCE_DATES[0];
  let bestDist = Infinity;
  for (const d of TIME_DISTANCE_DATES) {
    const doy = dayOfYearApprox(d.month, d.day);
    const raw = Math.abs(doy - todayDoy);
    const dist = Math.min(raw, 365 - raw);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best.id;
}

interface TimeDistanceBins {
  lowerHour: number;
  upperHour: number;
  frac: number;
}

// Baskartans terräng-, landtäcke- och vattenlager som ska färgsättas om (outdoors-v12).
// Vägar, byggnader, admin-gränser och opensnowmap-layer rörs inte. Terräng/landtäcke
// gråtonas, vatten får en egen lågmäld blå kulör — se transform-fältet. Satellitstilen
// saknar dessa vektor-fill-lager helt (rasterbilder), så forEach:en nedan blir en no-op där.
const BASEMAP_COLOR_LAYERS: Array<{
  id: string;
  prop: 'background-color' | 'fill-color' | 'line-color';
  transform: ColorTransform;
}> = [
  { id: 'land', prop: 'background-color', transform: terrainTransform },
  { id: 'landcover', prop: 'fill-color', transform: terrainTransform },
  { id: 'landuse', prop: 'fill-color', transform: terrainTransform },
  { id: 'national-park', prop: 'fill-color', transform: terrainTransform },
  { id: 'national-park_tint-band', prop: 'line-color', transform: terrainTransform },
  { id: 'wetland', prop: 'fill-color', transform: terrainTransform },
  { id: 'wetland-pattern', prop: 'fill-color', transform: terrainTransform },
  { id: 'hillshade', prop: 'fill-color', transform: terrainTransform },
  { id: 'contour-line', prop: 'line-color', transform: terrainTransform },
  { id: 'water', prop: 'fill-color', transform: waterTransform },
  { id: 'water-shadow', prop: 'fill-color', transform: waterTransform },
  { id: 'water-depth', prop: 'fill-color', transform: waterTransform },
  { id: 'waterway', prop: 'line-color', transform: waterTransform },
  { id: 'waterway-shadow', prop: 'line-color', transform: waterTransform },
];

export default function MapView({ resorts, activeId, focusedResortId, onSelect, flyTarget, showSnowMap, onToggleSnowMap, resizeTrigger, isLanding }: MapViewProps) {
  // Om vald ort saknar data för lagret: togglen inaktiveras i panelen (se
  // disabled/disabledTitle nedan) och används för att auto-nollställa
  // toggle-state (effekterna längre ner) — annars kan en toggle bli kvar "på"
  // men grå/dold när man byter till en ort utan tiles.
  const slopeAvailable = focusedResortId !== null && SLOPE_LAYER_RESORT_IDS.has(focusedResortId);
  const sunShadowAvailable = focusedResortId !== null && SUN_SHADOW_LAYER_RESORT_IDS.has(focusedResortId);
  // 2D är standardläget varje gång man navigerar in i kartvyn — 3D är en manuell toggle (knappen
  // nedan), inte något som ska aktiveras automatiskt.
  const [is3D, setIs3D] = useState(false);
  // Branthetslagret är avstängt som standard, samma mönster som OpenSnowMap-lagret.
  const [showSlopeLayer, setShowSlopeLayer] = useState(false);
  // Sol/skugga-lagret är avstängt som standard, samma mönster som branthet/OpenSnowMap.
  const [showSunShadow, setShowSunShadow] = useState(false);
  // Minuter sedan midnatt, dagens datum — reglaget styr bara klockslag (se plan).
  // Förvalt värde: aktuell tid när kartan öppnas.
  const [sunTimeMinutes, setSunTimeMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });
  // Outdoors är standardstilen varje gång man navigerar in i kartvyn — samma princip som is3D.
  const [mapStyle, setMapStyle] = useState<MapStyleId>('outdoors');
  const [cornerPanelOpen, setCornerPanelOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const hiddenLayersRef = useRef<string[]>([]);
  const resortsRef = useRef<Resort[]>(resorts);
  const activeIdRef = useRef(activeId);
  const focusedResortIdRef = useRef(focusedResortId);
  const onSelectRef = useRef(onSelect);
  const isLandingRef = useRef(isLanding);
  const showSnowMapRef = useRef(showSnowMap);
  const showSlopeLayerRef = useRef(showSlopeLayer);
  const showSunShadowRef = useRef(showSunShadow);
  const is3DRef = useRef(is3D);
  // Sparar outdoors-v12:s PRISTINA filter per label-lager, så vi kan återställa
  // dem när is3D slås av — se applyLabelDensityFilters.
  const labelDensityDefaultFiltersRef = useRef<Partial<Record<LabelDensityLayerId, FilterSpecification | null | undefined>>>({});
  // Hindrar mapStyle-effekten från att köra ett onödigt setStyle() direkt vid mount,
  // eftersom kartan redan skapas med rätt stil (STYLE_URLS[mapStyle]) i init-effekten.
  const isInitialStyleRef = useRef(true);
  resortsRef.current = resorts;
  activeIdRef.current = activeId;
  focusedResortIdRef.current = focusedResortId;
  onSelectRef.current = onSelect;
  isLandingRef.current = isLanding;
  showSnowMapRef.current = showSnowMap;
  showSlopeLayerRef.current = showSlopeLayer;
  showSunShadowRef.current = showSunShadow;
  is3DRef.current = is3D;

  // Vilket av de 6 förberäknade datumen som visas — närmast dagens datum som
  // standard, växlingsbart manuellt via datumväljaren i panelen.
  const [selectedDateId, setSelectedDateId] = useState(() => nearestTimeDistanceDateId(new Date()));
  const selectedDateIdRef = useRef(selectedDateId);
  selectedDateIdRef.current = selectedDateId;

  // Vilka två av de 13 timbinsen (06-18) som ska korstonas för att representera
  // reglagets klockslag just nu.
  const clampedHourFloat = Math.min(
    TIME_DISTANCE_HOUR_MAX,
    Math.max(TIME_DISTANCE_HOUR_MIN, sunTimeMinutes / 60),
  );
  const timeDistanceBins: TimeDistanceBins = {
    lowerHour: Math.min(TIME_DISTANCE_HOUR_MAX - 1, Math.floor(clampedHourFloat)),
    upperHour: Math.min(TIME_DISTANCE_HOUR_MAX, Math.floor(clampedHourFloat) + 1),
    frac: clampedHourFloat - Math.floor(clampedHourFloat),
  };
  const timeDistanceBinsRef = useRef(timeDistanceBins);
  timeDistanceBinsRef.current = timeDistanceBins;

  // Karta-initialisering
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: mapboxgl.Map;
    try {
      mapboxgl.accessToken = MAPBOX_TOKEN;
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: STYLE_URLS.outdoors,
        center: CENTER,
        zoom: isLandingRef.current ? ZOOM_LANDING : ZOOM_MAP,
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'bottom-right');
      map.on('load', () => {
        map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');
        map.on('zoomend', () => console.log('zoom:', map.getZoom()));

        void initStyleDependentLayers(
          map, resortsRef, activeIdRef, isLandingRef, showSnowMapRef, showSlopeLayerRef,
          showSunShadowRef, timeDistanceBinsRef, selectedDateIdRef, hiddenLayersRef,
          is3DRef, labelDensityDefaultFiltersRef, focusedResortIdRef,
        ).then(() => {
          // Klick-/hover-lyssnarna registreras precis EN gång, här — de lever på
          // map-instansen (inte på lagren) och triggas bara när lagret med matchande
          // id faktiskt finns, så de överlever framtida stilbyten utan att registreras om.
          setupResortInteractions(map, resortsRef, onSelectRef);

          // Registreras EFTER initial load: 'style.load' fyrar redan för den första
          // stilinläsningen (innan 'load'), så den här lyssnaren fångar bara efterföljande
          // map.setStyle()-byten (satellit/outdoors-växlingen), inte det initiala.
          map.on('style.load', () => {
            void initStyleDependentLayers(
              map, resortsRef, activeIdRef, isLandingRef, showSnowMapRef, showSlopeLayerRef,
              showSunShadowRef, timeDistanceBinsRef, selectedDateIdRef, hiddenLayersRef,
              is3DRef, labelDensityDefaultFiltersRef, focusedResortIdRef,
            );
          });
        });
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

  // Fog ovanpå terräng/sky (se useMapAtmosphere) - snöeffekten är avstängd
  // oavsett is3D (medveten avstängning, inte kopplad till 3D-läget längre).
  useMapAtmosphere({ mapRef, snowEnabled: false });

  // Växla kartstil (outdoors/satellit) via panelen
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (isInitialStyleRef.current) {
      isInitialStyleRef.current = false;
      return;
    }
    map.setStyle(STYLE_URLS[mapStyle]);
  }, [mapStyle]);

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

  // Slå av/på branthetslagret
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource('slope-source')) return;
    map.setLayoutProperty('slope-layer', 'visibility', showSlopeLayer ? 'visible' : 'none');
  }, [showSlopeLayer]);

  // Byt vilken orts branthets-tiles slope-källan pekar på, när aktiv ort
  // ändras (t.ex. en annan ort väljs i sidopanelen). Källan kan inte peka om
  // sina tiles i efterhand (samma begränsning som sol/skugga-binbytet nedan),
  // så vi bygger om källa+lager via setSlopeSourceLayer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource('slope-source')) return;
    setSlopeSourceLayer(map, resolveTerrainResortId(focusedResortId, SLOPE_LAYER_RESORT_IDS), showSlopeLayerRef.current);
  }, [focusedResortId]);

  // Om vald ort saknar branthetsdata: stäng av togglen automatiskt — annars
  // kan den bli kvar "på" men grå/dold efter ett ortsbyte, förvirrande.
  useEffect(() => {
    if (!slopeAvailable) setShowSlopeLayer(false);
  }, [slopeAvailable]);

  // Byt vilka två timbin (06-18) sol/skugga-lagren pekar på, när reglaget
  // korsar en heltimmesgräns, datumet växlas manuellt, ELLER aktiv ort ändras
  // (alla tre kräver en källswap eftersom tile-URL:en beror på ort, datum OCH
  // timme). Om källorna ännu inte finns (t.ex. körs detta innan initial
  // 'load') görs inget här — initStyleDependentLayers sätter då redan rätt
  // bin vid skapandet, via timeDistanceBinsRef/selectedDateIdRef/
  // focusedResortIdRef. timeDistanceBins.frac är AVSIKTLIGT inte en
  // dependency — dess ändringar hanteras av den separata opacitetseffekten
  // nedan, annars skulle en källswap triggas på varje liten reglagerörelse
  // istället för bara vid en faktisk timmesgräns.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource('time-distance-source-a')) return;
    const { lowerHour, upperHour, frac } = timeDistanceBins;
    const resortId = resolveTerrainResortId(focusedResortId, SUN_SHADOW_LAYER_RESORT_IDS);
    setTimeDistanceBinLayer(map, 'time-distance-source-a', 'time-distance-layer-a', resortId, selectedDateId, lowerHour, 1 - frac, showSunShadowRef.current);
    setTimeDistanceBinLayer(map, 'time-distance-source-b', 'time-distance-layer-b', resortId, selectedDateId, upperHour, frac, showSunShadowRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeDistanceBins.lowerHour, timeDistanceBins.upperHour, selectedDateId, focusedResortId]);

  // Om vald ort saknar sol/skugga-data: stäng av togglen automatiskt, samma
  // princip som branthet ovan.
  useEffect(() => {
    if (!sunShadowAvailable) setShowSunShadow(false);
  }, [sunShadowAvailable]);

  // Korstona opaciteten mellan de två redan skapade timbinsen medan reglaget
  // dras inom samma binpar (ingen källbyte, bara raster-opacity).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('time-distance-layer-a') || !map.getLayer('time-distance-layer-b')) return;
    map.setPaintProperty('time-distance-layer-a', 'raster-opacity', 1 - timeDistanceBins.frac);
    map.setPaintProperty('time-distance-layer-b', 'raster-opacity', timeDistanceBins.frac);
  }, [timeDistanceBins.frac]);

  // Slå av/på sol/skugga-lagret
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource('time-distance-source-a')) return;
    const visibility = showSunShadow ? 'visible' : 'none';
    map.setLayoutProperty('time-distance-layer-a', 'visibility', visibility);
    map.setLayoutProperty('time-distance-layer-b', 'visibility', visibility);
  }, [showSunShadow]);

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
      // pitch/bearing nollställs alltid till platt rakt-uppifrån-vy — annars kan startsidans
      // låsta karta råka visa en lutad/roterad vy kvar från kartläget
      map.flyTo({ center: CENTER, zoom: ZOOM_LANDING, pitch: 0, bearing: 0, duration: 1600, essential: true });
      // 2D, outdoors-stilen, avstängt branthetslager och ihopfälld lagerpanel är alltid
      // standardläget nästa gång man går in i kartvyn (alla väljs bara manuellt via kontrollerna)
      setIs3D(false);
      setMapStyle('outdoors');
      setShowSlopeLayer(false);
      setShowSunShadow(false);
      setCornerPanelOpen(false);
    } else {
      handlers.forEach((h) => h.enable());
      // pitch/bearing: 0 = öppna alltid i 2D, rakt uppifrån — 3D aktiveras bara manuellt (is3D-effekten nedan)
      map.flyTo({ center: CENTER, zoom: ZOOM_MAP, pitch: 0, bearing: 0, duration: 1000, essential: true });
    }

    // Hantera lagerdöljning (kräver att stilen är laddad)
    if (map.isStyleLoaded()) {
      applyLayerVisibility(map, isLanding, hiddenLayersRef);
    }
    // Dölj/visa klustringslagren (nålar + kluster) på samma sätt som etiketter/vägar
    setResortLayersVisibility(map, !isLanding);
    // Om stilen inte är laddad än hanteras det i on('load')-callbacken ovan
  }, [isLanding]);

  // Växla 2D/3D via knappen — rör inte center/zoom, och körs bara vid faktisk
  // knapptryckning (isLanding är avsiktligt INTE en dependency, se isLandingRef-vakten)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Byt place-label/road-label mellan Mapboxs standardfilter och vårt eget,
    // striktare 3D-filter direkt när is3D slås av/på — INTE landing-vaktad som
    // resten av effekten nedan: annars skulle filtret kunna fastna i 3D-läge
    // om is3D nollställs (se isLanding-effekten ovan) medan startsidan visas,
    // eftersom den här effekten då inte körs igen förrän is3D faktiskt ändras
    // nästa gång.
    applyLabelDensityFilters(map, is3D, labelDensityDefaultFiltersRef);
    if (isLandingRef.current) return;
    if (is3D) {
      map.dragRotate.enable();
      map.touchZoomRotate.enable();
      map.easeTo({ pitch: MAP_PITCH, bearing: MAP_BEARING, duration: 600, essential: true });
    } else {
      map.dragRotate.disable();
      map.touchZoomRotate.disable();
      map.easeTo({ pitch: 0, bearing: 0, duration: 600, essential: true });
    }
  }, [is3D]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      {!isLanding && (
        <div className="absolute right-4 top-4 z-10">
          <button
            onClick={() => setCornerPanelOpen((v) => !v)}
            aria-label={cornerPanelOpen ? 'Stäng kartlager' : 'Visa kartlager'}
            aria-expanded={cornerPanelOpen}
            className="rounded-lg bg-white p-2.5 text-slate-700 shadow-md transition hover:bg-slate-50"
          >
            <Layers className="h-4 w-4" />
          </button>
          <div
            className={`absolute right-0 top-[calc(100%+8px)] w-56 origin-top-right rounded-lg bg-white p-3 shadow-lg transition duration-150 ease-out ${
              cornerPanelOpen ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
            }`}
          >
            <div className="space-y-3">
              <div>
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Kartstil
                </span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setMapStyle('outdoors')}
                    aria-pressed={mapStyle === 'outdoors'}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                      mapStyle === 'outdoors' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Outdoors
                  </button>
                  <button
                    onClick={() => {
                      // Satellitstilen är begränsad till 2D — går man dit medan 3D är
                      // aktivt växlas kameran automatiskt tillbaka till pitch/bearing 0
                      // samtidigt (is3D-effekten längre ner sköter själva easeTo:n).
                      setMapStyle('satellite');
                      setIs3D(false);
                    }}
                    aria-pressed={mapStyle === 'satellite'}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                      mapStyle === 'satellite' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Satellit
                  </button>
                </div>
              </div>
              <CornerToggleRow label="Pistkarta (OpenSnowMap)" checked={showSnowMap} onChange={onToggleSnowMap} />
              <div>
                <CornerToggleRow
                  label="Branthet"
                  checked={showSlopeLayer}
                  onChange={() => setShowSlopeLayer((v) => !v)}
                  disabled={!slopeAvailable}
                  disabledTitle={focusedResortId ? 'Ingen branthetsdata för den här orten ännu' : 'Välj en ort för att visa branthet'}
                />
                {showSlopeLayer && (
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                    {SLOPE_LEGEND.map((entry) => (
                      <span key={entry.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-sm ${entry.color === null ? 'border border-dashed border-slate-300' : ''}`}
                          style={entry.color === null ? undefined : { backgroundColor: entry.color }}
                        />
                        {entry.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <CornerToggleRow
                  label="Sol/skugga"
                  checked={showSunShadow}
                  onChange={() => setShowSunShadow((v) => !v)}
                  disabled={!sunShadowAvailable}
                  disabledTitle={focusedResortId ? 'Ingen sol/skugga-data för den här orten ännu' : 'Välj en ort för att visa sol/skugga'}
                />
                {showSunShadow && (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-3 gap-1">
                      {TIME_DISTANCE_DATES.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => setSelectedDateId(d.id)}
                          aria-pressed={selectedDateId === d.id}
                          className={`rounded px-1.5 py-1 text-[11px] font-semibold transition ${
                            selectedDateId === d.id
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                    <div>
                      <input
                        type="range"
                        min={0}
                        max={1439}
                        step={5}
                        value={sunTimeMinutes}
                        onChange={(e) => setSunTimeMinutes(Number(e.target.value))}
                        aria-label="Klockslag för sol/skugga"
                        className="w-full"
                      />
                      <div className="mt-0.5 text-center text-[11px] text-slate-500">
                        {formatMinutesAsTime(sunTimeMinutes)}
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      {TIME_DISTANCE_LEGEND.map((entry) => (
                        <span key={entry.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: entry.color }}
                          />
                          {entry.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <CornerToggleRow
                label="3D-vy"
                checked={is3D}
                onChange={() => setIs3D((v) => !v)}
                disabled={mapStyle === 'satellite'}
                disabledTitle="Endast tillgängligt i Outdoors-läge"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Formaterar minuter-sedan-midnatt (reglagevärdet) som "HH:MM" för etiketten
// under tidsreglaget.
function formatMinutesAsTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// En kompakt växlingsrad i kartlagerpanelen — samma princip (etikett + switch) som
// filtren i vänstersidopanelen, bara mindre.
function CornerToggleRow({
  label, checked, onChange, disabled, disabledTitle,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={`text-xs font-medium ${disabled ? 'text-slate-400' : 'text-slate-700'}`}>{label}</span>
      {/* title på en WRAPPER, inte på <button disabled> självt — Chrome/Chromium
          (till skillnad från Firefox) triggar inte hover-tooltiper på disabled-
          element överhuvudtaget, så title på knappen skulle tyst aldrig visas där. */}
      <span title={disabled ? disabledTitle : undefined}>
        <button
          onClick={onChange}
          disabled={disabled}
          aria-pressed={checked}
          aria-disabled={disabled}
          className={`relative h-5 w-9 shrink-0 rounded-full transition ${
            disabled ? 'cursor-not-allowed bg-slate-200' : checked ? 'bg-blue-600' : 'bg-slate-300'
          }`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </span>
    </div>
  );
}

// Bygger om allt stilberoende innehåll som mapbox-gl nollar vid varje setStyle():
// baskarte-omfärgning, terräng/sky, OpenSnowMap- och branthetslagren samt ort-nålarna.
// Körs både från den initiala 'load' och från varje efterföljande 'style.load'
// (satellit/outdoors-växling) — men registrerar INGA klick-/hover-lyssnare, se
// setupResortInteractions för det (de ska bara registreras en gång, aldrig här).
function initStyleDependentLayers(
  map: mapboxgl.Map,
  resortsRef: MutableRefObject<Resort[]>,
  activeIdRef: MutableRefObject<string | null>,
  isLandingRef: MutableRefObject<boolean>,
  showSnowMapRef: MutableRefObject<boolean>,
  showSlopeLayerRef: MutableRefObject<boolean>,
  showSunShadowRef: MutableRefObject<boolean>,
  timeDistanceBinsRef: MutableRefObject<TimeDistanceBins>,
  selectedDateIdRef: MutableRefObject<string>,
  hiddenLayersRef: MutableRefObject<string[]>,
  is3DRef: MutableRefObject<boolean>,
  labelDensityDefaultFiltersRef: MutableRefObject<Partial<Record<LabelDensityLayerId, FilterSpecification | null | undefined>>>,
  focusedResortIdRef: MutableRefObject<string | null>,
): Promise<void> {
  // aerialway (liftarna) finns bara i vissa stilar — no-op om lagret saknas i den
  // aktuella stilen istället för att krascha.
  if (map.getLayer('aerialway')) {
    map.setPaintProperty('aerialway', 'line-color', '#444444');
    map.setPaintProperty('aerialway', 'line-width', [
      'interpolate', ['exponential', 1.5], ['zoom'],
      10, 1.5,
      16, 2.5,
    ]);
    map.setPaintProperty('aerialway', 'line-dasharray', undefined);
    map.setLayerZoomRange('aerialway', 9, 24);
  }

  // Gör baskartans terräng/landtäcke gråtonad och vattnet lågmält blått (rör inte vägar/admin/OpenSnowMap).
  // Läser alltid stilens EGNA default-färg (fräscht laddad stil), så det här är säkert att
  // köra om upprepade gånger utan att färgerna "kompoundas".
  BASEMAP_COLOR_LAYERS.forEach(({ id, prop, transform }) => {
    if (!map.getLayer(id)) return;
    map.setPaintProperty(id, prop, recolor(map.getPaintProperty(id, prop), transform));
  });

  // 3D-terräng (riktig höjddata) + sky layer så det inte blir tomt ovanför horisonten
  map.addSource('mapbox-dem', {
    type: 'raster-dem',
    url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
    tileSize: 512,
    maxzoom: 14,
  });
  map.setTerrain({ source: 'mapbox-dem', exaggeration: TERRAIN_EXAGGERATION });
  map.addLayer({
    id: 'sky',
    type: 'sky',
    paint: {
      'sky-type': 'atmosphere',
      'sky-atmosphere-sun': [0, 0],
      'sky-atmosphere-sun-intensity': 15,
    },
  });

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
    layout: {
      visibility: showSnowMapRef.current ? 'visible' : 'none',
    },
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

  // Branthet — vilken orts tiles som visas beror på aktiv ort (se
  // resolveTerrainResortId/SLOPE_LAYER_RESORT_IDS). Källbyte vid ortsbyte
  // hanteras separat i en MapView-effekt, precis som stilbyten hanteras här —
  // den här funktionen sätter bara upp lagret med den ort som gäller just nu.
  setSlopeSourceLayer(
    map, resolveTerrainResortId(focusedResortIdRef.current, SLOPE_LAYER_RESORT_IDS), showSlopeLayerRef.current,
  );

  // Sol/skugga — två av de 13 förberäknade timbinsen (för det valda datumet
  // och den valda orten) visas samtidigt, korstonade via raster-opacity. Bin-
  // bytet (när timeDistanceBins hoppar till nästa par, datumet växlas, eller
  // aktiv ort ändras) hanteras separat i en MapView-effekt, precis som
  // stilbyten hanteras här — den här funktionen sätter bara upp lagren med de
  // bin/det datum/den ort som gäller just nu.
  const { lowerHour, upperHour, frac: hourFrac } = timeDistanceBinsRef.current;
  const dateId = selectedDateIdRef.current;
  const sunShadowResortId = resolveTerrainResortId(focusedResortIdRef.current, SUN_SHADOW_LAYER_RESORT_IDS);
  setTimeDistanceBinLayer(
    map, 'time-distance-source-a', 'time-distance-layer-a', sunShadowResortId, dateId, lowerHour, 1 - hourFrac, showSunShadowRef.current,
  );
  setTimeDistanceBinLayer(
    map, 'time-distance-source-b', 'time-distance-layer-b', sunShadowResortId, dateId, upperHour, hourFrac, showSunShadowRef.current,
  );

  // Dölj etiketter/vägar direkt om startsidan är aktiv (både vid initial load och
  // om en stilväxling skulle ske medan startsidan råkar vara låst)
  if (isLandingRef.current) {
    applyLayerVisibility(map, true, hiddenLayersRef);
  }

  // Nollställ det sparade PRISTINA filtret — en färsk stil (initial load eller
  // satellit/outdoors-byte) har alltid Mapboxs egna, orörda standardfilter, så
  // det finns inget gammalt värde att bevara över stilbytet.
  labelDensityDefaultFiltersRef.current = {};
  applyLabelDensityFilters(map, is3DRef.current, labelDensityDefaultFiltersRef);

  return addResortLayers(map, resortsRef, activeIdRef, !isLandingRef.current);
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

// Sätter (eller byter) vilken orts branthets-tiles slope-källan pekar på.
// Samma remove+återskapa-mönster som setTimeDistanceBinLayer nedan, av samma
// skäl (raster-källor kan inte peka om sina tiles i efterhand).
function setSlopeSourceLayer(map: mapboxgl.Map, resortId: string, visible: boolean) {
  if (map.getLayer('slope-layer')) map.removeLayer('slope-layer');
  if (map.getSource('slope-source')) map.removeSource('slope-source');
  map.addSource('slope-source', {
    type: 'raster',
    tiles: [slopeTileUrl(resortId)],
    tileSize: 256,
    minzoom: 8,
    // Tiles genereras bara t.o.m. z13 (se pipeline) — Mapbox overzoomar
    // automatiskt (skalar upp z13-tiles) för högre zoom istället för att
    // begära icke-existerande z14/z15-tiles.
    maxzoom: 13,
    attribution: SLOPE_ATTRIBUTION,
  });
  map.addLayer({
    id: 'slope-layer',
    type: 'raster',
    source: 'slope-source',
    minzoom: 8,
    layout: { visibility: visible ? 'visible' : 'none' },
    paint: { 'raster-opacity': 0.7 },
  });
}

// Sätter (eller byter) vilken ort/vilket datum+timbin en av de två
// sol/skugga-lagren visar. Mapbox raster-källor kan inte peka om sina tiles i
// efterhand, så ett ort-, bin- eller datumbyte görs genom att ta bort och
// återskapa källa+lager — samma mönster som mapStyle-bytet (map.setStyle)
// redan gör i stort, bara begränsat till just de här två lagren.
function setTimeDistanceBinLayer(
  map: mapboxgl.Map,
  sourceId: string,
  layerId: string,
  resortId: string,
  dateId: string,
  hour: number,
  opacity: number,
  visible: boolean,
) {
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
  map.addSource(sourceId, {
    type: 'raster',
    tiles: [timeDistanceTileUrl(resortId, dateId, hour)],
    tileSize: 256,
    minzoom: 8,
    // Tiles genereras bara t.o.m. z13 (samma pipeline/mönster som branthet) —
    // Mapbox overzoomar automatiskt för högre zoom.
    maxzoom: 13,
  });
  map.addLayer({
    id: layerId,
    type: 'raster',
    source: sourceId,
    minzoom: 8,
    layout: { visibility: visible ? 'visible' : 'none' },
    // 'raster-resampling' är 'linear' som standard, vilket interpolerar mjukt
    // mellan angränsande gula/blå/mörka pixlar vid rendering och overzoom
    // (>z13) — det kan skapa orange-aktiga blandtoner som inte finns i själva
    // PNG-filerna (bekräftat rena, se pipeline-verifieringen). 'nearest'
    // behåller de platta, skarpa färgstegen.
    paint: { 'raster-opacity': opacity, 'raster-resampling': 'nearest' },
  });
}

// Visar/döljer klustringslagren (kluster + enskilda nålar) som en enhet
function setResortLayersVisibility(map: mapboxgl.Map, visible: boolean) {
  RESORT_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  });
}

// Växlar settlement-/road-label mellan Mapboxs standardfilter och vårt eget,
// striktare 3D-filter (se LABEL_DENSITY_FILTERS_3D). Fångar stilens PRISTINA
// filter i defaultFiltersRef första gången ett lager ses efter en (åter)inladd
// stil — annars finns inget att återställa till när is3D slås av igen.
function applyLabelDensityFilters(
  map: mapboxgl.Map,
  is3D: boolean,
  defaultFiltersRef: MutableRefObject<Partial<Record<LabelDensityLayerId, FilterSpecification | null | undefined>>>,
) {
  LABEL_DENSITY_LAYER_IDS.forEach((id) => {
    if (!map.getLayer(id)) return;
    if (!(id in defaultFiltersRef.current)) {
      defaultFiltersRef.current[id] = map.getFilter(id);
    }
    map.setFilter(id, is3D ? LABEL_DENSITY_FILTERS_3D[id] : defaultFiltersRef.current[id]);
  });
}

const HSL_COLOR_PATTERN = /^hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*\)$/i;

// Räknar om en hsl(...)-ljushet (0-100) till en ny {h, s, l} — s och h är fasta
// per kurva, bara l räknas ut från originalvärdet.
type ColorTransform = (lightness: number) => { h: number; s: number; l: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Terräng/landtäcke: gråtonar (mättnad 0) och sprider ut ljusheten så att konturlinjer/
// bergsskuggor (35% i originalstilen) blir tydligt mörkare golv (65%) och land/bakgrund
// (85%) blir en ljusgrå — inte vit — yta (93%). Större spridning = tydligare bergsform.
function terrainTransform(l: number): { h: number; s: number; l: number } {
  return { h: 0, s: 0, l: clamp(65 + (l - 35) * 0.56, 55, 96) };
}

// Vatten: byter bort grått mot en lågmäld ljusblå (fast nyans/mättnad), med ljushet
// nedskalad från originalvärdet så ytvatten (70% i originalstilen) hamnar runt 65%
// och djupare vatten (lägre originalvärde) blir mörkare blått, inte grått.
function waterTransform(l: number): { h: number; s: number; l: number } {
  return { h: 206, s: 30, l: clamp(l - 5, 45, 68) };
}

// Läser ljusheten ur en hsl(...)/hsla(...)-färgsträng och bygger om den med given
// transform, t.ex. "hsl(103, 50%, 60%)" (grönt) blir "hsl(0, 0%, 79%)" (grått).
function recolorString(value: string, transform: ColorTransform): string {
  const match = value.match(HSL_COLOR_PATTERN);
  if (!match) return value;
  const [, lightness, alpha] = match;
  const { h, s, l } = transform(Number(lightness));
  return alpha !== undefined ? `hsla(${h}, ${s}%, ${l}%, ${alpha})` : `hsl(${h}, ${s}%, ${l}%)`;
}

// Går rekursivt igenom ett Mapbox paint-uttryck (sträng, tal eller nästlad array,
// t.ex. match/interpolate-uttryck) och färgsätter om varje hsl(...)/hsla(...)-färgsträng
// den hittar. Allt annat i uttrycket (operatorer, zoomstopp, klassnamn) lämnas orört.
function recolor(value: unknown, transform: ColorTransform): unknown {
  if (typeof value === 'string') return recolorString(value, transform);
  if (Array.isArray(value)) return value.map((v) => recolor(v, transform));
  return value;
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

// Lägger till klustringskälla, kluster-/pin-lager, pin-bilder och lagrens synlighet.
// Körs vid initial load OCH vid varje efterföljande stilbyte (se initStyleDependentLayers)
// eftersom mapbox-gl nollar runtime-tillagda källor/lager vid setStyle(). Registrerar
// INGA event-lyssnare — det görs en gång för alla i setupResortInteractions.
async function addResortLayers(
  map: mapboxgl.Map,
  resortsRef: MutableRefObject<Resort[]>,
  activeIdRef: MutableRefObject<string | null>,
  visibleOnLoad: boolean,
): Promise<void> {
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
}

// Registrerar klick-/hover-hantering för kluster och enskilda nålar (tooltip, klick-till-
// detaljvy, klick-till-zoom). Körs EN gång, någonsin, från den initiala 'load'-callbacken.
// Lyssnarna lever på map-instansen (map.on(event, layerId, handler) är delegerad), inte på
// lagren själva — de triggas helt enkelt inte medan ett lager med matchande id saknas, och
// återupptas automatiskt så fort addResortLayers återskapar det efter ett stilbyte. Om den
// här funktionen kördes om vid varje stilbyte skulle lyssnarna dubbleras och trigga
// klick-/hover-hanteringen flera gånger per interaktion.
function setupResortInteractions(
  map: mapboxgl.Map,
  resortsRef: MutableRefObject<Resort[]>,
  onSelectRef: MutableRefObject<(resort: Resort) => void>,
) {
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
