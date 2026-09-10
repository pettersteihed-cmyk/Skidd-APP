# -*- coding: utf-8 -*-
BASE = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance"

KEYS = ["A", "B", "C", "D"]

with open(f"{BASE}/stepped_template.html", "r", encoding="utf-8") as f:
    template = f.read()

for key in KEYS:
    with open(f"{BASE}/preview_stepped/b64/{key}.b64", "r", encoding="ascii") as f:
        b64 = f.read()
    template = template.replace("{{STEPPED_" + key + "}}", b64)

with open(f"{BASE}/stepped-comparison.html", "w", encoding="utf-8") as f:
    f.write(template)

print("Klart:", f"{BASE}/stepped-comparison.html")
print("Storlek:", len(template) / 1_000_000, "MB")
