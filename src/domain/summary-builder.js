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
