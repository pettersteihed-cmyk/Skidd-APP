import { getStore } from '@netlify/blobs';

// Koordinater för alla orter i src/data/resorts.ts — bara { id, lat, lng }, hållna som en egen
// lista här istället för att importera resorts.ts direkt. resorts.ts har `export const
// MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN` på modulnivå, en Vite-specifik syntax som
// kastar ("Cannot read properties of undefined") så fort modulen laddas utanför Vite — vilket
// en Netlify Function gör. Bekräftat med en esbuild-bundling + körning i Node (2026-10-05).
// UPPDATERA MANUELLT när en ort läggs till/tas bort eller får ändrade koordinater i resorts.ts
// (samma mönster som SLOPE_LAYER_RESORT_IDS/SUN_SHADOW_LAYER_RESORT_IDS i terrainLayers.ts).
const RESORT_COORDINATES: { id: string; lat: number; lng: number }[] = [
  { id: 'les-3-vallees', lat: 45.298, lng: 6.58 },
  { id: 'paradiski', lat: 45.572, lng: 6.78 },
  { id: 'tignes-val-disere', lat: 45.468, lng: 6.905 },
  { id: 'portes-du-soleil', lat: 46.192, lng: 6.772 },
  { id: 'le-grand-massif', lat: 46.006, lng: 6.691 },
  { id: 'les-sybelles', lat: 45.239, lng: 6.269 },
  { id: 'alpe-dhuez', lat: 45.092, lng: 6.069 },
  { id: 'les-deux-alpes', lat: 45.008, lng: 6.121 },
  { id: 'serre-chevalier', lat: 44.933, lng: 6.586 },
  { id: 'evasion-mont-blanc', lat: 45.857, lng: 6.617 },
  { id: 'chamonix', lat: 45.923, lng: 6.869 },
  { id: 'via-lattea', lat: 44.931, lng: 6.722 },
  { id: 'espace-san-bernardo', lat: 45.627, lng: 6.848 },
  { id: 'espace-diamant', lat: 45.759, lng: 6.536 },
  { id: 'val-cenis', lat: 45.281, lng: 6.9 },
];

// Klustring: alla anrop inom samma 0,15°-ruta delar samma cache-post, så grannorter
// (t.ex. flera skidorter i samma dalgång) återanvänder samma OpenWeather-anrop.
const CLUSTER_SIZE = 0.15;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const STORE_NAME = 'weather-cache';
// Höjs varje gång WeatherPayload-strukturen ändras, så gamla cachade svar med en mindre
// struktur aldrig återanvänds efter en deploy som lägger till fält.
const CACHE_VERSION = 'v2';
const ONE_CALL_URL = 'https://api.openweathermap.org/data/3.0/onecall';

// Hur nära (grader, euklidiskt avstånd i lat/lon) en faktisk skidort i resorts.ts ett
// koordinatpar måste ligga för att accepteras — skydd mot missbruk/överförbrukning av kvoten.
const MAX_RESORT_DISTANCE_DEG = 0.2;

// OpenWeathers One Call 3.0 har en daglig anropsgräns på kontonivå. Vid 900 uppströmsanrop
// samma UTC-dygn görs inga fler anrop — senaste cachade data serveras istället (stale: true).
const MAX_UPSTREAM_CALLS_PER_DAY = 900;

interface DailyTempByTime {
  night?: number;
  morn?: number;
  day?: number;
  eve?: number;
}

interface DailyForecast {
  date: string;
  tempMin: number;
  tempMax: number;
  temp?: DailyTempByTime;
  feelsLike?: DailyTempByTime;
  precipitationChance: number;
  icon: string;
  description: string;
  windSpeed?: number; // m/s
  windDeg?: number; // grader, meteorologisk (varifrån vinden kommer)
  windGust?: number; // m/s
  snowCm?: number; // cm, 0 om inget snöfall den dagen
  sunrise?: string; // "HH:MM", ortens lokala tid
  sunset?: string; // "HH:MM", ortens lokala tid
}

interface WeatherPayload {
  current: {
    temp: number;
    icon: string;
    description: string;
  };
  daily: DailyForecast[];
}

interface CacheEntry {
  data: WeatherPayload;
  fetchedAt: number;
}

interface QuotaEntry {
  count: number;
}

interface OneCallWeatherCondition {
  icon: string;
  description: string;
}

interface OneCallDayTemp {
  min: number;
  max: number;
  night?: number;
  morn?: number;
  day?: number;
  eve?: number;
}

interface OneCallDay {
  dt: number;
  sunrise?: number;
  sunset?: number;
  temp: OneCallDayTemp;
  feels_like?: { night?: number; morn?: number; day?: number; eve?: number };
  pop?: number;
  weather?: OneCallWeatherCondition[];
  wind_speed?: number;
  wind_deg?: number;
  wind_gust?: number;
  snow?: number; // mm
}

interface OneCallResponse {
  timezone_offset?: number; // sekunder, för att räkna sunrise/sunset till ortens lokala tid
  current: {
    temp: number;
    weather?: OneCallWeatherCondition[];
  };
  daily?: OneCallDay[];
}

function clusterCoordinate(value: number): number {
  return Number((Math.round(value / CLUSTER_SIZE) * CLUSTER_SIZE).toFixed(2));
}

function buildCacheKey(lat: number, lon: number): string {
  return `weather:${CACHE_VERSION}:${clusterCoordinate(lat)}_${clusterCoordinate(lon)}`;
}

function todayUtcKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

function buildQuotaKey(): string {
  return `weather:${CACHE_VERSION}:quota:${todayUtcKey()}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Koordinaten måste ligga nära en faktisk skidort i appen — annars avvisas förfrågan med 400
// innan något anrop mot OpenWeather görs.
function isNearAnyResort(lat: number, lon: number): boolean {
  return RESORT_COORDINATES.some((resort) => {
    const dLat = resort.lat - lat;
    const dLon = resort.lng - lon;
    return Math.sqrt(dLat * dLat + dLon * dLon) <= MAX_RESORT_DISTANCE_DEG;
  });
}

async function getUpstreamCallCountToday(store: ReturnType<typeof getStore>): Promise<number> {
  const entry = (await store.get(buildQuotaKey(), { type: 'json' })) as QuotaEntry | null;
  return entry?.count ?? 0;
}

// Läs-ändra-skriv, inte atomärt — vid samtidiga anrop kan räknaren undervärderas något.
// Med 15 orter och 4h cache-TTL är marginalen till taket stor nog att det inte spelar roll
// i praktiken, men räknaren är inte exakt.
async function incrementUpstreamCallCount(store: ReturnType<typeof getStore>): Promise<void> {
  const current = await getUpstreamCallCountToday(store);
  await store.setJSON(buildQuotaKey(), { count: current + 1 } satisfies QuotaEntry);
}

// Formaterar en UTC-tidsstämpel (sekunder) som "HH:MM" i ORTENS lokala tid — använder
// timezone_offset (sekunder) från samma API-svar, inte besökarens webbläsartid eller
// serverns klocka.
function formatLocalTime(unixSeconds: number, timezoneOffsetSeconds: number): string {
  const shifted = new Date((unixSeconds + timezoneOffsetSeconds) * 1000);
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function mapDailyTempByTime(src?: {
  night?: number;
  morn?: number;
  day?: number;
  eve?: number;
}): DailyTempByTime | undefined {
  if (!src) return undefined;
  return {
    night: src.night !== undefined ? Math.round(src.night) : undefined,
    morn: src.morn !== undefined ? Math.round(src.morn) : undefined,
    day: src.day !== undefined ? Math.round(src.day) : undefined,
    eve: src.eve !== undefined ? Math.round(src.eve) : undefined,
  };
}

function mapOneCallResponse(raw: OneCallResponse): WeatherPayload {
  const current = raw.current;
  const daily = Array.isArray(raw.daily) ? raw.daily.slice(0, 5) : [];
  const tzOffset = raw.timezone_offset ?? 0;

  return {
    current: {
      temp: Math.round(current.temp),
      icon: current.weather?.[0]?.icon ?? '',
      description: current.weather?.[0]?.description ?? '',
    },
    daily: daily.map((day) => ({
      date: new Date(day.dt * 1000).toISOString().slice(0, 10),
      tempMin: Math.round(day.temp.min),
      tempMax: Math.round(day.temp.max),
      temp: mapDailyTempByTime(day.temp),
      feelsLike: mapDailyTempByTime(day.feels_like),
      precipitationChance: Math.round((day.pop ?? 0) * 100),
      icon: day.weather?.[0]?.icon ?? '',
      description: day.weather?.[0]?.description ?? '',
      windSpeed: day.wind_speed !== undefined ? Math.round(day.wind_speed) : undefined,
      windDeg: day.wind_deg !== undefined ? Math.round(day.wind_deg) : undefined,
      windGust: day.wind_gust !== undefined ? Math.round(day.wind_gust) : undefined,
      // mm -> cm räknas 1:1 (vattenekvivalent-antagande, beslutat 2026-10-05) — 0 om fältet
      // saknas (OpenWeather skickar bara "snow" de dygn det faktiskt snöar).
      snowCm: day.snow !== undefined ? Math.round(day.snow) : 0,
      sunrise: day.sunrise !== undefined ? formatLocalTime(day.sunrise, tzOffset) : undefined,
      sunset: day.sunset !== undefined ? formatLocalTime(day.sunset, tzOffset) : undefined,
    })),
  };
}

async function fetchLiveWeather(lat: number, lon: number): Promise<WeatherPayload> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENWEATHER_API_KEY saknas i miljövariablerna');
  }

  // Exakta (icke-avrundade) koordinater används mot OpenWeather — bara cache-nyckeln klustras.
  const url = new URL(ONE_CALL_URL);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('appid', apiKey);
  url.searchParams.set('units', 'metric');
  url.searchParams.set('exclude', 'minutely,hourly,alerts');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OpenWeather svarade med status ${response.status}`);
  }

  return mapOneCallResponse((await response.json()) as OneCallResponse);
}

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const latParam = url.searchParams.get('lat');
  const lonParam = url.searchParams.get('lon') ?? url.searchParams.get('lng');

  const lat = latParam !== null ? Number(latParam) : NaN;
  const lon = lonParam !== null ? Number(lonParam) : NaN;

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return jsonResponse(
      { error: 'lat och lon (query-parametrar) krävs och måste vara numeriska.' },
      400,
    );
  }

  if (!isNearAnyResort(lat, lon)) {
    return jsonResponse(
      { error: 'Koordinaten ligger inte nära någon av orterna i appen.' },
      400,
    );
  }

  const store = getStore(STORE_NAME);
  const cacheKey = buildCacheKey(lat, lon);
  const cached = (await store.get(cacheKey, { type: 'json' })) as CacheEntry | null;
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return jsonResponse({ ...cached.data, stale: false });
  }

  // Dygnskvoten gäller hela kontot, inte per ort — kolla innan ett nytt uppströmsanrop görs.
  const callsToday = await getUpstreamCallCountToday(store);
  if (callsToday >= MAX_UPSTREAM_CALLS_PER_DAY) {
    if (cached) {
      return jsonResponse({ ...cached.data, stale: true });
    }
    return jsonResponse(
      { error: 'Dagens väderkvot är förbrukad och ingen cachad data finns för den här orten.' },
      503,
    );
  }

  try {
    await incrementUpstreamCallCount(store);
    const liveData = await fetchLiveWeather(lat, lon);
    const entry: CacheEntry = { data: liveData, fetchedAt: now };
    await store.setJSON(cacheKey, entry);
    return jsonResponse({ ...liveData, stale: false });
  } catch (error) {
    // Live-anropet misslyckades — hellre gammal (stale) data än ett fel, om vi har något cachat.
    if (cached) {
      return jsonResponse({ ...cached.data, stale: true });
    }

    console.error('OpenWeather-anrop misslyckades och ingen cachad data finns:', error);
    return jsonResponse(
      { error: 'Kunde inte hämta väderdata och ingen cachad data finns.' },
      502,
    );
  }
};
