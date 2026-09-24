# Synkar offpistfälten från docs/offpist-underlag.xlsx (bladet "Underlag") till src/data/resorts.ts.
#
# Excel-filen är den officiella källan för offpistNivaMin/Max, offpistTillgang, glaciarakning,
# guideverksamhet och offpistNote (se CLAUDE.md). Ändra i Excel först, kör sedan skriptet:
#
#   python scripts/sync_offpist_to_resorts.py
#
# Kräver bara Pythons standardbibliotek (ingen openpyxl). Skriptet är idempotent: befintliga
# offpistrader i resorts.ts ersätts, så en omkörning utan ändringar i Excel ger ingen diff.
# Det avbryter utan att skriva om något i Excel avviker (fel rubriker, Min > Max, värden utanför
# 1–5, annat än ja/nej, offpistNote över 140 tecken eller med citattecken/backslash, eller om
# orterna i Excel och resorts.ts inte stämmer överens).
#
# Mappning: C/D -> offpistNivaMin/Max (tal), E–H med "ja" -> offpistTillgang[],
# I/J -> glaciarakning/guideverksamhet (boolean), K -> offpistNote (ordagrant).
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / "docs" / "offpist-underlag.xlsx"
RESORTS_TS = ROOT / "src" / "data" / "resorts.ts"

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
RUBRIKER = {"A": "id", "C": "offpistNivaMin", "D": "offpistNivaMax", "E": "liftnara", "F": "kort-stigning",
            "G": "turakning", "H": "guide-kravs", "I": "glaciarakning", "J": "guideverksamhet", "K": "offpistNote"}
TILLGANG = ["liftnara", "kort-stigning", "turakning", "guide-kravs"]


def las_underlag() -> dict[str, dict[str, str | None]]:
    """Returnerar {id: {rubrik: värde}} för bladet Underlag."""
    z = zipfile.ZipFile(XLSX)
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        ss = ["".join(t.text or "" for t in si.iter(M + "t"))
              for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(M + "si")]
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    blad = next(s for s in ET.fromstring(z.read("xl/workbook.xml")).iter(M + "sheet") if s.get("name") == "Underlag")
    target = rels[blad.get(R + "id")].lstrip("/")
    target = target if target.startswith("xl/") else "xl/" + target

    celler: dict[str, str | None] = {}
    for c in ET.fromstring(z.read(target)).iter(M + "c"):
        t, v = c.get("t"), c.find(M + "v")
        if t == "s":
            celler[c.get("r")] = ss[int(v.text)]
        elif t == "inlineStr":
            celler[c.get("r")] = "".join(x.text or "" for x in c.iter(M + "t"))
        else:
            celler[c.get("r")] = None if v is None else v.text

    for kol, namn in RUBRIKER.items():
        if celler.get(f"{kol}1") != namn:
            sys.exit(f"Fel rubrik i {kol}1: {celler.get(f'{kol}1')!r}, förväntade {namn!r}")

    rader = {}
    r = 2
    while celler.get(f"A{r}"):
        rader[celler[f"A{r}"]] = {namn: celler.get(f"{kol}{r}") for kol, namn in RUBRIKER.items()}
        r += 1
    return rader


def ts_rader(oid: str, v: dict[str, str | None]) -> list[str]:
    """Bygger de två TS-raderna för en ort, efter validering."""
    try:
        lo, hi = float(v["offpistNivaMin"]), float(v["offpistNivaMax"])
    except (TypeError, ValueError):
        sys.exit(f"{oid}: offpistNivaMin/Max saknas eller är inte tal")
    if not (lo.is_integer() and hi.is_integer() and 1 <= lo <= hi <= 5):
        sys.exit(f"{oid}: ogiltigt nivåspann {lo}–{hi}")
    for f in TILLGANG + ["glaciarakning", "guideverksamhet"]:
        if v[f] not in ("ja", "nej"):
            sys.exit(f"{oid}: {f} är {v[f]!r}, förväntade 'ja' eller 'nej'")
    note = v["offpistNote"]
    if not note or '"' in note or "\\" in note or len(note) > 140:
        sys.exit(f"{oid}: ogiltig offpistNote ({len(note or '')} tecken): {note!r}")

    tillgang = ", ".join(json.dumps(f) for f in TILLGANG if v[f] == "ja")
    return [
        f"    offpistNivaMin: {int(lo)}, offpistNivaMax: {int(hi)}, offpistTillgang: [{tillgang}], "
        f"glaciarakning: {str(v['glaciarakning'] == 'ja').lower()}, "
        f"guideverksamhet: {str(v['guideverksamhet'] == 'ja').lower()},",
        f"    offpistNote: {json.dumps(note, ensure_ascii=False)} }},",
    ]


def main() -> None:
    data = las_underlag()
    raw = RESORTS_TS.read_bytes().decode("utf-8")
    nl = "\r\n" if "\r\n" in raw else "\n"

    # 1. Ta bort befintliga offpistrader och återställ avslutningen på pisteColors-raden.
    rensad: list[str] = []
    for line in raw.split(nl):
        if line.startswith("    offpistNivaMin:"):
            continue
        if line.startswith("    offpistNote:"):
            rensad[-1] = re.sub(r",$", " },", rensad[-1])
            continue
        rensad.append(line)

    # 2. Lägg in nya offpistrader efter pisteColors för varje ort.
    ut: list[str] = []
    aktuell, klara = None, []
    for line in rensad:
        m = re.match(r'\s*\{ id: "([^"]+)"', line)
        if m:
            aktuell = m.group(1)
        if aktuell in data and re.search(r"pisteColors: \{[^}]*\} \},$", line):
            ut.append(line[: -len(" },")] + ",")
            ut.extend(ts_rader(aktuell, data[aktuell]))
            klara.append(aktuell)
            continue
        ut.append(line)

    if sorted(klara) != sorted(data):
        sys.exit(f"Orterna i Excel och resorts.ts stämmer inte: {sorted(set(data) ^ set(klara))}")

    nytt = nl.join(ut)
    if nytt == raw:
        print(f"Inga ändringar — resorts.ts är redan i synk med {XLSX.name} ({len(klara)} orter).")
    else:
        RESORTS_TS.write_bytes(nytt.encode("utf-8"))
        print(f"Uppdaterade offpistfälten för {len(klara)} orter i {RESORTS_TS.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
