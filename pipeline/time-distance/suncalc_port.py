"""Exakt Python-port av suncalc@2.0.2:s getPosition (node_modules/suncalc/suncalc.cjs),
sa att den har offline-berakningen anvander EXAKT samma formel som appens
useSunPosition.ts. Validerad mot verkliga varden fran den riktiga JS-korningen
(se valideringsblocket langst ner).

Kopierad ordagrant fran .../scratchpad/first-sun/suncalc_port.py (ren Python,
ingen GDAL-beroende) - se pipeline/time-distance/build_time_distance_local.py.
"""
import math
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

RAD = math.pi / 180
J1970 = 2440588
J2000 = 2451545
DAY_MS = 86400000
PARIS = ZoneInfo("Europe/Paris")


def _to_days(date_ms: float) -> float:
    return date_ms / DAY_MS - 0.5 + J1970 - J2000


def _delta_t(d: float) -> float:
    y = 2000 + d / 365.2425
    if y < 1920:
        t = y - 1900
        return -2.79 + t * (1.494119 + t * (-0.0598939 + t * (0.0061966 - t * 0.000197)))
    if y < 1941:
        t = y - 1920
        return 21.2 + t * (0.84493 + t * (-0.0761 + t * 0.0020936))
    if y < 1961:
        t = y - 1950
        return 29.07 + t * (0.407 + t * (-1 / 233 + t / 2547))
    if y < 1986:
        t = y - 1975
        return 45.45 + t * (1.067 + t * (-1 / 260 - t / 718))
    if y < 2005:
        t = y - 2000
        return 63.86 + t * (0.3345 + t * (-0.060374 + t * (0.0017275 + t * (0.000000651814 + t * 0.00000000002373599))))
    if y < 2050:
        t = y - 2000
        return 62.92 + t * (0.32217 + t * 0.005589)
    t = (y - 1820) / 100
    return -20 + 32 * t * t - 0.5628 * (2150 - y)


def _to_days_tt(d: float) -> float:
    return d + _delta_t(d) / 86400


def _sun_coords(d: float):
    t = d / 36525
    l0 = RAD * (280.46646 + t * (36000.76983 + t * 0.0003032))
    m = RAD * (357.52911 + t * (35999.05029 - t * 0.0001537))
    sin_m, cos_m = math.sin(m), math.cos(m)
    c = RAD * (
        (1.914602 - t * (0.004817 + t * 0.000014)) * sin_m
        + (0.019993 - 0.000101 * t) * 2 * sin_m * cos_m
        + 0.000289 * sin_m * (3 - 4 * sin_m * sin_m)
    )
    om = RAD * (125.04 - 1934.136 * t)
    l = l0 + c - RAD * (0.00569 + 0.00478 * math.sin(om))
    e = RAD * (23.439291 - t * (0.0130042 + t * (0.00000016 - t * 0.000000504))) + RAD * 0.00256 * math.cos(om)
    ra = math.atan2(math.cos(e) * math.sin(l), math.cos(l))
    dec = math.asin(math.sin(e) * math.sin(l))
    return ra, dec


def _sidereal_time(d: float, lw: float) -> float:
    return RAD * (280.46061837 + 360.98564736629 * d) - lw


def _astro_refraction(h: float) -> float:
    if h < 0:
        h = 0
    return 0.0002967 / math.tan(h + 0.00312536 / (h + 0.08901179))


def _azimuth(hh: float, phi: float, dec: float) -> float:
    return (math.degrees(math.atan2(math.sin(hh), math.cos(hh) * math.sin(phi) - math.tan(dec) * math.cos(phi))) + 540) % 360


def _altitude(hh: float, phi: float, dec: float) -> float:
    return math.asin(math.sin(phi) * math.sin(dec) + math.cos(phi) * math.cos(dec) * math.cos(hh))


def get_position(date_ms: float, lat: float, lng: float):
    """Returnerar (azimuthDeg, altitudeDeg) - identiskt med suncalc.getPosition()."""
    lw = RAD * (-lng)
    phi = RAD * lat
    d = _to_days(date_ms)
    ra, dec = _sun_coords(_to_days_tt(d))
    hh = _sidereal_time(d, lw) - ra
    h = _altitude(hh, phi, dec)
    az = _azimuth(hh, phi, dec)
    alt = math.degrees(h + _astro_refraction(h))
    return az, alt


def local_datetime_ms(year: int, month: int, day: int, hour: int, minute: int) -> float:
    """Lokal tid (Europe/Paris, hanterar sommartid korrekt) -> ms sedan epoch."""
    dt = datetime(year, month, day, hour, minute, tzinfo=PARIS)
    return dt.astimezone(timezone.utc).timestamp() * 1000


if __name__ == "__main__":
    ms = local_datetime_ms(2026, 1, 15, 12, 30)
    az, alt = get_position(ms, 45.092, 6.069)
    print(f"Validering 2026-01-15 12:30 Europe/Paris: az={az:.2f} alt={alt:.2f}")
    print("Forvantat (fran riktig node-korning): az=176.14 alt=23.78")
