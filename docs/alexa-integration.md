# Alexa Interface Integration (MVP)

This document defines the Alexa-to-Family-Tracker interface.

## Scope

- In scope: Alexa custom skill and server integration contract.
- Out of scope: natural-language parsing internals (handled by Family Tracker domain logic).

## High-level flow

1. User speaks a command to Alexa.
2. Alexa invokes a custom skill intent (`RecordIntent`).
3. AWS Lambda receives the intent and extracts `task_text`.
4. Lambda calls Family Tracker integration API.
5. Family Tracker routes the text internally and stores either a baby log or a task.

## Endpoint

Preferred unified endpoint:

`POST /api/integrations/alexa/record`

Task-only compatibility endpoint:

`POST /api/integrations/alexa/task`

### Authentication

Use Bearer token from Lambda:

```http
Authorization: Bearer <ALEXA_INTEGRATION_TOKEN>
```

- Configure `ALEXA_INTEGRATION_TOKEN` on both Lambda and Family Tracker server.
- Reject missing/invalid tokens with `401`.

### Request body

```json
{
  "text": "clean the restroom by tomorrow",
  "requestId": "amzn1.echo-api.request.123",
  "requestedAt": "2026-05-26T12:34:56.000Z",
  "locale": "en-US",
  "timezone": "America/Los_Angeles",
  "alexaUserId": "amzn1.ask.account.example"
}
```

### Validation rules

- `text`: required, string, trimmed, max 300 chars.
- `requestId`: required, string, max 200 chars.
- `requestedAt`: optional ISO timestamp (defaults to now when absent).
- `locale`: optional string, default `en-US`.
- `timezone`: optional string, default `UTC`.
- `alexaUserId`: optional Alexa user identifier, max 300 chars. Used only for server-side family mapping.

### Response body (success: unified baby log)

```json
{
  "ok": true,
  "kind": "baby_log",
  "message": "Recorded baby log.",
  "rawLog": {
    "id": "rawlog_xxx",
    "rawText": "formula 60 milliliters"
  },
  "events": [
    {
      "type": "feeding_milk",
      "inputSource": "alexa"
    }
  ]
}
```

Alexa-created baby events are stored with `inputSource: "alexa"` so the timeline can label them as `Added by Alexa`.

### Response body (success: task)

```json
{
  "ok": true,
  "kind": "task",
  "message": "Recorded task.",
  "task": {
    "id": "task_xxx",
    "title": "clean the restroom by tomorrow",
    "status": "open"
  }
}
```

### Error responses

- `400`: invalid payload
- `401`: unauthorized integration token
- `409`: duplicated `requestId`
- `422`: record text needs clarification before safe baby-log storage
- `500`: unexpected server error

## Idempotency

- `requestId` must be unique for each Alexa request.
- Server stores processed request IDs in memory (MVP).
- Duplicate requests return `409` to prevent accidental double task creation.

## Environment variables

- Family Tracker server:
  - `ALEXA_INTEGRATION_TOKEN`
  - `ALEXA_FAMILY_ID` (optional fallback; use `family-admin-test` for pre-deploy integration tests)
  - `ALEXA_USER_FAMILY_MAP` (optional JSON object mapping Alexa user IDs to Family Tracker family IDs)
- Alexa Lambda:
  - `FAMILY_TRACKER_API_URL`
  - `FAMILY_TRACKER_API_TOKEN`

Example `ALEXA_USER_FAMILY_MAP`:

```json
{
  "amzn1.ask.account.example": "family-admin-test"
}
```

## Alexa interaction model (minimum)

- Invocation name: `family tracker`
- Intent: `RecordIntent`
- Sample utterances:
  - `record {task_text}`
  - `add task {task_text}`
  - `track {task_text}`
  - `log {task_text}`

- Slot:
  - `task_text` (`AMAZON.SearchQuery`)

## Operational notes

- Keep this integration endpoint server-to-server only.
- Never pass user speech text via query string.
- Keep raw text out of public access logs where possible.
