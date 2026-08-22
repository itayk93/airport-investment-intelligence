#!/usr/bin/env python3
"""Parse the full FAA TAF annual series (all years, both scenarios) for the pilot
airports, from the zip already cached by test-faa-taf.py during stage 1.

Unlike test-faa-taf.py (which only prints a base-year/horizon-year summary for the
data-feasibility spike), this outputs one row per (airport, year, scenario) — the
grain airport_forecast_annual actually needs. Run after test-faa-taf.py at least once
so data/raw/APO100_TAF_Final_2025.zip exists.
"""
import io, json, os, sys, urllib.request, warnings, zipfile
warnings.filterwarnings("ignore")
import openpyxl

URL = "https://taf.faa.gov/Downloads/APO100_TAF_Final_2025.zip"
RAW = "data/raw/APO100_TAF_Final_2025.zip"
AIRPORTS = ["SFO", "LAX", "SNA", "ANC", "BOS"]


def fetch():
    os.makedirs("data/raw", exist_ok=True)
    if not os.path.exists(RAW):
        print(f"downloading {URL} ...", file=sys.stderr)
        urllib.request.urlretrieve(URL, RAW)
    return zipfile.ZipFile(RAW)


def read(zf, name, value_cols):
    ws = openpyxl.load_workbook(io.BytesIO(zf.read(name)), read_only=True)["Sheet1"]
    rows = ws.iter_rows(values_only=True)
    next(rows)
    out = {}
    for r in rows:
        loc = str(r[0]).strip()
        if loc in AIRPORTS:
            out[(loc, int(r[1]), int(r[2]))] = sum(int(r[c] or 0) for c in value_cols)
    return out


zf = fetch()
enpl = read(zf, "Enplanements.xlsx", [3, 4, 5, 6, 7])
ops = read(zf, "AirportsOperations.xlsx", [3, 4, 5, 6, 7, 8])

keys = sorted(set(enpl) | set(ops))
rows = [
    {
        "airport": a,
        "year": y,
        "scenario": s,
        "enplanements": enpl.get((a, s, y)),
        "operations": ops.get((a, s, y)),
    }
    for (a, s, y) in keys
]

os.makedirs("data/out", exist_ok=True)
with open("data/out/faa-taf-annual.json", "w") as f:
    json.dump(rows, f, indent=2)
print(f"wrote {len(rows)} rows to data/out/faa-taf-annual.json", file=sys.stderr)
