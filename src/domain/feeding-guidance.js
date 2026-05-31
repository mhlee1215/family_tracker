const DAY_MS = 24 * 60 * 60 * 1000;

export const FEEDING_GUIDANCE_SOURCES = [
  {
    label: 'CDC formula feeding frequency',
    url: 'https://www.cdc.gov/infant-toddler-nutrition/formula-feeding/how-much-and-how-often.html',
  },
  {
    label: 'AAP HealthyChildren formula amounts',
    url: 'https://www.healthychildren.org/English/ages-stages/baby/formula-feeding/Pages/Amount-and-Schedule-of-Formula-Feedings.aspx',
  },
  {
    label: 'CDC newborn breastfeeding basics',
    url: 'https://www.cdc.gov/infant-toddler-nutrition/breastfeeding/newborn-basics.html',
  },
];

export function buildFeedingGuidance({
  profile = {},
  events = [],
  previousEvents = [],
  selectedDay,
  now = new Date(),
} = {}) {
  const safeDay = isDateKey(selectedDay) ? selectedDay : localDateKey(now);
  const ageDays = babyAgeDays(profile.birthDate, safeDay);
  const dayProgress = progressForDay(safeDay, now);
  const today = feedingMetrics(events);
  const yesterday = feedingMetrics(filterEventsThroughDayProgress(previousEvents, shiftDateKey(safeDay, -1), dayProgress));
  const guideline = selectBottleFeedingGuideline({ ageDays, profile });
  const comparison = guideline ? compareWithGuideline(today, guideline, dayProgress) : null;
  const yesterdayComparison = compareWithYesterday(today, yesterday);

  return {
    selectedDay: safeDay,
    ageDays,
    stageLabel: feedingStageLabel(ageDays),
    today,
    yesterday,
    guideline,
    dayProgress,
    comparison,
    yesterdayComparison,
    sources: FEEDING_GUIDANCE_SOURCES,
    summary: guidanceSummary({ ageDays, today, guideline, comparison, yesterdayComparison }),
    suggestions: guidanceSuggestions({ ageDays, today, guideline, comparison }),
  };
}

export function feedingMetrics(events = []) {
  const milkEvents = events.filter((event) => event?.type === 'feeding_milk' && !event.hiddenFromTimeline);
  const amounts = milkEvents
    .map((event) => Number(event.amountMl?.value))
    .filter((value) => Number.isFinite(value) && value > 0);
  const totalAmountMl = Math.round(amounts.reduce((sum, value) => sum + value, 0));
  const feedCount = milkEvents.length;
  const averageAmountMl = amounts.length ? Math.round(totalAmountMl / amounts.length) : null;
  const lastFeedAt = latestEventTime(milkEvents);
  return { feedCount, amountCount: amounts.length, totalAmountMl, averageAmountMl, lastFeedAt };
}

export function selectBottleFeedingGuideline({ ageDays, profile = {} } = {}) {
  if (!Number.isFinite(ageDays) || ageDays < 0) return null;
  const personalAmount = positiveNumber(profile.milkAmountMlOverride);
  if (ageDays <= 30) {
    const amountPerFeedMl = personalAmount
      ? { min: personalAmount, max: personalAmount, basis: 'baby profile default' }
      : ageDays <= 7
        ? { min: 30, max: 60, basis: 'general newborn range' }
        : { min: 60, max: 90, basis: 'general 2–4 week range' };
    return {
      id: 'bottle_feeding_newborn_0_30_days',
      label: 'Newborn bottle-feeding guide',
      ageRangeDays: { min: 0, max: 30 },
      dailyFeedCount: { min: 8, max: 12 },
      amountPerFeedMl,
      note: 'Bottle-fed newborns often feed frequently; use hunger cues, wet diapers, growth, and clinician advice alongside any volume target.',
    };
  }
  return {
    id: 'feeding_guidance_after_newborn',
    label: 'Feeding pattern check',
    ageRangeDays: { min: 31, max: 365 },
    dailyFeedCount: null,
    amountPerFeedMl: personalAmount ? { min: personalAmount, max: personalAmount, basis: 'baby profile default' } : null,
    note: 'After the newborn stage, feeding patterns vary more by weight, growth, and feeding method. Compare with your baby’s recent baseline and clinician guidance.',
  };
}

export function compareWithGuideline(metrics, guideline, dayProgress) {
  const feedCount = guideline.dailyFeedCount ? expectedRange(guideline.dailyFeedCount, dayProgress) : null;
  const amount = guideline.dailyFeedCount && guideline.amountPerFeedMl
    ? expectedRange({
      min: guideline.dailyFeedCount.min * guideline.amountPerFeedMl.min,
      max: guideline.dailyFeedCount.max * guideline.amountPerFeedMl.max,
    }, dayProgress)
    : null;
  return {
    feedCount,
    amount,
    feedCountStatus: feedCount ? classifyRange(metrics.feedCount, feedCount) : 'not_enough_data',
    amountStatus: amount && metrics.amountCount ? classifyRange(metrics.totalAmountMl, amount) : 'not_enough_data',
    averageStatus: guideline.amountPerFeedMl && metrics.averageAmountMl
      ? classifyRange(metrics.averageAmountMl, guideline.amountPerFeedMl)
      : 'not_enough_data',
  };
}

export function compareWithYesterday(today, yesterday) {
  return {
    feedCountDelta: today.feedCount - yesterday.feedCount,
    totalAmountDeltaMl: today.totalAmountMl - yesterday.totalAmountMl,
    averageAmountDeltaMl: today.averageAmountMl !== null && yesterday.averageAmountMl !== null
      ? today.averageAmountMl - yesterday.averageAmountMl
      : null,
    hasYesterday: yesterday.feedCount > 0 || yesterday.totalAmountMl > 0,
  };
}

function expectedRange(range, progress) {
  return {
    min: Math.round(range.min * progress),
    max: Math.round(range.max * progress),
  };
}

export function classifyRange(actual, range) {
  if (!Number.isFinite(actual) || !range) return 'not_enough_data';
  if (actual < range.min * 0.8) return 'low';
  if (actual < range.min) return 'slightly_low';
  if (actual <= range.max) return 'within_range';
  if (actual <= range.max * 1.2) return 'slightly_high';
  return 'high';
}

function guidanceSummary({ ageDays, today, guideline, comparison, yesterdayComparison }) {
  if (!Number.isFinite(ageDays)) return 'Add a birth date in Baby settings to unlock age-based feeding guidance.';
  if (!guideline?.dailyFeedCount) return 'Use today’s milk records as a trend check and compare with your baby’s recent baseline.';
  if (today.feedCount === 0) return 'No milk feeds are logged for this day yet. Add feeds to compare progress with the newborn guide.';
  const countText = statusText(comparison.feedCountStatus, 'frequency');
  const amountText = comparison.amountStatus === 'not_enough_data'
    ? 'volume needs ml records'
    : statusText(comparison.amountStatus, 'volume');
  const yesterdayText = yesterdayComparison.hasYesterday
    ? ` Compared with yesterday so far: ${signedMl(yesterdayComparison.totalAmountDeltaMl)} and ${signedCount(yesterdayComparison.feedCountDelta)}.`
    : '';
  return `Current records show ${countText}; ${amountText}.${yesterdayText}`;
}

function guidanceSuggestions({ ageDays, today, guideline, comparison }) {
  if (!Number.isFinite(ageDays)) return ['Set birth date/time so guidance can match the baby’s current stage.'];
  const suggestions = [
    'Use this as a progress check, not a diagnosis; baby cues, wet diapers, weight gain, and clinician guidance matter too.',
  ];
  if (!today.feedCount) {
    suggestions.unshift('Log the next milk feed with ml when possible so the progress card can compare amount and frequency.');
    return suggestions;
  }
  if (comparison?.amountStatus === 'low' || comparison?.amountStatus === 'slightly_low') {
    suggestions.unshift('If records are complete and baby shows hunger cues, consider offering the next feed sooner and watch wet diapers/alertness.');
  } else if (comparison?.amountStatus === 'high' || comparison?.amountStatus === 'slightly_high') {
    suggestions.unshift('If baby seems uncomfortable, spits up often, or feeds very fast, check pacing and discuss concerns with a clinician.');
  } else {
    suggestions.unshift('Keep following hunger/fullness cues and continue logging feeds as the day progresses.');
  }
  if (guideline?.amountPerFeedMl?.basis === 'baby profile default') {
    suggestions.push('This comparison uses the default milk amount saved in Baby settings as the per-feed target.');
  }
  return suggestions;
}

function statusText(status, label) {
  const prefix = label === 'frequency' ? 'feed count' : 'total volume';
  return {
    low: `${prefix} is below the expected pace`,
    slightly_low: `${prefix} is a little below the expected pace`,
    within_range: `${prefix} is within the expected pace`,
    slightly_high: `${prefix} is a little above the expected pace`,
    high: `${prefix} is above the expected pace`,
    not_enough_data: `${prefix} needs more data`,
  }[status] || `${prefix} needs more data`;
}

function feedingStageLabel(ageDays) {
  if (!Number.isFinite(ageDays)) return 'Age-based guide unavailable';
  if (ageDays < 7) return `Day ${ageDays + 1} newborn`;
  if (ageDays <= 30) return `Week ${Math.floor(ageDays / 7) + 1} newborn`;
  if (ageDays < 183) return `${Math.floor(ageDays / 30)} month feeding pattern`;
  return `${Math.floor(ageDays / 30)} month feeding + solids pattern`;
}

function babyAgeDays(birthDate, selectedDay) {
  if (!isDateKey(birthDate) || !isDateKey(selectedDay)) return null;
  const diff = dateFromKey(selectedDay).getTime() - dateFromKey(birthDate).getTime();
  return Math.max(0, Math.floor(diff / DAY_MS));
}

function progressForDay(day, now) {
  const selectedStart = dateFromKey(day).getTime();
  const todayStart = dateFromKey(localDateKey(now)).getTime();
  if (selectedStart < todayStart) return 1;
  if (selectedStart > todayStart) return 0;
  return Math.min(1, Math.max(0, (now.getTime() - selectedStart) / DAY_MS));
}

function filterEventsThroughDayProgress(events = [], day, progress) {
  if (progress >= 1) return events;
  const cutoff = dateFromKey(day).getTime() + DAY_MS * progress;
  return events.filter((event) => {
    const value = event?.occurredAt?.value || event?.startAt?.value || event?.endAt?.value || event?.createdAt;
    if (!value) return true;
    const time = new Date(value).getTime();
    return Number.isFinite(time) && time <= cutoff;
  });
}

function latestEventTime(events) {
  return events
    .map((event) => event.occurredAt?.value || event.startAt?.value || event.endAt?.value || event.createdAt)
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || null;
}

function signedMl(value) {
  if (value === 0) return 'same ml';
  return `${Math.abs(value)}ml ${value > 0 ? 'more' : 'less'}`;
}

function signedCount(value) {
  if (value === 0) return 'same feed count';
  return `${Math.abs(value)} ${Math.abs(value) === 1 ? 'feed' : 'feeds'} ${value > 0 ? 'more' : 'fewer'}`;
}

function positiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '');
}

function shiftDateKey(day, days) {
  const date = dateFromKey(day);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromKey(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}
