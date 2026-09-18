# -*- coding: utf-8 -*-
"""Ren Python (rasterio + numpy + scipy + PIL, ingen osgeo.gdal) branthets-
pipeline for samtliga 15 orter i resorts.ts. Portering/generalisering av den
verifierade slope_pipeline_la_rosiere.py (se konversationen 2026-09-17-18)
till en resort-parametriserad produktionsversion, med DEM-mosaik via
rasterio.warp (pixel-for-pixel verifierat identiskt mot GDAL:s gamla output,
se sol/skugga-arbetets smoke-test) istallet for den ursprungliga manuella
Mercator-matten, och med den lasta 7-bands lavinforsknings-skalan
(McCammon 2009/Perla) istallet for de gamla 5 banden.

Anvands eftersom osgeo.gdal fortfarande ar blockerat av Windows Smart App
Control pa den har maskinen (bekraftat oforandrat sedan 2026-09-17).

Kor: python build_slope_local.py [--resort <id> ...] [--no-tile]
     (utan --resort: kor alla 15)

Uppladdning till R2 gors INTE har.
"""
from __future__ import annotations

import argparse
import math
import os
import urllib.request
from dataclasses import dataclass

import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling, calculate_default_transform
from scipy.ndimage import gaussian_filter
from PIL import Image

# --------------------------------------------------------------------------
# Resorter (id, lat, lng - fran src/data/resorts.ts, verifierat 2026-09-18)
# --------------------------------------------------------------------------
@dataclass
class Resort:
    id: str
    lat: float
    lng: float


RESORTS = [
    Resort("les-3-vallees", 45.298, 6.580),
    Resort("paradiski", 45.572, 6.780),
    Resort("tignes-val-disere", 45.468, 6.905),
    Resort("portes-du-soleil", 46.192, 6.772),
    Resort("le-grand-massif", 46.006, 6.691),
    Resort("les-sybelles", 45.239, 6.269),
    Resort("alpe-dhuez", 45.092, 6.069),
    Resort("les-deux-alpes", 45.008, 6.121),
    Resort("serre-chevalier", 44.933, 6.586),
    Resort("evasion-mont-blanc", 45.857, 6.617),
    Resort("chamonix", 45.923, 6.869),
    Resort("via-lattea", 44.931, 6.722),
    Resort("espace-san-bernardo", 45.627, 6.848),
    Resort("espace-diamant", 45.759, 6.536),
    Resort("val-cenis", 45.281, 6.900),
]

HALF_LON, HALF_LAT = 0.125, 0.0725  # samma klippstorlek som verifierad La Rosiere-pilot

WORK_DIR = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/7f028cf8-1b7b-40cc-b6c2-406ca6cded93/scratchpad/slope-all-resorts"
DEM_DIR = f"{WORK_DIR}/dem"
COPERNICUS_BASE = "https://copernicus-dem-30m.s3.amazonaws.com"

# Kanda befintliga DEM-tiles pa disk fran tidigare pilotarbete - aterananvands
# istallet for att laddas ner igen.
KNOWN_DEM_TILES = {
    "N45_00_E005_00": "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/4216b33b-98a3-4d8c-af10-f0904f0d0da6/scratchpad/slope-pilot/alpe-dhuez/dem/N45_00_E005_00.tif",
    "N45_00_E006_00": "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/4216b33b-98a3-4d8c-af10-f0904f0d0da6/scratchpad/slope-pilot/alpe-dhuez/dem/N45_00_E006_00.tif",
    "N45_00_E007_00": "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/7f028cf8-1b7b-40cc-b6c2-406ca6cded93/scratchpad/time-distance-local/espace-san-bernardo/dem/N45_00_E007_00.tif",
}

# --------------------------------------------------------------------------
# LAST 7-bands lavinforskningsskala (McCammon 2009/Perla) - se konversationen
# 2026-09-18. Identisk med SLOPE_LEGEND i MapView.tsx.
# --------------------------------------------------------------------------
THRESHOLDS = [25, 30, 35, 40, 45, 50]
BAND_COLORS = [
    (0, 25, None),
    (25, 30, (255, 213, 0)),
    (30, 35, (255, 140, 0)),
    (35, 40, (227, 0, 0)),
    (40, 45, (139, 0, 0)),
    (45, 50, (106, 13, 173)),
    (50, 999, (26, 10, 46)),
]
ALPHA = 255
BLUR_SIGMA = 1.0  # oforandrat fran verifierad La Rosiere-pilot

TILE = 256
R = 6378137.0
ORIGIN = math.pi * R


def dem_tile_url(tile_id: str) -> str:
    return f"{COPERNICUS_BASE}/Copernicus_DSM_COG_10_{tile_id}_DEM/Copernicus_DSM_COG_10_{tile_id}_DEM.tif"


def required_dem_tiles(resort: Resort) -> list[str]:
    lon_min, lon_max = resort.lng - HALF_LON, resort.lng + HALF_LON
    lat_min, lat_max = resort.lat - HALF_LAT, resort.lat + HALF_LAT
    tiles = []
    lat0 = math.floor(lat_min)
    while lat0 <= math.floor(lat_max):
        lon0 = math.floor(lon_min)
        while lon0 <= math.floor(lon_max):
            tiles.append(f"N{lat0:02d}_00_E{lon0:03d}_00")
            lon0 += 1
        lat0 += 1
    return tiles


def ensure_dem_tiles(tile_ids: list[str]) -> dict[str, str]:
    os.makedirs(DEM_DIR, exist_ok=True)
    paths = {}
    for tid in tile_ids:
        if tid in KNOWN_DEM_TILES and os.path.exists(KNOWN_DEM_TILES[tid]):
            paths[tid] = KNOWN_DEM_TILES[tid]
            continue
        dst = f"{DEM_DIR}/{tid}.tif"
        if not os.path.exists(dst):
            url = dem_tile_url(tid)
            print(f"    {tid}: laddar ner fran {url} ...")
            urllib.request.urlretrieve(url, dst)
            print(f"    {tid}: klar ({os.path.getsize(dst)/1e6:.1f} MB)")
        paths[tid] = dst
    return paths


def mosaic_dem(tile_paths: list[str]):
    """Manuell mosaik (rasterio.merge.merge kraschar nativt med dessa
    Copernicus-COG:er pa den har maskinen, se sol/skugga-arbetets
    felsokning) - alla Copernicus GLO-30-tiles ar exakt 1x1 grader/3600x3600
    px pa samma raster, sa enkel rad/kolumn-sammanfogning racker."""
    if len(tile_paths) == 1:
        with rasterio.open(tile_paths[0]) as ds:
            return ds.read(1), ds.transform, ds.crs

    tiles_meta = []
    for p in tile_paths:
        with rasterio.open(p) as ds:
            tiles_meta.append({
                "arr": ds.read(1), "west": ds.bounds.left, "north": ds.bounds.top,
                "transform": ds.transform, "crs": ds.crs,
            })
    norths = sorted({t["north"] for t in tiles_meta}, reverse=True)
    rows = []
    row_west = row_north_top = None
    for north in norths:
        row_tiles = sorted((t for t in tiles_meta if t["north"] == north), key=lambda t: t["west"])
        rows.append(np.concatenate([t["arr"] for t in row_tiles], axis=1))
        if row_west is None:
            row_west, row_north_top = row_tiles[0]["west"], row_tiles[0]["north"]
    mosaic_arr = np.concatenate(rows, axis=0)
    ref = tiles_meta[0]
    mosaic_transform = rasterio.transform.from_origin(row_west, row_north_top, ref["transform"].a, -ref["transform"].e)
    return mosaic_arr, mosaic_transform, ref["crs"]


def compute_slope_deg_for_resort(resort: Resort):
    tile_ids = required_dem_tiles(resort)
    tile_paths_map = ensure_dem_tiles(tile_ids)
    tile_paths = [tile_paths_map[t] for t in tile_ids]
    dem_arr, dem_transform, dem_crs = mosaic_dem(tile_paths)

    lon_min, lon_max = resort.lng - HALF_LON, resort.lng + HALF_LON
    lat_min, lat_max = resort.lat - HALF_LAT, resort.lat + HALF_LAT

    dst_crs = "EPSG:3857"
    dst_transform, width, height = calculate_default_transform(
        dem_crs, dst_crs,
        width=int((lon_max - lon_min) / (30.0 / 111320)),
        height=int((lat_max - lat_min) / (30.0 / 111320)),
        left=lon_min, bottom=lat_min, right=lon_max, top=lat_max,
    )
    dem_3857 = np.zeros((height, width), dtype=np.float32)
    reproject(
        source=dem_arr, destination=dem_3857,
        src_transform=dem_transform, src_crs=dem_crs,
        dst_transform=dst_transform, dst_crs=dst_crs,
        resampling=Resampling.bilinear,
    )

    # Pixelstorlek i meter (approx, konstant over den har lilla bboxen)
    px_x = abs(dst_transform.a)
    px_y = abs(dst_transform.e)

    z = dem_3857
    zp = np.pad(z, 1, mode="edge")
    a, b, c = zp[:-2, :-2], zp[:-2, 1:-1], zp[:-2, 2:]
    d, f = zp[1:-1, :-2], zp[1:-1, 2:]
    g, h, i = zp[2:, :-2], zp[2:, 1:-1], zp[2:, 2:]
    dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * px_x)
    dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * px_y)
    slope_deg = np.degrees(np.arctan(np.sqrt(dzdx ** 2 + dzdy ** 2)))

    bbox = (lon_min, lat_min, lon_max, lat_max)
    return slope_deg, bbox, tile_ids


def colorize_antialiased(slope_blurred, half_width=0.5, alpha_opaque=ALPHA):
    h_, w_ = slope_blurred.shape
    rgb_f = np.zeros((h_, w_, 3), dtype=np.float32)
    alpha_f = np.zeros((h_, w_), dtype=np.float32)

    for lo, hi, color in BAND_COLORS:
        mask = (slope_blurred >= lo) & (slope_blurred < hi)
        if color is not None:
            rgb_f[mask] = color
            alpha_f[mask] = alpha_opaque

    for t in THRESHOLDS:
        lo_color = next(c for l, h, c in BAND_COLORS if h == t)
        hi_color = next(c for l, h, c in BAND_COLORS if l == t)
        near = (slope_blurred >= t - half_width) & (slope_blurred < t + half_width)
        frac = np.clip((slope_blurred[near] - (t - half_width)) / (2 * half_width), 0, 1)
        lo_rgb = np.array(lo_color if lo_color is not None else (0, 0, 0), dtype=np.float32)
        hi_rgb = np.array(hi_color if hi_color is not None else (0, 0, 0), dtype=np.float32)
        lo_a = 0.0 if lo_color is None else alpha_opaque
        hi_a = 0.0 if hi_color is None else alpha_opaque
        blended_rgb = lo_rgb[None, :] * (1 - frac[:, None]) + hi_rgb[None, :] * frac[:, None]
        blended_a = lo_a * (1 - frac) + hi_a * frac
        rgb_f[near] = blended_rgb
        alpha_f[near] = blended_a

    rgba = np.concatenate([rgb_f, alpha_f[..., None]], axis=-1)
    return np.clip(rgba, 0, 255).astype(np.uint8)


def merc_fwd(lon, lat):
    x = math.radians(lon) * R
    y = R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    return x, y


def tile_rgba(rgba: np.ndarray, bbox, out_dir: str) -> int:
    lon_min, lat_min, lon_max, lat_max = bbox
    src_h, src_w = rgba.shape[:2]
    src_x_min, src_y_min = merc_fwd(lon_min, lat_min)
    src_x_max, src_y_max = merc_fwd(lon_max, lat_max)

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
        return int((x + ORIGIN) / tile_size), int((ORIGIN - y) / tile_size)

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
            cur[(px, py)] = avg.astype(np.uint8)
            d = f"{out_dir}/{z}/{px}"
            os.makedirs(d, exist_ok=True)
            Image.fromarray(cur[(px, py)], "RGBA").save(f"{d}/{py}.png")
        prev = cur

    return len(z13_tiles)


def run_resort(resort: Resort, tile: bool = True):
    print(f"--- {resort.id} (lat={resort.lat}, lng={resort.lng}) ---")
    slope_deg, bbox, tile_ids = compute_slope_deg_for_resort(resort)
    print(f"  DEM-tiles: {tile_ids}")
    print(f"  slope_deg: {slope_deg.shape}, min={slope_deg.min():.1f} max={slope_deg.max():.1f}")

    blurred = gaussian_filter(slope_deg, sigma=BLUR_SIGMA, mode="nearest")
    rgba = colorize_antialiased(blurred)

    out_dir = f"{WORK_DIR}/tiles/{resort.id}"
    if tile:
        n = tile_rgba(rgba, bbox, out_dir)
        print(f"  {n} z13-tiles -> {out_dir}")
    else:
        n = None

    preview_path = f"{WORK_DIR}/preview_{resort.id}.png"
    os.makedirs(WORK_DIR, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(preview_path)
    print(f"  forhandsvisning: {preview_path}")

    return {"resort": resort, "slope_deg": slope_deg, "blurred": blurred, "tile_count": n, "preview": preview_path}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--resort", nargs="*", help="Kor bara dessa resort-id, annars alla 15")
    parser.add_argument("--no-tile", action="store_true")
    args = parser.parse_args()

    targets = RESORTS
    if args.resort:
        wanted = set(args.resort)
        targets = [r for r in RESORTS if r.id in wanted]

    results = []
    for resort in targets:
        results.append(run_resort(resort, tile=not args.no_tile))

    print("\n=== SAMMANFATTNING ===")
    for res in results:
        r = res["resort"]
        print(f"{r.id}: {res['tile_count']} tiles, slope max={res['slope_deg'].max():.1f}°")
