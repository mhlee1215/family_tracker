import { callLLMTask } from './llm-provider.js';
import {
  applyParserInfo,
  getBabyLogClarification,
  heuristicParserInfo,
  llmParserInfo,
  normalizeParsedBabyLogDecision,
  normalizeParsedBabyLogEvents,
  parseBabyLogText,
} from './baby-log-parser.js';

const DEFAULT_LLM_PARSE_TIMEOUT_MS = 12_000;

export async function parseBabyLogForSave(text, context = {}, options = {}) {
  const provider = options.provider || 'mock';
  const model = options.model || 'mock-local';
  const apiKey = options.apiKey || '';
  const forceHeuristic = options.parserMode === 'heuristic';
  const canUseLLM = !forceHeuristic && provider !== 'mock' && Boolean(apiKey);

  if (!canUseLLM) {
    const clarification = getBabyLogClarification(text);
    if (clarification) return clarification;
    return { status: 'ok', events: applyParserInfo(parseBabyLogText(text, context), heuristicParserInfo()) };
  }

  try {
    const response = await callProviderTaskWithTimeout(options.callTask || callLLMTask, 'parse_baby_log', {
      text,
      now: toIso(context.now),
      timezone: context.timezone || 'UTC',
      profile: context.profile || null,
      recentEvents: summarizeRecentEvents(context.recentEvents || []),
    }, {
      provider,
      model,
      apiKey,
      context,
    }, options.providerTimeoutMs);
    return normalizeParsedBabyLogDecision(response, { ...context, rawText: text }, llmParserInfo(provider, model));
  } catch (error) {
    if (error?.clarification) return error.clarification;
    const clarification = getBabyLogClarification(text);
    if (clarification) return clarification;
    const fallbackInfo = {
      ...heuristicParserInfo(),
      fallbackFrom: { provider, model, reason: error.message || 'LLM parse failed' },
      label: `Heuristic · rule-based-mvp (fallback from ${provider} · ${model})`,
    };
    return { status: 'ok', events: applyParserInfo(parseBabyLogText(text, context), fallbackInfo) };
  }
}

export async function parseBabyLogWithProvider(text, context = {}, options = {}) {
  const provider = options.provider || 'mock';
  const model = options.model || 'mock-local';
  const apiKey = options.apiKey || '';
  const forceHeuristic = options.parserMode === 'heuristic';
  const canUseLLM = !forceHeuristic && provider !== 'mock' && Boolean(apiKey);

  if (!canUseLLM) {
    return applyParserInfo(parseBabyLogText(text, context), heuristicParserInfo());
  }

  try {
    const response = await callProviderTaskWithTimeout(options.callTask || callLLMTask, 'parse_baby_log', {
      text,
      now: toIso(context.now),
      timezone: context.timezone || 'UTC',
      profile: context.profile || null,
      recentEvents: summarizeRecentEvents(context.recentEvents || []),
    }, {
      provider,
      model,
      apiKey,
      context,
    }, options.providerTimeoutMs);
    return normalizeParsedBabyLogEvents(response, { ...context, rawText: text }, llmParserInfo(provider, model));
  } catch (error) {
    if (error?.clarification) throw error;
    const fallbackInfo = {
      ...heuristicParserInfo(),
      fallbackFrom: { provider, model, reason: error.message || 'LLM parse failed' },
      label: `Heuristic · rule-based-mvp (fallback from ${provider} · ${model})`,
    };
    return applyParserInfo(parseBabyLogText(text, context), fallbackInfo);
  }
}

async function callProviderTaskWithTimeout(callTask, task, input, providerOptions = {}, timeoutMs = DEFAULT_LLM_PARSE_TIMEOUT_MS) {
  const timeout = Number(timeoutMs);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return callTask(task, input, providerOptions);
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller?.abort();
      reject(new Error(`LLM parse timed out after ${timeout}ms`));
    }, timeout);
  });

  try {
    return await Promise.race([
      callTask(task, input, controller ? { ...providerOptions, signal: controller.signal } : providerOptions),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function summarizeRecentEvents(events) {
  return events.slice(-20).map((event) => ({
    type: event.type,
    occurredAt: event.occurredAt?.value,
    startAt: event.startAt?.value,
    endAt: event.endAt?.value,
    id: event.id,
    amountMl: event.amountMl?.value,
    feedingKind: event.feedingKind?.value,
    diaperKind: event.diaperKind?.value,
    durationMinutes: event.durationMinutes?.value,
    status: event.status,
  }));
}

function toIso(value) {
  return (value instanceof Date ? value : new Date(value || Date.now())).toISOString();
}
