const isoDateTime = {
  type: 'string',
  description: 'ISO 8601 datetime for a time explicitly mentioned by the user.',
};

export const babyLogParseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['events'],
  properties: {
    status: { type: 'string', enum: ['ok', 'needs_clarification'], description: 'Use needs_clarification when the text is too ambiguous to save safely.' },
    code: { type: 'string' },
    message: { type: 'string' },
    questions: { type: 'array', items: { type: 'string' } },
    suggestedInputs: { type: 'array', items: { type: 'string' } },
    events: {
      type: 'array',
      minItems: 0,
      description: 'One event per baby activity described in the input text. Leave empty only when status is needs_clarification.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['sleep', 'feeding_milk', 'feeding_solid', 'diaper'] },
          rawText: { type: 'string', description: 'Optional phrase for this event when the input contains multiple activities.' },
          occurredAt: isoDateTime,
          startAt: isoDateTime,
          endAt: isoDateTime,
          durationMinutes: { type: 'number', description: 'Duration explicitly stated by the user.' },
          amountMl: { type: 'number', description: 'Milk amount explicitly stated by the user.' },
          feedingKind: { type: 'string', enum: ['formula', 'breast'] },
          food: { type: 'string' },
          diaperKind: { type: 'string', enum: ['dirty', 'wet_or_unspecified', 'mixed'] },
          relativeTime: {
            type: 'object',
            additionalProperties: false,
            description: 'Use only when the user gives a clear offset from a recent logged event, such as latest formula feeding minus 10 minutes.',
            properties: {
              anchorEventType: { type: 'string', enum: ['sleep', 'feeding_milk', 'feeding_solid', 'diaper'] },
              anchorFeedingKind: { type: 'string', enum: ['formula', 'breast'] },
              anchorSelector: { type: 'string', enum: ['latest'] },
              offsetMinutes: { type: 'number' },
            },
          },
          action: { type: 'string', enum: ['start', 'end', 'session'] },
          status: { type: 'string', enum: ['completed', 'ongoing_or_predicted'] },
        },
      },
    },
  },
};

export function instructionsForTask(task) {
  if (task === 'parse_baby_log') {
    return [
      'Return JSON matching the supplied schema.',
      'Read the caregiver log, decide which baby activities are clear enough to save, and return one event per activity.',
      'Include only values that are stated or safely understood from the input and provided context.',
      'When the input is not safe to save as structured data, return status "needs_clarification" with caregiver-facing questions and no events.',
    ].join(' ');
  }
  return 'Answer family tracker questions using the provided structured data.';
}

export function openAIResponseFormatForTask(task) {
  if (task !== 'parse_baby_log') return null;
  return {
    type: 'json_schema',
    name: 'baby_log_parse',
    strict: false,
    schema: babyLogParseSchema,
  };
}

export function mistralResponseFormatForTask(task) {
  if (task !== 'parse_baby_log') return null;
  return {
    type: 'json_schema',
    json_schema: {
      name: 'baby_log_parse',
      strict: false,
      schema: babyLogParseSchema,
    },
  };
}

