from osgeo import gdal
import glob
from collections import defaultdict

gdal.UseExceptions()
files = glob.glob(
    "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance/tiles/2025-12-15/17/**/*.png",
    recursive=True,
)
byzoom = defaultdict(lambda: defaultdict(int))
for f in files:
    parts = f.replace("\\", "/").split("/")
    z = parts[-3]
    ds = gdal.Open(f)
    byzoom[z][ds.RasterCount] += 1
for z in sorted(byzoom.keys(), key=int):
    print("z" + z, dict(byzoom[z]))
