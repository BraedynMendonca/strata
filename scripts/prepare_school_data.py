"""Fetch and validate California school canopy and heat context for Strata.

Usage: python3 scripts/prepare_school_data.py

Uses curl for HTTPS requests so macOS system certificate trust is respected.
No credentials or private data are sent. Outputs are public, static JSON for
the client-only app. Campus coordinates and canopy measurements come from the
California Schoolyard Tree Canopy study; ZIP heat scores are a separate daily
CalHeatScore forecast and must never be presented as historical campus data.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "planner"
CAMPUS_LAYER = (
    "https://services1.arcgis.com/4ZKi1B1zTblbwgWB/arcgis/rest/services/"
    "FinalGSA_AGOL_2024/FeatureServer/0/query"
)
HEAT_LAYER = (
    "https://services1.arcgis.com/PCHfdHz4GlDNAhBb/arcgis/rest/services/"
    "CalHeatScore_Live_Data_for_API_Use/FeatureServer/0/query"
)
CAMPUS_FIELDS = (
    "FID,County,City,District,StPct,PropPct,FPct,CpTotEnr23,SchoolName"
)
HEAT_FIELDS = "OBJECTID,ZIP_CODE,DATE,CHS_Day_0,CHS_Day_1,CHS_Day_2,CHS_Day_3,CHS_Day_4,CHS_Day_5,CHS_Day_6"
PAGE_SIZE = 2000


def arcgis_query(endpoint: str, parameters: dict[str, object]) -> dict:
    if shutil.which("curl") is None:
        raise RuntimeError("curl is required for trusted HTTPS requests on this system.")
    command = [
        "curl", "--fail", "--silent", "--show-error", "--location",
        "--retry", "3", "--max-time", "90", "--get", endpoint,
    ]
    for key, value in parameters.items():
        command.extend(["--data-urlencode", f"{key}={value}"])
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError(f"ArcGIS request failed ({result.returncode}): {result.stderr.strip()}")
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("ArcGIS returned invalid JSON.") from error
    if "error" in data:
        raise RuntimeError(
            f"ArcGIS service error at {endpoint} with {parameters}: "
            f"{data['error'].get('message', 'unknown error')}"
        )
    return data


def feature_count(endpoint: str) -> int:
    data = arcgis_query(endpoint, {"where": "1=1", "returnCountOnly": "true", "f": "json"})
    count = data.get("count")
    if not isinstance(count, int) or count < 1:
        raise RuntimeError(f"ArcGIS returned an invalid feature count: {count!r}")
    return count


def fetch_features(endpoint: str, fields: str, *, geometry: bool, expected: int) -> list[dict]:
    features: list[dict] = []
    for offset in range(0, expected, PAGE_SIZE):
        data = arcgis_query(endpoint, {
            "where": "1=1",
            "outFields": fields,
            "returnGeometry": "true" if geometry else "false",
            "outSR": "4326",
            "orderByFields": f"{fields.split(',')[0]} ASC",
            "resultOffset": offset,
            "resultRecordCount": PAGE_SIZE,
            "f": "json",
        })
        page = data.get("features")
        if not isinstance(page, list) or not page:
            raise RuntimeError(f"ArcGIS returned an empty page at offset {offset} of {expected}.")
        features.extend(page)
        print(f"Fetched {min(offset + len(page), expected):,} of {expected:,} records", flush=True)
        if len(page) > PAGE_SIZE or len(features) > expected:
            raise RuntimeError("ArcGIS returned more records than requested.")
    if len(features) != expected:
        raise RuntimeError(f"Downloaded {len(features):,} records; the service reports {expected:,}.")
    if len({f.get("attributes", {}).get(fields.split(",")[0]) for f in features}) != expected:
        raise RuntimeError("A source page contains duplicate or missing feature identifiers.")
    return features


def number_or_none(value: object) -> float | None:
    if value is None or value == "":
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    # The campus service uses -999 for unavailable numeric observations.
    return parsed if math.isfinite(parsed) and parsed != -999 else None


def valid_percentage(value: object, field: str, campus: str) -> float | None:
    parsed = number_or_none(value)
    if parsed is not None and not 0 <= parsed <= 100:
        raise RuntimeError(f"{campus}: {field} is outside 0–100: {parsed}")
    return parsed


def point_in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    """Return containment including boundary points for one closed ring."""
    inside = False
    previous = ring[-1]
    for current in ring:
        x1, y1 = previous[0], previous[1]
        x2, y2 = current[0], current[1]
        cross = (lon - x1) * (y2 - y1) - (lat - y1) * (x2 - x1)
        if abs(cross) < 1e-10 and min(x1, x2) - 1e-10 <= lon <= max(x1, x2) + 1e-10 and min(y1, y2) - 1e-10 <= lat <= max(y1, y2) + 1e-10:
            return True
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
        previous = current
    return inside


def make_heat_areas(features: list[dict]) -> list[dict]:
    areas = []
    for feature in features:
        attributes = feature.get("attributes", {})
        rings = feature.get("geometry", {}).get("rings", [])
        zipcode = str(attributes.get("ZIP_CODE") or "").strip()
        if not zipcode or not rings:
            continue
        area_rings = []
        for ring in rings:
            if len(ring) < 4 or any(len(point) < 2 or not all(math.isfinite(float(v)) for v in point[:2]) for point in ring):
                raise RuntimeError(f"ZIP {zipcode} contains malformed boundary geometry.")
            xs = [point[0] for point in ring]
            ys = [point[1] for point in ring]
            area_rings.append({"extent": [min(xs), min(ys), max(xs), max(ys)], "points": ring})
        date = str(attributes.get("DATE") or "").strip()
        scores = []
        for day in range(7):
            raw = attributes.get(f"CHS_Day_{day}")
            try:
                score = int(raw) if raw not in (None, "") else None
            except (TypeError, ValueError):
                score = None
            if score is not None and score not in range(5):
                raise RuntimeError(f"ZIP {zipcode}: heat score is outside 0–4: {score}")
            scores.append(score)
        areas.append({"zip": zipcode, "date": date, "scores": scores, "rings": area_rings})
    if not areas:
        raise RuntimeError("The CalHeatScore service returned no ZIP polygons with valid geometry.")
    if len({area["zip"] for area in areas}) != len(areas):
        raise RuntimeError("The CalHeatScore service returned duplicate ZIP polygons.")
    return areas


def lookup_heat(lon: float, lat: float, areas: list[dict]) -> dict | None:
    for area in areas:
        contains = False
        for ring in area["rings"]:
            min_x, min_y, max_x, max_y = ring["extent"]
            if min_x - 1e-9 <= lon <= max_x + 1e-9 and min_y - 1e-9 <= lat <= max_y + 1e-9:
                if point_in_ring(lon, lat, ring["points"]):
                    contains = not contains
        if contains:
            return {"zip": area["zip"], "date": area["date"], "days": area["scores"]}
    return None


def build() -> tuple[dict, dict]:
    campus_total = feature_count(CAMPUS_LAYER)
    heat_total = feature_count(HEAT_LAYER)
    print(f"Service counts: {campus_total:,} campuses; {heat_total:,} ZIP forecasts", flush=True)
    campus_features = fetch_features(CAMPUS_LAYER, CAMPUS_FIELDS, geometry=True, expected=campus_total)
    heat_features = fetch_features(HEAT_LAYER, HEAT_FIELDS, geometry=True, expected=heat_total)
    heat_areas = make_heat_areas(heat_features)

    campuses = []
    counties: set[str] = set()
    missing_fields: Counter[str] = Counter()
    unmatched_heat = 0
    seen_ids: set[str] = set()
    for feature in campus_features:
        attributes = feature.get("attributes", {})
        geometry = feature.get("geometry", {})
        identifier = attributes.get("FID")
        name = str(attributes.get("SchoolName") or "").strip()
        county = str(attributes.get("County") or "").strip()
        city = str(attributes.get("City") or "").strip()
        district = str(attributes.get("District") or "").strip()
        coordinates = [number_or_none(geometry.get("x")), number_or_none(geometry.get("y"))]
        if identifier is None or not name or not county or any(point is None for point in coordinates):
            raise RuntimeError(f"Campus record lacks a source identifier, name, county, or point: {attributes!r}")
        lon, lat = coordinates
        if not (-125 <= lon <= -113 and 32 <= lat <= 43):
            raise RuntimeError(f"{name}, {county}: coordinates fall outside California: {coordinates!r}")
        campus_id = f"gsa-2024:{identifier}"
        if campus_id in seen_ids:
            raise RuntimeError(f"Duplicate campus identifier: {campus_id}")
        seen_ids.add(campus_id)
        campus = {
            "id": campus_id,
            "name": name,
            "city": city or None,
            "district": district or None,
            "county": county,
            "coordinates": [lon, lat],
            "studentZoneCanopyPct": valid_percentage(attributes.get("StPct"), "student-zone canopy", name),
            "propertyCanopyPct": valid_percentage(attributes.get("PropPct"), "property canopy", name),
            "sourceEnrollment": number_or_none(attributes.get("CpTotEnr23")),
            "sourceMealsEligibilityPct": valid_percentage(attributes.get("FPct"), "source meals eligibility", name),
        }
        for field in ("studentZoneCanopyPct", "propertyCanopyPct"):
            if campus[field] is None:
                missing_fields[field] += 1
        heat = lookup_heat(lon, lat, heat_areas)
        if heat is None:
            unmatched_heat += 1
        campus["heatForecast"] = heat
        campuses.append(campus)
        counties.add(county)

    if len(campuses) != campus_total:
        raise RuntimeError(f"Campus count changed during processing: {len(campuses)} of {campus_total}.")
    if len(counties) != 58:
        raise RuntimeError(f"Expected California coverage across 58 counties; found {len(counties)}.")

    retrieved_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    source_manifest = {
        "retrievedAt": retrieved_at,
        "campuses": {
            "name": "California Schoolyard Tree Canopy Equity Study, Green Schoolyards America with GreenInfo Network and California Department of Education school data",
            "serviceUrl": "https://services1.arcgis.com/4ZKi1B1zTblbwgWB/arcgis/rest/services/FinalGSA_AGOL_2024/FeatureServer/0",
            "studyUrl": "https://www.greenschoolyards.org/tree-canopy-equity",
            "serviceTitle": "FinalGSA_AGOL_2024",
            "featureCount": campus_total,
            "countyCount": len(counties),
            "fields": {
                "studentZoneCanopyPct": "StPct: reported percent tree canopy in student-use zones",
                "propertyCanopyPct": "PropPct: reported tree canopy percent across the entire property",
                "sourceEnrollment": "CpTotEnr23: source-reported enrollment; the field suffix is retained and not recast as current enrollment",
                "sourceMealsEligibilityPct": "FPct: source-reported percent qualifying for free or reduced-price meals; optional context only, not used to rank schools",
                "coordinates": "Source campus point in longitude, latitude order",
            },
            "studyVintage": "2024 study layer; source imagery acquisition date is not specified in the service metadata",
            "counties": sorted(counties),
        },
        "heatForecast": {
            "name": "CalHeatScore California ZIP-code daily forecast, California Environmental Protection Agency and Office of Environmental Health Hazard Assessment",
            "serviceUrl": "https://services1.arcgis.com/PCHfdHz4GlDNAhBb/arcgis/rest/services/CalHeatScore_Live_Data_for_API_Use/FeatureServer/0",
            "documentationUrl": "https://calheatscore.calepa.ca.gov/api/",
            "zipAreaCount": len(heat_areas),
            "matchedCampusCount": len(campuses) - unmatched_heat,
            "unmatchedCampusCount": unmatched_heat,
            "meaning": "Daily community heat-health forecast, separate from school canopy and Landsat evidence",
            "fields": {"zip": "ZIP_CODE", "date": "DATE", "days": "CHS_Day_0 through CHS_Day_6; daily forecast scores 0–4; null denotes unavailable"},
        },
        "missingCampusValues": dict(missing_fields),
        "missingValueSentinels": {"numeric": -999},
        "limitations": [
            "Campus canopy is a study estimate; it is not a real-time shade audit, temperature reading, or verified intervention opportunity.",
            "Student-zone and whole-property canopy describe different footprints and must not be subtracted to infer usable canopy area.",
            "CalHeatScore is a daily ZIP-level heat-health forecast; it is not a measurement of schoolyard temperature or a seasonal climate projection.",
            "An unmatched or unavailable ZIP forecast remains null; it is never converted to a zero-risk score.",
        ],
    }
    payload = {"schemaVersion": 1, "retrievedAt": retrieved_at, "source": "gsa-2024", "campuses": campuses}
    return payload, source_manifest


def main() -> int:
    try:
        payload, source_manifest = build()
    except Exception as error:
        print(f"Data preparation failed: {error}", file=sys.stderr)
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "campuses.json").write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    (OUT / "sources.json").write_text(json.dumps(source_manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "campuses": len(payload["campuses"]),
        "counties": source_manifest["campuses"]["countyCount"],
        "matchedHeatForecasts": source_manifest["heatForecast"]["matchedCampusCount"],
        "unmatchedHeatForecasts": source_manifest["heatForecast"]["unmatchedCampusCount"],
        "missingCanopyValues": source_manifest["missingCampusValues"],
        "output": str(OUT.relative_to(ROOT)),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
