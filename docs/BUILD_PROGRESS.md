# Strata school cooling planner build progress

## Current status

**Checkpoint 5 work is saved; paused with two visual checks outstanding.** The San José research entry remains intact and the hidden-map initialization issue has been corrected. The current branch includes the saved Checkpoint 4 implementation and Checkpoint 5 map fix. Checkpoint 4 print output still needs a successful preview/PDF inspection; Checkpoint 5 still needs a phone-sized browser review. Both remain explicitly incomplete.

## Checkpoint 0: recoverable starting point

- Archive: `outputs/checkpoints/checkpoint-00-baseline.tar.gz`
- SHA-256 manifest: `outputs/checkpoints/checkpoint-00-baseline.sha256`
- Created before implementation changes. The archive contains 47 project files, including the original San José research data and case study. Generated `dist/`, `outputs/`, installed packages, and raw satellite cache were excluded.
- No Git metadata exists in this workspace; these archives are the recovery points.

## Checkpoint 1: statewide data and heat context

### Implemented

- `scripts/prepare_school_data.py` fetches both public ArcGIS services in pages, validates service counts, normalizes 2024 campus records, assigns seven-day ZIP heat forecasts by point-in-polygon lookup, and writes static JSON and source metadata to `web/planner/`.
- Dataset checks include unique source IDs, county count, California coordinates, canopy percentages, score ranges, geometry validity, service paging, unavailable data, and unmatched ZIP forecasts.
- `scripts/build.mjs` now copies the generated planner data into the static build.

### Verified results

- Campus service: **8,380 records** across **58 counties**; all campus identifiers are unique and all coordinates fall within California.
- CalHeatScore service: **1,721 dated ZIP forecast polygons**; **8,380 of 8,380** school locations matched to a forecast area. Every sample has a seven-day score list; unavailable scores remain `null`.
- The source uses `-999` for unavailable canopy percentages. These are preserved as missing values: **90** student-zone and **76** whole-property canopy values are missing in this snapshot. Remaining canopy percentages fall within 0–100.
- The snapshot date is **2026-10-21**. School canopy is from the 2024 study layer; the service does not identify its imagery acquisition date. The separate heat scores are daily ZIP-level forecasts.
- `web/planner/campuses.json` is **3,104,526 bytes**; the static build contains byte-identical copies of both generated planner JSON files.
- `python3 -c '...compile(...)...'`: downloader syntax passed. `node scripts/build.mjs`: passed. `node --test tests/analysis.test.cjs`: **11 passed**. Baseline archive checksum verified.
- A first run exposed the `-999` sentinel; the downloader now records it as missing. A source query also showed that campus pagination must order by `FID`; that request has been corrected and all pages downloaded successfully.

### Recovery point

- Archive: `outputs/checkpoints/checkpoint-01-data.tar.gz`
- SHA-256 manifest: `outputs/checkpoints/checkpoint-01-data.sha256`

### Limitations recorded

- The forecast snapshot is a daily context layer; it is not a campus thermometer, historical heat map, or seasonal climate projection.
- The campus canopy values are study estimates, not current shade audits or planting feasibility.
- The snapshot will become stale as daily forecasts change. Rerun `python3 scripts/prepare_school_data.py` before building a fresh showcase snapshot.

## Checkpoint 2: school discovery and evidence

### Implemented

- Replaced the main page with a California school finder and retained the original research page at `web/research.html`.
- Added searchable campus cards across school name, city, district, and county; map selection zooms to a campus. At statewide scale, the map groups campus points by county centroid, with a count badge; at local zoom it shows individual campuses colored by student-use canopy band.
- Added evidence cards that label student-use canopy and whole-property canopy separately, mark absent values as “Not reported,” and explain the estimates' footprint and audit limits.
- Added a dated seven-day CalHeatScore view that is explicitly identified as a community ZIP forecast, not a schoolyard temperature. Expired or missing forecasts are withheld with an explanatory status. Expiry compares the source date to the California local calendar date.
- Added an OpenStreetMap tile-error message; campus search and evidence load separately from basemap tiles. The search/results are native keyboard-accessible controls, and the layout adapts for narrow screens.
- Added a `prefers-color-scheme` dark palette using semantic surface and text tokens.
- Updated `scripts/build.mjs` to include the new app and preserved research route.

### Verified results

- Dataset smoke check confirmed **8,380 campuses**, **58 counties**, and searchable examples in Sacramento, Fresno, and San Diego.
- `node --check web/app.js` passed. `node scripts/build.mjs` passed. The existing `node --test tests/analysis.test.cjs` suite passed: **11 tests**.
- Chrome browser review at `http://127.0.0.1:8771/` showed the 8,380 total, all 58 county clusters, statewide map tiles, a Sacramento search, school evidence, and the valid seven-day forecast snapshot. A second search opened a San Diego County school. A campus with missing student-zone canopy displayed “Not reported” while retaining the available property value.
- The preserved `http://127.0.0.1:8771/research.html` route rendered the original San José page and hero Landsat image.
- Browser console log inspection returned no entries during the exercised flows. The tile-error UI is implemented; a deliberate network-block/offline injection was not performed. The dark palette was inspected in Chrome and retained readable text, controls, and campus clusters. The mobile layout is implemented but was not separately inspected in a resized phone browser.
- The forecast snapshot used for this checkpoint is dated **2026-10-21**. It is current for California local time during this review; it will expire after that local calendar date unless refreshed.

### Recovery point

- Archive: `outputs/checkpoints/checkpoint-02-discovery.tar.gz`
- SHA-256 manifest: `outputs/checkpoints/checkpoint-02-discovery.sha256`

### Limitations recorded

- County circles mark the average location of school points and show counts; they are not county boundaries or heat summaries.
- The campus list is capped at the first 50 text matches for usability; the displayed status says when the cap applies.
- A basemap outage should not gate campus data or search, but a forced offline simulation remains to be checked in the full-product verification checkpoint.
- The cooling recommendation planner, capacity calculator, printable proposal, and local drafts are not part of this checkpoint.

## Checkpoint 3: two-stage cooling planner

### Implemented

- Added an opt-in planner for the currently selected campus, with two separate horizons: near-term shade planning and longer-term canopy planning.
- Added explicit questions for urgency, confirmed usable shade, planting space, establishment watering, maintenance support, and resources. All site conditions and urgency start as “Not confirmed” or “Not set”; changing campuses resets assumptions so one school's answers do not silently carry over.
- Added deterministic, explainable rules in `web/planner-rules.js`. Confirmed existing shade can support a schedule/location pilot. Unknown shade leads to a supervised shade-walk step. A temporary structure remains a facilities-review concept; very limited resources block it as a current candidate.
- Tree planting is marked as fitting stated assumptions only when planting space, watering, maintenance, and resources are all marked available. Missing conditions request confirmation; known conflicts defer planting. Each stage shows the reason and school-review steps.
- Added explicit boundaries: user answers are planning assumptions, not campus records or field observations. The planner makes no estimates of cost, shade capacity, measured cooling, health benefits, or emissions savings.
- Added focused rule tests in `tests/planner-rules.test.cjs` and included `planner-rules.js` in the static build.

### Verified results

- `node --check web/app.js` and `node --check web/planner-rules.js` passed.
- `node --test tests/planner-rules.test.cjs tests/analysis.test.cjs`: **19 passed** (8 planner-rule checks and 11 existing research checks).
- `node scripts/build.mjs` passed. The app, rules, and data outputs were checked against their generated `dist/` copies.
- In Chrome, unknown defaults produced “Needs confirmation” and “Timing not set.” Marking all gates available changed both stages to “Fits your stated assumptions,” with facilities review still required. Removing confirmed shade and setting limited water/resources deferred structures and tree planting with reasons. Changing to another campus reset the answers to unknown.
- Browser console logs were empty during the tested planner interactions. The recommendation cards and constraint form were visually inspected in Chrome's dark appearance.

### Recovery point

- Archive: `outputs/checkpoints/checkpoint-03-planner.tar.gz`
- SHA-256 manifest: `outputs/checkpoints/checkpoint-03-planner.sha256`

### Limitations recorded

- This planner filters and explains candidate next steps; it does not establish actual school conditions, facilities approval, tree suitability, affordability, or cooling impact.
- Draft persistence, the student activity calculator, printable proposals, and CSV export are not included yet.

### Next checkpoint

Build the optional shade-opportunity calculator, printable proposal, CSV export, and local draft recovery in Checkpoint 4. Keep estimates hypothetical, cap capacity at attendance, avoid double-counting across the two horizons, preserve sources and assumptions in exports, and test reload/reset behavior. Update this log, create a verified archive and checksum, then stop for review.

## Checkpoint 4: calculator, proposal, exports, and local drafts

### Implemented

- Added `web/planner-calculator.js` for user-entered attendance, activity minutes, and separate near-term/future distinct shaded-capacity inputs. Each horizon calculates `min(attendance, capacity) × minutes` independently, clearly labels the result as a hypothetical student-minute estimate, and never derives capacity from canopy.
- Added a school proposal with dated public canopy/forecast evidence, explicit team assumptions, the two recommendation stages and review steps, optional calculations, team notes, source references, and limits. Print styling isolates the proposal.
- Added CSV download with campus/source facts, source vintage and retrieval metadata, planning answers, action/review details, separate hypothetical calculations, notes, and formula-leading text neutralization.
- Added automatic localStorage draft save/restore for campus selection, planner state, constraints, calculator inputs, and notes, plus a clear-draft action. Data stays in the current browser profile; no accounts or server storage are used.
- Added calculator and CSV utility tests; `scripts/build.mjs` copies the new browser modules.

### Verified results

- `node --check web/app.js`, `node --check web/planner-calculator.js`, and `node --check web/planner-exports.js`: passed.
- `node --test tests/analysis.test.cjs tests/planner-rules.test.cjs tests/planner-calculator.test.cjs tests/planner-exports.test.cjs`: **25 passed**.
- `node scripts/build.mjs`: passed; byte comparisons confirm the built app, styles, planner modules, and planner source data match `web/`.
- Chrome interaction review selected Anna Kirchgater Elementary in Sacramento. With 120 students, 25 minutes, capacity 36 near-term, and 90 future, the interface displayed **900** and **2,250 student-minutes** separately and labeled both hypothetical. The proposal showed distinct student-use and whole-property canopy, the ZIP forecast date, assumptions, plan rationale/review steps, and source references.
- Opened a fresh Chrome tab on the same local origin and confirmed it restored the campus, planner answers, calculator values, notes, and proposal from localStorage. The CSV button was exercised; the clear-draft action reported success. The temporary browser test draft was cleared afterward.
- Static print CSS isolates the proposal. **Outstanding check:** invoking Print reached the browser print pathway, but browser automation timed out while the native print UI was handling the request. No print preview/PDF was captured, so output pagination and margins are not visually verified. This is recorded as an incomplete criterion, not a passed check.

### Recovery point

- Archive: `outputs/checkpoints/checkpoint-04-exports.tar.gz`
- SHA-256 manifest: `outputs/checkpoints/checkpoint-04-exports.sha256`

### Limitations recorded

- The calculator uses only user-entered attendance and distinct capacity. Its output describes a hypothetical activity opportunity, not observed shade or environmental impact.
- Drafts live only in the same browser profile and device. CSV and proposal exports are the portable copies.
- The print view still needs a successful visual review in a browser print preview or captured PDF before Checkpoint 4 can be marked complete.

### Next step

The user requested continuation into Checkpoint 5 before the Checkpoint 4 print preview could be captured. The Checkpoint 4 print check remains open and should be visually completed at the next review opportunity.

## Checkpoint 5: research integration and full-product verification

### Implemented

- Preserved the original San José Landsat research at `/research.html`, the research entry points, data links, original analysis code, and scientific imagery/data assets.
- Fixed the initial research-map view when the page starts on another slide: Leaflet previously fit the study bounds while its map container was hidden, which could leave an over-zoomed first reveal. The map now invalidates its size and refits to study bounds after becoming visible, while retaining a user's prior map view when returning to the map.

### Verified results

- `node --check web/heat.js`, `node --check web/app.js`, and `node --check web/analysis.js`: passed.
- `node --test tests/analysis.test.cjs tests/planner-rules.test.cjs tests/planner-calculator.test.cjs tests/planner-exports.test.cjs`: **25 passed**. The research test verifies the six archived scientific assets remain byte-for-byte unchanged.
- `node scripts/build.mjs`: passed.
- In Chrome, direct entry to `/research.html#map-section` opened at San José study bounds (center 37.32519, -121.89004; zoom 12). Starting on the opening slide and navigating to the map also produced the correct study view after the fix. The historical heat layer, featured places, selected-location evidence, and source link rendered.
- Chrome keyboard review confirmed the map receives focus and arrow-key panning changes its reported center. Selecting two featured locations produced valid 300 m comparison cards and exposed the field-review brief link.
- A temporary failure server with `heat/grid.json` removed showed the explanatory unavailable-data alert, disabled dependent controls, and retry button. The production build served all local data successfully. No console errors were observed in these exercised pages.
- Desktop layout was visually inspected. Responsive phone breakpoints are present in the stylesheet, but this session did not successfully create a phone-sized browser viewport. The phone-size check remains incomplete.

### Recovery point

- Archive: `outputs/checkpoints/checkpoint-05-verification.tar.gz`
- SHA-256 manifest: `outputs/checkpoints/checkpoint-05-verification.sha256`

### Outstanding checks

- Visually inspect the Checkpoint 4 printable school proposal in print preview or a captured PDF; the native print UI did not yield a screenshot during the earlier browser run.
- Open the product in a phone-sized viewport and inspect school discovery, planner controls, research map, comparison cards, and export actions.
- Deliberate street-tile network failure was not injected; the product's basemap fallback is implemented but not newly exercised here.

### Next step

Resume by completing the print-preview and phone-viewport checks, fixing any issues found, updating this log, and replacing the recovery archive. Do not start Checkpoint 6 until those checks pass.

## Checkpoints remaining

2. California school discovery and evidence interface. **Complete.**
3. Two-stage cooling planner and constraint rules. **Complete.**
4. Capacity calculator, proposal exports, and local drafts. **Implementation saved; print visual check outstanding.**
5. Preserve and integrate the San José research; map fix and partial verification saved; phone visual check outstanding.
6. Prepare the showcase pitch, demo, supporting notes, and final recovery archive.
