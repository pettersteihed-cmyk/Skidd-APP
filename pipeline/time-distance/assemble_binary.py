# -*- coding: utf-8 -*-
import json

BASE = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance"

KEYS = ["2025_12_15_09", "2025_12_15_16"]

with open(f"{BASE}/binary_template.html", "r", encoding="utf-8") as f:
    template = f.read()

with open(f"{BASE}/preview_binary/stats.json", "r", encoding="utf-8") as f:
    stats = json.load(f)

for key in KEYS:
    with open(f"{BASE}/preview_binary/b64/{key}.b64", "r", encoding="ascii") as f:
        b64 = f.read()
    template = template.replace("{{BINARY_" + key + "}}", b64)

    hour = key[-2:]
    template = template.replace("{{PCT_SUN_" + hour + "}}", str(stats[key]["sol"]))
    template = template.replace("{{PCT_SHADOW_" + hour + "}}", str(stats[key]["skugga"]))
    template = template.replace("{{PCT_NEVER_" + hour + "}}", str(stats[key]["aldrig"]))

with open(f"{BASE}/binary-comparison.html", "w", encoding="utf-8") as f:
    f.write(template)

print("Klart:", f"{BASE}/binary-comparison.html")
print("Storlek:", len(template) / 1_000_000, "MB")
