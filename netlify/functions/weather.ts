import { getStore } from '@netlify/blobs';

// Klustring: alla anrop inom samma 0,15°-ruta delar samma cache-post, så grannorter
// (t.ex. flera skidorter i samma dalgång) återanvänder samma OpenWeather-anrop.
const CLUSTER_SIZE = 0.15;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const STORE_NAME = 'weather-cache';
const ONE_CALL_URL = 'https://api.openweathermap.org/data/3.0/onecall';

interface DailyForecast {
  date: string;
  tempMin: number;
  tempMax: number;
  precipitationChance: number;
  icon: string;
  description: string;
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

interface OneCallWeatherCondition {
  icon: string;
  description: string;
}

interface OneCallDay {
  dt: number;
  temp: { min: number; max: number };
  pop?: number;
  weather?: OneCallWeatherCondition[];
}

interface OneCallResponse {
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
  return `weather:${clusterCoordinate(lat)}_${clusterCoordinate(lon)}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mapOneCallResponse(raw: OneCallResponse): WeatherPayload {
  const current = raw.current;
  const daily = Array.isArray(raw.daily) ? raw.daily.slice(0, 5) : [];

  return {
    current: {
      temp: Math.round(current.temp),
      icon: current.weather?.[0]?.icon ?? '',
      description: current.weather?.[0]?.description ?? '',
    },
    daily: daily.map((day) => ({
      date: new Date(day.dt * 1000).toISOString().slice(0, 10),
      tempMin: Math.round(day.temp?.min),
      tempMax: Math.round(day.temp?.max),
      precipitationChance: Math.round((day.pop ?? 0) * 100),
      icon: day.weather?.[0]?.icon ?? '',
      description: day.weather?.[0]?.description ?? '',
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

  const store = getStore(STORE_NAME);
  const cacheKey = buildCacheKey(lat, lon);
  const cached = (await store.get(cacheKey, { type: 'json' })) as CacheEntry | null;
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return jsonResponse({ ...cached.data, stale: false });
  }

  try {
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
