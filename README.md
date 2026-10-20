# Strata

[Open the website](https://strata-heat.vercel.app/)

We're using satellite images and machine learning to find hotter parts of San José. The question behind Strata is whether the light reflected by a neighborhood can tell us enough about its surface heat to help decide where to investigate shade and greening.

## How it works

Landsat records reflected sunlight and thermal measurements. We use six reflected-light bands, vegetation and moisture indices, and nearby surface patterns as inputs to an ExtraTrees model with 220 decision trees. The thermal measurements supply the training answers. They aren't input features.

The model trains on eight images from 2022–2024, then makes estimates for two 2025 images excluded from training. We compare those estimates with the thermal readings from the same test images. A separate check leaves out 600-meter map blocks during training-year evaluation.

The map shows degrees above or below each image's median surface temperature. It estimates relative heat on the image date, rather than forecasting tomorrow's weather.

## Results so far

| Test image | Model error (RMSE) | Baseline error (RMSE) | Hotspot precision |
| --- | --- | --- | --- |
| June 20, 2025 | 1.39°C | 2.12°C | 48.9% |
| August 31, 2025 | 2.46°C | 2.90°C | 47.3% |

The baseline assigns every location the image's median temperature. Average RMSE across the two dates was 23.1% lower with the model.

Hotspot precision asks: of the locations the model put in the hottest fifth, how many were also in the measured hottest fifth? Random selection would match about 20%.

The review layer flags roughly 16.2 km² with high estimated heat and low greenness, out of 154.8 km² mapped. Those are places to look more closely, not confirmed tree-planting sites.

## Run it locally

The saved results are included, so viewing the site only needs Python:

```sh
python3 server.py
```

Open [localhost:8765](http://localhost:8765/). The website loads the saved maps and evaluation data; you don't need an API key or a GPU.

To rebuild the satellite analysis, use Python 3.11:

```sh
python3.11 -m venv .venv311
source .venv311/bin/activate
python -m pip install -r requirements.txt
python research/satellite_heat.py
```

This downloads public scene windows from Microsoft Planetary Computer and caches them in `data/satellite/cache/`. Results go into `web/heat/`. The raw cache isn't committed.

For the static website build:

```sh
node scripts/build.mjs
```

Vercel serves the resulting `dist/` folder and deploys updates pushed to `main`.

## Where things are

- `research/satellite_heat.py`: download, preprocessing, training, evaluation, and map export.
- `web/`: the presentation, interactive map, and saved results.
- [METHODS.md](METHODS.md): the model settings, evaluation, and screening rule.
- [SOURCES.md](SOURCES.md): the satellite products and other data sources.

## What still needs checking

So far, this is one city and two later test dates. Satellite surface temperature also differs from the air temperature someone feels outside. Landsat's thermal observations have about 100 m native resolution, even though they're delivered on a 30 m grid.

We haven't measured the cooling effect of an intervention. The next step is to check flagged locations on the ground and compare them with canopy, water availability, and community priorities before recommending a project.

## Explore, compare, and prepare a field review

Choose **Explore the heat map**, then use one of three featured starting places or click inside the study footprint. You can also enter coordinates using the expandable form.

1. Select **Compare this area · 300 m** for up to three locations. Circles show the area being summarized, with modeled/observed heat, greenness and the fraction meeting review criteria.
2. Open **Explore screening criteria** to compare the original saved screen with custom thresholds. Changing criteria changes the shortlist; it does not predict cooling. The archived 16.2 km² study total is preserved.
3. Add field-review notes and open **Build a field-review brief**. Print/save a PDF through your browser, or download the numerical evidence as CSV. Remove/clear selections with a one-step undo.

Locations, notes, criteria, and map view stay in memory while navigating the five sections. Reloading resets the session. There are no accounts, submissions, analytics, or automatic downloads. The live satellite overlay and comparisons remain usable if external street-map tiles fail. Outside the study or below 80% coverage, area averages are withheld.

The three preset positions were checked against official venue/campus information and map metadata/geocoding. These summarize each location's surroundings, not the venue's property. The map is historical surface heat from August 31, 2025, not current weather or personal heat exposure.

### Checks and supporting material

```sh
node --test tests/analysis.test.cjs
node scripts/build.mjs
```

- [Case study](docs/CASE_STUDY.md): actual summaries for San Pedro Square and the park visitor-center surroundings, including limitations.
- [Usability test](docs/USABILITY_TEST.md): volunteer tasks and recording template. Participant testing is pending; no recruitment or outreach was performed automatically.
- [Implementation and verification](docs/IMPLEMENTATION.md): interaction contract, scope, browser checks and known limits.
- `tests/browser_fixture_server.py`: local-only loading, failed-data/retry, malformed-data, no-match, and failed-basemap fixtures. These are not included in the static build.
