"""Forhandsgranskning: symmetrisk gradient MED varierande opacitet per stopp -
nara overgangen (gul/orange) forblir tatt, den morka/kalla anden ("aldrig"/
langt-till-sol) blir mycket genomskinlig sa terrangens form syns igenom.
Komposiiterar over en hillshade-proxy (fran samma buffrade DEM) for att visa
hur det faktiskt ser ut nar det ligger ovanpa en baskarta - INTE bara den
rena fargbilden pa vit bakgrund. Andrar inget permanent, ingen tile-ombyggnad.
"""
import sys
import numpy as np
from osgeo import gdal

sys.path.insert(0, "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/first-sun")
from build_time_distance import (  # noqa: E402
    load_horizon_stack, sweep_lit_stack, signed_time_to_transition,
    write_png, NEVER_SENTINEL, CORE_WEST, CORE_EAST, CORE_NORTH, CORE_SOUTH,
)

gdal.UseExceptions()

BASE = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance"
OUT_DIR = f"{BASE}/preview_symmetric_alpha"

# Fargen ar OFORANDRAD fran forsta symmetriska versionen (samma brytpunkter
# som forut). Alfan har EGNA, separata brytpunkter - och stannar pa 255
# (helt opak) genom hela den aktiva/mellersta delen. Bara den allra kallaste
# svansen (>~250 min) tonas ner - inte gult/orange, inte ens den mellersta
# bla overgangen.
COLOR_STOPS = [
    (0, (254, 240, 138)),
    (60, (249, 115, 22)),
    (150, (96, 141, 201)),
    # Nagot ljusare/mer matt an ursprungliga (30,58,138), men fortfarande
    # tydligt morkare/mer "djupbla" an mellanstoppets ljusare cyanbla
    # (96,141,201) - ska aldrig kunna forvaxlas med den.
    (300, (38, 71, 160)),
]
ALPHA_STOPS = [
    (0, 255),
    (250, 255),   # helt opak anda hit - gult, orange OCH hela den mellersta delen
    (300, 217),   # 85% opacitet, bara i den allra kallaste svansen
]
NEVER_COLOR = (38, 71, 160)  # samma ton som 300-stoppet - kontinuerlig fortsattning
NEVER_ALPHA = 217  # 85%, samma som kallaste punkten


def colorize_rgba(signed_minutes: np.ndarray) -> np.ndarray:
    h, w = signed_minutes.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    never_mask = signed_minutes >= NEVER_SENTINEL - 1

    distance = np.abs(signed_minutes)
    color_dist = np.array([s[0] for s in COLOR_STOPS], dtype=np.float32)
    color_rgb = np.array([s[1] for s in COLOR_STOPS], dtype=np.float32)
    alpha_dist = np.array([s[0] for s in ALPHA_STOPS], dtype=np.float32)
    alpha_vals = np.array([s[1] for s in ALPHA_STOPS], dtype=np.float32)

    clamped_color = np.clip(distance, color_dist[0], color_dist[-1])
    clamped_alpha = np.clip(distance, alpha_dist[0], alpha_dist[-1])
    for channel in range(3):
        rgba[:, :, channel] = np.interp(clamped_color, color_dist, color_rgb[:, channel]).astype(np.uint8)
    rgba[:, :, 3] = np.interp(clamped_alpha, alpha_dist, alpha_vals).astype(np.uint8)

    rgba[never_mask, 0:3] = NEVER_COLOR
    rgba[never_mask, 3] = NEVER_ALPHA
    return rgba


def load_hillshade_core(geotransform, projection, w, h) -> np.ndarray:
    gdal.Warp(
        f"{BASE}/hillshade_core.tif", f"{BASE}/hillshade_utm31n.tif",
        dstSRS="EPSG:3857",
        outputBounds=(CORE_WEST, CORE_SOUTH, CORE_EAST, CORE_NORTH),
        outputBoundsSRS="EPSG:4326",
        width=w, height=h,
        resampleAlg="bilinear",
        format="GTiff",
    )
    ds = gdal.Open(f"{BASE}/hillshade_core.tif")
    arr = ds.GetRasterBand(1).ReadAsArray().astype(np.float32)
    ds = None
    return arr


def composite_over_hillshade(rgba: np.ndarray, hillshade: np.ndarray) -> np.ndarray:
    h, w, _ = rgba.shape
    hs_rgb = np.repeat(hillshade[:, :, None], 3, axis=2)  # grascale -> "baskarta"-proxy
    alpha = (rgba[:, :, 3:4].astype(np.float32)) / 255.0
    color = rgba[:, :, 0:3].astype(np.float32)
    out = color * alpha + hs_rgb * (1 - alpha)
    return out.astype(np.uint8)


def write_png_bands(rgb: np.ndarray, geotransform, projection, path: str, bands: int):
    hh, ww = rgb.shape[0], rgb.shape[1]
    mem_ds = gdal.GetDriverByName("MEM").Create("", ww, hh, bands, gdal.GDT_Byte)
    mem_ds.SetGeoTransform(geotransform)
    mem_ds.SetProjection(projection)
    for ch in range(bands):
        mem_ds.GetRasterBand(ch + 1).WriteArray(rgb[:, :, ch])
    gdal.GetDriverByName("PNG").CreateCopy(path, mem_ds)
    mem_ds = None


def main():
    import os
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Laser horisontstack...")
    stack, (geotransform, projection) = load_horizon_stack()
    h, w = stack.shape[1], stack.shape[2]
    print("Laser hillshade-proxy...")
    hillshade = load_hillshade_core(geotransform, projection, w, h)

    targets = [
        (2025, 12, 15, 8), (2025, 12, 15, 11), (2025, 12, 15, 14), (2025, 12, 15, 17),
        (2026, 3, 15, 11),
    ]
    swept = {}
    for year, month, day, hour in targets:
        key = (year, month, day)
        if key not in swept:
            print(f"Sveper {year:04d}-{month:02d}-{day:02d}...")
            swept[key] = sweep_lit_stack(stack, year, month, day)
        lit, minutes = swept[key]
        signed = signed_time_to_transition(lit, minutes, hour * 60)
        rgba = colorize_rgba(signed)
        composited = composite_over_hillshade(rgba, hillshade)
        label = f"{year:04d}-{month:02d}-{day:02d}_{hour:02d}"
        write_png_bands(composited, geotransform, projection, f"{OUT_DIR}/comp_{label}.png", 3)
        print(f"  Skrev comp_{label}.png")


if __name__ == "__main__":
    main()
