"""Bekraftar hypotesen: jamfor signerat tidsvarde for samma punkt (bykarnan)
kl 16:00, 15 december mot 15 mars. Andrar ingen appkod - bara en fristaende
kontroll som ateranvander redan skrivna funktioner."""
import sys
from osgeo import osr, ogr

sys.path.insert(0, "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/first-sun")
from build_time_distance import load_horizon_stack, sweep_lit_stack, signed_time_to_transition  # noqa: E402

POINT_LAT, POINT_LNG = 45.0919, 6.0703
REF_HOUR = 16


def lonlat_to_pixel(lon, lat, geotransform):
    src = osr.SpatialReference()
    src.ImportFromEPSG(4326)
    dst = osr.SpatialReference()
    dst.ImportFromEPSG(3857)
    src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    transform = osr.CoordinateTransformation(src, dst)
    point = ogr.Geometry(ogr.wkbPoint)
    point.AddPoint(lon, lat)
    point.Transform(transform)
    mx, my = point.GetX(), point.GetY()
    ox, px_w, _, oy, _, px_h = geotransform
    col = int((mx - ox) / px_w)
    row = int((my - oy) / px_h)
    return col, row


def main():
    print("Laser horisontstack...")
    stack, (geotransform, _projection) = load_horizon_stack()
    col, row = lonlat_to_pixel(POINT_LNG, POINT_LAT, geotransform)
    print(f"Pixel for bykarnan ({POINT_LAT}, {POINT_LNG}): col={col}, row={row} (rutnat {stack.shape[1]}x{stack.shape[2]})")

    results = {}
    for year, month, day, label in [(2025, 12, 15, "15 december"), (2026, 3, 15, "15 mars")]:
        lit, minutes = sweep_lit_stack(stack, year, month, day)
        signed = signed_time_to_transition(lit, minutes, REF_HOUR * 60)
        value = float(signed[row, col])
        results[label] = value
        print(f"{label} kl {REF_HOUR}:00 -> signerat varde vid bykarnan: {value:.1f} min")

    print()
    dec = results["15 december"]
    mar = results["15 mars"]
    print(f"Sammanfattning: december={dec:.1f} min, mars={mar:.1f} min")
    if mar < -100 and abs(dec) < abs(mar):
        print("HYPOTES BEKRAFTAD: mars ar ett stort negativt tal (lange sedan solen kom),")
        print("december ligger narmare noll/annan storleksordning.")
    else:
        print("Hypotesen stammer INTE rakt av med de har konkreta talen - se varden ovan.")


if __name__ == "__main__":
    main()
