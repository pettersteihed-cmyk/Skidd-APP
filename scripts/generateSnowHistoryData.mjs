// Genererar src/data/snowHistory.ts från snohistorik_export.csv.
//
// Körs fristående som ren .mjs (till skillnad från export/append-skripten, som körs via en
// esbuild-bootstrap) eftersom det här skriptet inte behöver importera några TS-moduler eller
// Vite-specifika globaler — bara läsa en CSV-fil och skriva ut en statisk TS-datafil.
//
// Kör med: npm run snow:generate-data
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV_PATH = path.join(PROJECT_ROOT, 'snohistorik_export.csv');
const OUT_PATH = path.join(PROJECT_ROOT, 'src', 'data', 'snowHistory.ts');

const raw = readFileSync(CSV_PATH, 'utf8');
const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
const [, ...dataLines] = lines; // hoppa över header-raden (kan ha skadad teckenkodning, se nedan)

/**
 * Excel har vid något tillfälle sparat om filen med semikolon som avgränsare (europeisk
 * lokalinställning) istället för kommatecken som exportSnowHistory.ts/appendResortSnowHistory.ts
 * ursprungligen skriver, och samtidigt skadat å/ä/ö i header-raden till fel teckenkodning.
 * Header-texten läses aldrig (vi parsar positionellt: ort_id, säsong, snöfall, djup, datum), så
 * det spelar ingen roll — men vi måste avgöra rätt avgränsare per rad för att klara båda formaten.
 */
function splitRow(line) {
  const delimiter = line.includes(';') ? ';' : ',';
  return line.split(delimiter).map((f) => f.trim());
}

const bySeason = new Map();
for (const line of dataLines) {
  const [ortId, season, totalSnowfallCm, maxSnowDepthCm, maxSnowDepthDate] = splitRow(line);
  if (!ortId) continue;
  if (!bySeason.has(ortId)) bySeason.set(ortId, []);
  bySeason.get(ortId).push({
    season,
    totalSnowfallCm: Number(totalSnowfallCm),
    maxSnowDepthCm: Number(maxSnowDepthCm),
    maxSnowDepthDate,
  });
}

// Säsongsetiketten ("2022-2023") sorterar redan korrekt kronologiskt som sträng eftersom alla
// år är fyrsiffriga — sortera fallande (senaste säsongen först) så UI:t kan visa den direkt.
for (const entries of bySeason.values()) {
  entries.sort((a, b) => b.season.localeCompare(a.season));
}

const ortIds = [...bySeason.keys()].sort();

const body = ortIds
  .map((ortId) => {
    const rows = bySeason
      .get(ortId)
      .map(
        (e) =>
          `    { season: '${e.season}', totalSnowfallCm: ${e.totalSnowfallCm}, maxSnowDepthCm: ${e.maxSnowDepthCm}, maxSnowDepthDate: '${e.maxSnowDepthDate}' },`
      )
      .join('\n');
    return `  '${ortId}': [\n${rows}\n  ],`;
  })
  .join('\n');

const fileContent = `// AUTOGENERERAD av scripts/generateSnowHistoryData.mjs från snohistorik_export.csv.
// Redigera INTE denna fil för hand — kör \`npm run snow:generate-data\` om CSV:n ändras
// (t.ex. fler säsonger eller fler orter tillagda).
//
// ⚠️ UTVECKLING/TEST — GRATIS-NIVÅ: Data hämtad från Open-Meteos gratis Historical Weather
// API. Se header-kommentaren i scripts/fetchSnowHistory.ts — ska bytas till kommersiell/betald
// åtkomst innan lansering (förfrågan om prissättning redan skickad till Open-Meteo).

export interface SeasonSnow {
  season: string;
  totalSnowfallCm: number;
  maxSnowDepthCm: number;
  maxSnowDepthDate: string;
}

/**
 * Nyckel = ort_id, samma slug som Resort.id i src/data/resorts.ts (se dess kommentar).
 * Varje orts säsonger är sorterade senaste-först. Saknar en ort en nyckel här (t.ex. en ort
 * som ännu inte hunnit köras genom snöhistorik-exporten) ska UI:t helt enkelt dölja
 * Snöhistorik-sektionen för den orten istället för att krascha.
 */
export const SNOW_HISTORY: Record<string, SeasonSnow[]> = {
${body}
};
`;

writeFileSync(OUT_PATH, fileContent, 'utf8');
console.log(`✓ Skrev snöhistorik för ${ortIds.length} orter (${dataLines.length} säsongsrader totalt) till ${OUT_PATH}`);
