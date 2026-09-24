# Skidd-APP — projektkontext för Claude Code

## HUR VI JOBBAR — läs detta först

1. **PLAN FÖRE BYGGE.** Förklara alltid tillvägagångssätt och vänta på
   godkännande innan något körs som rör flera filer, laddar upp data eller
   ändrar en etablerad design.
2. **VERIFIERA, LITA INTE PÅ ÖGONMÅTT.** När något ska stämma mot ett facit:
   gör riktig pixel-diff eller checksum-jämförelse. En bild som ser rätt ut
   kan dölja fel, och en som ser fel ut kan vara en cache-artefakt.
3. **VAR EXAKT MED GRÄNSER OCH TRÖSKLAR.** Om en instruktion kan tolkas på
   mer än ett sätt: fråga innan du bygger, bekräfta tolkningen explicit,
   gissa inte.
4. **EN VARIABEL I TAGET.** Blanda inte flera samtidiga ändringar. Testa och
   lås en sak innan nästa.
5. **FELSÖK METODISKT, BÖRJA MED DET ENKLASTE.** Uteslut cache, gammal
   webbläsarflik och fel testdata innan komplexa buggar misstänks. Flera
   "olösliga" buggar har varit en flik som levt för länge - lösningen är att
   stänga webbläsaren helt.
6. **LÅS DESIGNBESLUT INNAN BATCH-KÖRNING.** Lås färgskala och parametrar en
   gång innan en pipeline körs för alla orter.
7. **SÄKERHETSKRITISKA LAGER (branthet, sol/skugga):** appen riktar sig till
   offpiståkare. Prioritera saklig korrekthet över estetik. Flagga
   avvägningen om en ändring gör en gräns svårare att läsa av exakt.
8. **HEMLIGHETER** (API-nycklar, tokens) klistras aldrig in i chatten, bara
   direkt i terminalen. Skapa engångsnycklar med begränsad räckvidd och
   återkalla dem efteråt.
9. **COMMITTA VID SÄKRA CHECKPOINTS,** inte mitt i en osäker utredning.
10. **GDAL OCH PYTHON BLOCKERAS** av Windows Smart App Control när det är
    påslaget. All geodata-pipeline ska vara ren Python (rasterio, numpy,
    scipy, PIL, whitebox). Smart App Control stängs av manuellt före
    pipelinekörningar och slås på igen efteråt.
11. **VERIFIERA ATT EN KÖRNING FAKTISKT KÖRDES.** Orimligt kort byggtid
    betyder oftast att cachad data återanvänts. Jämför alltid mot förväntad
    tid.

---

## Vad är det här för projekt?
En interaktiv karta över 15 franska/italienska skidorter (`src/data/resorts.ts`,
Excel-synkat — ändra inte utan att också uppdatera Excel-källan). Utöver
grundinfo (pistkilometer, liftar, höjd) finns tre terränglager byggda i
förberäknade tile-pyramider, hostade på Cloudflare R2 och laddade via
Mapbox i `src/components/MapView.tsx`:

- **Branthetslager (slope)** — 7-bandsgradering (McCammon 2009/Perla)
- **Sol/skugga-lager (time-distance)** — binär sol/skugga-status per timme
- **Sol/skugga tidsavstånd** — bygger på samma pipeline, sekundär vy

Vilka orter som har tiles klara styrs av `SLOPE_LAYER_RESORT_IDS` och
`SUN_SHADOW_LAYER_RESORT_IDS` i `src/data/terrainLayers.ts` — uppdatera
manuellt när en ny ort får tiles uppladdade.

---

## Tech stack
- **Frontend:** React + TypeScript + Vite, Mapbox GL
- **Backend/data:** Netlify Functions (`netlify/functions/weather.ts`, cachar
  OpenWeather One Call via `@netlify/blobs`), Supabase
- **Tile-hosting:** Cloudflare R2, bucket `skidorter-tiles`, publik URL
  `https://pub-6d13387d7dcb4d59b77f9bb88cb0858e.r2.dev/`
- **Tile-pipeline:** fristående Python-skript i `pipeline/`, körs manuellt
  (ingen CI), miljön `C:\Users\User1\miniforge3\envs\geo` (rasterio, numpy,
  scipy, PIL, whitebox — inte `osgeo.gdal`, blockerad av Windows Smart App
  Control på byggmaskinen)

---

## Nuläge terränglager (2026-09-23)

**Sol/skugga-lagret är klart för samtliga 15 orter**, byggt med
`pipeline/time-distance/build_time_distance_local.py`, uppladdat till R2
(`time-distance-tiles/<ort>/`) och verifierat (0 mörka kantpixlar, bara de
tre palettfärgerna + alpha 0/166, täckning inom bbox, `rclone check` 0 diff
mot R2).

Två designfixar gjordes under utrullningen (se `git log` för
`build_time_distance_local.py`, commits 2026-09-22):

1. **Buffert per ort** (`_resort_buffer_bounds`, med `assert`): horisontberäkningens
   sökbuffert beräknas nu per ort (kärnboxens mest avlägsna kant + 20 km
   sökradie + 5 km marginal) istället för en fast 56,1×49,2 km-buffert ärvd
   från Alpe d'Huez-piloten, som var för liten för flera av de större
   orterna.
2. **Masterraster med låst 30 m-rutnät** (`build_utm_master_raster`,
   `DEM_MASTER_DIR = C:\Users\User1\geodata`): `rasterio.warp.reproject()`
   visade sig inte vara bit-exakt reproducerbar när målarrayens storlek
   ändras (ca 0,1–0,3 m DEM-brus, spritt över hela kärnboxen, oberoende av
   buffertens kant). Lösning: DEM-mosaiken reprojiceras EN gång per UTM-zon
   till en fast masterraster, rutnätet låst till jämna 30 m från UTM (0,0).
   Varje ort klipper sedan ut sin buffert som ett rent fönster (numpy-slice)
   ur masterrastret — ingen ny omprojicering, alltså inget brus.

Bbox per ny ort = union(branthetslagrets bbox, OSM aerialway-utbredning +
~1 km marginal), avrundad utåt till 0,001°. Flera orter fick därför en
**större** bbox än branthetslagret (se nästa avsnitt).

---

## Kända ärenden

- **Branthetslagret behöver byggas om** för de orter vars sol/skugga-bbox
  blev större än branthetslagrets ursprungliga bbox: **les-3-vallees,
  paradiski, portes-du-soleil, chamonix** (bekräftat utvidgade) samt
  **via-lattea** (byggdes om till hela systemet inkl. Sestriere/Sauze
  d'Oulx/Sansicario/Claviere). Annars täcker branthetslagret mindre yta än
  sol/skugga för dessa orter. DEM-tiles för det finns redan på disk
  (`C:\Users\User1\geodata\copernicus-dem\`, komplett 3×3-rutnät N44–N46 ×
  E005–E007).
- **25°-kantfixen i `pipeline/slope/build_slope_local.py` är INTE gjord.**
  Branthetspipelinen har samma typ av mörk-kant-bugg som sol/skugga-
  pipelinen hade (RGB blandas mot svart vid nedskalning av z12→z8, inte
  alpha-viktat) — hittad men aldrig åtgärdad, eftersom den prioriterades
  ned till förmån för sol/skugga-utrullningen. Bör fixas innan/i samband
  med ombyggnaden ovan (samma alpha-viktade medelvärde-fix som gjordes i
  `tile_rgba` i `build_time_distance_local.py`).
- **Backup av föregående tiles:** `alpe-dhuez` och `espace-san-bernardo`
  byggdes om 2026-09-22 med buffert-/masterraster-fixarna. De tidigare
  tiles ligger kvar i `time-distance-tiles-backup-2026-09-22/<ort>/` i R2.
- **via-lattea och espace-san-bernardo är gränsöverskridande system
  (Italien/Frankrike).** `country` är en enda sträng och anger basorten. En
  `countries`-lista vore mer korrekt men kräver ändring i filter, UI och
  Excel-källan.

---

## Kodstil och konventioner
- TypeScript, funktionella React-komponenter
- Kommentarer i Python-pipelinen på svenska (utan å/ä/ö i vissa äldre
  skript av historiska skäl — nya skript använder å/ä/ö normalt)
- Pipeline-skript är körbara fristående, inte del av npm-bygget

## Viktiga regler
- Rör inte `alpe-dhuez`/`espace-san-bernardo`-tiles i R2 utan att först
  säkerhetskopiera (se mönstret `time-distance-tiles-backup-<datum>/`)
- Ladda aldrig upp till R2 eller committa pipeline-ändringar utan explicit
  godkännande — bygg och verifiera i scratchpad först
