"""Train and evaluate a satellite-only urban surface-heat screening model.

Sentinel-compatible Landsat surface-reflectance bands are model inputs. The
USGS Landsat surface-temperature band is the independent prediction target.
2025 scenes are held out by acquisition date for temporal evaluation.
"""
from __future__ import annotations

import argparse
import json
import math
import urllib.parse
import urllib.request
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import array_bounds
from rasterio.warp import reproject, transform_bounds
from rasterio.windows import from_bounds
from sklearn.ensemble import ExtraTreesRegressor, RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.metrics import precision_score, recall_score, f1_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "heat"
RAW = ROOT / "data" / "satellite" / "cache"
BBOX = [-121.96, 37.27, -121.82, 37.38]
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
TOKEN = "https://planetarycomputer.microsoft.com/api/sas/v1/token/landsat-c2-l2"
SAS_QUERY = None


def get_json(url: str, payload: dict | None = None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", "User-Agent": "SanJoseHeatResearch/1.0"})
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.load(response)


def scenes():
    query = {"collections": ["landsat-c2-l2"], "bbox": BBOX,
             "datetime": "2022-06-01/2025-09-30", "limit": 100,
             "query": {"eo:cloud_cover": {"lt": 12}}}
    data = get_json(STAC, query)
    found = []
    for item in data.get("features", []):
        ident = item["id"]
        date = item["properties"]["datetime"][:10]
        if not ident.startswith(("LC08_L2SP_044034", "LC09_L2SP_044034")):
            continue
        month = int(date[5:7])
        if month not in (6, 7, 8, 9):
            continue
        found.append(item)
    return sorted(found, key=lambda x: x["properties"]["datetime"])


def signed(href: str) -> str:
    global SAS_QUERY
    if SAS_QUERY is None:
        # One container-scoped SAS token authenticates every COG asset in this
        # public collection, avoiding a per-band signing request and throttling.
        SAS_QUERY = "?" + get_json(TOKEN)["token"]
    return href + SAS_QUERY


def read_scene(item):
    RAW.mkdir(parents=True, exist_ok=True)
    cache = RAW / f"{item['id']}_context.npz"
    if cache.exists():
        with np.load(cache, allow_pickle=False) as c:
            result = {key: c[key] for key in c.files}
        from affine import Affine
        from rasterio.crs import CRS
        result["transform"] = Affine(*result["transform"].tolist())
        result["crs"] = CRS.from_string(str(result["crs"]))
        for key in ("date", "id"):
            result[key] = str(result[key])
        for key in ("width", "height", "cloud", "sun_elevation"):
            result[key] = float(result[key])
        result["width"], result["height"] = int(result["width"]), int(result["height"])
        return result
    bands = ("blue", "green", "red", "nir08", "swir16", "swir22", "lwir11", "qa_pixel")
    crop = None
    result = {}
    for key in bands:
        asset = item["assets"][key]
        with rasterio.open(signed(asset["href"])) as ds:
            if crop is None:
                projected = transform_bounds("EPSG:4326", ds.crs, *BBOX, densify_pts=21)
                crop = from_bounds(*projected, transform=ds.transform).round_offsets().round_lengths()
                crop = crop.intersection(rasterio.windows.Window(0, 0, ds.width, ds.height))
                transform = ds.window_transform(crop)
            arr = ds.read(1, window=crop).astype(np.float32)
            nodata = ds.nodata
            result[key] = arr
            if key == "blue":
                crs = ds.crs
                width, height = int(crop.width), int(crop.height)
    qa = result.pop("qa_pixel").astype(np.uint16)
    # USGS QA_PIXEL bits: fill, dilated cloud, cirrus, cloud, shadow, snow.
    invalid = np.zeros(qa.shape, dtype=bool)
    for bit in range(6):
        invalid |= (qa & (1 << bit)) != 0
    raw_temp = result.pop("lwir11")
    temp = raw_temp * 0.00341802 + 149.0 - 273.15
    reflectance = {}
    for key, raw in result.items():
        reflectance[key] = raw * 0.0000275 - 0.2
        invalid |= raw == 0
    invalid |= (raw_temp == 0) | ~np.isfinite(temp) | (temp < -10) | (temp > 70)
    b = reflectance
    eps = 1e-6
    ndvi = (b["nir08"] - b["red"]) / (b["nir08"] + b["red"] + eps)
    ndbi = (b["swir16"] - b["nir08"]) / (b["swir16"] + b["nir08"] + eps)
    ndmi = (b["nir08"] - b["swir16"]) / (b["nir08"] + b["swir16"] + eps)
    ndwi = (b["green"] - b["nir08"]) / (b["green"] + b["nir08"] + eps)
    # Spectral reflectance, indices, and 90/270m context; no thermal input.
    from scipy.ndimage import uniform_filter
    valid = ~invalid
    weights = valid.astype(np.float32)
    def neighborhood(a, size):
        count = uniform_filter(weights, size=size, mode="nearest")
        vals = uniform_filter(np.where(valid, a, 0).astype(np.float32), size=size, mode="nearest")
        return vals / np.maximum(count, 1e-4)
    base = [b[k] for k in ("blue", "green", "red", "nir08", "swir16", "swir22")] + [ndvi, ndbi, ndmi, ndwi]
    context = [neighborhood(v, size) for v in (ndvi, ndbi, ndmi) for size in (3, 9)]
    features = np.stack(base + context, axis=-1)
    invalid |= ~np.isfinite(features).all(axis=-1)
    invalid |= (np.abs(features) > 2).any(axis=-1)
    valid = ~invalid
    target = temp - float(np.nanmedian(temp[valid])) if valid.any() else temp * np.nan
    result = {"features": features, "target": target.astype(np.float32), "temp": temp,
            "ndvi": ndvi.astype(np.float32), "valid": valid, "transform": transform,
            "crs": crs, "width": width, "height": height,
            "date": item["properties"]["datetime"][:10], "id": item["id"],
            "cloud": float(item["properties"].get("eo:cloud_cover", 0)),
            "sun_elevation": float(item["properties"].get("view:sun_elevation", 0) or 0)}
    # Compact local cache makes training reruns independent of remote COG access.
    cacheable = {k: np.asarray(v) for k, v in result.items()}
    cacheable["transform"] = np.asarray(tuple(transform)[:6], dtype=np.float64)
    cacheable["crs"] = np.asarray(str(crs))
    np.savez_compressed(cache, **cacheable)
    return result


def score(y, pred):
    return {"mae_c": float(mean_absolute_error(y, pred)),
            "rmse_c": float(np.sqrt(mean_squared_error(y, pred))),
            "r2": float(r2_score(y, pred)),
            "baseline_mae_c": float(mean_absolute_error(y, np.zeros_like(y))),
            "baseline_rmse_c": float(np.sqrt(mean_squared_error(y, np.zeros_like(y))))}


def to_geographic(array, transform, crs, out_shape, resampling=Resampling.nearest):
    west, south, east, north = array_bounds(array.shape[0], array.shape[1], transform)
    geographic_bounds = transform_bounds(crs, "EPSG:4326", west, south, east, north, densify_pts=21)
    lon0, lat0, lon1, lat1 = geographic_bounds
    h, w = out_shape
    dst_transform = rasterio.transform.from_bounds(lon0, lat0, lon1, lat1, w, h)
    dst = np.full(out_shape, np.nan, dtype=np.float32)
    reproject(array.astype(np.float32), dst, src_transform=transform, src_crs=crs,
              dst_transform=dst_transform, dst_crs="EPSG:4326", src_nodata=np.nan,
              dst_nodata=np.nan, resampling=resampling)
    return dst, geographic_bounds


def ramp(values, mask, limits):
    lo, hi = limits
    t = np.clip((np.nan_to_num(values, nan=lo) - lo) / max(hi - lo, 1e-6), 0, 1)
    stops = np.asarray([[41, 95, 140], [74, 157, 151], [239, 205, 108], [220, 93, 53], [115, 31, 35]], dtype=np.float32)
    x = t * (len(stops) - 1)
    i = np.minimum(x.astype(int), len(stops) - 2)
    rgba = np.zeros((*values.shape, 4), dtype=np.uint8)
    mix = (x - i)[..., None]
    rgb = stops[i] * (1 - mix) + stops[i + 1] * mix
    rgba[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    rgba[..., 3] = np.where(mask, 210, 0).astype(np.uint8)
    return rgba


def save_image(name, values, mask, limits, bounds):
    img = Image.fromarray(ramp(values, mask, limits), "RGBA")
    img.save(OUT / name, optimize=True)
    return {"url": "heat/" + name, "min": float(limits[0]), "max": float(limits[1])}


def build(sample_per_scene=22000, seed=41):
    OUT.mkdir(parents=True, exist_ok=True)
    items = scenes()
    # All clear summer acquisitions through 2024 train the model; both clear
    # 2025 dates are held out for temporal evaluation.
    historical = [x for x in items if int(x["properties"]["datetime"][:4]) < 2025]
    train_items = historical
    test_items = [x for x in items if int(x["properties"]["datetime"][:4]) == 2025]
    if len(train_items) < 3 or len(test_items) < 2:
        raise RuntimeError(f"Need >=3 training scenes and >=2 held-out 2025 scenes; got {len(train_items)}, {len(test_items)}")
    data = []
    selected = train_items + test_items
    for item in selected:
        scene = read_scene(item)
        data.append(scene)
        print(scene["date"], scene["id"], f'{scene["valid"].mean()*100:.1f}% usable pixels', flush=True)
    rng = np.random.default_rng(seed)
    Xs, ys, groups = [], [], []
    for scene in data:
        if scene["date"] >= "2025-01-01":
            continue
        rows, cols = np.where(scene["valid"])
        if len(rows) > sample_per_scene:
            take = rng.choice(len(rows), sample_per_scene, replace=False)
            rows, cols = rows[take], cols[take]
        Xs.append(scene["features"][rows, cols])
        ys.append(scene["target"][rows, cols])
        # Spatially blocked holdout at approx. 600 m, reused across dates.
        groups.append((rows // 20) * 10000 + (cols // 20))
    X, y, g = np.concatenate(Xs), np.concatenate(ys), np.concatenate(groups)
    split = GroupShuffleSplit(n_splits=1, test_size=.2, random_state=seed)
    tr, va = next(split.split(X, y, groups=g))
    model = ExtraTreesRegressor(n_estimators=220, min_samples_leaf=3, max_features=.85,
                                n_jobs=-1, random_state=seed)
    model.fit(X[tr], y[tr])
    spatial_pred = model.predict(X[va])
    spatial_metrics = score(y[va], spatial_pred)
    baseline = make_pipeline(StandardScaler(), Ridge(alpha=2.0)).fit(X[tr], y[tr])
    baseline_metrics = score(y[va], baseline.predict(X[va]))
    # Train on all pre-2025 acquisitions, then evaluate on two 2025 dates.
    model.fit(X, y)
    test_metrics = []
    for scene in (s for s in data if s["date"] >= "2025-01-01"):
        valid = scene["valid"]
        rows, cols = np.where(valid)
        pred = np.full(valid.shape, np.nan, dtype=np.float32)
        pred[rows, cols] = model.predict(scene["features"][rows, cols])
        yy = scene["target"][valid]
        pp = pred[valid]
        if len(yy) > 30000:
            idx = rng.choice(len(yy), 30000, replace=False)
            yy, pp = yy[idx], pp[idx]
        hot_cut, pred_cut = np.quantile(yy, .8), np.quantile(pp, .8)
        hot_true, hot_pred = yy >= hot_cut, pp >= pred_cut
        test_metrics.append({"date": scene["date"], "scene": scene["id"], "valid_pixels": int(valid.sum()), **score(yy, pp),
            "hottest_quintile_precision": float(precision_score(hot_true, hot_pred, zero_division=0)),
            "hottest_quintile_recall": float(recall_score(hot_true, hot_pred, zero_division=0)),
            "hottest_quintile_f1": float(f1_score(hot_true, hot_pred, zero_division=0))})
        scene["pred"] = pred
    # Latest held-out clear scene is rendered as a prediction/evidence comparison.
    target_scene = max((s for s in data if "pred" in s), key=lambda x: x["date"])
    valid = target_scene["valid"]
    pred, observed = target_scene["pred"], target_scene["target"]
    error = pred - observed
    ndvi = target_scene["ndvi"]
    positive = valid & (pred > 0)
    q75 = float(np.nanpercentile(pred[positive], 75)) if positive.any() else 0.0
    priority = valid & (pred > 0) & (pred >= q75) & (ndvi < .25)
    # Resample to a browser-ready lat/lon grid, preserving a visible 30–60m scale.
    out_h = max(150, int(target_scene["height"] * .65))
    out_w = max(150, int(target_scene["width"] * .65))
    shape = (out_h, out_w)
    pred_geo, bounds = to_geographic(pred, target_scene["transform"], target_scene["crs"], shape)
    obs_geo, _ = to_geographic(observed, target_scene["transform"], target_scene["crs"], shape)
    err_geo, _ = to_geographic(error, target_scene["transform"], target_scene["crs"], shape)
    ndvi_geo, _ = to_geographic(ndvi, target_scene["transform"], target_scene["crs"], shape)
    valid_geo = np.isfinite(pred_geo) & np.isfinite(obs_geo)
    priority_geo = valid_geo & (pred_geo > 0) & (pred_geo >= q75) & (ndvi_geo < .25)
    # Ensure north is at the top; raster warp retains north-up orientation.
    limit = float(np.nanpercentile(np.abs(np.concatenate([pred_geo[valid_geo], obs_geo[valid_geo]])), 97))
    images = {
        "prediction": save_image("predicted-anomaly.png", pred_geo, valid_geo, (-limit, limit), bounds),
        "observed": save_image("observed-anomaly.png", obs_geo, valid_geo, (-limit, limit), bounds),
        "error": save_image("prediction-error.png", err_geo, valid_geo, (-max(2, limit / 2), max(2, limit / 2)), bounds),
        "priority": save_image("cooling-screen.png", pred_geo, priority_geo, (-limit, limit), bounds),
    }
    # Compact click-inspection grid; values rounded to 0.1C and greenness to 0.01.
    grid = {"bounds": bounds, "shape": list(shape),
            "predicted_c": np.where(np.isfinite(pred_geo), np.round(pred_geo, 1), -999).tolist(),
            "observed_c": np.where(np.isfinite(obs_geo), np.round(obs_geo, 1), -999).tolist(),
            "error_c": np.where(np.isfinite(err_geo), np.round(err_geo, 1), -999).tolist(),
            "ndvi": np.where(np.isfinite(ndvi_geo), np.round(ndvi_geo, 2), -9).tolist(),
            "priority": priority_geo.astype(np.uint8).tolist()}
    (OUT / "grid.json").write_text(json.dumps(grid, separators=(",", ":")))
    names = ["Blue", "Green", "Red", "NIR", "SWIR-1", "SWIR-2", "NDVI", "NDBI", "NDMI", "NDWI", "NDVI 90m", "NDVI 270m", "NDBI 90m", "NDBI 270m", "NDMI 90m", "NDMI 270m"]
    importance = sorted(zip(names, model.feature_importances_), key=lambda x: -x[1])
    total_area_ha = float(valid.sum() * .09)
    priority_area_ha = float(priority.sum() * .09)
    summary = {
        "title": "Satellite-based urban surface-heat screening",
        "site": "San José, California (downtown and adjacent neighborhoods)",
        "bbox": bounds, "grid_shape": list(shape), "grid_file": "heat/grid.json", "images": images,
        "input_source": "Landsat 8/9 Collection 2 Level-2 surface reflectance (blue, green, red, NIR, SWIR1, SWIR2) and spectral indices.",
        "target_source": "USGS Landsat Collection 2 Level-2 surface temperature (thermal band), converted to °C and centered within acquisition to measure neighborhood heat anomaly.",
        "train_years": sorted({s["date"][:4] for s in data if s["date"] < "2025-01-01"}),
        "train_scenes": [s["id"] for s in data if s["date"] < "2025-01-01"],
        "scene_inventory": [{"id": s["id"], "date": s["date"], "role": "training" if s["date"] < "2025-01-01" else "held-out evaluation", "catalog_cloud_cover_pct": s["cloud"], "catalog_record": f"https://planetarycomputer.microsoft.com/api/stac/v1/collections/landsat-c2-l2/items/{s['id']}"} for s in data],
        "test_scenes": test_metrics,
        "spatial_holdout": {"split": "Held-out 600m spatial blocks across the 2022–2024 training acquisitions", "n": int(len(va)), **spatial_metrics},
        "spectral_baseline": {"model": "Ridge regression on the same spectral features", "mae_c": baseline_metrics["mae_c"], "rmse_c": baseline_metrics["rmse_c"], "r2": baseline_metrics["r2"]},
        "model": "ExtraTrees regression; 220 trees; minimum leaf 3; six reflectance bands, four spectral indices and 90/270m neighborhood context; no thermal input features.",
        "prediction_date": target_scene["date"], "prediction_scene": target_scene["id"],
        "cloud_cover_scene_pct": target_scene["cloud"], "valid_pixels": int(valid.sum()),
        "modeled_area_km2": round(total_area_ha / 100, 1), "cooling_screen_area_ha": round(priority_area_ha, 1),
        "cooling_screen_definition": "Upper quartile of positive predicted surface-heat anomaly and NDVI below 0.25. Screening only; does not establish planting feasibility or cooling causality.",
        "feature_importance": [{"feature": k, "importance": float(v)} for k, v in importance],
        "temperature_reference": "Anomaly relative to the median valid surface temperature in each acquisition, not absolute air temperature.",
        "limits": ["Thermal surface temperature is not human-level air temperature or personal heat exposure.", "The model predicts spatial patterns from reflective bands; the thermal band is held out as the target, not used as an input.", "Evaluation dates are temporally held out (2025) and spatial-block evaluation is also reported; all are from the same Landsat path/row and one San José AOI.", "A cooling-screen pixel is not a planting recommendation. Shade feasibility, water availability, equity, tree survival, and actual cooling effect require field and community validation.", "Landsat pixels are 30 m; geospatial resampling is for web display and does not create finer measured resolution."],
        "source_urls": ["https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2", "https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-temperature", "https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products"],
        "generated_utc": datetime.now(timezone.utc).isoformat(),
    }
    (OUT / "study.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps({"spatial": summary["spatial_holdout"], "temporal": test_metrics,
                      "priority_ha": summary["cooling_screen_area_ha"], "scene_count": len(data), "importance": importance}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-per-scene", type=int, default=22000)
    parser.add_argument("--seed", type=int, default=41)
    args = parser.parse_args()
    build(args.sample_per_scene, args.seed)
