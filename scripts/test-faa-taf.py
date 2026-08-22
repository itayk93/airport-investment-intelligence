#!/usr/bin/env python3
"""Proof-of-data: FAA Terminal Area Forecast (no API key).

Source: https://taf.faa.gov/Downloads/APO100_TAF_Final_2025.zip
scenario 0 = historical actual, 1 = forecast. locid is space-padded -> strip().
"""
import io, json, os, sys, urllib.request, warnings, zipfile
warnings.filterwarnings("ignore")
import openpyxl

URL = "https://taf.faa.gov/Downloads/APO100_TAF_Final_2025.zip"
RAW = "data/raw/APO100_TAF_Final_2025.zip"
AIRPORTS = ["SFO", "LAX", "SNA", "ANC", "BOS"]
BASE_YEAR, HORIZON_YEAR = 2024, 2035  # 2024 = last actual in this TAF vintage


def fetch():
    os.makedirs("data/raw", exist_ok=True)
    if not os.path.exists(RAW):
        print(f"downloading {URL} ...", file=sys.stderr)
        urllib.request.urlretrieve(URL, RAW)
    return zipfile.ZipFile(RAW)


def read(zf, name, value_cols):
    """-> {(locid, year): summed value}"""
    ws = openpyxl.load_workbook(io.BytesIO(zf.read(name)), read_only=True)["Sheet1"]
    rows = ws.iter_rows(values_only=True)
    next(rows)
    out = {}
    for r in rows:
        loc = str(r[0]).strip()
        if loc in AIRPORTS:
            out[(loc, int(r[2]))] = sum(int(r[c] or 0) for c in value_cols)
    return out


def cagr(a, b, years):
    return round(((b / a) ** (1 / years) - 1) * 100, 2) if a and b else None


zf = fetch()
# Enplanements: aac, aat, commuter, us_flag, frgn_flag
enpl = read(zf, "Enplanements.xlsx", [3, 4, 5, 6, 7])
# Operations: itn_Ac, itn_at, itn_ga, itn_mil, loc_ga, loc_mil
ops = read(zf, "AirportsOperations.xlsx", [3, 4, 5, 6, 7, 8])

n = HORIZON_YEAR - BASE_YEAR
result = []
for a in AIRPORTS:
    e0, e1 = enpl.get((a, BASE_YEAR)), enpl.get((a, HORIZON_YEAR))
    o0, o1 = ops.get((a, BASE_YEAR)), ops.get((a, HORIZON_YEAR))
    result.append({
        "airport": a,
        "source": "FAA TAF (APO100_TAF_Final_2025)",
        "baseYear": BASE_YEAR,
        "horizonYear": HORIZON_YEAR,
        "enplanementsBase": e0,
        "enplanementsForecast": e1,
        "enplanementsCagrPct": cagr(e0, e1, n),
        "operationsBase": o0,
        "operationsForecast": o1,
        "operationsCagrPct": cagr(o0, o1, n),
        "forecastGrowthPct": round((e1 / e0 - 1) * 100, 1) if e0 and e1 else None,
    })

os.makedirs("data/out", exist_ok=True)
with open("data/out/faa-taf.json", "w") as f:
    json.dump(result, f, indent=2)
print(json.dumps(result, indent=2))
