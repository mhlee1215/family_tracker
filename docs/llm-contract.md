# LLM Contract

The parser accepts short, incomplete baby activity text and returns event candidates.

## MVP Event Types

- `sleep`
- `feeding_milk`
- `feeding_solid`
- `diaper`

## Field Sources

Each structured field must preserve provenance:

- `explicit`: user typed the value.
- `system`: app supplied the value, such as current time.
- `inferred`: app estimated the value from settings, recent data, monthly defaults, or generic defaults.
- `user_corrected`: user later changed the value.

## Field Shape

```json
{
  "value": "2026-05-23T13:10:00.000-07:00",
  "source": "system",
  "basis": "current_time",
  "confidence": 1
}
```

## Parsing Principle

The LLM should extract intent and explicit values. Deterministic domain logic should fill missing quantities, durations, and session links whenever possible.

Examples:

```text
분유 먹음 -> feeding_milk, time from current time, amount inferred
낮잠 -> sleep start, start from current time, end predicted
낮잠 잤음 -> sleep completed, end from current time, start inferred
깸 -> closes open sleep session if one exists
고구마 먹음 -> feeding_solid, time from current time, amount inferred
응가 -> diaper dirty, time from current time
```

