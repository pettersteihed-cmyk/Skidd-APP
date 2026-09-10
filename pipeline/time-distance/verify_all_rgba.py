from osgeo import gdal
import glob

gdal.UseExceptions()
files = glob.glob(
    "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance/tiles/**/*.png",
    recursive=True,
)
print("Totalt antal tiles:", len(files))
band_counts = {}
for f in files:
    ds = gdal.Open(f)
    band_counts[ds.RasterCount] = band_counts.get(ds.RasterCount, 0) + 1
print("Bandantal-fordelning:", band_counts)
