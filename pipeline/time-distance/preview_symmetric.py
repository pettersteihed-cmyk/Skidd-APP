"""Forhandsgranskning av en SYMMETRISK fargrampe for tidsavstands-lagret:
fargen ska bero pa |signerade minuter till overgang| - 0 = gul topp,
storre avstand at ENTINGEN hall = kallnar mot bla. Andrar INTE
build_time_distance.py permanent, INGEN tile-ombyggnad - bara forhandsvisning.
"""
import sys
import numpy as np
from osgeo import gdal

sys.path.insert(0, "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance")
sys.path.insert(0, "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/first-sun")
from build_time_distance import (  # noqa: E402
    load_horizon_stack, sweep_lit_stack, signed_time_to_transition,
    write_png, NEVER_SENTINEL,
)

gdal.UseExceptions()

OUT_DIR = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance/preview_symmetric"

# Symmetrisk gradient - nyckeln ar |signerade minuter|, sa +90 och -90 far
# EXAKT samma farg. 0 = gul topp ("overgangen just nu"), sedan orange,
# kallnar mot morkbla ju langre bort (i vilken riktning som helst).
SYMMETRIC_STOPS = [
    (0, (254, 240, 138)),    # gul topp
    (60, (249, 115, 22)),    # orange
    (150, (96, 141, 201)),   # overgang mot bla
    (300, (30, 58, 138)),    # morkbla, langt fran overgangen
]
# "Aldrig overgang idag" ar INTE ett eget/trasigt-utseende lage - det ar den
# naturliga fortsattningen av den kalla anden (annu langre bort an 300 min),
# sa den far en annu djupare, mer mattad bla ton, inte gratt.
NEVER_COLOR = (13, 23, 60)


def colorize_symmetric(signed_minutes: np.ndarray) -> np.ndarray:
    h, w = signed_minutes.shape
    rgb = np.zeros((h, w, 3), dtype=np.uint8)
    never_mask = signed_minutes >= NEVER_SENTINEL - 1

    distance = np.abs(signed_minutes)
    stops_dist = np.array([s[0] for s in SYMMETRIC_STOPS], dtype=np.float32)
    stops_rgb = np.array([s[1] for s in SYMMETRIC_STOPS], dtype=np.float32)
    clamped = np.clip(distance, stops_dist[0], stops_dist[-1])
    for channel in range(3):
        rgb[:, :, channel] = np.interp(clamped, stops_dist, stops_rgb[:, channel]).astype(np.uint8)
    rgb[never_mask] = NEVER_COLOR
    return rgb


def main():
    import os
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Laser horisontstack...")
    stack, (geotransform, projection) = load_horizon_stack()

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
        rgb = colorize_symmetric(signed)
        label = f"{year:04d}-{month:02d}-{day:02d}_{hour:02d}"
        out_path = f"{OUT_DIR}/sym_{label}.png"
        write_png(rgb, geotransform, projection, out_path)
        print(f"  Skrev {out_path}")


if __name__ == "__main__":
    main()
