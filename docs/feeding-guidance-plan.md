# Feeding Guidance Implementation Plan

## Product goal
Help caregivers answer “are we on track right now?” by comparing recorded feeding logs with age-aware guidance, yesterday’s baseline, and the current point in the day.

## Screen composition checklist
- [x] Add a Feeding Progress section directly below Today Context so it is visible before the timeline.
- [x] Show the baby’s current feeding stage from birth date, such as newborn week 2.
- [x] Show today’s recorded milk count, total ml, and average ml/feed.
- [x] Show an expected-by-now range that scales the daily guideline by day progress.
- [x] Show yesterday comparison using previous-day records as the first baseline.
- [x] Show a progress bar for current volume against the upper expected pace.
- [x] Include caregiver-safe guidance language and links to CDC/AAP sources.

## Implementation checklist
- [x] Keep computation in `src/domain/feeding-guidance.js` so UI rendering stays thin.
- [x] Use the baby profile birth date and optional default milk amount to select the relevant guideline.
- [x] Fetch previous-day baby logs alongside the selected day for same-window comparison.
- [x] Render a responsive Apple-style card section in `app/index.html`, `app/main.js`, and `app/styles.css`.
- [x] Add deterministic domain tests for guideline math, status classification, and yesterday comparison.
- [x] Add UI coverage for the rendered feedback card and source links.
- [x] Add/extend Playwright scenario coverage for the user-visible feeding progress flow.

## Safety and wording checklist
- [x] Say “current records” and “progress check” instead of diagnosing underfeeding/overfeeding.
- [x] Remind users to consider hunger cues, wet diapers, weight gain, and clinician guidance.
- [x] Make source links visible for guideline provenance.
- [x] Avoid browser-side provider calls or secrets.

## Source links
- CDC formula feeding: https://www.cdc.gov/infant-toddler-nutrition/formula-feeding/how-much-and-how-often.html
- AAP HealthyChildren formula amounts: https://www.healthychildren.org/English/ages-stages/baby/formula-feeding/Pages/Amount-and-Schedule-of-Formula-Feedings.aspx
- CDC newborn breastfeeding basics: https://www.cdc.gov/infant-toddler-nutrition/breastfeeding/newborn-basics.html
