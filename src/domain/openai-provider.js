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
  return {
    model: options.model || defaultOpenAIModel,
    instructions: instructionsForTask(task),
    input: JSON.stringify(input),
  };
}

function instructionsForTask(task) {
  if (task === 'parse_baby_log') {
    return [
      'Parse a short Korean baby activity log.',
      'Return only JSON event candidates.',
      'Preserve explicit values and do not invent medical facts.',
      'Supported event types: sleep, feeding_milk, feeding_solid, diaper.',
    ].join(' ');
  }
  return 'Answer family tracker questions using the provided structured data.';
}

