"""Hittar en punkt som genuint ar i skugga (positivt varde) kl 16:00, 15 dec,
och jamfor mot bykarnans stora negativa varde vid samma tidpunkt - for att
testa tecken-symmetrin (lange-lit vs lange-i-skugga -> samma farg)."""
import sys
import numpy as np
from osgeo import osr, ogr

sys.path.insert(0, "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/first-sun")
from build_time_distance import (  # noqa: E402
    load_horizon_stack, sweep_lit_stack, signed_time_to_transition, NEVER_SENTINEL,
    CORE_WEST, CORE_EAST, CORE_NORTH, CORE_SOUTH,
)

VILLAGE_LAT, VILLAGE_LNG = 45.0919, 6.0703
CANDIDATE_LAT, CANDIDATE_LNG = 45.09674, 5.96338
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
    return int((mx - ox) / px_w), int((my - oy) / px_h)


def pixel_to_lonlat(col, row, geotransform):
    ox, px_w, _, oy, _, px_h = geotransform
    mx = ox + (col + 0.5) * px_w
    my = oy + (row + 0.5) * px_h
    src = osr.SpatialReference(); src.ImportFromEPSG(3857)
    dst = osr.SpatialReference(); dst.ImportFromEPSG(4326)
    src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    t = osr.CoordinateTransformation(src, dst)
    p = ogr.Geometry(ogr.wkbPoint); p.AddPoint(mx, my); p.Transform(t)
    return p.GetY(), p.GetX()  # lat, lon


def main():
    print("Laser horisontstack...")
    stack, (geotransform, _proj) = load_horizon_stack()
    h, w = stack.shape[1], stack.shape[2]

    lit, minutes = sweep_lit_stack(stack, 2025, 12, 15)
    signed = signed_time_to_transition(lit, minutes, REF_HOUR * 60)

    vcol, vrow = lonlat_to_pixel(VILLAGE_LNG, VILLAGE_LAT, geotransform)
    village_value = float(signed[vrow, vcol])
    print(f"Bykarnan ({VILLAGE_LAT},{VILLAGE_LNG}) kl {REF_HOUR}:00, 15 dec: {village_value:.1f} min")

    ccol, crow = lonlat_to_pixel(CANDIDATE_LNG, CANDIDATE_LAT, geotransform)
    candidate_value = float(signed[crow, ccol])
    print(f"Kandidatpunkten ({CANDIDATE_LAT},{CANDIDATE_LNG}) kl {REF_HOUR}:00, 15 dec: {candidate_value:.1f} min "
          f"({'i skugga (positivt)' if 0 < candidate_value < NEVER_SENTINEL - 1 else 'INTE i skugga just nu'})")

    if not (0 < candidate_value < NEVER_SENTINEL - 1):
        print("\nKandidaten stammer inte langre (eller aldrig) - soker efter basta representativa punkt...")
        # Sok bland INRE pixlar (undvik kantartefakter) efter det storsta positiva,
        # icke-'aldrig'-vardet - dvs punkten som vantar LANGST pa sol men FAR sol
        # nagon gang under svepet (mest dramatiska genuina "vantar pa sol"-fallet).
        margin = 5
        inner = signed[margin:h - margin, margin:w - margin]
        valid_mask = (inner > 0) & (inner < NEVER_SENTINEL - 1)
        if not valid_mask.any():
            print("Ingen pixel vantar pa sol (positivt, icke-aldrig) kl 16:00 - alla ar antingen redan lit eller 'aldrig' for dagen.")
            return
        masked = np.where(valid_mask, inner, -1)
        idx = np.unravel_index(np.argmax(masked), masked.shape)
        best_row, best_col = idx[0] + margin, idx[1] + margin
        best_value = float(signed[best_row, best_col])
        best_lat, best_lon = pixel_to_lonlat(best_col, best_row, geotransform)
        print(f"Basta representativa punkt: rad={best_row} kol={best_col} -> lat={best_lat:.5f} lon={best_lon:.5f}")
        print(f"Varde dar kl {REF_HOUR}:00, 15 dec: {best_value:.1f} min (vantar pa sol)")
        candidate_value = best_value
        CANDIDATE_LABEL = f"({best_lat:.5f}, {best_lon:.5f})"
    else:
        CANDIDATE_LABEL = f"({CANDIDATE_LAT}, {CANDIDATE_LNG})"

    print("\n=== SAMMANFATTNING ===")
    print(f"Bykarnan (45.0919, 6.0703):      {village_value:.1f} min  (negativt = lange lit)")
    print(f"Skuggpunkt {CANDIDATE_LABEL}: {candidate_value:.1f} min  (positivt = vantar pa sol)")
    print(f"Absolutvarden: {abs(village_value):.1f} vs {abs(candidate_value):.1f}")


if __name__ == "__main__":
    main()
