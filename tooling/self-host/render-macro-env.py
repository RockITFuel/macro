#!/usr/bin/env python3
"""Render the 1Password items 'Production Macro Environment' (vault Alpha) and
'Production Macro Environment (email)' (vault Credentials) as one
dotenvy-compatible env file on stdout. A key in both items is an error.
Values are never logged."""
import json, subprocess, sys
ITEMS = [
    ("Production Macro Environment", "Alpha"),
    ("Production Macro Environment (email)", "Credentials"),
]
bad, seen, dupes = [], {}, []
for title, vault in ITEMS:
    item = json.loads(subprocess.check_output(
        ["op", "item", "get", title, "--vault", vault, "--format", "json", "--reveal"]))
    for f in item["fields"]:
        k, v = f["label"], f.get("value") or ""
        if k == "notesPlain":
            continue
        if k in seen:
            dupes.append(k)
            continue
        seen[k] = title
        if "$" in v:
            bad.append(k)  # compose would interpolate it
        esc = v.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
        sys.stdout.write(f'{k}="{esc}"\n')
if dupes:
    sys.exit("keys in more than one item: " + ", ".join(dupes))
if bad:
    sys.exit("values containing $ (compose interpolation): " + ", ".join(bad))
