import { callMockLLM } from './mock-provider.js';
import { callOpenAIForTask, defaultOpenAIModel } from './openai-provider.js';

export const llmProviders = {
  mock: { id: 'mock', label: 'Mock', defaultModel: 'mock-local', models: ['mock-local'], requiresApiKey: false },
  openai: { id: 'openai', label: 'OpenAI', defaultModel: defaultOpenAIModel, models: ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.5'], requiresApiKey: true },
};

export function normalizeLLMProvider(provider) {
  return llmProviders[provider]?.id || 'mock';
}

export function getProviderModelOptions() {
  return Object.values(llmProviders).map((provider) => ({ ...provider, models: [...provider.models] }));
}

export async function callLLMTask(task, input, options = {}) {
  const provider = normalizeLLMProvider(options.provider);
  if (provider === 'openai') return callOpenAIForTask(task, input, options);
  return callMockLLM(task, input, options.context || {});
}

