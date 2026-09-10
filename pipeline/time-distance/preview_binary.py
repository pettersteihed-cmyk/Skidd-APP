"""Binart alternativ: bara tva (plus "aldrig") tillstand, inga mellannyanser.
- I sol just nu vid referenstiden  -> EN varm ton (gul/orange), platt, alpha=255
- I skugga men far sol nagon gang samma dag -> EN kall ton (bla), platt, alpha=255
- Aldrig sol nagon gang under svepet (06-19) denna dag -> egen, morkare ton
Ingen gradient, ingen distansberoende nyans, ingen hillshade-blandning - rena
platta ytor sa att gransen ar omedelbart lasbar. Bara forhandsgranskning,
andrar inte build_final_rgba.py eller nagra tiles.
"""
import os
import sys
import base64
import json
import numpy as np
from osgeo import gdal

sys.path.insert(0, "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/first-sun")
from build_time_distance import load_horizon_stack, sweep_lit_stack  # noqa: E402

gdal.UseExceptions()
BASE = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance"
OUT_DIR = f"{BASE}/preview_binary"
B64_DIR = f"{OUT_DIR}/b64"

SUN_COLOR = (253, 184, 19)     # varm, matt gul/orange - i sol nu
SHADOW_COLOR = (37, 99, 235)   # kall, matt bla - i skugga nu, far sol senare samma dag
NEVER_COLOR = (8, 14, 40)      # egen, mycket morkare ton - aldrig sol denna dag

CASES = [
    (2025, 12, 15, 9, "2025_12_15_09"),
    (2025, 12, 15, 16, "2025_12_15_16"),
]


def colorize_binary(currently_lit: np.ndarray, never_lit_today: np.ndarray) -> np.ndarray:
    h, w = currently_lit.shape
    rgb = np.empty((h, w, 3), dtype=np.uint8)
    rgb[:] = SHADOW_COLOR
    rgb[currently_lit] = SUN_COLOR
    rgb[never_lit_today] = NEVER_COLOR
    return rgb


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
    print("Laser horisontstack...")
    stack, (geotransform, projection) = load_horizon_stack()
    print("Pixelgrid:", stack.shape)

    stats = {}
    swept = {}
    for year, month, day, hour, key in CASES:
        date_key = (year, month, day)
        if date_key not in swept:
            print(f"Sveper {year:04d}-{month:02d}-{day:02d}...")
            swept[date_key] = sweep_lit_stack(stack, year, month, day)
        lit, minutes = swept[date_key]

        ref_minute = hour * 60
        ref_idx = int(np.argmin(np.abs(minutes - ref_minute)))
        currently_lit = lit[ref_idx]
        never_lit_today = ~lit.any(axis=0)

        rgb = colorize_binary(currently_lit, never_lit_today)
        png_path = f"{OUT_DIR}/binary_{key}.png"
        write_png(rgb, geotransform, projection, png_path)

        with open(png_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        with open(f"{B64_DIR}/{key}.b64", "w", encoding="ascii") as f:
            f.write(b64)

        sol_pct = 100 * currently_lit.mean()
        vantar_pct = 100 * (~currently_lit & ~never_lit_today).mean()
        aldrig_pct = 100 * never_lit_today.mean()
        stats[key] = {"sol": round(sol_pct, 1), "skugga": round(vantar_pct, 1), "aldrig": round(aldrig_pct, 1)}
        print(f"  {key}: sol={sol_pct:.1f}% skugga(far sol senare)={vantar_pct:.1f}% aldrig={aldrig_pct:.1f}%")

    with open(f"{OUT_DIR}/stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)
    print("Klart:", OUT_DIR)


if __name__ == "__main__":
    main()
