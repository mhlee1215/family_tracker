import { instructionsForTask, mistralResponseFormatForTask } from './llm-task-contract.js';

export const defaultMistralModel = 'mistral-small-latest';

export async function callMistralForTask(task, input, options = {}) {
  if (!options.apiKey) throw new Error('MISTRAL_API_KEY is required.');
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${options.apiKey}`,
    },
    signal: options.signal,
    body: JSON.stringify(buildMistralRequest(task, input, options)),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.message || payload?.error?.message || `Mistral request failed with ${response.status}`);
  return { ...payload, output_text: extractMistralContent(payload) };
}

export function buildMistralRequest(task, input, options = {}) {
  const request = {
    model: options.model || defaultMistralModel,
    messages: [{
      role: 'system',
      content: instructionsForTask(task),
    }, {
      role: 'user',
      content: JSON.stringify(input),
    }],
  };
  const responseFormat = mistralResponseFormatForTask(task);
  if (responseFormat) request.response_format = responseFormat;
  return request;
}

function extractMistralContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((item) => item?.text || item?.content || '').filter(Boolean).join('\n');
  }
  return '';
}
