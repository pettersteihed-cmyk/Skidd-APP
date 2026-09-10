"""Kor gdal2tiles (z8-13, --xyz) pa varje separat RGB- och alfa-raster i
split/rgb och split/alpha (skapade av split_rgb_alpha.py), och skriver till
tiles/{dateId}/{hh}/{z}/{x}/{y}.png respektive alpha_tiles/{dateId}/{hh}/...
- samma mappstruktur som R2-bucketen forvantar sig
(time-distance-tiles/alpe-dhuez/{dateId}/{hh}/{z}/{x}/{y}.png). Kor
merge_rgb_alpha_tiles.py efterat for att sla ihop till slutgiltiga RGBA-tiles
(se split_rgb_alpha.py for varfor de tilas separat).
"""
import os
import sys
import glob
import subprocess
import time

BASE = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance"
SPLIT_DIR = f"{BASE}/split"
TILES_DIR = f"{BASE}/tiles"
ALPHA_TILES_DIR = f"{BASE}/alpha_tiles"

GEO = "C:/Users/User1/miniforge3/envs/geo"
GDAL2TILES = f"{GEO}/Scripts/gdal2tiles.py"
GEO_PYTHON = f"{GEO}/python.exe"


def name_to_date_hour(name: str):
    # "td_2025-12-15_09" -> ("2025-12-15", "09")
    date_part, hour_part = name[len("td_"):].rsplit("_", 1)
    return date_part, hour_part


def run_gdal2tiles(src_tif: str, dst_dir: str):
    os.makedirs(dst_dir, exist_ok=True)
    subprocess.run(
        [GEO_PYTHON, GDAL2TILES, "-z", "8-13", "--xyz", "-w", "none", src_tif, dst_dir],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
    )


def main():
    rgb_files = sorted(glob.glob(f"{SPLIT_DIR}/rgb/td_*.tif"))
    if not rgb_files:
        print("Inga split-rastren hittades - kor split_rgb_alpha.py forst.")
        sys.exit(1)
    print(f"Tilar {len(rgb_files)} RGB + {len(rgb_files)} alfa-rastren (z8-13, kan ta ett tag)...")
    for i, rgb_tif in enumerate(rgb_files, 1):
        name = os.path.splitext(os.path.basename(rgb_tif))[0]
        date_id, hour = name_to_date_hour(name)
        alpha_tif = f"{SPLIT_DIR}/alpha/{name}.tif"

        t0 = time.time()
        run_gdal2tiles(rgb_tif, f"{TILES_DIR}/{date_id}/{hour}")
        run_gdal2tiles(alpha_tif, f"{ALPHA_TILES_DIR}/{date_id}/{hour}")
        print(f"  [{i}/{len(rgb_files)}] {name} klar ({time.time()-t0:.1f}s)")
    print("Klart. Kor merge_rgb_alpha_tiles.py harnast.")


if __name__ == "__main__":
    main()
