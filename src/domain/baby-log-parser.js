import { createField, eventTypes } from './baby-events.js';

export function parseBabyLogText(text, context = {}) {
  const rawText = String(text || '').trim();
  if (!rawText) throw new Error('Log text is required.');

  const normalized = rawText.replace(/\s+/g, ' ');
  const lower = normalized.toLowerCase();
  const event = baseEvent(normalized, context);
  const explicitTime = extractExplicitTime(normalized, context.now);
  const candidates = [];

  if (looksLikeDiaper(lower)) {
    candidates.push({
      score: dirtyDiaper(lower) ? 78 : 60,
      event: {
        ...event,
        type: 'diaper',
        occurredAt: explicitTime || systemTime(context),
        diaperKind: createField(dirtyDiaper(lower) ? 'dirty' : 'wet_or_unspecified', dirtyDiaper(lower) ? 'explicit' : 'inferred', dirtyDiaper(lower) ? 'keyword' : 'diaper_default', dirtyDiaper(lower) ? 0.95 : 0.55),
      },
    });
  }

  if (looksLikeSleepEnd(lower)) {
    candidates.push({
      score: sleepEndScore(lower),
      event: {
        ...event,
        type: 'sleep',
        action: createField('end', 'explicit', 'completion_keyword', 0.85),
        endAt: explicitTime || systemTime(context),
        status: 'completed',
      },
    });
  }

  if (looksLikeSleep(lower)) {
    const explicitRange = extractTimeRange(normalized, context.now);
    candidates.push({
      score: explicitRange ? 95 : 72,
      event: explicitRange ? {
        ...event,
        type: 'sleep',
        action: createField('session', 'explicit', 'time_range', 0.95),
        startAt: explicitRange.startAt,
        endAt: explicitRange.endAt,
        status: 'completed',
      } : {
        ...event,
        type: 'sleep',
        action: createField('start', 'explicit', 'sleep_keyword', 0.75),
        startAt: explicitTime || systemTime(context),
        status: 'ongoing_or_predicted',
      },
    });
  }

  if (looksLikeMilk(lower)) {
    const amount = extractAmountMl(normalized);
    candidates.push({
      score: milkScore(lower, amount),
      event: {
        ...event,
        type: 'feeding_milk',
        occurredAt: explicitTime || systemTime(context),
        amountMl: amount
          ? createField(amount, 'explicit', 'typed_number', 0.98)
          : undefined,
        feedingKind: milkKindField(lower),
      },
    });
  }

  if (looksLikeSolid(lower)) {
    candidates.push({
      score: solidScore(lower),
      event: {
        ...event,
        type: 'feeding_solid',
        occurredAt: explicitTime || systemTime(context),
        food: createField(extractFood(normalized), 'explicit', 'food_keyword', 0.72),
      },
    });
  }

  if (candidates.length) {
    candidates.sort((a, b) => b.score - a.score);
    return [candidates[0].event];
  }

  return [{
    ...event,
    type: 'feeding_solid',
    occurredAt: explicitTime || systemTime(context),
    food: createField(normalized, 'explicit', 'fallback_text_as_food', 0.35),
  }];
}

export function normalizeParsedBabyLogEvents(value, context = {}, parserInfo = heuristicParserInfo()) {
  const payload = extractJsonPayload(value);
  const events = Array.isArray(payload) ? payload : payload?.events;
  if (!Array.isArray(events) || !events.length) throw new Error('LLM parser returned no events.');

  return events.map((event) => normalizeEventCandidate(event, context, parserInfo));
}

export function heuristicParserInfo() {
  return { kind: 'heuristic', provider: 'local', model: 'rule-based-mvp', label: 'Heuristic · rule-based-mvp' };
}

export function llmParserInfo(provider, model) {
  return { kind: 'llm', provider, model, label: `${provider} · ${model}` };
}

export function applyParserInfo(events, parserInfo = heuristicParserInfo()) {
  return events.map((event) => ({
    ...event,
    parser: parserInfo.kind === 'llm' ? `llm:${parserInfo.provider}` : 'rule-based-mvp',
    parserInfo,
  }));
}

function normalizeEventCandidate(candidate, context, parserInfo) {
  if (!candidate || typeof candidate !== 'object') throw new Error('LLM parser returned an invalid event.');
  if (!eventTypes.includes(candidate.type)) throw new Error(`Unsupported event type: ${candidate.type}`);

  const rawText = String(candidate.rawText || context.rawText || '').trim();
  const event = {
    ...baseEvent(rawText, context),
    ...candidate,
    rawText,
    familyId: context.familyId || candidate.familyId || 'local-family',
    babyId: context.babyId || candidate.babyId || 'local-baby',
    authorId: context.authorId || candidate.authorId || 'local-user',
    parser: parserInfo.kind === 'llm' ? `llm:${parserInfo.provider}` : 'rule-based-mvp',
    parserInfo,
  };

  if (event.occurredAt) event.occurredAt = normalizeExplicitField(event.occurredAt, 'llm_extracted_time');
  if (event.startAt) event.startAt = normalizeExplicitField(event.startAt, 'llm_extracted_start_time');
  if (event.endAt) event.endAt = normalizeExplicitField(event.endAt, 'llm_extracted_end_time');
  if (event.amountMl !== undefined) {
    event.amountMl = normalizeExplicitField(event.amountMl, 'llm_extracted_amount');
    event.amountMl.value = Number(event.amountMl.value);
  }
  if (event.food) event.food = normalizeExplicitField(event.food, 'llm_extracted_food');
  if (event.feedingKind) event.feedingKind = normalizeExplicitField(event.feedingKind, 'llm_extracted_feeding_kind');
  if (event.diaperKind) event.diaperKind = normalizeExplicitField(event.diaperKind, 'llm_extracted_diaper_kind');
  if (event.action) event.action = normalizeExplicitField(event.action, 'llm_extracted_action');
  if (event.durationMinutes !== undefined) {
    event.durationMinutes = normalizeExplicitField(event.durationMinutes, 'llm_extracted_duration');
    event.durationMinutes.value = Number(event.durationMinutes.value);
  }

  validateProviderEvent(event);
  if (event.type === 'sleep' && event.action?.value && !event.status) {
    event.status = event.action.value === 'start' ? 'ongoing_or_predicted' : 'completed';
  }
  fillMissingSystemTimes(event, context);
  return event;
}

function fillMissingSystemTimes(event, context) {
  if (['feeding_milk', 'feeding_solid', 'diaper'].includes(event.type) && !event.occurredAt) {
    event.occurredAt = systemTime(context);
  }
  if (event.type !== 'sleep') return;
  if (event.action?.value === 'end' && !event.endAt) event.endAt = systemTime(context);
  if (event.action?.value !== 'end' && !event.startAt && !event.endAt) event.startAt = systemTime(context);
}

function normalizeExplicitField(field, basis) {
  if (field && typeof field === 'object' && 'value' in field) {
    return createField(field.value, 'explicit', field.basis || basis, Number.isFinite(Number(field.confidence)) ? Number(field.confidence) : 0.8);
  }
  return createField(field, 'explicit', basis, 0.8);
}

function validateProviderEvent(event) {
  if (event.amountMl && !Number.isFinite(Number(event.amountMl.value))) throw new Error('Invalid amountMl from LLM parser.');
  if (event.durationMinutes && !Number.isFinite(Number(event.durationMinutes.value))) throw new Error('Invalid durationMinutes from LLM parser.');
  assertEnumField(event.feedingKind, ['formula', 'breast'], 'feedingKind');
  assertEnumField(event.diaperKind, ['dirty', 'wet_or_unspecified'], 'diaperKind');
  assertEnumField(event.action, ['start', 'end', 'session'], 'action');
  if (event.status && !['completed', 'ongoing_or_predicted'].includes(event.status)) throw new Error(`Invalid status from LLM parser: ${event.status}`);
}

function assertEnumField(field, allowed, name) {
  if (!field) return;
  if (!allowed.includes(field.value)) throw new Error(`Invalid ${name} from LLM parser: ${field.value}`);
}

function extractJsonPayload(value) {
  if (Array.isArray(value) || value?.events) return value;
  const text = extractResponseText(value);
  if (!text) throw new Error('LLM parser returned no JSON text.');
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(cleaned);
}

function extractResponseText(value) {
  if (typeof value === 'string') return value;
  if (typeof value?.output_text === 'string') return value.output_text;
  const chunks = value?.output?.flatMap((item) => item.content || []) || [];
  return chunks.map((chunk) => chunk.text || '').filter(Boolean).join('\n');
}

function baseEvent(rawText, context) {
  return {
    rawText,
    familyId: context.familyId || 'local-family',
    babyId: context.babyId || 'local-baby',
    authorId: context.authorId || 'local-user',
    parser: 'rule-based-mvp',
    parserInfo: heuristicParserInfo(),
  };
}

function systemTime(context) {
  return createField(toIso(context.now), 'system', 'current_time', 1);
}

function looksLikeSleep(text) {
  return /낮잠|밤잠|잠|수면|잔다|잠듦|잠들|\bnap\b|\bsleep(?:ing)?\b|ngủ|\bngu\b/.test(text);
}

function looksLikeSleepEnd(text) {
  return /깸|깨|일어남|일어났|잠.*잤|낮잠.*잤|수면.*끝|\bwake\b|\bwoke\b|\bawake\b|thức|\bthuc\b|dậy|\bday\b/.test(text);
}

function looksLikeMilk(text) {
  return /분유|수유|모유|젖|\bmilk\b|\bformula\b|\bbreast(?:milk)?\b|sữa|\bsua\b/.test(text);
}

function looksLikeBreast(text) {
  return /모유|젖|\bbreast(?:milk)?\b|sữa mẹ|\bsua me\b/.test(text);
}

function looksLikeFormula(text) {
  return /분유|\bformula\b/.test(text);
}

function milkKindField(text) {
  if (looksLikeBreast(text)) return createField('breast', 'explicit', 'keyword', 0.92);
  if (looksLikeFormula(text)) return createField('formula', 'explicit', 'keyword', 0.92);
  return createField('formula', 'inferred', 'milk_default', 0.68);
}

function looksLikeSolid(text) {
  return /이유식|밥|죽|고구마|감자|바나나|사과|소고기|닭고기|먹|\bsolid(?:s)?\b|\bfood\b|\bate\b|\beat\b|sweet potato|ăn|\ban\b|dặm|\bdam\b|khoai/.test(text);
}

function looksLikeDiaper(text) {
  return /기저귀|응가|똥|쉬|소변|대변|\bdiaper\b|\bdirty\b|\bwet\b|\bpee\b|\bpoop\b|tã|\bta\b|bẩn|\bban\b|ướt|\buot\b/.test(text);
}

function dirtyDiaper(text) {
  return /응가|똥|대변|\bdirty\b|\bpoop\b|bẩn|\bban\b/.test(text);
}

function milkScore(text, amount) {
  let score = 74;
  if (amount) score += 18;
  if (/\bformula\b|분유|\bmilk\b|수유|모유|sữa/.test(text)) score += 10;
  if (/\bate\b|\beat\b|먹/.test(text)) score += 4;
  return score;
}

function solidScore(text) {
  let score = 58;
  if (/이유식|고구마|감자|바나나|사과|소고기|닭고기|\bsolid(?:s)?\b|\bfood\b/.test(text)) score += 14;
  if (/\bate\b|\beat\b|먹/.test(text)) score += 5;
  return score;
}

function sleepEndScore(text) {
  if (/깸|깨|일어남|일어났|\bwake\b|\bwoke\b|\bawake\b/.test(text)) return 88;
  if (/잠.*잤|낮잠.*잤|수면.*끝|thức|\bthuc\b|dậy|\bday\b/.test(text)) return 86;
  return 60;
}

function extractAmountMl(text) {
  const match = text.match(/(\d{1,3}(?:\.\d+)?)\s?(ml|미리|밀리)\b/i) || text.match(/(?:분유|수유|모유|milk|formula)\D{0,12}(\d{1,3}(?:\.\d+)?)/i);
  return match ? Number(match[1]) : null;
}

function extractFood(text) {
  const cleaned = text
    .replace(/먹음|먹었음|먹었다|먹임|먹였음|이유식|밥|조금|많이|보통|\bate\b|\beat\b|eaten|solids?|food|ăn|\ban\b|dặm|\bdam\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || '이유식';
}

function extractExplicitTime(text, now = new Date()) {
  const korean = text.match(/(오전|오후|아침|점심|저녁|밤)?\s*(\d{1,2})\s*시(?:\s*(반|[0-5]?\d)\s*분?)?/);
  if (korean) {
    const date = new Date(now);
    let hour = Number(korean[2]);
    const minute = korean[3] === '반' ? 30 : Number(korean[3] || 0);
    const marker = korean[1] || '';
    if ((marker === '오후' || marker === '점심' || marker === '저녁' || marker === '밤') && hour < 12) hour += 12;
    if ((marker === '아침' || marker === '오전') && hour === 12) hour = 0;
    date.setHours(hour, minute, 0, 0);
    return createField(date.toISOString(), 'explicit', 'typed_time', 0.95);
  }

  const english = text.match(/(?:\bat\s*)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i);
  if (!english) return null;
  const date = new Date(now);
  let hour = Number(english[1]);
  const minute = Number(english[2] || 0);
  const marker = english[3].toLowerCase();
  if (marker === 'pm' && hour < 12) hour += 12;
  if (marker === 'am' && hour === 12) hour = 0;
  if (/\byesterday\b/i.test(text)) date.setDate(date.getDate() - 1);
  if (/\btomorrow\b/i.test(text)) date.setDate(date.getDate() + 1);
  date.setHours(hour, minute, 0, 0);
  return createField(date.toISOString(), 'explicit', 'typed_time', 0.95);
}

function extractTimeRange(text, now = new Date()) {
  const range = text.match(/(.+?)부터\s*(.+?)까지/);
  if (!range) return null;
  const startAt = extractExplicitTime(range[1], now);
  const endAt = extractExplicitTime(range[2], now);
  return startAt && endAt ? { startAt, endAt } : null;
}

function toIso(value) {
  return (value instanceof Date ? value : new Date(value || Date.now())).toISOString();
}
