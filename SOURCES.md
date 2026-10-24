# Strata data sources

Scene identifiers, acquisition dates, original asset URLs, and quality screening are produced from the Planetary Computer STAC catalog when `research/satellite_heat.py` runs. Downloaded local windows are cached under `data/satellite/cache/`; public-facing map products and metrics are in `web/heat/`.

- [Microsoft Planetary Computer: Landsat Collection 2 Level-2](https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2) — public Landsat 8/9 Cloud-Optimized GeoTIFFs and STAC metadata used to locate scenes and read small raster windows.
- [USGS: Landsat Collection 2 Surface Temperature](https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-temperature) — surface-temperature science product and processing notes.
- [USGS: Landsat Collection 2 Level-2 Science Products](https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products) — product documentation and scale/offset conventions.
- [USGS Landsat 8–9 Collection 2 Level-2 Science Product Guide](https://www.usgs.gov/media/files/landsat-8-9-collection-2-level-2-science-product-guide) — band and quality-mask documentation.
- [OpenStreetMap](https://www.openstreetmap.org/copyright) — basemap context only; map tiles are not model inputs.

Landsat thermal observations provide satellite-derived land-surface temperature, not ground thermometers or personal heat exposure. Reflective bands and their indices are ML predictors; thermal band values are held out as the supervised target. The display’s derived model outputs are not independent observations.

## California school cooling planner

- [California Schoolyard Tree Canopy Equity Study](https://www.greenschoolyards.org/tree-canopy-equity) — statewide campus records and separate estimates for student-use areas and the whole property. The study layer is labeled 2024; the service does not specify its imagery acquisition date.
- The school evidence panel uses a statewide canopy benchmark derived from the same 2024 campus records: it reports the share of campuses under 10% student-use canopy and compares the selected campus with reporting schools. Missing canopy values are excluded, ties are reported separately, and the comparison is descriptive rather than a cooling or shade-access estimate.
- [CalHeatScore API documentation](https://calheatscore.calepa.ca.gov/api/) — reviewed as an optional forecast source. On October 23, 2026, its live feed returned score 0 (Low) for the current day across all 1,721 California ZIP areas, so the forecast card was replaced with the more useful campus-canopy benchmark. This ZIP-level forecast is not a schoolyard temperature or historical canopy measure.

## Featured starting places (checked October 18, 2026)

- [San Pedro Square Market — Visit San Jose](https://www.sanjose.org/listings/san-pedro-square-market): 87 North San Pedro Street. The listing's map metadata supplies 37.336446, -121.894151.
- [San José State University main campus](https://www.sjsu.edu/map/index.php): official campus address One Washington Square. ArcGIS World Geocoding matched the campus POI at 37.3357957, -121.882134 (100 match score).
- [Guadalupe River Park Conservancy visitor center](https://grpg.org/visit/guadalupe-gardens/visitor-and-education-center/): official address 438 Coleman Avenue. ArcGIS World Geocoding matched that address at 37.341509613833, -121.903007375963 (PointAddress; 100 match score).

ArcGIS was used only to check reference positions during development. There are no runtime geocoding requests. Coordinates designate the centers of neighborhood comparison circles, not precise boundaries or permission to access the properties. Original-source URLs, coordinate provenance and check date are included in `web/places.json`.
