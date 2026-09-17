// Vilka orter som faktiskt har förberäknade branthets-/sol-skugga-tiles
// hostade på Cloudflare R2. Medvetet separat från Resort-typen i types.ts —
// resorts.ts är Excel-synkat ("ÄNDRA INTE utan att också uppdatera i koden"),
// medan det här bara är en implementationsdetalj om pipeline-status. Två
// separata listor eftersom branthets- och sol/skugga-pipelinen körs
// oberoende av varandra per ort och kan hamna i otakt.
//
// Uppdatera manuellt (lägg till ortens id, se Resort.id i resorts.ts) varje
// gång en ny ort får tiles genererade och uppladdade.
export const SLOPE_LAYER_RESORT_IDS: ReadonlySet<string> = new Set(['alpe-dhuez', 'espace-san-bernardo']);
export const SUN_SHADOW_LAYER_RESORT_IDS: ReadonlySet<string> = new Set(['alpe-dhuez', 'espace-san-bernardo']);
