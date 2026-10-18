# Strata data sources

Scene identifiers, acquisition dates, original asset URLs, and quality screening are produced from the Planetary Computer STAC catalog when `research/satellite_heat.py` runs. Downloaded local windows are cached under `data/satellite/cache/`; public-facing map products and metrics are in `web/heat/`.

- [Microsoft Planetary Computer: Landsat Collection 2 Level-2](https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2) — public Landsat 8/9 Cloud-Optimized GeoTIFFs and STAC metadata used to locate scenes and read small raster windows.
- [USGS: Landsat Collection 2 Surface Temperature](https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-temperature) — surface-temperature science product and processing notes.
- [USGS: Landsat Collection 2 Level-2 Science Products](https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products) — product documentation and scale/offset conventions.
- [USGS Landsat 8–9 Collection 2 Level-2 Science Product Guide](https://www.usgs.gov/media/files/landsat-8-9-collection-2-level-2-science-product-guide) — band and quality-mask documentation.
- [OpenStreetMap](https://www.openstreetmap.org/copyright) — basemap context only; map tiles are not model inputs.

Landsat thermal observations provide satellite-derived land-surface temperature, not ground thermometers or personal heat exposure. Reflective bands and their indices are ML predictors; thermal band values are held out as the supervised target. The display’s derived model outputs are not independent observations.
