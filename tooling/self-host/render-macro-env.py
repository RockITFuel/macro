#!/usr/bin/env python3
"""Render the 1Password item 'Production Macro Environment' (vault Alpha) as a
dotenvy-compatible env file on stdout. Values are never logged."""
import json, subprocess, sys
item = json.loads(subprocess.check_output(
    ["op", "item", "get", "Production Macro Environment", "--vault", "Alpha", "--format", "json", "--reveal"]))
bad = []
for f in item["fields"]:
    k, v = f["label"], f.get("value") or ""
    if k == "notesPlain":
        continue
    if "$" in v:
        bad.append(k)  # compose would interpolate it
    esc = v.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    sys.stdout.write(f'{k}="{esc}"\n')
if bad:
    sys.exit("values containing $ (compose interpolation): " + ", ".join(bad))
