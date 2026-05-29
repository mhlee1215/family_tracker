export const defaultOpenAIModel = 'gpt-5.4-mini';

export async function callOpenAIForTask(task, input, options = {}) {
  if (!options.apiKey) throw new Error('OPENAI_API_KEY is required.');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify(buildOpenAIRequest(task, input, options)),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI request failed with ${response.status}`);
  return payload;
}

export function buildOpenAIRequest(task, input, options = {}) {
  const request = {
    model: options.model || defaultOpenAIModel,
    instructions: instructionsForTask(task),
    input: JSON.stringify(input),
  };
  const format = responseFormatForTask(task);
  if (format) request.text = { format };
  return request;
}

function instructionsForTask(task) {
  if (task === 'parse_baby_log') {
    return 'Return JSON matching the supplied schema.';
  }
  return 'Answer family tracker questions using the provided structured data.';
}

function responseFormatForTask(task) {
  if (task !== 'parse_baby_log') return null;
  return {
    type: 'json_schema',
    name: 'baby_log_parse',
    strict: false,
    schema: babyLogParseSchema,
  };
}

const isoDateTime = {
  type: 'string',
  description: 'ISO 8601 datetime for a time explicitly mentioned by the user.',
};

const babyLogParseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['events'],
  properties: {
    events: {
      type: 'array',
      minItems: 1,
      description: 'One event per baby activity described in the input text.',
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
          diaperKind: { type: 'string', enum: ['dirty', 'wet_or_unspecified'] },
          action: { type: 'string', enum: ['start', 'end', 'session'] },
          status: { type: 'string', enum: ['completed', 'ongoing_or_predicted'] },
        },
      },
    },
  },
};
