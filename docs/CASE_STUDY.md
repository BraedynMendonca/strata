# San Pedro Square and Guadalupe River Park: evidence before assumptions

## Question

Do the surroundings of a familiar dining/shopping destination and a park visitor center differ in satellite-observed surface heat and vegetation? Can residents compare those surroundings without treating a screening result as a planting recommendation?

## Evidence

Acquisition: **August 31, 2025**. Both areas are 300 m radius circles around the source-checked reference points in `web/places.json`. Values below are calculated from the saved rounded display grid, not a new model run or field survey.

| Area | Center (latitude, longitude) | Valid display cells | Mean model anomaly | Mean observed anomaly | Mean NDVI | Meets original saved screen |
| --- | --- | --- | --- | --- | --- | --- |
| San Pedro Square Market surroundings | 37.336446, -121.894151 | 130 / 130 | +0.2°C | −2.2°C | 0.15 | 2.3% |
| Guadalupe River Park visitor-center surroundings | 37.341509613833, -121.903007375963 | 127 / 127 | −0.1°C | −1.6°C | 0.27 | 10.2% |

All temperatures are differences from this image's median surface temperature. NDVI is a greenness indicator, not a canopy percentage. Cell counts describe display sampling, not independent thermal observations. Neither circle crosses the study boundary.

The market surroundings have lower average greenness but also a lower observed surface anomaly than the visitor-center surroundings on this image. The model orders their average anomalies differently. This is a useful counterexample to an automatic “less green always means hotter” explanation. It shows why the observed layer, model error, and follow-up assessment matter. Neither circle is uniformly hot or cool; a circle-level mean can conceal local variation, including qualifying cells in otherwise below-median areas.

At the custom defaults (+1.0°C, NDVI < 0.25), 7.7% of market-vicinity cells and 13.4% of visitor-center-vicinity cells qualify. These differ from the original screen because the rule and precision differ. Neither percentage establishes planting feasibility or a cooling effect.

## Current observations

**Not collected.** The preset sources confirm geographic reference information. They do not establish the current condition of shade, pavement, vegetation, ownership, or public access. No partner or community endorsement has been obtained.

## Proposed follow-up

Inspect the qualifying pockets within each circle and record existing shade during occupied periods, paved surfaces, planting space, permissions, utilities, irrigation, maintenance capacity, and priorities of people using the area. Identify what greening or shade options merit professional/site review. If a project is implemented, measure its outcomes separately. Do not derive a temperature reduction or emissions saving from these comparisons.

## Reproduce

Run `node --test tests/analysis.test.cjs`. The preset comparisons are checked against an independent full-grid geographic calculation. The UI's **Compare these two places** button loads these exact centers; select **Original study screen** to reproduce the first table.
