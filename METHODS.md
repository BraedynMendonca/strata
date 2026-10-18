# Satellite surface-heat study methods

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
