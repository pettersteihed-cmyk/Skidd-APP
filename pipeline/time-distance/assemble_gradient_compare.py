# -*- coding: utf-8 -*-
BASE = "C:/Users/User1/AppData/Local/Temp/claude/C--Users-User1-Downloads-project-bolt-sb1-qfebkjhm-project/355540e2-9d89-4241-9e0b-4a3d14a4197b/scratchpad/time-distance"

KEYS = ["2025-12-15_08", "2025-12-15_11", "2025-12-15_14", "2025-12-15_17", "2026-03-15_11"]

with open(f"{BASE}/gradient_compare_template.html", "r", encoding="utf-8") as f:
    template = f.read()

for key in KEYS:
    with open(f"{BASE}/out/b64/{key}.b64", "r", encoding="ascii") as f:
        old_b64 = f.read()
    with open(f"{BASE}/preview_symmetric_alpha/b64/{key}.b64", "r", encoding="ascii") as f:
        new_b64 = f.read()
    suffix = key.replace("-", "_")
    template = template.replace("{{OLD_" + suffix + "}}", old_b64)
    template = template.replace("{{NEW_" + suffix + "}}", new_b64)

with open(f"{BASE}/gradient-compare.html", "w", encoding="utf-8") as f:
    f.write(template)

print("Klart:", f"{BASE}/gradient-compare.html")
print("Storlek:", len(template) / 1_000_000, "MB")
