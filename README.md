# Strata — Satellite Surface Heat in San José

A local research prototype that trains a machine-learning model on real Landsat spectral observations to predict neighborhood-scale surface-heat anomalies. The model is evaluated against later Landsat thermal observations that were excluded from training. Its map screens locations with high predicted surface heat and low greenness for further cooling research.

## The project in plain language

Cities cannot measure every block on the ground before deciding where to investigate heat. This project tests whether a computer model can use how land reflects sunlight in satellite images to point to hotter, less-green locations for follow-up.

The model’s hottest-fifth screen matched the satellite-measured hottest fifth in 49% of selected pixels on June 20, 2025, and 47% on August 31, 2025. A random selection would match about 20%. Across both dates, its typical error was about 1.93°C, compared with 2.51°C for a simple estimate that assigns every location the scene median. These are surface-temperature comparisons, not air-temperature or human-exposure measurements.

The map’s 1,621-hectare review screen is a starting area for field checks, not a count of feasible tree sites or a measured cooling benefit. The next test is to compare flagged locations with on-the-ground temperatures, canopy, water access, heat vulnerability and community priorities.

## Run the project

The saved satellite study and web map are included. Double-click `start.command`, then open <http://localhost:8765>. No API key or GPU is needed to view the demo. On a fresh Mac, run `setup.command` once to install the ML/geospatial packages and acquire the public satellite scenes.

To acquire fresh public imagery, retrain and regenerate the map products (network required):

```sh
.venv311/bin/python runoff/satellite_heat.py
.venv311/bin/python server.py
```

The acquisition script uses Landsat Collection 2 Level-2 scenes from 2022–2025 and the Planetary Computer STAC catalog. Raw scene windows and derived crops are cached locally under `data/satellite/cache/`; web-ready prediction rasters and metrics are saved under `web/heat/`.

## Research design

- **Inputs:** Landsat 8/9 surface reflectance: blue, green, red, NIR, SWIR-1 and SWIR-2; NDVI, NDBI, NDMI, NDWI; neighborhood context.
- **Target:** USGS Landsat Collection 2 surface temperature, scaled to degrees Celsius and centered within each acquisition to represent local surface-temperature anomaly.
- **Model:** ExtraTrees regression; thermal-band observations are never input features.
- **Training:** Clear summer acquisitions during 2022–2024.
- **Evaluation:** 2025 acquisitions held out by date, plus held-out spatial blocks from training years. A zero-anomaly baseline is reported alongside a linear spectral baseline.
- **Environmental use:** A screening layer combines upper-quartile predicted heat with low observed NDVI. It does not imply a location is suitable for planting or estimate the causal cooling effect of trees.

## Interpret results carefully

Landsat surface temperature is not human-level air temperature, personal heat exposure, or a measure of health risk. Data are from one path/row and one city; temporal validation spans two later satellite dates. Landsat thermal measurements are natively about 100 m and delivered resampled to 30 m; web display resampling does not create new detail. A model score does not show that a proposed intervention works. Field transects and local tree-canopy, water-access, and heat-vulnerability data are the next validation steps.

## Project files

- `runoff/satellite_heat.py` — public satellite acquisition, masking, feature engineering, training, validation and map export.
- `web/index.html`, `web/heat.css`, `web/heat.js` — pitch narrative and interactive study interface.
- `web/heat/study.json`, `web/heat/grid.json`, `web/heat/*.png` — saved 2025 predictions, observations, errors, cooling screen and evaluation metrics.
- `METHODS.md`, `SOURCES.md` — research protocol and public-source details.

The presentation contains five focused sections: the problem, the method, the evidence, the live map, and the environmental use. Sources, model details and limitations are available in the Sources & methods dialog.

To build the static Vercel output, run `node scripts/build.mjs`. Vercel serves the resulting `dist/` directory; no Python server or live model inference is needed to view the results.
