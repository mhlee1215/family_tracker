import { createField } from './baby-events.js';

export function parseBabyLogText(text, context = {}) {
  const rawText = String(text || '').trim();
  if (!rawText) throw new Error('Log text is required.');

  const normalized = rawText.replace(/\s+/g, ' ');
  const lower = normalized.toLowerCase();
  const event = baseEvent(normalized, context);
  const explicitTime = extractExplicitTime(normalized, context.now);

  if (looksLikeDiaper(lower)) {
    return [{
      ...event,
      type: 'diaper',
      occurredAt: explicitTime || systemTime(context),
      diaperKind: createField(dirtyDiaper(lower) ? 'dirty' : 'wet_or_unspecified', dirtyDiaper(lower) ? 'explicit' : 'inferred', dirtyDiaper(lower) ? 'keyword' : 'diaper_default', dirtyDiaper(lower) ? 0.95 : 0.55),
    }];
  }

  if (looksLikeSleepEnd(lower)) {
    return [{
      ...event,
      type: 'sleep',
      action: createField('end', 'explicit', 'completion_keyword', 0.85),
      endAt: explicitTime || systemTime(context),
      status: 'completed',
    }];
  }

  if (looksLikeSleep(lower)) {
    const explicitRange = extractTimeRange(normalized, context.now);
    if (explicitRange) {
      return [{
        ...event,
        type: 'sleep',
        action: createField('session', 'explicit', 'time_range', 0.95),
        startAt: explicitRange.startAt,
        endAt: explicitRange.endAt,
        status: 'completed',
      }];
    }

    return [{
      ...event,
      type: 'sleep',
      action: createField('start', 'explicit', 'sleep_keyword', 0.75),
      startAt: explicitTime || systemTime(context),
      status: 'ongoing_or_predicted',
    }];
  }

  if (looksLikeMilk(lower)) {
    const amount = extractAmountMl(normalized);
    return [{
      ...event,
      type: 'feeding_milk',
      occurredAt: explicitTime || systemTime(context),
      amountMl: amount
        ? createField(amount, 'explicit', 'typed_number', 0.98)
        : undefined,
      feedingKind: createField(looksLikeBreast(lower) ? 'breast' : 'formula', looksLikeBreast(lower) ? 'explicit' : 'inferred', looksLikeBreast(lower) ? 'keyword' : 'milk_default', looksLikeBreast(lower) ? 0.92 : 0.68),
    }];
  }

  if (looksLikeSolid(lower)) {
    return [{
      ...event,
      type: 'feeding_solid',
      occurredAt: explicitTime || systemTime(context),
      food: createField(extractFood(normalized), 'explicit', 'food_keyword', 0.72),
    }];
  }

  return [{
    ...event,
    type: 'feeding_solid',
    occurredAt: explicitTime || systemTime(context),
    food: createField(normalized, 'explicit', 'fallback_text_as_food', 0.35),
  }];
}

function baseEvent(rawText, context) {
  return {
    rawText,
    familyId: context.familyId || 'local-family',
    babyId: context.babyId || 'local-baby',
    authorId: context.authorId || 'local-user',
    parser: 'rule-based-mvp',
  };
}

function systemTime(context) {
  return createField(toIso(context.now), 'system', 'current_time', 1);
}

function looksLikeSleep(text) {
  return /낮잠|밤잠|잠|수면|잔다|잠듦|잠들/.test(text);
}

function looksLikeSleepEnd(text) {
  return /깸|깨|일어남|일어났|잠.*잤|낮잠.*잤|수면.*끝/.test(text);
}

function looksLikeMilk(text) {
  return /분유|수유|모유|젖|milk|formula/.test(text);
}

function looksLikeBreast(text) {
  return /모유|젖/.test(text);
}

function looksLikeSolid(text) {
  return /이유식|밥|죽|고구마|감자|바나나|사과|소고기|닭고기|먹/.test(text);
}

function looksLikeDiaper(text) {
  return /기저귀|응가|똥|쉬|소변|대변/.test(text);
}

function dirtyDiaper(text) {
  return /응가|똥|대변/.test(text);
}

function extractAmountMl(text) {
  const match = text.match(/(\d{2,3})\s?(ml|미리|밀리)?/i);
  return match ? Number(match[1]) : null;
}

function extractFood(text) {
  const cleaned = text
    .replace(/먹음|먹었음|먹었다|먹임|먹였음|이유식|밥|조금|많이|보통/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || '이유식';
}

function extractExplicitTime(text, now = new Date()) {
  const match = text.match(/(오전|오후|아침|점심|저녁|밤)?\s*(\d{1,2})\s*시(?:\s*(반|[0-5]?\d)\s*분?)?/);
  if (!match) return null;
  const date = new Date(now);
  let hour = Number(match[2]);
  const minute = match[3] === '반' ? 30 : Number(match[3] || 0);
  const marker = match[1] || '';
  if ((marker === '오후' || marker === '점심' || marker === '저녁' || marker === '밤') && hour < 12) hour += 12;
  if ((marker === '아침' || marker === '오전') && hour === 12) hour = 0;
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

