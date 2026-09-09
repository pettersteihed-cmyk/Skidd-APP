/**
 * Hämtar historisk snödata (nysnö + snödjup) per ort från Open-Meteos Historical Weather API.
 *
 * ⚠️ UTVECKLING/TEST — GRATIS-NIVÅ:
 * Vi använder Open-Meteos gratis "archive-api" (archive-api.open-meteo.com) under utveckling.
 * Detta är INTE avsett för produktion/lansering — vi har skickat en förfrågan om prissättning
 * till Open-Meteo för kommersiell/betald åtkomst och ska byta till den innan lansering.
 * Se: https://open-meteo.com/en/pricing
 *
 * Bakgrund/observationer från manuell testning (se konversation):
 * - Daglig variabel heter `snowfall_sum` (cm) och `snow_depth_max`/`_min`/`_mean` (m).
 *   Ren `snow_depth` finns INTE som daglig variabel (ger 400-fel) — bara timvis.
 * - API:t snappar koordinater till närmaste väderrutnät (ERA5-Land, ~9–11 km upplösning),
 *   så exakta pist-koordinater ger inte nödvändigtvis unik data per ort om två orter ligger
 *   inom samma rutnätscell.
 */

const OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

/** De tre senaste vintersäsongerna (nov–apr) vi rapporterar snöhistorik för. */
export const SEASONS = [
  { label: "2022-2023", start: "2022-11-01", end: "2023-04-30" },
  { label: "2023-2024", start: "2023-11-01", end: "2024-04-30" },
  { label: "2024-2025", start: "2024-11-01", end: "2025-04-30" },
] as const;

/** Hela perioden som täcker alla tre säsonger, för att hämta allt i ett enda API-anrop per ort. */
const FULL_RANGE_START = SEASONS[0].start;
const FULL_RANGE_END = SEASONS[SEASONS.length - 1].end;

export interface ResortInput {
  name: string;
  lat: number;
  lng: number;
}

export interface SeasonSnowSummary {
  ortId: string;
  ortNamn: string;
  säsong: string;
  totaltSnöfallCm: number | null;
  maxSnödjupCm: number | null;
  datumMaxSnödjup: string | null;
  /** Sant om något dagsvärde saknades (null) i API-svaret för denna säsong. */
  saknarNågraVärden: boolean;
  /** Sant om hela anropet för orten misslyckades (nätverksfel / icke-200 efter retries). */
  hämtningMisslyckades: boolean;
}

/** Gör om ett ortnamn till ett stabilt, URL-/filnamnsvänligt id (kebab-case, utan diakritiska tecken). */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // ta bort diakritiska tecken (é -> e, ô -> o, etc.)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface OpenMeteoDailyResponse {
  daily?: {
    time: string[];
    snowfall_sum: (number | null)[];
    snow_depth_max: (number | null)[];
  };
  error?: boolean;
  reason?: string;
}

async function fetchWithRetry(url: string, attempts = 3, delayMs = 1000): Promise<OpenMeteoDailyResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url);
      const body = (await res.json()) as OpenMeteoDailyResponse;
      if (!res.ok || body.error) {
        throw new Error(`Open-Meteo svarade ${res.status}: ${body.reason ?? res.statusText}`);
      }
      return body;
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

/** Hämtar och sammanfattar snöhistorik (per säsong) för en enskild ort. */
export async function fetchResortSnowHistory(resort: ResortInput): Promise<SeasonSnowSummary[]> {
  const ortId = slugify(resort.name);
  const url =
    `${OPEN_METEO_ARCHIVE_URL}?latitude=${resort.lat}&longitude=${resort.lng}` +
    `&start_date=${FULL_RANGE_START}&end_date=${FULL_RANGE_END}` +
    `&daily=snowfall_sum,snow_depth_max&timezone=Europe/Paris`;

  let response: OpenMeteoDailyResponse;
  try {
    response = await fetchWithRetry(url);
  } catch (err) {
    console.error(`  ✗ Hämtning misslyckades för ${resort.name}: ${(err as Error).message}`);
    return SEASONS.map((season) => ({
      ortId,
      ortNamn: resort.name,
      säsong: season.label,
      totaltSnöfallCm: null,
      maxSnödjupCm: null,
      datumMaxSnödjup: null,
      saknarNågraVärden: true,
      hämtningMisslyckades: true,
    }));
  }

  const times = response.daily?.time ?? [];
  const snowfall = response.daily?.snowfall_sum ?? [];
  const snowDepth = response.daily?.snow_depth_max ?? [];

  return SEASONS.map((season) => {
    let totalSnöfall = 0;
    let maxDjupM = 0;
    let maxDjupDatum: string | null = null;
    let saknarNågraVärden = false;

    for (let i = 0; i < times.length; i++) {
      const dag = times[i];
      if (dag < season.start || dag > season.end) continue;

      const snöfallVärde = snowfall[i];
      if (snöfallVärde === null || snöfallVärde === undefined) {
        saknarNågraVärden = true;
      } else {
        totalSnöfall += snöfallVärde;
      }

      const djupVärde = snowDepth[i];
      if (djupVärde === null || djupVärde === undefined) {
        saknarNågraVärden = true;
      } else if (djupVärde > maxDjupM) {
        maxDjupM = djupVärde;
        maxDjupDatum = dag;
      }
    }

    return {
      ortId,
      ortNamn: resort.name,
      säsong: season.label,
      totaltSnöfallCm: Math.round(totalSnöfall * 10) / 10,
      maxSnödjupCm: Math.round(maxDjupM * 100),
      datumMaxSnödjup: maxDjupDatum,
      saknarNågraVärden,
      hämtningMisslyckades: false,
    };
  });
}

/**
 * Hämtar snöhistorik för samtliga orter, sekventiellt med en liten fördröjning mellan
 * anropen (artighet mot Open-Meteos gratis-nivå — se filens header-kommentar).
 */
export async function fetchAllResortsSnowHistory(
  resorts: ResortInput[],
  options: { delayMs?: number; onProgress?: (resort: ResortInput, index: number, total: number) => void } = {}
): Promise<SeasonSnowSummary[]> {
  const { delayMs = 250, onProgress } = options;
  const alla: SeasonSnowSummary[] = [];

  for (let i = 0; i < resorts.length; i++) {
    const resort = resorts[i];
    onProgress?.(resort, i, resorts.length);
    const sammanfattningar = await fetchResortSnowHistory(resort);
    alla.push(...sammanfattningar);
    if (i < resorts.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return alla;
}
