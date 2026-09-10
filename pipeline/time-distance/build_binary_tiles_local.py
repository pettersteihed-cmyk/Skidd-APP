"""Bygger RIKTIGA z8-13-tiles for det binara sol/skugga-alternativet (65%
opacitet, platta farger, ingen gradient) och serverar dem lokalt - for att
kunna kopplas in temporart i appen (MapView.tsx) och synas i 3D-laget, precis
som den tidigare lokala testkorningen (cors_server.py + tiles/-monstret).

Bygger BARA 2025-12-15 (06-18, 13 kartor) - inte alla 6 produktionsdatum -
eftersom detta ar ett temporart visuellt test, inte en produktionskorning.
Andrar INGET i produktions-out/tiles/alpha_tiles (skriver till egna
out_binary/tiles_binary/alpha_tiles_binary/split_binary-mappar). Laddar
INGET upp till R2.
"""
import os
import sys
import glob
import subprocess
import time
import numpy as np
from osgeo import gdal

sys.path.insert(0, "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/first-sun")
from build_time_distance import load_horizon_stack, sweep_lit_stack  # noqa: E402

gdal.UseExceptions()

BASE = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance"
OUT_DIR = f"{BASE}/out_binary"
SPLIT_DIR = f"{BASE}/split_binary"
TILES_DIR = f"{BASE}/tiles_binary"
ALPHA_TILES_DIR = f"{BASE}/alpha_tiles_binary"

GEO = "C:/Users/User1/miniforge3/envs/geo"
GDAL2TILES = f"{GEO}/Scripts/gdal2tiles.py"
GEO_PYTHON = f"{GEO}/python.exe"

SUN_COLOR = (253, 184, 19)
SHADOW_COLOR = (37, 99, 235)
NEVER_COLOR = (8, 14, 40)
OPACITY = 0.65
ALPHA_VALUE = round(OPACITY * 255)  # 166

DATE_ID = "2025-12-15"
YEAR, MONTH, DAY = 2025, 12, 15
HOURS = list(range(6, 19))  # 06..18, matchar TIME_DISTANCE_HOUR_MIN/MAX i appen


def colorize_binary(currently_lit: np.ndarray, never_lit_today: np.ndarray) -> np.ndarray:
    h, w = currently_lit.shape
    rgba = np.empty((h, w, 4), dtype=np.uint8)
    rgba[:, :, :3] = SHADOW_COLOR
    rgba[currently_lit, :3] = SUN_COLOR
    rgba[never_lit_today, :3] = NEVER_COLOR
    rgba[:, :, 3] = ALPHA_VALUE
    return rgba


def write_png_rgba(rgba: np.ndarray, geotransform, projection, path: str):
    h, w, _ = rgba.shape
    mem_ds = gdal.GetDriverByName("MEM").Create("", w, h, 4, gdal.GDT_Byte)
    mem_ds.SetGeoTransform(geotransform)
    mem_ds.SetProjection(projection)
    for ch in range(4):
        mem_ds.GetRasterBand(ch + 1).WriteArray(rgba[:, :, ch])
    mem_ds.GetRasterBand(4).SetColorInterpretation(gdal.GCI_AlphaBand)
    gdal.GetDriverByName("PNG").CreateCopy(path, mem_ds)
    mem_ds = None


def build_rgba():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Laser horisontstack...")
    stack, (geotransform, projection) = load_horizon_stack()
    print("Pixelgrid:", stack.shape)

    print(f"Sveper {DATE_ID}...")
    lit, minutes = sweep_lit_stack(stack, YEAR, MONTH, DAY)
    never_lit_today = ~lit.any(axis=0)

    for hour in HOURS:
        ref_minute = hour * 60
        ref_idx = int(np.argmin(np.abs(minutes - ref_minute)))
        currently_lit = lit[ref_idx]
        rgba = colorize_binary(currently_lit, never_lit_today)
        out_path = f"{OUT_DIR}/td_{DATE_ID}_{hour:02d}.png"
        write_png_rgba(rgba, geotransform, projection, out_path)
    print(f"  {DATE_ID}: {len(HOURS)} referenstimmar (RGBA, {int(OPACITY*100)}% opacitet) klara")


def split_rgb_alpha():
    os.makedirs(f"{SPLIT_DIR}/rgb", exist_ok=True)
    os.makedirs(f"{SPLIT_DIR}/alpha", exist_ok=True)
    files = glob.glob(f"{OUT_DIR}/td_*.png")
    print(f"Delar upp {len(files)} RGBA-kallor i RGB + alfa...")
    for src_path in files:
        name = os.path.splitext(os.path.basename(src_path))[0]  # td_2025-12-15_09
        ds = gdal.Open(src_path)
        gt = ds.GetGeoTransform()
        proj = ds.GetProjection()
        w, h = ds.RasterXSize, ds.RasterYSize

        rgb_path = f"{SPLIT_DIR}/rgb/{name}.tif"
        rgb_ds = gdal.GetDriverByName("GTiff").Create(rgb_path, w, h, 3, gdal.GDT_Byte)
        rgb_ds.SetGeoTransform(gt)
        rgb_ds.SetProjection(proj)
        for ch in range(3):
            rgb_ds.GetRasterBand(ch + 1).WriteArray(ds.GetRasterBand(ch + 1).ReadAsArray())
        rgb_ds = None

        alpha_path = f"{SPLIT_DIR}/alpha/{name}.tif"
        alpha_ds = gdal.GetDriverByName("GTiff").Create(alpha_path, w, h, 1, gdal.GDT_Byte)
        alpha_ds.SetGeoTransform(gt)
        alpha_ds.SetProjection(proj)
        alpha_ds.GetRasterBand(1).WriteArray(ds.GetRasterBand(4).ReadAsArray())
        alpha_ds = None
        ds = None
    print("Klart.")


def name_to_hour_dir(name: str) -> str:
    # "td_2025-12-15_09" -> "09"
    return name.rsplit("_", 1)[1]


def run_gdal2tiles(src_tif: str, dst_dir: str):
    os.makedirs(dst_dir, exist_ok=True)
    subprocess.run(
        [GEO_PYTHON, GDAL2TILES, "-z", "8-13", "--xyz", "-w", "none", src_tif, dst_dir],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
    )


def tile_all():
    rgb_files = sorted(glob.glob(f"{SPLIT_DIR}/rgb/td_*.tif"))
    print(f"Tilar {len(rgb_files)} RGB + {len(rgb_files)} alfa-rastren (z8-13, kan ta ett tag)...")
    for i, rgb_tif in enumerate(rgb_files, 1):
        name = os.path.splitext(os.path.basename(rgb_tif))[0]
        hour_dir = name_to_hour_dir(name)
        alpha_tif = f"{SPLIT_DIR}/alpha/{name}.tif"

        t0 = time.time()
        run_gdal2tiles(rgb_tif, f"{TILES_DIR}/{DATE_ID}/{hour_dir}")
        run_gdal2tiles(alpha_tif, f"{ALPHA_TILES_DIR}/{DATE_ID}/{hour_dir}")
        print(f"  [{i}/{len(rgb_files)}] {name} klar ({time.time()-t0:.1f}s)")


def merge_one(rgb_path: str, alpha_path: str) -> bool:
    rgb_ds = gdal.Open(rgb_path)
    w, h = rgb_ds.RasterXSize, rgb_ds.RasterYSize
    rgb = np.stack([rgb_ds.GetRasterBand(i + 1).ReadAsArray() for i in range(3)], axis=-1).astype(np.uint8)
    rgb_ds = None

    if not os.path.exists(alpha_path):
        return False
    alpha_ds = gdal.Open(alpha_path)
    alpha = alpha_ds.GetRasterBand(1).ReadAsArray().astype(np.uint8)
    alpha_ds = None

    mem_ds = gdal.GetDriverByName("MEM").Create("", w, h, 4, gdal.GDT_Byte)
    for ch in range(3):
        mem_ds.GetRasterBand(ch + 1).WriteArray(rgb[:, :, ch])
    mem_ds.GetRasterBand(4).WriteArray(alpha)
    mem_ds.GetRasterBand(4).SetColorInterpretation(gdal.GCI_AlphaBand)
    gdal.GetDriverByName("PNG").CreateCopy(rgb_path, mem_ds)
    mem_ds = None
    return True


def merge_all():
    rgb_files = glob.glob(f"{TILES_DIR}/**/*.png", recursive=True)
    print(f"Slar ihop {len(rgb_files)} tiles...")
    merged = missing = 0
    for rgb_path in rgb_files:
        rel = os.path.relpath(rgb_path, TILES_DIR)
        alpha_path = os.path.join(ALPHA_TILES_DIR, rel)
        if merge_one(rgb_path, alpha_path):
            merged += 1
        else:
            missing += 1
    print(f"Klart. Ihopslagna: {merged}, saknade alfamotsvarigheter: {missing}")


def main():
    build_rgba()
    split_rgb_alpha()
    tile_all()
    merge_all()
    print()
    print(f"KLART. Lokala tiles ligger i: {TILES_DIR}/{DATE_ID}/{{hh}}/{{z}}/{{x}}/{{y}}.png")
    print("Starta lokal server med: cors_server.py (peka DIRECTORY pa tiles_binary)")


if __name__ == "__main__":
    main()
