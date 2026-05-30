export function buildTodaySummary(events = []) {
  const visibleEvents = events.filter((event) => !event.hiddenFromTimeline);
  const sleeps = visibleEvents.filter((event) => (
    event.type === 'sleep'
    && Number.isFinite(Number(event.durationMinutes?.value))
    && !(event.action?.value === 'end' && event.linkedStartEventId)
  ));
  const milkFeeds = visibleEvents.filter((event) => event.type === 'feeding_milk');
  const solids = visibleEvents.filter((event) => event.type === 'feeding_solid');
  const diapers = visibleEvents.filter((event) => event.type === 'diaper');

  const sleepMinutes = sleeps.reduce((sum, event) => sum + Number(event.durationMinutes.value), 0);
  const milkAmount = milkFeeds.reduce((sum, event) => sum + Number(event.amountMl?.value || 0), 0);

  return {
    sleepMinutes,
    sleepLabel: formatMinutes(sleepMinutes),
    milkCount: milkFeeds.length,
    milkAmountMl: milkAmount,
    solidCount: solids.length,
    diaperCount: diapers.length,
  };
}

export function answerSimpleQuestion(question, events = []) {
  const summary = buildTodaySummary(events);
  const text = String(question || '');
  if (/수면|잠|낮잠/.test(text)) {
    return `오늘 기록 기준 총 수면은 ${summary.sleepLabel}입니다. 추정값이 포함된 기록은 타임라인에서 예상 표시로 구분됩니다.`;
  }
  if (/수유|분유|모유|milk/.test(text)) {
    return `오늘 수유는 ${summary.milkCount}회, 총 ${summary.milkAmountMl}ml로 기록되어 있습니다.`;
  }
  if (/기저귀|응가|쉬/.test(text)) {
    return `오늘 기저귀 기록은 ${summary.diaperCount}회입니다.`;
  }
  return `오늘은 수면 ${summary.sleepLabel}, 수유 ${summary.milkCount}회, 이유식 ${summary.solidCount}회, 기저귀 ${summary.diaperCount}회로 기록되어 있습니다.`;
}

function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}분`;
  if (!rest) return `${hours}시간`;
  return `${hours}시간 ${rest}분`;
}


export function buildTodayContext(events = [], options = {}) {
  const visibleEvents = events.filter((event) => !event.hiddenFromTimeline);
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const selectedDay = options.selectedDay || '';
  const today = options.today || localDateKey(now);
  const relative = !selectedDay || selectedDay === today;
  const lastMilk = latestEvent(visibleEvents.filter((event) => event.type === 'feeding_milk'));
  const lastDiaper = latestEvent(visibleEvents.filter((event) => event.type === 'diaper'));
  const openSleep = [...visibleEvents].reverse().find((event) => (
    event.type === 'sleep' && event.action?.value === 'start' && event.status !== 'completed' && !event.endAt?.value
  ));
  const lastCompletedSleep = latestEvent(visibleEvents.filter((event) => (
    event.type === 'sleep'
    && event.status === 'completed'
    && !(event.action?.value === 'end' && event.linkedStartEventId)
    && (event.endAt?.value || event.startAt?.value)
  )), (event) => event.endAt?.value || event.startAt?.value);
  const inferredFieldCount = visibleEvents.reduce((sum, event) => sum + Object.values(event).filter((value) => value?.source === 'inferred').length, 0);
  const correctedFieldCount = visibleEvents.reduce((sum, event) => sum + Object.values(event).filter((value) => value?.source === 'user_corrected').length, 0);

  return {
    generatedAt: now.toISOString(),
    relative,
    lastMilk: lastMilk ? contextItem(lastMilk, now, relative) : null,
    lastDiaper: lastDiaper ? { ...contextItem(lastDiaper, now, relative), diaperKind: lastDiaper.diaperKind?.value || 'wet_or_unspecified' } : null,
    sleep: openSleep ? {
      state: 'ongoing',
      eventId: openSleep.id,
      label: relative ? `${formatDuration(minutesBetween(openSleep.startAt?.value, now))} sleeping` : `Started ${formatClock(openSleep.startAt?.value)}`,
      startedAt: openSleep.startAt?.value || null,
      minutes: minutesBetween(openSleep.startAt?.value, now),
    } : lastCompletedSleep ? {
      state: 'completed',
      eventId: lastCompletedSleep.id,
      label: relative ? `Woke ${formatAgo(lastCompletedSleep.endAt?.value || lastCompletedSleep.startAt?.value, now)} ago` : `Woke ${formatClock(lastCompletedSleep.endAt?.value || lastCompletedSleep.startAt?.value)}`,
      endedAt: lastCompletedSleep.endAt?.value || null,
      durationMinutes: Number(lastCompletedSleep.durationMinutes?.value || 0),
    } : null,
    inferredFieldCount,
    correctedFieldCount,
  };
}

function latestEvent(events, getValue = eventTimeValue) {
  return [...events]
    .filter((event) => getValue(event))
    .sort((left, right) => new Date(getValue(right)) - new Date(getValue(left)))[0] || null;
}

function eventTimeValue(event) {
  return event.occurredAt?.value || event.startAt?.value || event.endAt?.value || event.createdAt;
}

function contextItem(event, now, relative) {
  const value = eventTimeValue(event);
  return {
    eventId: event.id,
    at: value,
    label: relative ? `${formatAgo(value, now)} ago` : formatClock(value),
    amountMl: event.amountMl?.value ?? null,
  };
}

function formatAgo(value, now) {
  return formatDuration(minutesBetween(value, now));
}

function formatDuration(minutes) {
  const safe = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

function minutesBetween(value, now) {
  if (!value) return 0;
  return Math.max(0, Math.round((new Date(now) - new Date(value)) / 60000));
}

function formatClock(value) {
  if (!value) return 'No time';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
