# Strata research methods

## Question and intended use

This study asks whether multispectral satellite reflectance can predict spatial anomalies in later Landsat surface-temperature observations across central San José. It also demonstrates a first-pass screening rule for locations with both high predicted surface heat and low greenness. The screen is intended to guide follow-up review, not to select sites automatically or estimate the effect of planting.

## Data acquisition and preprocessing

The script queries the Microsoft Planetary Computer STAC catalog for Landsat Collection 2 Level-2 scenes over a fixed San José bounding box (approximately −121.96 to −121.82 longitude; 37.27 to 37.38 latitude), June through September, 2022–2025. It keeps Landsat 8/9 path 044 row 034 scenes with catalog cloud cover below 12%, and reads only the local raster window from public Cloud-Optimized GeoTIFF assets.

Surface reflectance bands are scaled using the Collection 2 factor and offset. Reflective inputs are blue, green, red, near-infrared, shortwave-infrared 1 and 2. Derived predictors are NDVI, NDBI, NDMI and NDWI, together with 3×3 and 9×9 pixel neighborhood averages of NDVI, NDBI and NDMI (approximately 90 m and 270 m at the source grid). Fill, dilated cloud, cirrus, cloud, cloud-shadow and snow bits in QA_PIXEL are excluded. Nonfinite, nodata, and implausible values are removed.

The target is the USGS Landsat Collection 2 Level-2 surface-temperature band, using its documented scale and offset to convert to Celsius. The target for each scene is centered on that scene’s median valid surface temperature. This asks the model to find *relative local heat patterns* and avoids presenting a model trained on a few clear dates as an absolute future temperature forecast. The thermal band is not an input feature.

## Training and evaluation

All qualifying 2022–2024 scenes train an ExtraTrees regressor (220 trees, minimum leaf size 3, 0.85 feature subsampling). Samples are randomly drawn within each training scene; each contributes up to 22,000 pixels. The spatial check withholds approximately 20% of 600 m blocks, with blocks shared across scenes to avoid placing the same location in both sets.

All qualifying 2025 scenes are held out by acquisition date. Each is scored separately against observed thermal anomalies. Report MAE, RMSE and R² alongside a zero-anomaly baseline. A ridge regression on the spectral features provides a simpler spatial-block comparison. Hotspot retrieval is evaluated as precision and recall for the hottest observed fifth of pixels; random selection has an expected 20% precision. This is not a formal probability calibration.

The 2025-08-31 held-out scene supplies the displayed predicted-anomaly map, satellite-observed thermal map and prediction-error layer. Values in the web grid are resampled only for browser display. The underlying Landsat thermal observations are natively approximately 100 m and distributed resampled to a 30 m grid; pixels are not independent 30 m temperature measurements.

## Cooling-screen rule and metrics

The screen flags pixels in the top quartile of predicted positive heat anomaly with NDVI below 0.25. The reported area is a rough area estimate from the valid source grid. It is an exploratory shortlist for field review. It does not account for property ownership, planting space, underground utilities, water access, species suitability, neighborhood priorities or the likely cooling effect of a particular intervention.

Report the held-out test-date RMSE and MAE, relative change versus the zero-anomaly baseline, spatial-block R², date-specific hotspot precision/recall, valid pixel count, feature importances and screening area. The baseline comparison is a prediction benchmark; it does not imply a cooling intervention has been tested.

## Limitations and next validation

This prototype uses one Landsat path/row over one metropolitan study area, a small number of clear acquisitions and satellite surface temperature rather than air temperature. Clear-sky daytime satellite overpasses may miss nighttime and peak-afternoon conditions. Validation across only two later dates is preliminary. The model and the temperature product share a satellite acquisition, although reflective bands are separate from the held-out thermal-band target. Feature importance does not establish causal cooling effects. The low-greenness screen does not measure social vulnerability or tree-planting feasibility.

The next step is to compare held-out satellite predictions with geolocated mobile temperature transects, tree canopy and neighborhood heat-vulnerability data, then test the usefulness of candidate sites with local partners. No measured health benefit, intervention effect, or emissions reduction is claimed.

## Interactive exploration and 300 m area summaries

The website retains the archived study record and all four original raster images without alteration. A separate browser calculation summarizes the rounded geographic display grid. It does not rerun the model or simulate the effect of an intervention.

A selected area is a geodesic 300 m radius circle. Membership is determined by the distance from the selected coordinate to each display cell's center (haversine distance, spherical Earth radius 6,371,008.8 m). The map uses the same radius. Means are arithmetic averages of valid cell-center samples. This is an approximate neighborhood summary; it is not an exact area-weighted raster integral, a parcel boundary, or a set of independent thermometer measurements. Display-grid temperature inputs were rounded to 0.1°C and NDVI to 0.01 when exported. Summaries display temperature to 0.1°C and NDVI to 0.01.

A valid display sample has finite modeled temperature, observed temperature and NDVI, excluding the -999 temperature and -9 NDVI sentinels. Coverage is valid samples divided by all display cell centers inside the circle and within the grid. If the circle crosses the study boundary, outside coverage is unknown. All aggregate means and screening percentages are withheld if the circle crosses the boundary, has no cell centers, or has less than 80% valid in-grid coverage. The brief and CSV still identify the area and explain the missing coverage. Valid samples are reported for transparency, not as independent statistical observations.

### Two explicitly separate screening modes

- **Original study screen:** uses the saved `priority` mask exactly. Its source-grid definition and archived 1,620.7 ha (about 16.2 km²) total remain unchanged. The source positive-heat quartile threshold was not exported numerically; the browser does not reconstruct it from rounded values. In reports, the original threshold is identified by its source-grid quartile definition.
- **Custom display-grid screen:** a cell qualifies when its rounded modeled anomaly is strictly positive, is at least the selected heat threshold, and its rounded NDVI is strictly below the selected vegetation threshold. Defaults are +1.0°C and NDVI < 0.25. Controls range from 0–5°C in 0.5°C steps and 0.10–0.50 NDVI in 0.05 steps. Float32 representation noise is removed at the documented 0.1°C / 0.01 NDVI display precision before threshold comparisons; a displayed NDVI of 0.35 is not treated as below 0.35. The UI does not treat custom defaults as equivalent to the original mask.

For either mode, the exploratory percentage is qualifying valid display cells divided by all valid display cells, globally or within an eligible comparison circle. No display-grid area in km² is inferred. Changing these criteria changes the shortlist, not the temperature values. The original-screen impact headline always comes from the archived source analysis.

## Evidence exported for field review

A comparison holds at most three locations in session memory. Notes are user-entered and remain separate from satellite measurements. Printable briefs and CSV rows include acquisition date, center coordinates, 300 m radius, modeled/observed means, NDVI, screening definition, coverage, and notes. Incomplete areas retain missing numeric fields rather than fabricated zeroes. A signed prediction error is not an uncertainty interval. The map's selected layer is identified in the printable brief; both model and observed summary values are always provided when coverage permits.

The three named presets are geographic reference points sourced in `web/places.json`; their circles include surrounding land beyond the named venue. The current case study is documented in `docs/CASE_STUDY.md`. No current field conditions, cooling outcomes, avoided emissions, user-study results or planting feasibility are inferred from the historical image. A field checklist identifies what needs to be assessed before proposing greening, shade or building measures.
