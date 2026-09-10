"""Bygger RIKTIGA z8-13-tiles for en vald stegad flernyans-variant (se
preview_stepped.py for jamforelsen av A/B/C/D) och serverar dem lokalt for
ett visuellt 3D-test i appen - samma monster som build_binary_tiles_local.py.

Standard: variant B (3 nyanser/sida, 65% opacitet). Byt VARIANT_KEY for att
testa en annan.

Bygger BARA 2025-12-15 (06-18, 13 kartor) - inte alla 6 produktionsdatum -
eftersom detta ar ett temporart visuellt test. Andrar INGET i produktionens
out/tiles/alpha_tiles (egna out_stepped/split_stepped/tiles_stepped/
alpha_tiles_stepped-mappar). Laddar INGET upp till R2.
"""
import os
import sys
import glob
import subprocess
import time
import numpy as np
from osgeo import gdal

sys.path.insert(0, "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/first-sun")
from build_time_distance import load_horizon_stack, sweep_lit_stack, signed_time_to_transition, NEVER_SENTINEL  # noqa: E402

gdal.UseExceptions()

BASE = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance"
OUT_DIR = f"{BASE}/out_stepped"
SPLIT_DIR = f"{BASE}/split_stepped"
TILES_DIR = f"{BASE}/tiles_stepped"
ALPHA_TILES_DIR = f"{BASE}/alpha_tiles_stepped"

GEO = "C:/Users/User1/miniforge3/envs/geo"
GDAL2TILES = f"{GEO}/Scripts/gdal2tiles.py"
GEO_PYTHON = f"{GEO}/python.exe"

NEVER_COLOR = (8, 14, 40)

# Samma varianter som preview_stepped.py - halls i synk manuellt (kort lista,
# inte vart att bryta ut till en delad modul for tva forhandsgranskningsskript).
VARIANTS = {
    "A": {"opacity": 0.65, "edges": [90],
          "sun": [(253, 224, 71), (234, 88, 12)],
          "shadow": [(147, 197, 253), (29, 78, 216)]},
    "B": {"opacity": 0.65, "edges": [60, 180],
          "sun": [(253, 224, 71), (245, 158, 11), (194, 65, 12)],
          "shadow": [(147, 197, 253), (59, 130, 246), (30, 58, 138)]},
    "C": {"opacity": 0.55, "edges": [60, 180],
          "sun": [(250, 204, 21), (249, 115, 22), (234, 88, 12)],
          "shadow": [(96, 165, 250), (59, 130, 246), (29, 78, 216)]},
    "D": {"opacity": 0.45, "edges": [60, 180],
          "sun": [(250, 204, 21), (249, 115, 22), (234, 88, 12)],
          "shadow": [(96, 165, 250), (59, 130, 246), (29, 78, 216)]},
}
VARIANT_KEY = sys.argv[1] if len(sys.argv) > 1 else "B"
VARIANT = VARIANTS[VARIANT_KEY]
ALPHA_VALUE = round(VARIANT["opacity"] * 255)

DATE_ID = "2025-12-15"
YEAR, MONTH, DAY = 2025, 12, 15
HOURS = list(range(6, 19))


def colorize_stepped_rgba(signed_minutes: np.ndarray) -> np.ndarray:
    h, w = signed_minutes.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    never_mask = signed_minutes >= NEVER_SENTINEL - 1
    lit_mask = (signed_minutes < 0) & ~never_mask
    wait_mask = (signed_minutes >= 0) & ~never_mask

    magnitude = np.abs(signed_minutes)
    bin_idx = np.digitize(magnitude, VARIANT["edges"])

    sun_arr = np.array(VARIANT["sun"], dtype=np.uint8)
    shadow_arr = np.array(VARIANT["shadow"], dtype=np.uint8)
    for ch in range(3):
        rgba[:, :, ch] = np.where(
            lit_mask, sun_arr[bin_idx, ch], np.where(wait_mask, shadow_arr[bin_idx, ch], 0)
        )
    rgba[never_mask, 0:3] = NEVER_COLOR
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
    print(f"Variant {VARIANT_KEY}: {len(VARIANT['sun'])} nyanser/sida, {int(VARIANT['opacity']*100)}% opacitet")
    print("Laser horisontstack...")
    stack, (geotransform, projection) = load_horizon_stack()
    print("Pixelgrid:", stack.shape)

    print(f"Sveper {DATE_ID}...")
    lit, minutes = sweep_lit_stack(stack, YEAR, MONTH, DAY)

    for hour in HOURS:
        signed = signed_time_to_transition(lit, minutes, hour * 60)
        rgba = colorize_stepped_rgba(signed)
        out_path = f"{OUT_DIR}/td_{DATE_ID}_{hour:02d}.png"
        write_png_rgba(rgba, geotransform, projection, out_path)
    print(f"  {DATE_ID}: {len(HOURS)} referenstimmar klara")


def split_rgb_alpha():
    os.makedirs(f"{SPLIT_DIR}/rgb", exist_ok=True)
    os.makedirs(f"{SPLIT_DIR}/alpha", exist_ok=True)
    files = glob.glob(f"{OUT_DIR}/td_*.png")
    print(f"Delar upp {len(files)} RGBA-kallor i RGB + alfa...")
    for src_path in files:
        name = os.path.splitext(os.path.basename(src_path))[0]
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


if __name__ == "__main__":
    main()
