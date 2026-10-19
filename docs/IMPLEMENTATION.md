# Strata enhancement: implementation and verification

Implemented October 18, 2026. The approved five-section satellite heat study remains the product. This is a static-site enhancement, not a new simulator or a deployment.

## UX evaluation

The map now provides a clear starting action through three searchable named places, point selection, and accessible coordinate entry. A selected location has both model and satellite values, with the historical date and temperature reference adjacent to the readouts. Comparisons show consistent 300 m circles and four understandable metrics. Advanced criteria and methods are expandable. A printable field-review brief gives the exploration a practical output.

High-priority issues resolved during verification:

- Cached scripts could mismatch newer HTML: versioned CSS/JS asset URLs load the explorer together.
- Map navigation could lose its view after hidden/print layout changes: leaving the map explicitly captures center and zoom, and returning restores them after layout invalidation.
- Arrow/Home/End shortcuts conflicted with controls: global deck handling now excludes interactive controls and the map.
- Float32 JSON noise could misclassify values displayed exactly at an NDVI threshold: custom comparisons quantize to the documented display precision.
- Very small nonzero screening rates rounded to 0.0%: global screening now gives the matching-cell count and a “Less than 0.1%” readout.
- Clearing/removing or loading case-study selections could lose notes: selection changes have one-step undo; case-study replacement is described before the action.

Design scope follows the approved plan: retain the existing light paper/pine visual identity. A dark theme was not introduced. Screen-reader certification and a full WCAG audit have not been performed. The usability verdicts below are a design review, not findings from participant testing.

## Specification and implementation impact

- `METHODS.md` documents area membership, coverage, rounded-grid thresholds, percentages and report interpretation. The original training/evaluation methods and scientific outputs are preserved.
- `README.md` describes the explorer, session behavior and verification commands. `SOURCES.md` records preset provenance. `docs/CASE_STUDY.md` records actual comparisons; `docs/USABILITY_TEST.md` provides an unfilled participant protocol.
- `web/analysis.js` is the pure calculation/report module. The same module runs in the browser and Node's test runner. The frontend remains vanilla HTML/CSS/JS with Leaflet, with no new runtime framework or service.
- `web/places.json` contains the three named reference points, addresses, coordinates, source URLs, coordinate provenance and check date. Search filters these records locally; there is no live geocoding or arbitrary-address promise.
- The build copies the new module and presets. No account, API endpoint, telemetry, backend, model-training step or cloud publication was added.

The original-screen source-grid rule and archived 16.2 km² total are distinct from custom screening. Custom thresholds default to +1.0°C and NDVI < 0.25. Both modes produce percentages with valid display cells as the denominator. Reports identify the actual criteria, date, radius and coverage. The original quartile's numerical cutoff is not available in the archived export and is not reverse-engineered.

Selections and notes are held only in session memory. Up to three areas can be added, removed or cleared; adding an area fits the selected circles into view. A one-step undo restores previous selections and their notes. Switching slides preserves selections, screen settings, zoom and center. Reloading starts a new session. User notes are escaped in HTML and protected against spreadsheet formula execution in CSV output.

States implemented: loading with disabled controls; failed/malformed data with retry; no preset match; no custom screen match; invalid/out-of-bounds coordinates; invalid point observation; boundary-crossing/low-coverage areas with withheld means; three-area limit; missing street-map tiles with usable satellite data and exports; and empty briefs with disabled export controls. Downloads are initiated only by clicking Download CSV; printing uses the native browser preview.

## Tests and browser evidence

`node --test tests/analysis.test.cjs`: **11 tests passed**. Checks include coordinate/boundary mapping, positive/inclusive heat and exclusive NDVI thresholds, float32 precision, missing-data denominators, the 80% coverage rule, boundary withholding, independent full-grid preset calculations, report/CSV contents and escaping, and SHA-256 integrity of all six archived study assets.

`node --check web/heat.js`: passed. `node scripts/build.mjs`: passed; new assets are present. Static DOM checks found no missing referenced IDs or duplicate IDs. All six files in `web/heat/` are byte-for-byte identical to the pre-change copy. The model training script was not changed or rerun.

Browser: Chrome. Main route tested: `http://localhost:8765/?v=explorer-1#map-section`; the same session visited the other four sections and methods dialog. Desktop override 1366×900 and phone override 390×844 were inspected. The phone layout had no horizontal overflow. Layer switching, preset search/no-match, adding three areas, duplicate/limit handling, notes, remove/clear/undo, custom/default/strict criteria, keyboard slider limits, map panning, section navigation, coordinate errors, boundary coverage and case-study/brief flows were exercised.

The settled map view readout remained `37.34150, -121.89955; zoom 15` across a map → impact → map round trip. Keyboard panning was allowed to settle before comparing the view, since an in-progress animation changes it by design.

The actual CSV was downloaded and parsed: all three rows, criteria and the entered note matched the brief. Chrome produced a two-page PDF. Both rendered pages were visually inspected: readable values, intact source links, clean pagination and a complete field checklist. Test artifacts are in `outputs/verified-field-review.csv` and `outputs/verified-field-review.pdf` (not deployed). The browser's download-event waiter did not resolve for the blob download, so the filesystem download and Chrome's completed-download UI supplied the verification instead.

Fault fixtures served only from `tests/browser_fixture_server.py`, on localhost:8766:

| Fixture | Observed behavior |
| --- | --- |
| `/missing-data/#map-section` | Intentional grid HTTP 503 shows an error and disabled controls; Retry succeeds. |
| `/bad-data/#map-section` | Invalid grid geometry is reported; exports remain disabled. |
| `/slow-data/#map-section` | Loading status and disabled controls appear, then recover after data arrives. |
| `/missing-tiles/#map-section` | Intentional tile HTTP 503s show the basemap warning; comparison and CSV still work. |
| `/empty-screen/#map-section` | Synthetic zero modeled anomalies produce a clear no-match message for custom screening. |

Happy-path browser warning/error log: **none** at final inspection. Local asset requests were successful. Fault-fixture 503s were intentional; no exhaustive external network trace or load/performance benchmark was recorded.

Visual artifacts: `outputs/strata-explorer-desktop.jpg`, `outputs/strata-explorer-phone.jpg` and `outputs/strata-field-brief.jpg`.

- **Kid Wow Check: PASS** — a familiar-place entry, map layers, circles and changing criteria provide an immediate, visible interaction.
- **Mom Comprehension Check: PASS** — the main flow identifies what is being compared and the next action; explicit labels distinguish historical surface heat and screening from cooling effects.

## Remaining validation and publication boundary

Volunteer testing and current field observations remain **pending**. The case study uses actual saved satellite data and source-checked reference positions; it does not claim current site observations, partner endorsement, planting feasibility, reduced temperatures or avoided emissions. The prepared usability protocol must be run with real volunteers before reporting completion rates. No messages were sent, no deployment was performed and no Git publication occurred.
