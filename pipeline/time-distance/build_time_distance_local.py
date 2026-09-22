# -*- coding: utf-8 -*-
"""Ren Python (rasterio + numpy + scipy + PIL + whitebox) portering av
sol/skugga-tidsavstands-pipelinen. Originalet (.../scratchpad/first-sun/
build_time_distance.py, daterat 2025-09-09) anvander `from osgeo import gdal`
direkt, vilket inte kan koras pa den har maskinen langre (Windows Smart App
Control blockerar GDAL:s DLL, bekraftat oforandrat 2026-09-17).

Algoritmen (load_horizon_stack, interpolate_horizon, sweep_lit_stack,
signed_time_to_transition, NEVER_SENTINEL) ar HAMTAD OFORANDRAD fran
originalet - bara I/O-lagret ar bytt fran osgeo.gdal till rasterio, verifierat
pixel-for-pixel identiskt mot GDAL:s egen (aldre) output for warpning av
horisontbinsen (se scratchpad/time-distance-local/smoke_test_rasterio_warp.py:
mean/max abs diff = 0.0 over 465639 pixlar).

Fargsattningen ar dock BYTT fran originalets kontinuerliga amber/bla-gradient
till den BINARA 3-fargskodningen fran den faktiska produktionspipelinen
(pipeline/time-distance/build_binary_tiles_local.py), som ar den som matchar
TIME_DISTANCE_LEGEND i src/components/MapView.tsx exakt (#FDB813/#2563EB/
#080E28).

Tva korlagen:
  --resort alpe-dhuez       Regressionstest: aterananvander Alpe d'Huez egna,
                             redan berknade horizon_raw-tiles (fran fore
                             GDAL-blockeringen) for att verifiera att
                             portingen ger samma resultat som redan uppladdad,
                             live produktionsdata i R2.
  --resort espace-san-bernardo
                             Skarp korning for La Rosiere: laddar ner
                             saknade Copernicus GLO-30-tiles, mosaikar,
                             reprojicerar till UTM, beraknar 30
                             horisontbins med WhiteboxTools HorizonAngle,
                             sveper/fargsatter/kaklar.

Uppladdning till R2 gors INTE har - se plan/godkannande i konversationen.
"""
from __future__ import annotations

import argparse
import math
import os
import sys
import urllib.request
from dataclasses import dataclass, field

import numpy as np
import rasterio
import rasterio.windows
from rasterio.warp import reproject, Resampling, calculate_default_transform
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from suncalc_port import get_position, local_datetime_ms  # noqa: E402

# --------------------------------------------------------------------------
# Konstanter - identiska med originalet
# --------------------------------------------------------------------------
BINS = list(range(0, 360, 12))  # 30 bins, 12 grader mellanrum
DATES = [
    (2025, 11, 15), (2025, 12, 15), (2026, 1, 15),
    (2026, 2, 15), (2026, 3, 15), (2026, 4, 15),
]
REFERENCE_HOURS = list(range(6, 19))  # 06..18, 13 st
SWEEP_START_MIN = 6 * 60
SWEEP_END_MIN = 19 * 60
SWEEP_STEP_MIN = 5
NEVER_SENTINEL = 99999.0

# Binar fargsattning - fran build_binary_tiles_local.py (produktionsversionen,
# matchar MapView.tsx TIME_DISTANCE_LEGEND).
SUN_COLOR = (253, 184, 19)     # #FDB813
SHADOW_COLOR = (37, 99, 235)   # #2563EB
NEVER_COLOR = (8, 14, 40)      # #080E28
ALPHA = 166  # round(0.65 * 255)

TILE = 256
R = 6378137.0
ORIGIN = math.pi * R


# --------------------------------------------------------------------------
# Resort-konfiguration
# --------------------------------------------------------------------------
@dataclass
class ResortConfig:
    resort_id: str
    lat: float
    lng: float
    core_west: float
    core_east: float
    core_north: float
    core_south: float
    utm_epsg: int
    horizon_raw_dir: str
    work_dir: str
    dem_tiles: list = field(default_factory=list)  # (name, url) om nedladdning kravs
    dem_local_dir: str = ""
    generate_horizon: bool = False  # False = aterananvand befintliga horizon_az*.tif


FIRST_SUN_DIR = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/first-sun"
SESSION_WORK = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/7f028cf8-1b7b-40cc-b6c2-406ca6cded93/scratchpad/time-distance-local"

# Fast mapp for Copernicus DEM-tiles, utanfor Temp sa den overlever
# omstart/scratchpad-stadning (se konversationen 2026-09-22). Ersatter de
# gamla scratchpad-sokvagarna i KNOWN_DEM_TILES nedan.
DEM_CACHE_DIR = "C:/Users/User1/geodata/copernicus-dem"

# Mapp for UTM-masterrastren (en per zon, se build_utm_master_raster).
DEM_MASTER_DIR = "C:/Users/User1/geodata"

# Arbetsmapp for utrullningen till de 13 aterstaende orterna (se
# konversationen 2026-09-19/22). Bbox per ort = union(branthetslagrets bbox,
# OSM aerialway-utbredning + ~1 km), avrundad utat till 0.001 grader.
ROLLOUT_WORK = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/021da3f7-570d-4677-b02b-770d84328a4b/scratchpad/time-distance-rollout"

COPERNICUS_BASE = "https://copernicus-dem-30m.s3.amazonaws.com"


def dem_tile_url(tile_id: str) -> str:
    # tile_id t.ex. "N45_00_E007_00"
    return f"{COPERNICUS_BASE}/Copernicus_DSM_COG_10_{tile_id}_DEM/Copernicus_DSM_COG_10_{tile_id}_DEM.tif"


RESORTS = {
    "alpe-dhuez": ResortConfig(
        resort_id="alpe-dhuez",
        lat=45.092, lng=6.069,
        core_west=5.93262, core_east=6.24023, core_north=45.15105, core_south=44.99588,
        utm_epsg=32631,
        horizon_raw_dir=f"{FIRST_SUN_DIR}/horizon_raw",  # ATERANVANDER befintliga - genereras EJ om
        work_dir=f"{SESSION_WORK}/alpe-dhuez-regression",
        generate_horizon=False,
    ),
    "espace-san-bernardo": ResortConfig(
        resort_id="espace-san-bernardo",
        lat=45.627, lng=6.848,
        # Samma SPANN (bredd/hojd i grader) som Alpe d'Huez kärnbbox
        # (0.30761 x 0.15517 grader), men centrerad symmetriskt pa
        # ortens egen lat/lng - Alpe d'Huez-boxen ar nagot forskjuten mot
        # sydost om centrumpunkten (troligen handjusterad efter terrangen
        # dar), vilket vi inte har underlag att aterskapa. Bekraftas mot
        # jamforelsebilden i slutet av korningen.
        core_west=6.848 - 0.30761 / 2, core_east=6.848 + 0.30761 / 2,
        core_north=45.627 + 0.15517 / 2, core_south=45.627 - 0.15517 / 2,
        utm_epsg=32632,  # 6.848E ligger solitt i zon 32N (6-12E)
        horizon_raw_dir=f"{SESSION_WORK}/espace-san-bernardo/horizon_raw",  # GENERERAS
        work_dir=f"{SESSION_WORK}/espace-san-bernardo",
        dem_tiles=[],  # fylls i av ensure_dem_tiles() baserat pa beraknad buffert
        dem_local_dir=f"{SESSION_WORK}/espace-san-bernardo/dem",
        generate_horizon=True,
    ),

    # ------------------------------------------------------------------
    # De 13 aterstaende orterna (utrullning, se konversationen 2026-09-19
    # och 2026-09-22). Bbox = union(branthetslagrets bbox, OSM
    # aerialway-utbredning + ~1 km marginal), avrundad utat till 0.001
    # grader. Alla ligger solitt oster om 6E (les-deux-alpes bbox nuddar
    # 5.996, dvs ~0.3 km in i zon 31N - forsumbart, samma resonemang som
    # for espace-san-bernardo). generate_horizon=True: horisontbinsen
    # finns inte sedan tidigare, DEM-tiles aterananvands via
    # KNOWN_DEM_TILES/DEM_CACHE_DIR nedan.
    # ------------------------------------------------------------------
    "les-3-vallees": ResortConfig(
        resort_id="les-3-vallees", lat=45.298, lng=6.580,
        core_west=6.455, core_south=45.198, core_east=6.705, core_north=45.460,
        utm_epsg=32632,
        horizon_raw_dir=f"{ROLLOUT_WORK}/les-3-vallees/horizon_raw",
        work_dir=f"{ROLLOUT_WORK}/les-3-vallees",
        dem_tiles=[], dem_local_dir=DEM_CACHE_DIR, generate_horizon=True,
    ),
    "paradiski": ResortConfig(
        resort_id="paradiski", lat=45.572, lng=6.780,
        core_west=6.617, core_south=45.446, core_east=6.905, core_north=45.645,
        utm_epsg=32632,
        horizon_raw_dir=f"{ROLLOUT_WORK}/paradiski/horizon_raw",
        work_dir=f"{ROLLOUT_WORK}/paradiski",
        dem_tiles=[], dem_local_dir=DEM_CACHE_DIR, generate_horizon=True,
    ),
    "tignes-val-disere": ResortConfig(
        resort_id="tignes-val-disere", lat=45.468, lng=6.905,
        core_west=6.780, core_south=45.395, core_east=7.080, core_north=45.541,
        utm_epsg=32632,
        horizon_raw_dir=f"{ROLLOUT_WORK}/tignes-val-disere/horizon_raw",
        work_dir=f"{ROLLOUT_WORK}/tignes-val-disere",
        dem_tiles=[], dem_local_dir=DEM_CACHE_DIR, generate_horizon=True,
    ),
    "portes-du-soleil": ResortConfig(
        resort_id="portes-du-soleil", lat=46.192, lng=6.772,
        # Vastkanten stannar vid 6.619 - Saint-Jean-d'Aulps (separat OSM-
        # kluster) exkluderas medvetet (beslut 2026-09-22).
        core_west=6.619, core_south=46.119, core_east=6.897, core_north=46.320,
        utm_epsg=32632,
        horizon_raw_dir=f"{ROLLOUT_WORK}/portes-du-soleil/horizon_raw",
        work_dir=f"{ROLLOUT_WORK}/portes-du-soleil",
        dem_tiles=[], dem_local_dir=DEM_CACHE_DIR, generate_horizon=True,
    ),
    "le-grand-massif": ResortConfig(
        resort_id="le-grand-massif", lat=46.006, lng=6.691,
        core_west=6.566, core_south=45.933, core_east=6.816, core_north=46.091,
        utm_epsg=32632,
        horizon_raw_dir=f"{ROLLOUT_WORK}/le-grand-massif/horizon_raw",
        work_dir=f"{ROLLOUT_WORK}/le-grand-massif",
        dem_tiles=[], dem_local_dir=DEM_CACHE_DIR, generate_horizon=True,
    ),
    "les-sybelles": ResortConfig(
        resort_id="les-sybelles", lat=45.239, lng=6.269,
        core_west=6.144, core_south=45.166, core_east=6.394, core_north=45.312,
        utm_epsg=32632,
        horizon_raw_dir=f"{ROLLOUT_WORK}/les-sybelles/horizon_raw",
        work_dir=f"{ROLLOUT_WORK}/les-sybelles",
        dem_tiles=[], dem_local_dir=DEM_CACHE_DIR, generate_horizon=True,
    ),
    "les-deux-alpes": ResortConfig(
        resort_id="les-deux-alpes", lat=45.008, lng=6.121,
        core_west=5.996, core_south=44.935, core_east=6.250, core_north=45.081,
        utm_epsg=32632,
        horizon_raw_dir=f"{ROLLOUT_WORK}/les-deux-alpes/horizon_raw",
        work_dir=f"{ROLLOUT_WORK}/les-deux-alpes",
        dem_tiles=[], dem_local_dir=DEM_CACHE_DIR, generate_horizon=True,
    ),
    "serre-chevalier": ResortConfig(
        resort_id="serre-chevalier", lat=44.933, lng=6.586,
        core_west=6.461, core_south=44.860, core_east=6.711, core_north=45.006,
        utm_epsg=32632,
        horizon_raw_dir=f"{ROLLOUT_WORK}/serre-chevalier/horizon_raw",
        work_dir=f"{ROLLOUT_WORK}/serre-chevalier",
        dem_tiles=[], dem_local_dir=DEM_CACHE_DIR, generate_horizon=True,
    ),
    "evasion-mont-blanc": ResortConfig(
        resort_id="evasion-mont-blanc", lat=45.857, lng=6.617,
        core_west=6.492, core_south=45.763, core_east=6.776, core_north=45.930,
        utm_epsg=32632,
        horizon_raw_dir=f"{ROLLOUT_WORK}/evasion-mont-blanc/horizon_raw",
        work_dir=f"{ROLLOUT_WORK}/evasion-mont-blanc",
        dem_tiles=[], dem_local_dir=DEM_CACHE_DIR, generate_horizon=True,
    ),
    "chamonix": ResortConfig(
        resort_id="chamonix", lat=45.923, lng=6.869,
        core_west=6.737, core_south=45.850, core_east=6.994, core_north=46.052,
        utm_epsg=32632,
        horizon_raw_dir=f"{ROLLOUT_WORK}/chamonix/horizon_raw",
        work_dir=f"{ROLLOUT_WORK}/chamonix",
        dem_tiles=[], dem_local_dir=DEM_CACHE_DIR, generate_horizon=True,
    ),
    "via-lattea": ResortConfig(
        resort_id="via-lattea", lat=44.931, lng=6.722,
        # Hela systemet (beslut 2026-09-22): inkl. Sestriere, Sauze
        # d'Oulx, Sansicario, Claviere pa italienska sidan.
        core_west=6.597, core_south=44.858, core_east=6.973, core_north=45.035,
        utm_epsg=32632,
        horizon_raw_dir=f"{ROLLOUT_WORK}/via-lattea/horizon_raw",
        work_dir=f"{ROLLOUT_WORK}/via-lattea",
        dem_tiles=[], dem_local_dir=DEM_CACHE_DIR, generate_horizon=True,
    ),
    "espace-diamant": ResortConfig(
        resort_id="espace-diamant", lat=45.759, lng=6.536,
        core_west=6.411, core_south=45.686, core_east=6.661, core_north=45.843,
        utm_epsg=32632,
        horizon_raw_dir=f"{ROLLOUT_WORK}/espace-diamant/horizon_raw",
        work_dir=f"{ROLLOUT_WORK}/espace-diamant",
        dem_tiles=[], dem_local_dir=DEM_CACHE_DIR, generate_horizon=True,
    ),
    "val-cenis": ResortConfig(
        resort_id="val-cenis", lat=45.281, lng=6.900,
        core_west=6.775, core_south=45.208, core_east=7.025, core_north=45.354,
        utm_epsg=32632,
        horizon_raw_dir=f"{ROLLOUT_WORK}/val-cenis/horizon_raw",
        work_dir=f"{ROLLOUT_WORK}/val-cenis",
        dem_tiles=[], dem_local_dir=DEM_CACHE_DIR, generate_horizon=True,
    ),
}

# Kanda befintliga DEM-tiles pa disk (DEM_CACHE_DIR), aterananvands istallet
# for att laddas ner igen. Komplett 3x3-rektangel (N44-N46 x E005-E007) -
# masterrastrets manuella mosaikning (radvis konkatenering, se
# build_utm_master_raster) kraver samma antal tiles per breddgrad.
KNOWN_DEM_TILES = {
    "N44_00_E005_00": f"{DEM_CACHE_DIR}/N44_00_E005_00.tif",
    "N44_00_E006_00": f"{DEM_CACHE_DIR}/N44_00_E006_00.tif",
    "N44_00_E007_00": f"{DEM_CACHE_DIR}/N44_00_E007_00.tif",
    "N45_00_E005_00": f"{DEM_CACHE_DIR}/N45_00_E005_00.tif",
    "N45_00_E006_00": f"{DEM_CACHE_DIR}/N45_00_E006_00.tif",
    "N45_00_E007_00": f"{DEM_CACHE_DIR}/N45_00_E007_00.tif",
    "N46_00_E005_00": f"{DEM_CACHE_DIR}/N46_00_E005_00.tif",
    "N46_00_E006_00": f"{DEM_CACHE_DIR}/N46_00_E006_00.tif",
    "N46_00_E007_00": f"{DEM_CACHE_DIR}/N46_00_E007_00.tif",
}


def print_bbox_confirmation(cfg: ResortConfig):
    print(f"--- Bbox-bekraftelse for {cfg.resort_id} ---")
    print(f"  resorts.ts lat/lng: {cfg.lat}, {cfg.lng}")
    print(f"  CORE bbox (EPSG:4326): W={cfg.core_west:.5f} E={cfg.core_east:.5f} "
          f"N={cfg.core_north:.5f} S={cfg.core_south:.5f}")
    print(f"  Spann: {cfg.core_east - cfg.core_west:.5f} grader lon x "
          f"{cfg.core_north - cfg.core_south:.5f} grader lat")
    print(f"  UTM-mal: EPSG:{cfg.utm_epsg}")


# --------------------------------------------------------------------------
# DEM-hamtning och horisontberakning (endast for orter med generate_horizon=True)
# --------------------------------------------------------------------------
# Max sokavstand for HorizonAngle.
HORIZON_MAX_DIST_M = 20000.0

# Sakerhetsmarginal utover sokavstandet - bufferns kant hamnar minst
# HORIZON_MAX_DIST_M + BUFFER_SAFETY_MARGIN_M fran karnboxens mest
# avlagsna kant, i varje riktning.
BUFFER_SAFETY_MARGIN_M = 5000.0

# TIDIGARE (fore 2026-09-22): fast buffert (56100 x 49230 m halva
# bredd/hojd), uppmatt fran Alpe d'Huez befintliga horizon_raw-raster och
# aterananvand oforandrad for alla orter oavsett karnboxens storlek. Den
# rackte for La Rosiere (marginal ~16 km till karnboxens kant, se nedan)
# men inte for flera av de 13 orterna i utrullningen (karnboxar storre an
# Alpe d'Huez/La Rosiere pga OSM-baserad utvidgning) - upp till 13 km for
# lite pa den varsta kanten, vilket hade gett kantartefakter i
# horisontberakningen langs hela karnboxens perimeter. Bufferten beraknas
# darfor nu per ort istallet for en global konstant.
def _resort_buffer_bounds(cfg: ResortConfig):
    """UTM-buffert (west, south, east, north) for en ort: centrerad pa
    ortens punkt (cfg.lat/lng), stor nog att karnboxens mest avlagsna
    kant fran punkten (i vardera riktningen separat, eftersom karnboxen
    inte alltid ar symmetriskt centrerad pa punkten) fortfarande har
    HORIZON_MAX_DIST_M + BUFFER_SAFETY_MARGIN_M kvar av sokradien
    innanfor bufferten."""
    with rasterio.Env():
        # Punkten plus karnboxens fyra kanter, langs punktens egna
        # lat/lng (inte kärnboxens hörn) - ger ratt UTM-avstand oavsett
        # hur boxen ar forskjuten i forhallande till punkten.
        from rasterio.warp import transform
        lons = [cfg.lng, cfg.core_west, cfg.core_east, cfg.lng, cfg.lng]
        lats = [cfg.lat, cfg.lat, cfg.lat, cfg.core_south, cfg.core_north]
        xs, ys = transform("EPSG:4326", f"EPSG:{cfg.utm_epsg}", lons, lats)
    cx, cy, x_w, x_e, y_s, y_n = xs[0], ys[0], xs[1], xs[2], ys[3], ys[4]
    reach = HORIZON_MAX_DIST_M + BUFFER_SAFETY_MARGIN_M
    half_w = max(abs(cx - x_w), abs(x_e - cx)) + reach
    half_h = max(abs(cy - y_s), abs(y_n - cy)) + reach
    bounds = (cx - half_w, cy - half_h, cx + half_w, cy + half_h)

    # Sakerhetskontroll: stoppa hellre korningen an att bygga tiles med
    # kantartefakter i horisontsokningen (se motivering ovan).
    margins_m = {
        "vast": (x_w - bounds[0]) - HORIZON_MAX_DIST_M,
        "ost": (bounds[2] - x_e) - HORIZON_MAX_DIST_M,
        "syd": (y_s - bounds[1]) - HORIZON_MAX_DIST_M,
        "nord": (bounds[3] - y_n) - HORIZON_MAX_DIST_M,
    }
    worst_side, worst_margin = min(margins_m.items(), key=lambda kv: kv[1])
    assert worst_margin >= 0, (
        f"{cfg.resort_id}: bufferten tacker inte karnboxen + "
        f"{HORIZON_MAX_DIST_M / 1000:.0f} km sokradie i alla riktningar "
        f"(kortast marginal {worst_margin / 1000:.1f} km pa {worst_side}-kanten). "
        f"Kantartefakter i horisontberakningen skulle uppsta - avbryter."
    )
    return bounds


def utm_bbox_for_buffer(cfg: ResortConfig):
    """Rortpunktens UTM-koordinat +- ortens buffert -> (west, south, east, north) i UTM."""
    return _resort_buffer_bounds(cfg)


def required_dem_tiles(cfg: ResortConfig) -> list:
    """Rakna ut vilka 1x1-graders Copernicus-tiles som bufferten (i EPSG:4326)
    faktiskt tacker, istallet for att anta ett hardkodat monster.

    OBS: anvands INTE langre av build_utm_buffer_dem (se
    build_utm_master_raster nedan, 2026-09-22) - kvar for referens/eventuell
    framtida direkt-nedladdning per ort."""
    from rasterio.warp import transform
    west_utm, south_utm, east_utm, north_utm = utm_bbox_for_buffer(cfg)
    xs = [west_utm, east_utm, east_utm, west_utm]
    ys = [south_utm, south_utm, north_utm, north_utm]
    lons, lats = transform(f"EPSG:{cfg.utm_epsg}", "EPSG:4326", xs, ys)
    lon_min, lon_max = min(lons), max(lons)
    lat_min, lat_max = min(lats), max(lats)
    print(f"  Horisontbuffert i EPSG:4326: lon [{lon_min:.4f},{lon_max:.4f}] "
          f"lat [{lat_min:.4f},{lat_max:.4f}]")
    tiles = []
    lat0 = math.floor(lat_min)
    while lat0 <= math.floor(lat_max):
        lon0 = math.floor(lon_min)
        while lon0 <= math.floor(lon_max):
            tiles.append(f"N{lat0:02d}_00_E{lon0:03d}_00")
            lon0 += 1
        lat0 += 1
    return tiles


def ensure_dem_tiles(cfg: ResortConfig) -> list:
    """OBS: anvands INTE langre av build_utm_buffer_dem (se
    build_utm_master_raster nedan, 2026-09-22) - kvar for referens/eventuell
    framtida direkt-nedladdning per ort."""
    os.makedirs(cfg.dem_local_dir, exist_ok=True)
    tile_ids = required_dem_tiles(cfg)
    print(f"  Kravda DEM-tiles: {tile_ids}")
    paths = []
    for tid in tile_ids:
        if tid in KNOWN_DEM_TILES and os.path.exists(KNOWN_DEM_TILES[tid]):
            print(f"    {tid}: aterananvander befintlig lokal fil")
            paths.append(KNOWN_DEM_TILES[tid])
            continue
        dst = f"{cfg.dem_local_dir}/{tid}.tif"
        if os.path.exists(dst):
            print(f"    {tid}: redan nedladdad")
            paths.append(dst)
            continue
        url = dem_tile_url(tid)
        print(f"    {tid}: laddar ner fran {url} ...")
        urllib.request.urlretrieve(url, dst)
        size_mb = os.path.getsize(dst) / 1e6
        print(f"    {tid}: klar ({size_mb:.1f} MB)")
        paths.append(dst)
    return paths


# --------------------------------------------------------------------------
# EN masterraster per UTM-zon istallet for en ny reprojicering per ort.
#
# Undersokning 2026-09-22 (se konversationen): rasterio.warp.reproject() ar
# INTE bit-exakt reproducerbar nar malarrayens overgripande storlek andras,
# aven med identisk kalldata och identiskt malrutnat (fas+pixelstorlek) pa
# den overlappande delen - median ~0.1-0.3 m DEM-hojdskillnad, aven langt
# fran nagon buffertkant. Uteslutet som orsak: tolerance (0.0 vs standard
# 0.125), warp_mem_limit, num_threads, XSCALE/YSCALE, flera PROJ/OGR-
# installningar, WarpedVRT vs reproject(), samt chunkad omprojicering (gav
# INTE mindre avvikelse - snarare likvardig). Den ENDA kombination som gav
# bit-exakt (0.000000) matchning var en enda reproject()-anrop med EXAKT
# samma malarray-dimensioner som en tidigare korning.
#
# Losning: reprojicera DEM-mosaiken EN GANG per UTM-zon till en fast
# masterraster (rutnat last till jamna 30 m fran UTM (0,0)), sparad i
# DEM_MASTER_DIR (aterananvands om den redan finns). Varje ort klipper sedan
# ut sin buffert som ett rent fonster (numpy-slice, ingen omprojicering) ur
# masterrastret - identiskt for alla buffertstorlekar per konstruktion,
# eftersom det ar samma underliggande pixeldata som las. Verifierat:
# La Rosiere byggd med gamla resp. nya bufferstorleken ur samma masterraster
# gav 0 avvikande pixlar bortom 20 km fran gamla buffertkanten (503 av
# 245 miljoner totalt, samtliga inom 15.9-18.0 km fran kanten - forvantad
# sokradie-kanslighet, inte brus).
# --------------------------------------------------------------------------
GRID_STEP_M = 30.0  # samma pixelstorlek som tidigare (Copernicus GLO-30 nativ)


def _snap_to_zero_lattice(value: float, direction: str) -> float:
    """Rundar `value` till narmaste multipel av GRID_STEP_M rakt fran UTM
    (0,0) - "down" rundar nedat/vasterut/soderut (utvidgar tackningen at det
    hallet), "up" uppat/osterut/norrut. Ort-oberoende fas, sa alla orter i en
    zon delar exakt samma rutnat."""
    k = value / GRID_STEP_M
    k = math.floor(k) if direction == "down" else math.ceil(k)
    return k * GRID_STEP_M


def build_utm_master_raster(utm_epsg: int) -> str:
    """Mosaikar ALLA kanda DEM-tiles (KNOWN_DEM_TILES) och reprojicerar dem
    EN GANG till en masterraster i EPSG:{utm_epsg}, rutnat last till jamna
    30 m fran UTM (0,0). Sparas i DEM_MASTER_DIR (aterananvands om filen
    redan finns) - se motivering ovan."""
    master_path = f"{DEM_MASTER_DIR}/dem-utm{utm_epsg}-master.tif"
    if os.path.exists(master_path):
        return master_path

    os.makedirs(DEM_MASTER_DIR, exist_ok=True)
    mosaic_path = f"{DEM_MASTER_DIR}/_dem_mosaic_4326_master.tif"
    dem_paths = sorted(set(KNOWN_DEM_TILES.values()))

    if not os.path.exists(mosaic_path):
        # rasterio.merge.merge() kraschar (native krasch, ingen Python-
        # traceback) med de har Copernicus COG-tiles pa den har maskinen -
        # se scratchpad-felsokningen. Mosaikar darfor manuellt istallet:
        # Copernicus GLO-30-tiles ar alla exakt 1x1 grader / 3600x3600 px pa
        # samma raster, sa en enkel rad/kolumn-sammanfogning racker.
        tiles_meta = []
        for p in dem_paths:
            with rasterio.open(p) as ds:
                tiles_meta.append({
                    "arr": ds.read(1), "west": ds.bounds.left,
                    "north": ds.bounds.top, "transform": ds.transform,
                    "meta": ds.meta.copy(),
                })
        norths = sorted({t["north"] for t in tiles_meta}, reverse=True)
        rows = []
        row_west = None
        row_north_top = None
        for north in norths:
            row_tiles = sorted((t for t in tiles_meta if t["north"] == north), key=lambda t: t["west"])
            rows.append(np.concatenate([t["arr"] for t in row_tiles], axis=1))
            if row_west is None:
                row_west = row_tiles[0]["west"]
                row_north_top = row_tiles[0]["north"]
        mosaic_arr = np.concatenate(rows, axis=0)
        ref_transform = tiles_meta[0]["transform"]
        mosaic_transform = rasterio.transform.from_origin(
            row_west, row_north_top, ref_transform.a, -ref_transform.e,
        )
        meta = tiles_meta[0]["meta"]
        meta.update({
            "height": mosaic_arr.shape[0], "width": mosaic_arr.shape[1],
            "transform": mosaic_transform, "count": 1,
        })
        with rasterio.open(mosaic_path, "w", **meta) as dst:
            dst.write(mosaic_arr, 1)
        print(f"  DEM-mastermosaik skriven (manuell sammanfogning): {mosaic_path}")

    dst_crs = f"EPSG:{utm_epsg}"
    with rasterio.open(mosaic_path) as src:
        # Grov uppskattning av UTM-utbredning via kallans horn, snappas
        # sedan utat till 30 m-natet fran (0,0) - exakt grans spelar ingen
        # roll har, bara att den TACKER hela mosaiken med marginal.
        from rasterio.warp import transform as warp_transform
        lons = [src.bounds.left, src.bounds.right, src.bounds.left, src.bounds.right]
        lats = [src.bounds.bottom, src.bounds.bottom, src.bounds.top, src.bounds.top]
        xs, ys = warp_transform(src.crs, dst_crs, lons, lats)
        west = _snap_to_zero_lattice(min(xs) - 1000, "down")
        east = _snap_to_zero_lattice(max(xs) + 1000, "up")
        south = _snap_to_zero_lattice(min(ys) - 1000, "down")
        north = _snap_to_zero_lattice(max(ys) + 1000, "up")
        width = round((east - west) / GRID_STEP_M)
        height = round((north - south) / GRID_STEP_M)
        dst_transform = rasterio.transform.from_origin(west, north, GRID_STEP_M, GRID_STEP_M)
        print(f"  Masterraster UTM{utm_epsg}: W{west:.0f} S{south:.0f} E{east:.0f} N{north:.0f} "
              f"({width}x{height} px, exakt {GRID_STEP_M} m, rutnat last mot (0,0))")
        meta = src.meta.copy()
        meta.update({
            "crs": dst_crs, "transform": dst_transform,
            "width": width, "height": height, "nodata": -32768.0,
        })
        with rasterio.open(master_path, "w", **meta) as dst:
            # Samma omsamplingsmetod som tidigare (bilinjar).
            reproject(
                source=rasterio.band(src, 1),
                destination=rasterio.band(dst, 1),
                src_transform=src.transform, src_crs=src.crs,
                dst_transform=dst_transform, dst_crs=dst_crs,
                resampling=Resampling.bilinear,
                src_nodata=src.nodata, dst_nodata=-32768.0,
            )
    print(f"  Masterraster klar: {master_path}")
    return master_path


def build_utm_buffer_dem(cfg: ResortConfig) -> str:
    """Klipper ut ortens buffert ur masterrastret - ren fonster-lasning
    (numpy-slice), ingen omprojicering. Returnerar sokvag till den skrivna
    UTM-GeoTIFF:en (samma kontrakt/filnamn som tidigare)."""
    master_path = build_utm_master_raster(cfg.utm_epsg)
    os.makedirs(cfg.work_dir, exist_ok=True)
    utm_path = f"{cfg.work_dir}/dem_buffer_utm{cfg.utm_epsg}.tif"
    if os.path.exists(utm_path):
        return utm_path

    west, south, east, north = utm_bbox_for_buffer(cfg)
    # Snappa buffertfonstret utat till masterrastrets rutnat (last mot
    # (0,0)) sa fonstret hamnar pa exakta pixelgranser och tacker minst den
    # begarda bufferten.
    west_s = _snap_to_zero_lattice(west, "down")
    east_s = _snap_to_zero_lattice(east, "up")
    south_s = _snap_to_zero_lattice(south, "down")
    north_s = _snap_to_zero_lattice(north, "up")

    with rasterio.open(master_path) as src:
        # rasterio.windows.from_bounds()/.transform() kraschar tyst (exit
        # 127, ingen traceback) i den har miljon - samma kanda BLAS/LAPACK-
        # relaterade krasch som np.matmul/np.dot/np.linalg.pinv (se
        # konversationen). Bygger fonstret for hand med Affine-inversion
        # istallet (ren Python-aritmetik, kraschar inte).
        inv = ~src.transform
        col0, row0 = inv * (west_s, north_s)
        col1, row1 = inv * (east_s, south_s)
        col0, row0, col1, row1 = round(col0), round(row0), round(col1), round(row1)
        window = rasterio.windows.Window(col0, row0, col1 - col0, row1 - row0)
        arr = src.read(1, window=window)
        win_transform = rasterio.transform.from_origin(west_s, north_s, GRID_STEP_M, GRID_STEP_M)
        meta = src.meta.copy()
        meta.update({
            "height": arr.shape[0], "width": arr.shape[1], "transform": win_transform,
        })
        with rasterio.open(utm_path, "w", **meta) as dst:
            dst.write(arr, 1)
    print(f"  DEM-buffert klippt ur masterraster (ingen omprojicering): {utm_path}")
    return utm_path


def compute_horizon_bins(cfg: ResortConfig):
    """Kor WhiteboxTools HorizonAngle for alla 30 bins pa UTM-bufferten."""
    import whitebox
    utm_dem = build_utm_buffer_dem(cfg)
    os.makedirs(cfg.horizon_raw_dir, exist_ok=True)
    wbt = whitebox.WhiteboxTools()
    wbt.set_working_dir(cfg.horizon_raw_dir)
    wbt.verbose = False
    for az in BINS:
        out_name = f"horizon_az{az}.tif"
        out_path = f"{cfg.horizon_raw_dir}/{out_name}"
        if os.path.exists(out_path):
            continue
        print(f"  HorizonAngle az={az}...")
        ret = wbt.horizon_angle(dem=utm_dem, output=out_name, azimuth=float(az),
                                 max_dist=HORIZON_MAX_DIST_M)
        if ret != 0:
            raise RuntimeError(f"whitebox horizon_angle misslyckades for az={az} (kod {ret})")
    print(f"  30 horisontbins klara i {cfg.horizon_raw_dir}")


# --------------------------------------------------------------------------
# Karnalgoritm - OFORANDRAD logik fran den atterfunna build_time_distance.py,
# bara raster-I/O bytt fran osgeo.gdal till rasterio (se smoke-test i
# scratchpad, pixel-for-pixel identiskt).
# --------------------------------------------------------------------------
def warp_bin_to_core(cfg: ResortConfig, azimuth: int) -> np.ndarray:
    src_path = f"{cfg.horizon_raw_dir}/horizon_az{azimuth}.tif"
    with rasterio.open(src_path) as src:
        src_arr = src.read(1)
        src_transform = src.transform
        src_crs = src.crs

    dst_transform, width, height = _core_3857_grid(cfg)
    dst_arr = np.full((height, width), -32768.0, dtype=np.float32)
    reproject(
        source=src_arr,
        destination=dst_arr,
        src_transform=src_transform,
        src_crs=src_crs,
        dst_transform=dst_transform,
        dst_crs="EPSG:3857",
        resampling=Resampling.bilinear,
        src_nodata=-32768.0,
        dst_nodata=-32768.0,
    )
    return dst_arr


_CORE_GRID_CACHE = {}


def _core_3857_grid(cfg: ResortConfig):
    """Malgrid (transform, width, height) i EPSG:3857 for CORE-bboxen, med
    fast 30 m pixelstorlek (Copernicus GLO-30 nativ upplosning) - matchar
    hur bredd/hojd bestamdes i originalets gdal.Warp-anrop (dar de foljde av
    outputBounds + kallans upplosning)."""
    if cfg.resort_id in _CORE_GRID_CACHE:
        return _CORE_GRID_CACHE[cfg.resort_id]
    from rasterio.warp import transform as warp_transform, calculate_default_transform as cdt
    dst_transform, width, height = cdt(
        "EPSG:4326", "EPSG:3857",
        # Bredd/hojd i kallpixlar spelar ingen roll har - vi later
        # calculate_default_transform valja upplosning baserat pa bboxen och
        # en rimlig kallupplosning (~30 m/pixel som DEM-kallan).
        width=int((cfg.core_east - cfg.core_west) / (30.0 / 111320)),
        height=int((cfg.core_north - cfg.core_south) / (30.0 / 111320)),
        left=cfg.core_west, bottom=cfg.core_south, right=cfg.core_east, top=cfg.core_north,
    )
    _CORE_GRID_CACHE[cfg.resort_id] = (dst_transform, width, height)
    return dst_transform, width, height


def load_horizon_stack(cfg: ResortConfig):
    arrays = [warp_bin_to_core(cfg, az) for az in BINS]
    stack = np.stack(arrays, axis=0)
    dst_transform, width, height = _core_3857_grid(cfg)
    return stack, (dst_transform, width, height)


def interpolate_horizon(stack: np.ndarray, azimuth_deg: float) -> np.ndarray:
    step = 12
    az = azimuth_deg % 360
    lower_idx = int(az // step)
    upper_idx = (lower_idx + 1) % len(BINS)
    frac = (az - lower_idx * step) / step
    return stack[lower_idx] * (1 - frac) + stack[upper_idx] * frac


def sweep_lit_stack(cfg: ResortConfig, stack: np.ndarray, year: int, month: int, day: int):
    """Kor hela finmaskiga svepet EN gang och returnerar (lit_bool (T,H,W), minute_of_each_step)."""
    minutes = list(range(SWEEP_START_MIN, SWEEP_END_MIN + 1, SWEEP_STEP_MIN))
    h, w = stack.shape[1], stack.shape[2]
    lit = np.zeros((len(minutes), h, w), dtype=bool)
    for i, minute in enumerate(minutes):
        hour, minute_of_hour = divmod(minute, 60)
        ms = local_datetime_ms(year, month, day, hour, minute_of_hour)
        az, alt = get_position(ms, cfg.lat, cfg.lng)
        horizon_here = interpolate_horizon(stack, az)
        lit[i] = alt > horizon_here
    return lit, np.array(minutes)


def signed_time_to_transition(lit: np.ndarray, minutes: np.ndarray, ref_minute: int) -> np.ndarray:
    """For en referensminut: negativt = fick sol for X min sedan, positivt = far
    sol om X min, NEVER_SENTINEL = ingen kommande overgang i svepet. (Ej
    anvand av den binara produktionsfargsattningen nedan, men behallen fran
    originalet for eventuell framtida gradient-variant/felsokning.)"""
    ref_idx = int(np.argmin(np.abs(minutes - ref_minute)))
    became_lit = lit & ~np.concatenate([lit[:1], lit[:-1]], axis=0)

    currently_lit = lit[ref_idx]

    past_mask = became_lit[: ref_idx + 1]
    past_minutes = np.where(past_mask, minutes[: ref_idx + 1, None, None], -1)
    last_transition = past_minutes.max(axis=0)
    since = ref_minute - last_transition
    since = np.where(last_transition < 0, ref_minute - SWEEP_START_MIN, since)

    future_mask = became_lit[ref_idx + 1:]
    future_minutes = np.where(future_mask, minutes[ref_idx + 1:, None, None], 10**9)
    next_transition = future_minutes.min(axis=0)
    until = next_transition - ref_minute
    never_upcoming = next_transition >= 10**9

    result = np.where(currently_lit, -since.astype(np.float32), until.astype(np.float32))
    result = np.where(~currently_lit & never_upcoming, NEVER_SENTINEL, result)
    return result


def colorize_binary(currently_lit: np.ndarray, never_lit_today: np.ndarray) -> np.ndarray:
    """Binar produktionsfargsattning - fran build_binary_tiles_local.py."""
    h, w = currently_lit.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, :3] = SHADOW_COLOR
    rgba[currently_lit, :3] = SUN_COLOR
    rgba[never_lit_today, :3] = NEVER_COLOR
    rgba[:, :, 3] = ALPHA
    return rgba


# --------------------------------------------------------------------------
# Kaklning z8-13 - identisk med den redan verifierade branthets-kaklaren
# (.../eae1029a-.../scratchpad/slope_tile_la_rosiere.py), bara parametrerad
# per ort/bbox istallet for hardkodad HALF_LON/HALF_LAT, och med RESORT-CORE-
# bboxen (bredare, for sol/skugga) istallet for branthetens snavare klipp.
# --------------------------------------------------------------------------
def merc_fwd(lon, lat):
    x = math.radians(lon) * R
    y = R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    return x, y


def tile_bounds_3857(z, x, y):
    n = 2 ** z
    tile_size = (2 * ORIGIN) / n
    x_min = -ORIGIN + x * tile_size
    x_max = x_min + tile_size
    y_max = ORIGIN - y * tile_size
    y_min = y_max - tile_size
    return x_min, y_min, x_max, y_max


def deg2tilexy(z, lon, lat):
    x, y = merc_fwd(lon, lat)
    n = 2 ** z
    tile_size = (2 * ORIGIN) / n
    tx = int((x + ORIGIN) / tile_size)
    ty = int((ORIGIN - y) / tile_size)
    return tx, ty


def tile_rgba(cfg: ResortConfig, rgba: np.ndarray, out_dir: str):
    """rgba: (H,W,4) uint8 i EPSG:3857 over cfg CORE-bboxen. Skriver z8-13
    XYZ-tiles under out_dir/<z>/<x>/<y>.png."""
    src_h, src_w = rgba.shape[:2]
    lon_min, lon_max = cfg.core_west, cfg.core_east
    lat_min, lat_max = cfg.core_south, cfg.core_north
    src_x_min, src_y_min = merc_fwd(lon_min, lat_min)
    src_x_max, src_y_max = merc_fwd(lon_max, lat_max)

    Z_NATIVE = 13
    x0, y0 = deg2tilexy(Z_NATIVE, lon_min, lat_max)
    x1, y1 = deg2tilexy(Z_NATIVE, lon_max, lat_min)

    os.makedirs(f"{out_dir}/{Z_NATIVE}", exist_ok=True)
    z13_tiles = {}
    for tx in range(x0, x1 + 1):
        for ty in range(y0, y1 + 1):
            txmin, tymin, txmax, tymax = tile_bounds_3857(Z_NATIVE, tx, ty)
            px_x = txmin + (np.arange(TILE) + 0.5) * (txmax - txmin) / TILE
            px_y = tymax - (np.arange(TILE) + 0.5) * (tymax - tymin) / TILE
            gx, gy = np.meshgrid(px_x, px_y)
            src_col = ((gx - src_x_min) / (src_x_max - src_x_min) * src_w).astype(np.int64)
            src_row = ((src_y_max - gy) / (src_y_max - src_y_min) * src_h).astype(np.int64)
            valid = (src_col >= 0) & (src_col < src_w) & (src_row >= 0) & (src_row < src_h)
            if not valid.any():
                continue
            tile_img = np.zeros((TILE, TILE, 4), dtype=np.uint8)
            tile_img[valid] = rgba[src_row[valid], src_col[valid]]
            z13_tiles[(tx, ty)] = tile_img
            d = f"{out_dir}/{Z_NATIVE}/{tx}"
            os.makedirs(d, exist_ok=True)
            Image.fromarray(tile_img, "RGBA").save(f"{d}/{ty}.png")

    prev = z13_tiles
    for z in range(Z_NATIVE - 1, 7, -1):
        cur = {}
        parents = set((tx // 2, ty // 2) for (tx, ty) in prev.keys())
        os.makedirs(f"{out_dir}/{z}", exist_ok=True)
        for (px, py) in parents:
            quad = np.zeros((TILE * 2, TILE * 2, 4), dtype=np.float64)
            have_any = False
            for dx in (0, 1):
                for dy in (0, 1):
                    child = prev.get((px * 2 + dx, py * 2 + dy))
                    if child is not None:
                        quad[dy * TILE:(dy + 1) * TILE, dx * TILE:(dx + 1) * TILE] = child
                        have_any = True
            if not have_any:
                continue
            # Alpha-viktat medelvärde för RGB, separat medelvärde för alpha.
            # Ett rent 4-kanals-medelvärde blandar in transparenta (0,0,0,0)-
            # pixlar utanför täckningsytan och ger mörk RGB på kantpixlar
            # (t.ex. färg/4 vid alpha 41). Viktningen ger kantpixlar rätt
            # färg med lägre alpha. Inre pixlar (lika alpha) är oförändrade.
            blocks = quad.reshape(TILE, 2, TILE, 2, 4)
            alpha_blocks = blocks[..., 3]
            alpha_sum = alpha_blocks.sum(axis=(1, 3))
            rgb_weighted = (blocks[..., :3] * alpha_blocks[..., None]).sum(axis=(1, 3))
            rgb_avg = np.divide(
                rgb_weighted, alpha_sum[..., None],
                out=np.zeros_like(rgb_weighted), where=alpha_sum[..., None] > 0,
            )
            tile_img = np.empty((TILE, TILE, 4), dtype=np.uint8)
            tile_img[..., :3] = rgb_avg.astype(np.uint8)
            tile_img[..., 3] = alpha_blocks.mean(axis=(1, 3)).astype(np.uint8)
            cur[(px, py)] = tile_img
            d = f"{out_dir}/{z}/{px}"
            os.makedirs(d, exist_ok=True)
            Image.fromarray(tile_img, "RGBA").save(f"{d}/{py}.png")
        prev = cur
    return len(z13_tiles)


# --------------------------------------------------------------------------
# Huvudflode
# --------------------------------------------------------------------------
def run_resort(resort_id: str, dates=None, hours=None, tile: bool = True):
    cfg = RESORTS[resort_id]
    print_bbox_confirmation(cfg)
    os.makedirs(cfg.work_dir, exist_ok=True)
    out_dir = f"{cfg.work_dir}/out"
    tiles_dir = f"{cfg.work_dir}/tiles"
    os.makedirs(out_dir, exist_ok=True)

    if cfg.generate_horizon:
        print("Genererar horisontbins (DEM-nedladdning + WhiteboxTools)...")
        compute_horizon_bins(cfg)

    print("Laser in 30-binsen horisontdata (rasterio, EPSG:3857-karna)...")
    stack, _grid = load_horizon_stack(cfg)
    print("Pixelgrid:", stack.shape)

    run_dates = dates or DATES
    run_hours = hours or REFERENCE_HOURS

    for year, month, day in run_dates:
        label = f"{year:04d}-{month:02d}-{day:02d}"
        print(f"Sveper {label}...")
        lit, minutes = sweep_lit_stack(cfg, stack, year, month, day)
        never_lit_today = ~lit.any(axis=0)
        for hour in run_hours:
            ref_minute = hour * 60
            ref_idx = int(np.argmin(np.abs(minutes - ref_minute)))
            currently_lit = lit[ref_idx]
            rgba = colorize_binary(currently_lit, never_lit_today)
            out_path = f"{out_dir}/td_{label}_{hour:02d}.png"
            Image.fromarray(rgba, "RGBA").save(out_path)
            if tile:
                hh_dir = f"{tiles_dir}/{label}/{hour:02d}"
                n = tile_rgba(cfg, rgba, hh_dir)
                print(f"  {label} {hour:02d}:00 -> {n} z13-tiles i {hh_dir}")
            else:
                print(f"  {label} {hour:02d}:00 -> {out_path}")
        print(f"  {label}: {len(run_hours)} referenstimmar klara")

    return out_dir, tiles_dir


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--resort", required=True, choices=list(RESORTS.keys()))
    parser.add_argument("--dates", nargs="*", help="YYYY-MM-DD, standard = alla 6")
    parser.add_argument("--hours", nargs="*", type=int, help="06-18, standard = alla 13")
    parser.add_argument("--no-tile", action="store_true")
    args = parser.parse_args()

    dates = None
    if args.dates:
        dates = [tuple(int(x) for x in d.split("-")) for d in args.dates]
    run_resort(args.resort, dates=dates, hours=args.hours, tile=not args.no_tile)
