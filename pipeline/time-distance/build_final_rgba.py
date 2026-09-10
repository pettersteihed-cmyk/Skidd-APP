"""Slutgiltig (godkand) version: bygger alla 6 datum x 13 timmar med det
binara sol/skugga-alternativet - platta farger, ingen gradient, ingen
distansberoende nyans:
  - i sol just nu             -> en varm ton (gul/orange)
  - i skugga, far sol senare samma dag -> en kall ton (bla)
  - aldrig sol nagon gang under dagen (06-19-svepet) -> egen, morkare ton
Alla tre vid 65% opacitet (RGBA alpha=166) sa att terrangen (hillshade/
terrain-RGB i sjalva kartan) skymtar igenom utan att gransen blir en
gradient - se preview_binary_opacity.py for opacitetsjamforelsen som ledde
hit och preview_binary.py for enstaka-tidpunkt-forhandsgranskningen.
Skriver over de befintliga PNG:erna i out/ (som den lokala testservern
redan pekar mot via tiles/), sa nasta gdal2tiles-korning (tile_all.py)
ersatter de gamla tiles.
"""
import sys
import os
import numpy as np
from osgeo import gdal

sys.path.insert(0, "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/first-sun")
from build_time_distance import (  # noqa: E402
    load_horizon_stack, sweep_lit_stack, DATES, REFERENCE_HOURS,
)

gdal.UseExceptions()

OUT_DIR = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance/out"

# Godkand binar fargformel - MASTE matcha TIME_DISTANCE_LEGEND i MapView.tsx.
SUN_COLOR = (253, 184, 19)     # varm, matt gul/orange - i sol nu
SHADOW_COLOR = (37, 99, 235)   # kall, matt bla - i skugga nu, far sol senare samma dag
NEVER_COLOR = (8, 14, 40)      # egen, mycket morkare ton - aldrig sol denna dag
OPACITY = 0.65
ALPHA_VALUE = round(OPACITY * 255)  # 166


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


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Laser horisontstack...")
    stack, (geotransform, projection) = load_horizon_stack()
    print("Pixelgrid:", stack.shape)

    for year, month, day in DATES:
        label = f"{year:04d}-{month:02d}-{day:02d}"
        print(f"Sveper {label}...")
        lit, minutes = sweep_lit_stack(stack, year, month, day)
        never_lit_today = ~lit.any(axis=0)
        for hour in REFERENCE_HOURS:
            ref_minute = hour * 60
            ref_idx = int(np.argmin(np.abs(minutes - ref_minute)))
            currently_lit = lit[ref_idx]
            rgba = colorize_binary(currently_lit, never_lit_today)
            out_path = f"{OUT_DIR}/td_{label}_{hour:02d}.png"
            write_png_rgba(rgba, geotransform, projection, out_path)
        print(f"  {label}: {len(REFERENCE_HOURS)} referenstimmar (binar RGBA, {int(OPACITY*100)}%) klara")


if __name__ == "__main__":
    main()
