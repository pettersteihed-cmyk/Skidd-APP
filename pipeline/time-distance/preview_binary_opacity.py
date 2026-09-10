"""Opacitetsjamforelse for det binara alternativet (preview_binary.py).
Samma tva platta toner (sol/skugga/aldrig) och samma skarpa grans som forut,
men nu blandade mot hillshade vid tre opacitetsniva - sa bergsformen skymtar
igenom utan att gransen mellan sol och skugga blir en gradient. En referens-
tidpunkt (15 dec 09:00, har god spridning over alla tre tillstand) racker for
att valja niva.
"""
import os
import sys
import base64
import json
import numpy as np
from osgeo import gdal

sys.path.insert(0, "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/first-sun")
from build_time_distance import (  # noqa: E402
    load_horizon_stack, sweep_lit_stack, CORE_WEST, CORE_EAST, CORE_NORTH, CORE_SOUTH,
)

gdal.UseExceptions()
BASE = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance"
OUT_DIR = f"{BASE}/preview_binary_opacity"
B64_DIR = f"{OUT_DIR}/b64"

SUN_COLOR = (253, 184, 19)
SHADOW_COLOR = (37, 99, 235)
NEVER_COLOR = (8, 14, 40)

REF_YEAR, REF_MONTH, REF_DAY, REF_HOUR = 2025, 12, 15, 9
OPACITIES = [1.00, 0.80, 0.65]  # referens (fullt platt), foreslagen niva, langre ner


def flat_rgb(currently_lit: np.ndarray, never_lit_today: np.ndarray) -> np.ndarray:
    h, w = currently_lit.shape
    rgb = np.empty((h, w, 3), dtype=np.float32)
    rgb[:] = SHADOW_COLOR
    rgb[currently_lit] = SUN_COLOR
    rgb[never_lit_today] = NEVER_COLOR
    return rgb


def load_hillshade_core(geotransform, w, h):
    gdal.Warp(
        f"{BASE}/hillshade_core.tif", f"{BASE}/hillshade_utm31n.tif",
        dstSRS="EPSG:3857",
        outputBounds=(CORE_WEST, CORE_SOUTH, CORE_EAST, CORE_NORTH),
        outputBoundsSRS="EPSG:4326",
        width=w, height=h, resampleAlg="bilinear", format="GTiff",
    )
    ds = gdal.Open(f"{BASE}/hillshade_core.tif")
    arr = ds.GetRasterBand(1).ReadAsArray().astype(np.float32)
    ds = None
    return arr


def composite(flat_color: np.ndarray, hillshade: np.ndarray, opacity: float) -> np.ndarray:
    hs_rgb = np.repeat(hillshade[:, :, None], 3, axis=2)
    out = flat_color * opacity + hs_rgb * (1 - opacity)
    return np.clip(out, 0, 255).astype(np.uint8)


def write_png(rgb: np.ndarray, geotransform, projection, path: str):
    h, w, _ = rgb.shape
    mem_ds = gdal.GetDriverByName("MEM").Create("", w, h, 3, gdal.GDT_Byte)
    mem_ds.SetGeoTransform(geotransform)
    mem_ds.SetProjection(projection)
    for ch in range(3):
        mem_ds.GetRasterBand(ch + 1).WriteArray(rgb[:, :, ch])
    gdal.GetDriverByName("PNG").CreateCopy(path, mem_ds)
    mem_ds = None


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(B64_DIR, exist_ok=True)
    print("Laser horisontstack + hillshade...")
    stack, (geotransform, projection) = load_horizon_stack()
    h, w = stack.shape[1], stack.shape[2]
    hillshade = load_hillshade_core(geotransform, w, h)

    print(f"Sveper {REF_YEAR:04d}-{REF_MONTH:02d}-{REF_DAY:02d}...")
    lit, minutes = sweep_lit_stack(stack, REF_YEAR, REF_MONTH, REF_DAY)
    ref_minute = REF_HOUR * 60
    ref_idx = int(np.argmin(np.abs(minutes - ref_minute)))
    currently_lit = lit[ref_idx]
    never_lit_today = ~lit.any(axis=0)
    flat = flat_rgb(currently_lit, never_lit_today)

    for opacity in OPACITIES:
        rgb = composite(flat, hillshade, opacity)
        key = f"op{int(round(opacity * 100))}"
        png_path = f"{OUT_DIR}/{key}.png"
        write_png(rgb, geotransform, projection, png_path)
        with open(png_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        with open(f"{B64_DIR}/{key}.b64", "w", encoding="ascii") as f:
            f.write(b64)
        print(f"  {key}: klar")

    print("Klart:", OUT_DIR)


if __name__ == "__main__":
    main()
