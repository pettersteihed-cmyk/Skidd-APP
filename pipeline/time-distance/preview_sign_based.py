"""Ny fargformel: TECKNET avgor fargfamilj.
- Negativt (redan lit nu)   -> VARM familj (gul->orange->nertonad brun vid klamptaket)
- Positivt (vantar pa sol)  -> KALL familj (ljusbla->bla->morkbla vid klamptaket)
- "Aldrig sol denna dag"    -> EGEN extrem kall ton, tydligt skild fran det vanliga
  bla klamptaket (annars near-identisk med "vantar lange", vilket var just bristen
  som upptacktes).
Bara forhandsgranskning - andrar inte build_final_rgba.py eller nagra tiles an.
"""
import sys
import numpy as np
from osgeo import gdal, osr, ogr

sys.path.insert(0, "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/first-sun")
from build_time_distance import (  # noqa: E402
    load_horizon_stack, sweep_lit_stack, signed_time_to_transition, NEVER_SENTINEL,
    CORE_WEST, CORE_EAST, CORE_NORTH, CORE_SOUTH,
)

gdal.UseExceptions()
BASE = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance"
OUT_DIR = f"{BASE}/preview_sign_based"

# --- Fargstopp, tecken-beroende ---
NEG_COLOR_STOPS = [  # nyckel = |signerat varde| nar signerat < 0 (redan lit)
    (0, (250, 204, 21)),     # mattad gul, hog mattnad nara noll
    (60, (234, 88, 12)),     # stark orange
    (150, (220, 38, 38)),    # mattad rod
    (300, (159, 27, 20)),    # djup, fortfarande MATTAD rost-rod vid klamptaket - inte brun
]
POS_COLOR_STOPS = [  # nyckel = signerat varde nar signerat > 0 (vantar pa sol)
    (0, (191, 219, 254)),    # blek himmelsbla
    (60, (96, 141, 201)),    # mellanbla
    (150, (56, 94, 168)),
    (300, (30, 58, 138)),    # morkbla vid klamptaket
]
NEVER_COLOR = (8, 14, 40)    # naston svart-indigo - tydligt skild fran (30,58,138)
ALPHA_STOPS = [(0, 255), (250, 255), (300, 217)]
NEVER_ALPHA = 217


def colorize_rgba(signed_minutes: np.ndarray) -> np.ndarray:
    h, w = signed_minutes.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    never_mask = signed_minutes >= NEVER_SENTINEL - 1
    neg_mask = (signed_minutes < 0) & ~never_mask
    pos_mask = (signed_minutes >= 0) & ~never_mask

    neg_stops_d = np.array([s[0] for s in NEG_COLOR_STOPS], dtype=np.float32)
    neg_stops_rgb = np.array([s[1] for s in NEG_COLOR_STOPS], dtype=np.float32)
    pos_stops_d = np.array([s[0] for s in POS_COLOR_STOPS], dtype=np.float32)
    pos_stops_rgb = np.array([s[1] for s in POS_COLOR_STOPS], dtype=np.float32)
    alpha_d = np.array([s[0] for s in ALPHA_STOPS], dtype=np.float32)
    alpha_v = np.array([s[1] for s in ALPHA_STOPS], dtype=np.float32)

    neg_dist = np.clip(np.abs(signed_minutes), neg_stops_d[0], neg_stops_d[-1])
    pos_dist = np.clip(signed_minutes, pos_stops_d[0], pos_stops_d[-1])
    alpha_dist = np.clip(np.abs(signed_minutes), alpha_d[0], alpha_d[-1])

    for ch in range(3):
        neg_col = np.interp(neg_dist, neg_stops_d, neg_stops_rgb[:, ch])
        pos_col = np.interp(pos_dist, pos_stops_d, pos_stops_rgb[:, ch])
        rgba[:, :, ch] = np.where(neg_mask, neg_col, np.where(pos_mask, pos_col, 0)).astype(np.uint8)
    rgba[:, :, 3] = np.interp(alpha_dist, alpha_d, alpha_v).astype(np.uint8)

    rgba[never_mask, 0:3] = NEVER_COLOR
    rgba[never_mask, 3] = NEVER_ALPHA
    return rgba


def lonlat_to_pixel(lon, lat, geotransform):
    src = osr.SpatialReference(); src.ImportFromEPSG(4326)
    dst = osr.SpatialReference(); dst.ImportFromEPSG(3857)
    src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    t = osr.CoordinateTransformation(src, dst)
    p = ogr.Geometry(ogr.wkbPoint); p.AddPoint(lon, lat); p.Transform(t)
    mx, my = p.GetX(), p.GetY()
    ox, px_w, _, oy, _, px_h = geotransform
    return int((mx - ox) / px_w), int((my - oy) / px_h)


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


def composite_over_hillshade(rgba, hillshade):
    hs_rgb = np.repeat(hillshade[:, :, None], 3, axis=2)
    alpha = rgba[:, :, 3:4].astype(np.float32) / 255.0
    color = rgba[:, :, 0:3].astype(np.float32)
    return (color * alpha + hs_rgb * (1 - alpha)).astype(np.uint8)


def write_png_rgb(rgb, geotransform, projection, path):
    h, w, _ = rgb.shape
    mem_ds = gdal.GetDriverByName("MEM").Create("", w, h, 3, gdal.GDT_Byte)
    mem_ds.SetGeoTransform(geotransform)
    mem_ds.SetProjection(projection)
    for ch in range(3):
        mem_ds.GetRasterBand(ch + 1).WriteArray(rgb[:, :, ch])
    gdal.GetDriverByName("PNG").CreateCopy(path, mem_ds)
    mem_ds = None


def main():
    import os
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Laser horisontstack + hillshade...")
    stack, (geotransform, projection) = load_horizon_stack()
    h, w = stack.shape[1], stack.shape[2]
    hillshade = load_hillshade_core(geotransform, w, h)

    village_col, village_row = lonlat_to_pixel(6.0703, 45.0919, geotransform)
    wait_col, wait_row = lonlat_to_pixel(5.98808, 45.14877, geotransform)

    # 09:00 valt istallet for 16:00: vid 16:00 i december ar 69% av ytan redan
    # "aldrig sol" och av det som ar lit ligger medianen redan bortom klamptaket
    # (360 min) - nastan allt blir rott, inte en bugg utan en egenskap hos sen
    # eftermiddag i december. 09:00 ger en verklig spridning over hela skalan
    # (lit-median ~25-70 min, vantar-median ~55-80 min) pa bada datumen.
    for year, month, day, label in [(2025, 12, 15, "2025-12-15"), (2026, 3, 15, "2026-03-15")]:
        lit, minutes = sweep_lit_stack(stack, year, month, day)
        signed = signed_time_to_transition(lit, minutes, 9 * 60)
        rgba = colorize_rgba(signed)
        composited = composite_over_hillshade(rgba, hillshade)
        write_png_rgb(composited, geotransform, projection, f"{OUT_DIR}/sign_{label}_09.png")

        v = float(signed[village_row, village_col])
        wv = float(signed[wait_row, wait_col])
        print(f"{label} 09:00 - bykarnan={v:.1f} -> RGBA={tuple(rgba[village_row, village_col])}")
        print(f"{label} 09:00 - vantepunkt={wv:.1f} -> RGBA={tuple(rgba[wait_row, wait_col])}")

    never_arr = np.array([[NEVER_SENTINEL]], dtype=np.float32)
    print("aldrig-sentinel -> RGBA=", tuple(colorize_rgba(never_arr)[0, 0]))


if __name__ == "__main__":
    main()
