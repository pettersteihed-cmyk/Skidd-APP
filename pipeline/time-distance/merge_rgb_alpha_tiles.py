"""Slar ihop de separat tilade RGB- (tiles/) och alfa- (alpha_tiles/) tradarna
till slutgiltiga 4-bands RGBA-tiles, for att kringga gdal2tiles opalitliga
alfa-hantering for fullt tackta inre tiles (se split_rgb_alpha.py)."""
import os
import glob
from osgeo import gdal
import numpy as np

gdal.UseExceptions()

TILES_DIR = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance/tiles"
ALPHA_TILES_DIR = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance/alpha_tiles"


def merge_one(rgb_path: str, alpha_path: str) -> bool:
    rgb_ds = gdal.Open(rgb_path)
    w, h = rgb_ds.RasterXSize, rgb_ds.RasterYSize
    rgb = np.stack(
        [rgb_ds.GetRasterBand(i + 1).ReadAsArray() for i in range(3)], axis=-1
    ).astype(np.uint8)
    rgb_ds = None

    if not os.path.exists(alpha_path):
        return False
    alpha_ds = gdal.Open(alpha_path)
    alpha = alpha_ds.GetRasterBand(1).ReadAsArray().astype(np.uint8)  # "Gray"-bandet = vart alfavarde
    alpha_ds = None

    mem_ds = gdal.GetDriverByName("MEM").Create("", w, h, 4, gdal.GDT_Byte)
    for ch in range(3):
        mem_ds.GetRasterBand(ch + 1).WriteArray(rgb[:, :, ch])
    mem_ds.GetRasterBand(4).WriteArray(alpha)
    mem_ds.GetRasterBand(4).SetColorInterpretation(gdal.GCI_AlphaBand)
    gdal.GetDriverByName("PNG").CreateCopy(rgb_path, mem_ds)
    mem_ds = None
    return True


def main():
    rgb_files = glob.glob(f"{TILES_DIR}/**/*.png", recursive=True)
    print(f"Slar ihop {len(rgb_files)} tiles...")
    merged = 0
    missing = 0
    for rgb_path in rgb_files:
        rel = os.path.relpath(rgb_path, TILES_DIR)
        alpha_path = os.path.join(ALPHA_TILES_DIR, rel)
        if merge_one(rgb_path, alpha_path):
            merged += 1
        else:
            missing += 1
    print(f"Klart. Ihopslagna: {merged}, saknade alfamotsvarigheter: {missing}")


if __name__ == "__main__":
    main()
