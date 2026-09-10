"""Mellantinget mellan den gamla kontinuerliga gradienten och det nya platta
binara alternativet: 2-3 DISTINKTA nyanser per sida (varm/kall), tilldelade
med harda troskelsteg (np.digitize) - INGEN mjuk interpolation som i
build_time_distance.py:s ursprungliga colorize(). Gransen mellan sol och
skugga forblir skarp (samma tecken-baserade logik som preview_binary.py),
men inom respektive sida hoppar fargen i 2-3 klara steg istallet for en enda
platt ton.

4 varianter for 15 dec 09:00, jamfort sida vid sida:
  A: 2 nyanser/sida, 65% opacitet (samma opacitet som godkanda binara)
  B: 3 nyanser/sida, 65% opacitet
  C: 3 nyanser/sida, mer mattade farger, 55% opacitet
  D: samma mattade farger som C, 45% opacitet (mer terrang genomskinligt)
Bara forhandsgranskning - andrar inte build_final_rgba.py eller nagra tiles.
"""
import os
import sys
import base64
import json
import numpy as np
from osgeo import gdal

sys.path.insert(0, "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/first-sun")
from build_time_distance import (  # noqa: E402
    load_horizon_stack, sweep_lit_stack, signed_time_to_transition, NEVER_SENTINEL,
    CORE_WEST, CORE_EAST, CORE_NORTH, CORE_SOUTH,
)

gdal.UseExceptions()
BASE = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance"
OUT_DIR = f"{BASE}/preview_stepped"
B64_DIR = f"{OUT_DIR}/b64"

REF_YEAR, REF_MONTH, REF_DAY, REF_HOUR = 2025, 12, 15, 9
NEVER_COLOR = (8, 14, 40)

# (troskelkanter i minuter, [naromst-overgang ... langst-fran], farger)
VARIANTS = {
    "A": {
        "label": "2 nyanser, 65%",
        "opacity": 0.65,
        "edges": [90],
        "sun": [(253, 224, 71), (234, 88, 12)],       # gul-300 -> orange-600
        "shadow": [(147, 197, 253), (29, 78, 216)],    # bla-300 -> bla-700
    },
    "B": {
        "label": "3 nyanser, 65%",
        "opacity": 0.65,
        "edges": [60, 180],
        "sun": [(253, 224, 71), (245, 158, 11), (194, 65, 12)],       # gul-300 -> amber-500 -> orange-700
        "shadow": [(147, 197, 253), (59, 130, 246), (30, 58, 138)],   # bla-300 -> bla-500 -> bla-900
    },
    "C": {
        "label": "3 nyanser, mer mattat, 55%",
        "opacity": 0.55,
        "edges": [60, 180],
        "sun": [(250, 204, 21), (249, 115, 22), (234, 88, 12)],       # gul-400 -> orange-500 -> orange-600 (mer krom rakt igenom)
        "shadow": [(96, 165, 250), (59, 130, 246), (29, 78, 216)],    # bla-400 -> bla-500 -> bla-700 (mer krom rakt igenom)
    },
    "D": {
        "label": "3 nyanser, mer mattat, 45%",
        "opacity": 0.45,
        "edges": [60, 180],
        "sun": [(250, 204, 21), (249, 115, 22), (234, 88, 12)],
        "shadow": [(96, 165, 250), (59, 130, 246), (29, 78, 216)],
    },
}


def colorize_stepped(signed_minutes: np.ndarray, edges, sun_colors, shadow_colors) -> np.ndarray:
    h, w = signed_minutes.shape
    rgb = np.zeros((h, w, 3), dtype=np.float32)
    never_mask = signed_minutes >= NEVER_SENTINEL - 1
    lit_mask = (signed_minutes < 0) & ~never_mask
    wait_mask = (signed_minutes >= 0) & ~never_mask

    magnitude = np.abs(signed_minutes)
    bin_idx = np.digitize(magnitude, edges)  # 0..len(edges), harda steg (ingen interpolation)

    sun_arr = np.array(sun_colors, dtype=np.float32)
    shadow_arr = np.array(shadow_colors, dtype=np.float32)
    for ch in range(3):
        rgb[:, :, ch] = np.where(lit_mask, sun_arr[bin_idx, ch], np.where(wait_mask, shadow_arr[bin_idx, ch], 0))
    rgb[never_mask] = NEVER_COLOR
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
    signed = signed_time_to_transition(lit, minutes, REF_HOUR * 60)

    stats = {}
    for key, cfg in VARIANTS.items():
        flat = colorize_stepped(signed, cfg["edges"], cfg["sun"], cfg["shadow"])
        rgb = composite(flat, hillshade, cfg["opacity"])
        png_path = f"{OUT_DIR}/{key}.png"
        write_png(rgb, geotransform, projection, png_path)
        with open(png_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        with open(f"{B64_DIR}/{key}.b64", "w", encoding="ascii") as f:
            f.write(b64)
        stats[key] = cfg["label"]
        print(f"  {key} ({cfg['label']}): klar")

    with open(f"{OUT_DIR}/stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)
    print("Klart:", OUT_DIR)


if __name__ == "__main__":
    main()
