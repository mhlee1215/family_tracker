# LLM Contract

The parser accepts short, incomplete baby activity text and returns event candidates. LLM provider parsing may return multiple events from one input when the text contains multiple baby activities; the local heuristic parser may still return one event per input.

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

## Parser Provenance

The provider response keeps formatting minimal: `{ "events": [...] }`, with one compact event object per baby activity. Provider event fields should be plain explicit values such as `amountMl: 12`, `occurredAt: "2026-05-23T13:10:00.000Z"`, or `diaperKind: "dirty"`; the server wraps those values in provenance fields before storage. Each stored structured event should include parser metadata for debugging:

```json
{
  "parser": "llm:openai",
  "parserInfo": {
    "kind": "llm",
    "provider": "openai",
    "model": "gpt-5.4-mini",
    "label": "openai · gpt-5.4-mini"
  }
}
```

Heuristic fallback events use `kind: "heuristic"` and `model: "rule-based-mvp"`.

## Stored Field Shape

Provider output uses plain values, but stored structured events use provenance wrappers:

```json
{
  "value": "2026-05-23T13:10:00.000-07:00",
  "source": "system",
  "basis": "current_time",
  "confidence": 1
}
```

LLM-extracted fields are normalized to `source: "explicit"`; missing times that the server supplies remain `source: "system"`.

## Parsing Principle

The LLM should extract intent and explicit values only, returning one event per activity when one input describes multiple activities. Deterministic domain logic should fill missing quantities, durations, and session links whenever possible. Provider outputs are normalized, provenance-wrapped, and validated server-side before storage; invalid or unavailable provider output falls back to the local heuristic parser.

Examples:

```text
분유 먹음 -> feeding_milk, time from current time, amount inferred
ate formula 12 ml at 1:20 pm today -> feeding_milk, explicit time, explicit amount
formula 12 ml and dirty diaper at 1:20 pm -> feeding_milk + diaper, shared explicit time
낮잠 -> sleep start, start from current time, end predicted
낮잠 잤음 -> sleep completed, end from current time, start inferred
깸 -> closes open sleep session if one exists
고구마 먹음 -> feeding_solid, time from current time, amount inferred
응가 -> diaper dirty, time from current time
```

