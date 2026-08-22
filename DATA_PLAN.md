# DATA_PLAN.md — Data Feasibility Spike

Goal: prove every metric behind the 4 questions comes from a real, reachable source
**before** any DB schema, agent, or UI work.

Pilot airports: `SFO`, `LAX`, `SNA`, `ANC`, `BOS`.

Status: **all three sources verified live on 2026-08-22.** No API key needed anywhere.

---

## 1. Data Map

| Question | Metric to compute | Source | Verified |
|---|---|---|---|
| New England expansion | enplanements, departures, seats, load factor | BTS T-100 `r495-tyji` | yes |
| | forecast enplanement/ops growth (to FY2055) | FAA TAF `APO100_TAF_Final_2025.zip` | yes |
| | congestion (delay, NAS delay) | BTS On-Time PREZIP | yes |
| LAX vs SNA congestion | avg dep delay, %delayed>15, cancel rate, avg taxi-out, NAS-delay share, ops volume | BTS On-Time PREZIP | yes |
| ANC long-haul % | departures split by segment `Distance` | BTS On-Time PREZIP (domestic) + T-100 (intl) | yes |
| SFO unmet demand | TAF forecast growth vs actual T-100 growth + congestion + ops-vs-forecast-ops gap | TAF + T-100 + On-Time | yes |

**Capacity Pressure** and **Unmet Demand** are two distinct KPIs, not the same number
renamed. See `docs/03-scoring-methodology.md` for the full derivation; summary:

- **Capacity Pressure** = how congested the airport is *right now*, relative to itself.
  Built only from On-Time (current operational reality): normalized taxi-out time,
  NAS-delay minutes/departure, % flights delayed >15 min.
- **Unmet Demand Score** = forecast enplanement growth gap (TAF CAGR − T-100 historical CAGR)
  **gated by** Capacity Pressure. High forecast growth with low current congestion is just
  normal growth, not unmet demand. High forecast growth *and* high current congestion is
  unmet demand. `UnmetDemandScore = ForecastGrowthGapPct × CapacityPressureNormalized`.

No dataset publishes runway/terminal capacity — both metrics are modeled proxies from
delay/taxi data, stated as such, never presented as a published figure.

---

## 2. Sources — endpoint level

### A. BTS T-100 Segment Summary By Origin Airport (Socrata)
- Endpoint: `https://data.bts.gov/resource/r495-tyji.json`
- Key: **none**. SoQL supported (`$select/$where/$group/$order/$limit`).
- Coverage: `2014-01` → `2026-04`, 131,739 rows. Monthly, per origin airport. Domestic + international.
- Filter by IATA: yes — `origin_airport_code`.
- Fields used: `origin_airport_code, year, reporting_month, total_departures, total_passengers,
  total_seats, total_load_factor, total_distance_flight_sm, domestic_*, ...`
- Reliability: official BTS, good enough for demo and for production.

Example:
```
https://data.bts.gov/resource/r495-tyji.json?$select=origin_airport_code,year,sum(total_departures)%20as%20deps,sum(total_passengers)%20as%20pax&$where=origin_airport_code%20in('SFO','LAX','SNA','ANC','BOS')%20and%20year='2025'&$group=origin_airport_code,year
```
Verified output (2025): SFO 190,086 deps / 26,482,764 pax · LAX 273,911 / 36,766,912 ·
BOS 191,546 / 21,105,980 · SNA 51,256 / 5,532,646 · ANC 87,988 / 2,714,359.

### B. BTS Reporting Carrier On-Time Performance (TranStats PREZIP)
- Endpoint: `https://transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_{YYYY}_{M}.zip`
- Key: **none**. Plain GET, no form POST, no cookie. Supports HTTP Range.
- Latest month available: **2026_6** (`2026_7` returns a 108 KB HTML error page — that is the
  liveness check; HEAD always returns 200, so probe with `Range: bytes=0-0` and read `Content-Range`).
- Size: ~31 MB zip → ~277 MB CSV → ~611k rows/month. Must be streamed, not read into memory.
- Filter by IATA: yes — `Origin` / `Dest`.
- Fields used: `Origin, Dest, DepDelay, DepDelayMinutes, DepDel15, TaxiOut, Cancelled,
  CancellationCode, Diverted, Distance, DistanceGroup, ArrDel15, CarrierDelay, WeatherDelay,
  NASDelay, SecurityDelay, LateAircraftDelay, Flights`.
- **Caveat: US domestic only, and only carriers above the 0.5% revenue reporting threshold.**
  So ANC "long-haul share" from this source is *domestic* long-haul. Cross-check the
  international leg with T-100.

### C. FAA Terminal Area Forecast (TAF)
- Endpoint: `https://taf.faa.gov/Downloads/APO100_TAF_Final_2025.zip` (~15.7 MB)
- Key: **none**. (`taf.faa.gov/taf/downloadTAF.jsp` is dead — 302 to an error page. Do not use it.)
- Contents: `Airports.xlsx`, `AirportsOperations.xlsx`, `BasedAircraft.xlsx`,
  `Enplanements.xlsx`, `Tracon.xlsx`.
- Coverage: FY **1976 → 2055**, 3,331 airports.
- Filter by IATA: yes — column `locid`, **but values are space-padded (`'SFO '`). Always `.strip()`.**
- `scenario`: `0` = historical actual (through FY2024), `1` = forecast (FY2025+).
- `Enplanements.xlsx`: `locid, scenario, ayear, aac, aat, commuter, us_flag, frgn_flag`
- `AirportsOperations.xlsx`: `locid, scenario, ayear, itn_Ac, itn_at, itn_ga, itn_mil, loc_ga, loc_mil, tot_overs`
- Verified: SFO FY2019 enplanements 27,654,594 / ops 460,720; SFO FY2025 forecast enplanements 26,106,891.

---

## 3. Proof scripts

```bash
node   scripts/test-bts-t100.mjs         # Socrata, instant
python3 scripts/test-faa-taf.py          # downloads+caches 15.7 MB zip
node   scripts/test-bts-ontime.mjs 2026 5 # downloads+caches 31 MB zip, streams 277 MB CSV (~3 min first run)
```
Raw downloads cache in `data/raw/`, results write to `data/out/`.
FAA script is Python because the TAF ships as `.xlsx` and `openpyxl` is already available —
not worth a Node xlsx dependency for a spike.

---

## 4. Order of work

1. **APIs → sample responses → computable metrics** ← done, this file
2. Supabase schema + ingestion (shaped by section 2's real fields)
3. Deterministic scoring
4. Agent
5. UI

---

## 5. Verified sample output (2026-08-22)

`data/out/ontime-2026-5.json` — 2026-05, domestic reporting carriers:

| | SFO | LAX | SNA | ANC | BOS |
|---|---|---|---|---|---|
| departures | 13,114 | 16,317 | 3,835 | 1,818 | 12,694 |
| avg dep delay (min) | 21.75 | 14.24 | 14.05 | 8.78 | 12.51 |
| % delayed >15 | 31.73 | 20.41 | 19.89 | 13.34 | 18.01 |
| cancellation rate % | 0.79 | 0.54 | 0.78 | 0.61 | 0.61 |
| avg taxi-out (min) | 25.25 | 17.61 | 15.88 | 12.78 | 20.89 |
| NAS delay min/dep | 4.35 | 2.90 | 4.14 | 0.72 | 3.91 |
| long-haul share % (≥2000 mi) | 29.73 | 28.82 | 4.69 | 28.77 | 13.92 |

`data/out/faa-taf.json` — FY2024 → FY2035 forecast enplanement growth:
SFO **+39.6%** (3.08% CAGR) · BOS +28.5% · LAX +25.0% · ANC +22.8% · SNA +20.0%.

### Read on the four questions
- **SFO unmet demand** — highest forecast growth (+39.6%) *and* worst congestion of the five
  (21.75 min avg delay, 25.25 min taxi-out, 31.7% delayed). Growth demand vs congestion gap is real
  and computable from these two sources alone.
- **LAX vs SNA** — LAX has 4.3× the ops but similar delay (14.24 vs 14.05) and lower NAS delay
  (2.90 vs 4.14). SNA's congestion is not volume-driven; LAX's stage length is 1,322 mi vs SNA 805.
- **ANC long-haul** — 28.8% of domestic departures ≥2000 mi, avg stage 1,460 mi, plus 16.0%
  international departure share from T-100. Both numbers available.
- **New England** — BOS is covered; extend the `AIRPORTS` list in all three scripts to
  BDL/PVD/MHT/PWM/BTV. No source change needed, all three are IATA-filterable.

### Known gaps to state out loud in the demo
1. On-Time is **domestic-only** — LAX/SFO international ops are invisible there (T-100 covers them).
2. No published runway/gate/terminal capacity anywhere → "unmet demand" must stay a modeled proxy.
3. TAF vintage is annual (Final 2025); it will not reflect anything after FY2024 actuals.
4. `longHaulThresholdMiles = 2000` is our choice, not a BTS definition. Make it configurable.
