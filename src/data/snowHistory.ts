// AUTOGENERERAD från "skidorter_data 3.xlsx" (fliken "Snöhistorik").
// Redigera INTE denna fil för hand. Om Excel-filen uppdateras igen, kör om motsvarande
// genereringsskript (se historik: scripts/generateSnowHistoryData.mjs kör samma logik mot
// snohistorik_export.csv — den här versionen kördes en gång manuellt mot Excel-filen eftersom
// den, vid det här tillfället, innehöll nyare/mer komplett data än CSV:n, inklusive La Clusaz).
//
// ⚠️ UTVECKLING/TEST — GRATIS-NIVÅ: Underliggande data hämtad från Open-Meteos gratis
// Historical Weather API. Se header-kommentaren i scripts/fetchSnowHistory.ts — ska bytas till
// kommersiell/betald åtkomst innan lansering (förfrågan om prissättning redan skickad till
// Open-Meteo).

export interface SeasonSnow {
  season: string;
  totalSnowfallCm: number;
  maxSnowDepthCm: number;
  maxSnowDepthDate: string;
}

/**
 * Nyckel = ort_id, samma kanoniska id som Resort.id i src/data/resorts.ts (se dess kommentar
 * och "Läs mig"-fliken i skidorter_data-Excel-filen). Varje orts säsonger är sorterade
 * senaste-först. "la-clusaz" finns med här trots att La Clusaz ännu inte är en ort i
 * resorts.ts — ofarligt, bara en oanvänd nyckel tills orten läggs till. Saknar en ort en
 * nyckel här ska UI:t helt enkelt dölja Snöhistorik-sektionen för den orten istället för att
 * krascha.
 */
export const SNOW_HISTORY: Record<string, SeasonSnow[]> = {
  'alpe-dhuez': [
    { season: '2024-2025', totalSnowfallCm: 442.7, maxSnowDepthCm: 168, maxSnowDepthDate: '2025-03-16' },
    { season: '2023-2024', totalSnowfallCm: 490, maxSnowDepthCm: 199, maxSnowDepthDate: '2024-04-01' },
    { season: '2022-2023', totalSnowfallCm: 367.5, maxSnowDepthCm: 133, maxSnowDepthDate: '2023-04-02' },
    { season: '2021-2022', totalSnowfallCm: 409.6, maxSnowDepthCm: 143, maxSnowDepthDate: '2022-02-22' },
    { season: '2020-2021', totalSnowfallCm: 416.4, maxSnowDepthCm: 166, maxSnowDepthDate: '2021-03-17' },
  ],
  'chamonix': [
    { season: '2024-2025', totalSnowfallCm: 325.7, maxSnowDepthCm: 190, maxSnowDepthDate: '2025-01-29' },
    { season: '2023-2024', totalSnowfallCm: 437.6, maxSnowDepthCm: 229, maxSnowDepthDate: '2024-04-02' },
    { season: '2022-2023', totalSnowfallCm: 366.2, maxSnowDepthCm: 195, maxSnowDepthDate: '2023-04-15' },
    { season: '2021-2022', totalSnowfallCm: 394.9, maxSnowDepthCm: 196, maxSnowDepthDate: '2022-02-22' },
    { season: '2020-2021', totalSnowfallCm: 399.8, maxSnowDepthCm: 215, maxSnowDepthDate: '2021-03-17' },
  ],
  'espace-diamant': [
    { season: '2024-2025', totalSnowfallCm: 395.8, maxSnowDepthCm: 128, maxSnowDepthDate: '2025-01-09' },
    { season: '2023-2024', totalSnowfallCm: 514.2, maxSnowDepthCm: 135, maxSnowDepthDate: '2024-01-23' },
    { season: '2022-2023', totalSnowfallCm: 413.6, maxSnowDepthCm: 94, maxSnowDepthDate: '2023-01-19' },
    { season: '2021-2022', totalSnowfallCm: 438.4, maxSnowDepthCm: 146, maxSnowDepthDate: '2022-02-22' },
    { season: '2020-2021', totalSnowfallCm: 426.5, maxSnowDepthCm: 154, maxSnowDepthDate: '2021-03-17' },
  ],
  'espace-san-bernardo': [
    { season: '2024-2025', totalSnowfallCm: 516.3, maxSnowDepthCm: 195, maxSnowDepthDate: '2025-04-17' },
    { season: '2023-2024', totalSnowfallCm: 746.7, maxSnowDepthCm: 263, maxSnowDepthDate: '2024-04-01' },
    { season: '2022-2023', totalSnowfallCm: 597.2, maxSnowDepthCm: 191, maxSnowDepthDate: '2023-04-15' },
    { season: '2021-2022', totalSnowfallCm: 551.2, maxSnowDepthCm: 190, maxSnowDepthDate: '2022-04-09' },
    { season: '2020-2021', totalSnowfallCm: 493, maxSnowDepthCm: 193, maxSnowDepthDate: '2021-03-17' },
  ],
  'evasion-mont-blanc': [
    { season: '2024-2025', totalSnowfallCm: 297.1, maxSnowDepthCm: 159, maxSnowDepthDate: '2025-01-29' },
    { season: '2023-2024', totalSnowfallCm: 387.4, maxSnowDepthCm: 182, maxSnowDepthDate: '2024-01-23' },
    { season: '2022-2023', totalSnowfallCm: 332.3, maxSnowDepthCm: 139, maxSnowDepthDate: '2023-04-15' },
    { season: '2021-2022', totalSnowfallCm: 351.5, maxSnowDepthCm: 171, maxSnowDepthDate: '2022-02-22' },
    { season: '2020-2021', totalSnowfallCm: 362.7, maxSnowDepthCm: 181, maxSnowDepthDate: '2021-03-17' },
  ],
  'la-clusaz': [
    { season: '2024-2025', totalSnowfallCm: 330.5, maxSnowDepthCm: 113, maxSnowDepthDate: '2025-01-09' },
    { season: '2023-2024', totalSnowfallCm: 434.4, maxSnowDepthCm: 83, maxSnowDepthDate: '2024-01-19' },
    { season: '2022-2023', totalSnowfallCm: 347.3, maxSnowDepthCm: 58, maxSnowDepthDate: '2023-01-18' },
    { season: '2021-2022', totalSnowfallCm: 385.3, maxSnowDepthCm: 128, maxSnowDepthDate: '2022-02-22' },
    { season: '2020-2021', totalSnowfallCm: 410.1, maxSnowDepthCm: 134, maxSnowDepthDate: '2021-03-17' },
  ],
  'le-grand-massif': [
    { season: '2024-2025', totalSnowfallCm: 325.7, maxSnowDepthCm: 172, maxSnowDepthDate: '2025-01-29' },
    { season: '2023-2024', totalSnowfallCm: 437.6, maxSnowDepthCm: 198, maxSnowDepthDate: '2024-01-23' },
    { season: '2022-2023', totalSnowfallCm: 366.2, maxSnowDepthCm: 154, maxSnowDepthDate: '2023-03-15' },
    { season: '2021-2022', totalSnowfallCm: 394.9, maxSnowDepthCm: 178, maxSnowDepthDate: '2022-02-22' },
    { season: '2020-2021', totalSnowfallCm: 399.8, maxSnowDepthCm: 188, maxSnowDepthDate: '2021-03-17' },
  ],
  'les-3-vallees': [
    { season: '2024-2025', totalSnowfallCm: 465.8, maxSnowDepthCm: 170, maxSnowDepthDate: '2025-01-29' },
    { season: '2023-2024', totalSnowfallCm: 644.8, maxSnowDepthCm: 235, maxSnowDepthDate: '2024-04-01' },
    { season: '2022-2023', totalSnowfallCm: 485.4, maxSnowDepthCm: 161, maxSnowDepthDate: '2023-04-02' },
    { season: '2021-2022', totalSnowfallCm: 467.8, maxSnowDepthCm: 173, maxSnowDepthDate: '2022-04-09' },
    { season: '2020-2021', totalSnowfallCm: 435.7, maxSnowDepthCm: 168, maxSnowDepthDate: '2021-01-29' },
  ],
  'les-deux-alpes': [
    { season: '2024-2025', totalSnowfallCm: 420.7, maxSnowDepthCm: 162, maxSnowDepthDate: '2025-03-15' },
    { season: '2023-2024', totalSnowfallCm: 481.6, maxSnowDepthCm: 195, maxSnowDepthDate: '2024-04-01' },
    { season: '2022-2023', totalSnowfallCm: 351.7, maxSnowDepthCm: 125, maxSnowDepthDate: '2023-04-02' },
    { season: '2021-2022', totalSnowfallCm: 356.2, maxSnowDepthCm: 130, maxSnowDepthDate: '2022-02-22' },
    { season: '2020-2021', totalSnowfallCm: 380.9, maxSnowDepthCm: 155, maxSnowDepthDate: '2021-02-02' },
  ],
  'les-sybelles': [
    { season: '2024-2025', totalSnowfallCm: 467.3, maxSnowDepthCm: 160, maxSnowDepthDate: '2025-01-29' },
    { season: '2023-2024', totalSnowfallCm: 585.8, maxSnowDepthCm: 181, maxSnowDepthDate: '2024-03-12' },
    { season: '2022-2023', totalSnowfallCm: 464.3, maxSnowDepthCm: 144, maxSnowDepthDate: '2023-04-02' },
    { season: '2021-2022', totalSnowfallCm: 464.7, maxSnowDepthCm: 155, maxSnowDepthDate: '2022-02-22' },
    { season: '2020-2021', totalSnowfallCm: 436.7, maxSnowDepthCm: 169, maxSnowDepthDate: '2021-03-17' },
  ],
  'paradiski': [
    { season: '2024-2025', totalSnowfallCm: 516.3, maxSnowDepthCm: 195, maxSnowDepthDate: '2025-04-17' },
    { season: '2023-2024', totalSnowfallCm: 746.7, maxSnowDepthCm: 263, maxSnowDepthDate: '2024-04-01' },
    { season: '2022-2023', totalSnowfallCm: 597.2, maxSnowDepthCm: 191, maxSnowDepthDate: '2023-04-15' },
    { season: '2021-2022', totalSnowfallCm: 551.2, maxSnowDepthCm: 190, maxSnowDepthDate: '2022-04-09' },
    { season: '2020-2021', totalSnowfallCm: 493, maxSnowDepthCm: 193, maxSnowDepthDate: '2021-03-17' },
  ],
  'portes-du-soleil': [
    { season: '2024-2025', totalSnowfallCm: 425.6, maxSnowDepthCm: 117, maxSnowDepthDate: '2025-01-29' },
    { season: '2023-2024', totalSnowfallCm: 609.6, maxSnowDepthCm: 125, maxSnowDepthDate: '2024-01-19' },
    { season: '2022-2023', totalSnowfallCm: 479.3, maxSnowDepthCm: 92, maxSnowDepthDate: '2023-01-18' },
    { season: '2021-2022', totalSnowfallCm: 521.4, maxSnowDepthCm: 133, maxSnowDepthDate: '2022-02-22' },
    { season: '2020-2021', totalSnowfallCm: 483.4, maxSnowDepthCm: 147, maxSnowDepthDate: '2021-03-17' },
  ],
  'serre-chevalier': [
    { season: '2024-2025', totalSnowfallCm: 408.5, maxSnowDepthCm: 146, maxSnowDepthDate: '2025-04-17' },
    { season: '2023-2024', totalSnowfallCm: 565.2, maxSnowDepthCm: 234, maxSnowDepthDate: '2024-04-01' },
    { season: '2022-2023', totalSnowfallCm: 348.2, maxSnowDepthCm: 137, maxSnowDepthDate: '2023-03-14' },
    { season: '2021-2022', totalSnowfallCm: 278.3, maxSnowDepthCm: 111, maxSnowDepthDate: '2022-04-09' },
    { season: '2020-2021', totalSnowfallCm: 314.9, maxSnowDepthCm: 125, maxSnowDepthDate: '2021-01-29' },
  ],
  'tignes-val-disere': [
    { season: '2024-2025', totalSnowfallCm: 485.7, maxSnowDepthCm: 235, maxSnowDepthDate: '2025-04-17' },
    { season: '2023-2024', totalSnowfallCm: 712.4, maxSnowDepthCm: 287, maxSnowDepthDate: '2024-04-01' },
    { season: '2022-2023', totalSnowfallCm: 580.3, maxSnowDepthCm: 181, maxSnowDepthDate: '2023-03-14' },
    { season: '2021-2022', totalSnowfallCm: 523.3, maxSnowDepthCm: 185, maxSnowDepthDate: '2022-04-09' },
    { season: '2020-2021', totalSnowfallCm: 466.7, maxSnowDepthCm: 182, maxSnowDepthDate: '2021-01-29' },
  ],
  'val-cenis': [
    { season: '2024-2025', totalSnowfallCm: 392.1, maxSnowDepthCm: 172, maxSnowDepthDate: '2025-04-17' },
    { season: '2023-2024', totalSnowfallCm: 588.2, maxSnowDepthCm: 239, maxSnowDepthDate: '2024-03-10' },
    { season: '2022-2023', totalSnowfallCm: 350.5, maxSnowDepthCm: 138, maxSnowDepthDate: '2023-03-14' },
    { season: '2021-2022', totalSnowfallCm: 336.8, maxSnowDepthCm: 123, maxSnowDepthDate: '2022-04-08' },
    { season: '2020-2021', totalSnowfallCm: 301.5, maxSnowDepthCm: 127, maxSnowDepthDate: '2021-01-29' },
  ],
  'via-lattea': [
    { season: '2024-2025', totalSnowfallCm: 312.3, maxSnowDepthCm: 138, maxSnowDepthDate: '2025-04-17' },
    { season: '2023-2024', totalSnowfallCm: 462.9, maxSnowDepthCm: 220, maxSnowDepthDate: '2024-04-01' },
    { season: '2022-2023', totalSnowfallCm: 278.9, maxSnowDepthCm: 123, maxSnowDepthDate: '2023-03-14' },
    { season: '2021-2022', totalSnowfallCm: 208.8, maxSnowDepthCm: 101, maxSnowDepthDate: '2022-04-08' },
    { season: '2020-2021', totalSnowfallCm: 220.4, maxSnowDepthCm: 115, maxSnowDepthDate: '2021-02-01' },
  ],
};
