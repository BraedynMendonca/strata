# Strata

[Open the website](https://strata-heat.vercel.app/)

I'm using satellite images and machine learning to find hotter parts of San José. The question behind Strata is whether the light reflected by a neighborhood can tell us enough about its surface heat to help decide where to investigate shade and greening.

## How it works

Landsat records reflected sunlight and thermal measurements. I use six reflected-light bands, vegetation and moisture indices, and nearby surface patterns as inputs to an ExtraTrees model with 220 decision trees. The thermal measurements supply the training answers. They aren't input features.

The model trains on eight images from 2022–2024, then makes estimates for two 2025 images excluded from training. I compare those estimates with the thermal readings from the same test images. A separate check leaves out 600-meter map blocks during training-year evaluation.

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

I haven't measured the cooling effect of an intervention. The next step is to check flagged locations on the ground and compare them with canopy, water availability, and community priorities before recommending a project.
