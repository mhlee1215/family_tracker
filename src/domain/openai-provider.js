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
    return 'Return JSON matching the supplied schema. If multiple baby activities are described, return one event per activity. Extract explicit values only; omit unknown fields.';
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

const fieldSchema = fieldSchemaWithValue({
  anyOf: [
    { type: 'string' },
    { type: 'number' },
    { type: 'integer' },
    { type: 'boolean' },
  ],
});

function fieldSchemaWithValue(valueSchema) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['value', 'source', 'basis', 'confidence'],
    properties: {
      value: valueSchema,
      source: { type: 'string', enum: ['explicit', 'system', 'inferred', 'user_corrected'] },
      basis: { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
  };
}

const babyLogParseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['events'],
  properties: {
    events: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['sleep', 'feeding_milk', 'feeding_solid', 'diaper'] },
          rawText: { type: 'string' },
          occurredAt: fieldSchema,
          startAt: fieldSchema,
          endAt: fieldSchema,
          durationMinutes: fieldSchema,
          amountMl: fieldSchema,
          feedingKind: fieldSchemaWithValue({ type: 'string', enum: ['formula', 'breast'] }),
          food: fieldSchema,
          diaperKind: fieldSchemaWithValue({ type: 'string', enum: ['dirty', 'wet_or_unspecified'] }),
          action: fieldSchemaWithValue({ type: 'string', enum: ['start', 'end', 'session'] }),
          status: { type: 'string', enum: ['completed', 'ongoing_or_predicted'] },
        },
      },
    },
  },
};
