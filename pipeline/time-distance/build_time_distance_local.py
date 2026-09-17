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
}

# Kanda befintliga DEM-tiles pa disk (fran branthets-piloten), aterananvands
# istallet for att laddas ner igen.
KNOWN_DEM_TILES = {
    "N45_00_E006_00": "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/4216b33b-98a3-4d8c-af10-f0904f0d0da6/scratchpad/slope-pilot/alpe-dhuez/dem/N45_00_E006_00.tif",
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
# Samma buffertstorlek (halva bredd/hojd i meter, UTM) som Alpe d'Huez raw
# horisontraster faktiskt tacker (uppmatt fran horizon_raw/horizon_az0.tif:
# bounds 714988-771088 x 4971194-5020424, dvs 56100 x 49230 m).
BUFFER_HALF_WIDTH_M = 56100 / 2
BUFFER_HALF_HEIGHT_M = 49230 / 2

# Max sokavstand for HorizonAngle - vald sa att den ryms gott och val inom
# bufferten (halva bredden ar ~28000 m) sa vi undviker kantartefakter dar
# sokningen skulle ga utanfor den mosaikade DEM-ytan.
HORIZON_MAX_DIST_M = 20000.0


def utm_bbox_for_buffer(cfg: ResortConfig):
    """Rortpunktens UTM-koordinat +- buffert -> (west, south, east, north) i UTM."""
    with rasterio.Env():
        # Enkel punktprojicering via rasterio.warp.transform (anvander samma
        # inbyggda GDAL/PROJ som resten av rasterio - redan verifierad).
        from rasterio.warp import transform
        xs, ys = transform("EPSG:4326", f"EPSG:{cfg.utm_epsg}", [cfg.lng], [cfg.lat])
    cx, cy = xs[0], ys[0]
    return (cx - BUFFER_HALF_WIDTH_M, cy - BUFFER_HALF_HEIGHT_M,
            cx + BUFFER_HALF_WIDTH_M, cy + BUFFER_HALF_HEIGHT_M)


def required_dem_tiles(cfg: ResortConfig) -> list:
    """Rakna ut vilka 1x1-graders Copernicus-tiles som bufferten (i EPSG:4326)
    faktiskt tacker, istallet for att anta ett hardkodat monster."""
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


def build_utm_buffer_dem(cfg: ResortConfig) -> str:
    """Mosaikar DEM-tiles och reprojicerar till UTM-bufferten. Returnerar
    sokvag till den skrivna UTM-GeoTIFF:en."""
    dem_paths = ensure_dem_tiles(cfg)
    os.makedirs(cfg.work_dir, exist_ok=True)
    mosaic_path = f"{cfg.work_dir}/dem_mosaic_4326.tif"
    utm_path = f"{cfg.work_dir}/dem_buffer_utm{cfg.utm_epsg}.tif"

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
                    "path": p, "arr": ds.read(1), "west": ds.bounds.left,
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
        print(f"  DEM-mosaik skriven (manuell sammanfogning): {mosaic_path}")

    if not os.path.exists(utm_path):
        west, south, east, north = utm_bbox_for_buffer(cfg)
        with rasterio.open(mosaic_path) as src:
            dst_crs = f"EPSG:{cfg.utm_epsg}"
            # Fast pixelstorlek 30 m (Copernicus GLO-30 nativ upplosning) i
            # malprojektionen, sa vi inte rakar uppskala/nedskala i onodan.
            width = int(round((east - west) / 30.0))
            height = int(round((north - south) / 30.0))
            dst_transform = rasterio.transform.from_bounds(west, south, east, north, width, height)
            meta = src.meta.copy()
            meta.update({
                "crs": dst_crs, "transform": dst_transform,
                "width": width, "height": height, "nodata": -32768.0,
            })
            with rasterio.open(utm_path, "w", **meta) as dst:
                reproject(
                    source=rasterio.band(src, 1),
                    destination=rasterio.band(dst, 1),
                    src_transform=src.transform, src_crs=src.crs,
                    dst_transform=dst_transform, dst_crs=dst_crs,
                    resampling=Resampling.bilinear,
                    src_nodata=src.nodata, dst_nodata=-32768.0,
                )
        print(f"  DEM-buffert reprojicerad till UTM{cfg.utm_epsg}: {utm_path}")
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
            avg = quad.reshape(TILE, 2, TILE, 2, 4).mean(axis=(1, 3))
            tile_img = avg.astype(np.uint8)
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
