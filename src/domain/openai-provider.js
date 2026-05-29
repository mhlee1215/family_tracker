import { instructionsForTask, openAIResponseFormatForTask } from './llm-task-contract.js';

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
  const format = openAIResponseFormatForTask(task);
  if (format) request.text = { format };
  return request;
}
