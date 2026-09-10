# -*- coding: utf-8 -*-
BASE = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance/out"

KEYS = ["2025-12-15_08", "2025-12-15_11", "2025-12-15_14", "2025-12-15_17", "2026-03-15_11"]

b64 = {}
for key in KEYS:
    with open(f"{BASE}/b64/{key}.b64", "r", encoding="ascii") as f:
        b64[key] = f.read()

with open(f"{BASE}/../artifact_template.html", "r", encoding="utf-8") as f:
    template = f.read()

for key in KEYS:
    placeholder = "{{B64_" + key.replace("-", "_") + "}}"
    template = template.replace(placeholder, b64[key])

with open(f"{BASE}/../time-distance-comparison.html", "w", encoding="utf-8") as f:
    f.write(template)

print("Klart:", f"{BASE}/../time-distance-comparison.html")
print("Storlek:", len(template) / 1_000_000, "MB")
