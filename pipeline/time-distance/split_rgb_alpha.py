"""gdal2tiles droppar alfakanalen for VISSA (framforallt fullt tackta,
inre) tiles vid z13/z12 - troligen en intern optimering i nb_data_bands()/
create_base_tile() som INTE ar palitlig for var anvandning (semantisk
deltransparens, inte bara nodata-maskering). Losning: kringga gdal2tiles
alfa-hantering helt genom att tila RGB och alfa SEPARAT (bada garanterat
konsekventa bandantal), och sla ihop dem sjalva efterat.
"""
import os
import glob
from osgeo import gdal

gdal.UseExceptions()

OUT_DIR = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance/out"
SPLIT_DIR = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance/split"


def main():
    os.makedirs(f"{SPLIT_DIR}/rgb", exist_ok=True)
    os.makedirs(f"{SPLIT_DIR}/alpha", exist_ok=True)
    files = glob.glob(f"{OUT_DIR}/td_*.png")
    print(f"Delar upp {len(files)} RGBA-kallor i RGB + alfa...")
    for src_path in files:
        name = os.path.splitext(os.path.basename(src_path))[0]  # td_2025-12-15_17
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


if __name__ == "__main__":
    main()
