import { createField, eventTypes } from './baby-events.js';

export function getBabyLogClarification(text) {
  const rawText = String(text || '').trim();
  if (!rawText) return null;
  const normalized = rawText.replace(/\s+/g, ' ');
  const lower = normalized.toLowerCase();
  const minutePattern = /\b\d+(?:\.\d+)?\s*(?:m|min|mins|minute|minutes)\b/i;
  const hasRelativeTiming = /\b(before|after)\b/i.test(normalized);

  if (looksLikeMilk(lower) && looksLikeDiaper(lower) && hasRelativeTiming && minutePattern.test(normalized)) {
    return createClarification({
      code: 'ambiguous_relative_timing',
      message: 'The log mentions a diaper, formula feeding, and a minute offset, but the exact timing relationship is ambiguous.',
      questions: ['Did the poop diaper happen 5 minutes before formula feeding, or was formula feeding 5 minutes long?'],
      suggestedInputs: [
        'poop diaper 5 minutes before formula',
        'formula now, poop diaper 5 minutes before',
        'formula for 5 minutes after poop diaper',
      ],
    });
  }

  if (looksLikeMilk(lower) && !hasRelativeAgo(normalized) && /(?:formula|milk|feeding|feed|fed|분유|수유|모유)\D{0,16}\d+(?:\.\d+)?\s*(?:m|min|mins|minute|minutes)\b/i.test(normalized)) {
    return createClarification({
      code: 'ambiguous_feeding_minutes',
      message: 'The log includes minutes near a milk feeding, but it is unclear whether that means feeding duration or timing relative to another event.',
      questions: ['Please say whether the number is a feeding duration or when the feeding happened.'],
      suggestedInputs: [
        'formula for 5 minutes',
        'formula 120ml',
        'formula now',
      ],
    });
  }

  return null;
}

export function parseBabyLogText(text, context = {}) {
  const rawText = String(text || '').trim();
  if (!rawText) throw new Error('Log text is required.');

  const normalized = rawText.replace(/\s+/g, ' ');
  const lower = normalized.toLowerCase();
  const event = baseEvent(normalized, context);
  const explicitTime = extractEventTime(normalized, context);
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
    const explicitRange = extractTimeRange(normalized, context);
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
    return selectHeuristicEvents(candidates, lower);
  }

  return [{
    ...event,
    type: 'feeding_solid',
    occurredAt: explicitTime || systemTime(context),
    food: createField(normalized, 'explicit', 'fallback_text_as_food', 0.35),
  }];
}

export function normalizeParsedBabyLogDecision(value, context = {}, parserInfo = heuristicParserInfo()) {
  const payload = extractJsonPayload(value);
  if (payload?.status === 'needs_clarification' || payload?.needsClarification === true) {
    return createClarification({
      code: String(payload.code || 'llm_needs_clarification'),
      message: String(payload.message || payload.reason || 'The log is missing information needed for a reliable record.'),
      questions: Array.isArray(payload.questions) ? payload.questions.map(String) : [],
      suggestedInputs: Array.isArray(payload.suggestedInputs) ? payload.suggestedInputs.map(String) : [],
    });
  }

  return { status: 'ok', events: normalizeParsedBabyLogEventsFromPayload(payload, context, parserInfo) };
}

export function normalizeParsedBabyLogEvents(value, context = {}, parserInfo = heuristicParserInfo()) {
  const payload = extractJsonPayload(value);
  return normalizeParsedBabyLogEventsFromPayload(payload, context, parserInfo);
}

function normalizeParsedBabyLogEventsFromPayload(payload, context, parserInfo) {
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
  applyTypedClockFromRawText(event, context, rawText);
  if (event.amountMl !== undefined) {
    event.amountMl = normalizeExplicitField(event.amountMl, 'llm_extracted_amount');
    event.amountMl.value = Number(event.amountMl.value);
  }
  if (event.food) event.food = normalizeExplicitField(event.food, 'llm_extracted_food');
  if (event.feedingKind) event.feedingKind = normalizeExplicitField(event.feedingKind, 'llm_extracted_feeding_kind');
  if (event.diaperKind) event.diaperKind = normalizeExplicitField(event.diaperKind, 'llm_extracted_diaper_kind');
  resolveRelativeTime(event, context);
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

function applyTypedClockFromRawText(event, context, rawText) {
  const typedTime = extractExplicitTime(rawText, context);
  if (!typedTime) return;
  if (['feeding_milk', 'feeding_solid', 'diaper'].includes(event.type)) {
    event.occurredAt = typedTime;
    return;
  }
  if (event.type !== 'sleep') return;
  const action = fieldValue(event.action);
  if (action === 'end') event.endAt = typedTime;
  else if (action !== 'session') event.startAt = typedTime;
}


function resolveRelativeTime(event, context) {
  if (!event.relativeTime) return;
  const relation = event.relativeTime;
  const offsetMinutes = Number(relation.offsetMinutes);
  if (!Number.isFinite(offsetMinutes)) throw new Error('Invalid relativeTime.offsetMinutes from LLM parser.');

  const anchorSelector = relation.anchorSelector || 'latest';
  if (anchorSelector !== 'latest') throw new Error(`Unsupported relativeTime.anchorSelector from LLM parser: ${anchorSelector}`);

  const anchorEventType = relation.anchorEventType;
  if (!eventTypes.includes(anchorEventType)) throw new Error(`Unsupported relativeTime.anchorEventType from LLM parser: ${anchorEventType}`);

  const anchor = findRelativeTimeAnchor(context.recentEvents || [], relation);
  if (!anchor) throwRelativeTimeClarification(relation);

  const anchorTime = eventTimeValue(anchor);
  event.occurredAt = createField(
    addMinutes(anchorTime, offsetMinutes),
    'inferred',
    relativeTimeBasis(relation, offsetMinutes),
    0.82,
  );
  event.timeAnchor = compactObject({
    eventId: anchor.id || null,
    eventType: anchor.type,
    feedingKind: fieldValue(anchor.feedingKind) || relation.anchorFeedingKind,
    offsetMinutes,
  });
  delete event.relativeTime;
}

function findRelativeTimeAnchor(events, relation) {
  const candidates = events
    .filter((candidate) => candidate?.type === relation.anchorEventType)
    .filter((candidate) => !relation.anchorFeedingKind || fieldValue(candidate.feedingKind) === relation.anchorFeedingKind)
    .map((candidate) => ({ candidate, time: eventTimeValue(candidate) }))
    .filter(({ time }) => time && Number.isFinite(new Date(time).getTime()))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  return candidates[0]?.candidate || null;
}

function eventTimeValue(event) {
  return fieldValue(event?.occurredAt) || fieldValue(event?.startAt) || fieldValue(event?.endAt) || '';
}

function fieldValue(field) {
  if (field && typeof field === 'object' && 'value' in field) return field.value;
  return field;
}

function addMinutes(dateValue, minutes) {
  const date = new Date(dateValue);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function relativeTimeBasis(relation, offsetMinutes) {
  const eventName = relation.anchorEventType || 'event';
  const kind = relation.anchorFeedingKind ? `_${relation.anchorFeedingKind}` : '';
  const direction = offsetMinutes < 0 ? 'minus' : 'plus';
  return `latest_${eventName}${kind}_${direction}_${Math.abs(offsetMinutes)}_minutes`;
}

function throwRelativeTimeClarification(relation) {
  const anchorLabel = relation.anchorFeedingKind
    ? `${relation.anchorFeedingKind} feeding`
    : String(relation.anchorEventType || 'anchor event').replace(/_/g, ' ');
  const error = new Error(`Missing recent ${anchorLabel} for relative time.`);
  error.clarification = createClarification({
    code: 'missing_relative_time_anchor',
    message: `The log refers to a recent ${anchorLabel}, but no matching recent record with a usable time was found.`,
    questions: [`When was the recent ${anchorLabel}?`],
    suggestedInputs: [
      `Add the ${anchorLabel} time first, then say what happened ${Math.abs(Number(relation.offsetMinutes) || 0)} minutes before or after it.`,
    ],
  });
  throw error;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''));
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
  assertEnumField(event.diaperKind, ['dirty', 'wet_or_unspecified', 'mixed'], 'diaperKind');
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

function createClarification({ code, message, questions = [], suggestedInputs = [] }) {
  return {
    status: 'needs_clarification',
    code,
    error: '입력 내용을 정확히 기록하려면 추가 정보가 필요해요.',
    message,
    issues: [{ code, message }],
    questions,
    suggestedInputs,
  };
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
  const { now } = explicitTimeContext(context);
  return createField(toIso(now), 'system', 'current_time', 1);
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


function selectHeuristicEvents(candidates, text) {
  candidates.sort((a, b) => b.score - a.score);
  if (!hasMultiActivitySignal(text)) return [candidates[0].event];

  const selected = [];
  const seenTypes = new Set();
  for (const candidate of candidates) {
    const event = candidate.event;
    if (event.type === 'feeding_solid' && looksLikeMilk(text) && !hasSpecificSolidFood(text)) continue;
    if (event.type === 'sleep' && event.action?.value === 'start' && hasExplicitSleepEndCandidate(candidates)) continue;
    const key = event.type === 'sleep' ? `sleep:${event.action?.value || 'session'}` : event.type;
    if (seenTypes.has(key)) continue;
    selected.push(event);
    seenTypes.add(key);
  }

  return selected.length ? selected : [candidates[0].event];
}

function hasMultiActivitySignal(text) {
  const matched = [looksLikeMilk(text), looksLikeDiaper(text), looksLikeSleep(text) || looksLikeSleepEnd(text), looksLikeSolid(text) && hasSpecificSolidFood(text)]
    .filter(Boolean).length;
  return matched > 1 && /그리고|하고|먹고|자고|깬|후|다음|,|\/|\+|\band\b|\bthen\b|\bafter\b/.test(text);
}

function hasExplicitSleepEndCandidate(candidates) {
  return candidates.some(({ event }) => event.type === 'sleep' && event.action?.value === 'end');
}

function hasSpecificSolidFood(text) {
  return /이유식|밥|죽|고구마|감자|바나나|사과|소고기|닭고기|\bsolid(?:s)?\b|\bfood\b|sweet potato|dặm|\bdam\b|khoai/.test(text);
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
  const explicitUnit = text.match(/(\d{1,3}(?:\.\d+)?)\s?(ml|미리|밀리)\b/i);
  if (explicitUnit) return Number(explicitUnit[1]);

  const nearbyNumber = text.match(/(?:분유|수유|모유|milk|formula)\D{0,12}(\d{1,3}(?:\.\d+)?)(?![\d.])(?!\s*(?:m|min|mins|minute|minutes)\b)/i);
  return nearbyNumber ? Number(nearbyNumber[1]) : null;
}

function extractFood(text) {
  const cleaned = text
    .replace(/먹음|먹었음|먹었다|먹임|먹였음|이유식|밥|조금|많이|보통|\bate\b|\beat\b|eaten|solids?|food|ăn|\ban\b|dặm|\bdam\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || '이유식';
}

function extractEventTime(text, context = {}) {
  return extractExplicitTime(text, context) || extractRelativeAgoTime(text, context) || extractDateOnlyTime(text, context);
}

function extractDateOnlyTime(text, context = {}) {
  const shift = dateShiftFromText(text);
  if (!shift) return null;
  const { now, timezone } = explicitTimeContext(context);
  const parts = localDateParts(now, timezone);
  shiftLocalDate(parts, shift);
  return createField(localDateTimeToIso(parts, timezone), 'system', 'typed_date_current_time', 0.95);
}

function extractRelativeAgoTime(text, context = {}) {
  const match = text.match(/\b(\d{1,3}(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\s+ago\b/i);
  if (!match) return null;
  const minutesAgo = Number(match[1]);
  if (!Number.isFinite(minutesAgo)) return null;
  const { now } = explicitTimeContext(context);
  return createField(addMinutes(now.toISOString(), -minutesAgo), 'inferred', `current_time_minus_${formatBasisNumber(minutesAgo)}_minutes`, 0.9);
}

function hasRelativeAgo(text) {
  return /\b\d{1,3}(?:\.\d+)?\s*(?:m|min|mins|minute|minutes)\s+ago\b/i.test(text);
}

function formatBasisNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace(/\./g, '_');
}

function extractExplicitTime(text, context = {}) {
  const { now, timezone } = explicitTimeContext(context);
  const korean = text.match(/(오전|오후|아침|점심|저녁|밤)?\s*(\d{1,2})\s*시(?:\s*(반|[0-5]?\d)\s*분?)?/);
  if (korean) {
    let hour = Number(korean[2]);
    const minute = korean[3] === '반' ? 30 : Number(korean[3] || 0);
    const marker = korean[1] || '';
    if ((marker === '오후' || marker === '점심' || marker === '저녁' || marker === '밤') && hour < 12) hour += 12;
    if ((marker === '아침' || marker === '오전') && hour === 12) hour = 0;
    return createField(explicitLocalTimeIso({ now, timezone, text, hour, minute }), 'explicit', 'typed_time', 0.95);
  }

  const english = text.match(/(?:\bat\s*)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i);
  if (!english) return null;
  let hour = Number(english[1]);
  const minute = Number(english[2] || 0);
  const marker = english[3].toLowerCase();
  if (marker === 'pm' && hour < 12) hour += 12;
  if (marker === 'am' && hour === 12) hour = 0;
  return createField(explicitLocalTimeIso({ now, timezone, text, hour, minute }), 'explicit', 'typed_time', 0.95);
}

function explicitTimeContext(context) {
  if (context instanceof Date || typeof context === 'string' || typeof context === 'number') {
    return { now: new Date(context), timezone: 'UTC' };
  }
  const timezone = context.timezone || 'UTC';
  const now = context.now instanceof Date ? context.now : new Date(context.now || Date.now());
  return {
    now: selectedDayNow(now, timezone, context.selectedDay) || now,
    timezone,
  };
}

function explicitLocalTimeIso({ now, timezone, text, hour, minute }) {
  const parts = localDateParts(now, timezone);
  shiftLocalDate(parts, dateShiftFromText(text));
  return localDateTimeToIso({ ...parts, hour, minute, second: 0, millisecond: 0 }, timezone);
}

function shiftLocalDate(parts, days) {
  if (!days) return;
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  parts.year = shifted.getUTCFullYear();
  parts.month = shifted.getUTCMonth() + 1;
  parts.day = shifted.getUTCDate();
}

function dateShiftFromText(text) {
  const value = String(text || '').toLowerCase();
  if (/\b(?:the\s+)?day\s+before\s+yesterday\b/.test(value) || /그제|그저께/.test(value)) return -2;
  if (/\byesterday\b/.test(value) || /어제/.test(value)) return -1;
  if (/\btomorrow\b/.test(value) || /내일/.test(value)) return 1;
  return 0;
}

function selectedDayNow(now, timezone, selectedDay) {
  if (!isDateKey(selectedDay)) return null;
  const [, year, month, day] = String(selectedDay).match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  const parts = localDateParts(now, timezone);
  return new Date(localDateTimeToIso({
    ...parts,
    year: Number(year),
    month: Number(month),
    day: Number(day),
  }, timezone));
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function localDateParts(value, timezone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    millisecond: value.getUTCMilliseconds(),
  };
}

function localDateTimeToIso(parts, timezone) {
  const target = localPartsEpoch(parts);
  let guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond));
  for (let i = 0; i < 4; i += 1) {
    const actual = localDateParts(guess, timezone);
    const diff = localPartsEpoch(actual) - target;
    if (diff === 0) break;
    guess = new Date(guess.getTime() - diff);
  }
  return guess.toISOString();
}

function localPartsEpoch(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0, parts.millisecond || 0);
}

function extractTimeRange(text, context = {}) {
  const range = text.match(/(.+?)부터\s*(.+?)까지/);
  if (!range) return null;
  const startAt = extractExplicitTime(range[1], context);
  const endAt = extractExplicitTime(range[2], context);
  return startAt && endAt ? { startAt, endAt } : null;
}

function toIso(value) {
  return (value instanceof Date ? value : new Date(value || Date.now())).toISOString();
}
