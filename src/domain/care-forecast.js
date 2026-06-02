const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DEFAULT_PERIOD_DAYS = 7;

const RULES = Object.freeze({
  milk: {
    type: 'feeding_milk',
    minimumSamples: 2,
    minimumIntervalMinutes: 30,
    maximumIntervalMinutes: 8 * 60,
    amountField: 'amountMl',
  },
  diaper: {
    type: 'diaper',
    minimumSamples: 2,
    minimumIntervalMinutes: 20,
    maximumIntervalMinutes: 12 * 60,
  },
});

export function buildCareForecast(events = [], options = {}) {
  const now = coerceDate(options.now) || new Date();
  const periodDays = normalizeForecastPeriodDays(options.periodDays);
  const start = new Date(now.getTime() - periodDays * DAY_MS);
  const visibleEvents = events.filter((event) => !event.hiddenFromTimeline);
  const windowEvents = visibleEvents.filter((event) => {
    const time = eventPointDate(event);
    return time && time >= start && time <= now;
  });

  return {
    generatedAt: now.toISOString(),
    periodDays,
    rangeStart: start.toISOString(),
    milk: forecastMilk(windowEvents, now, periodDays),
    diaper: forecastDiaper(windowEvents, now, periodDays),
  };
}

export function normalizeForecastPeriodDays(value) {
  const parsed = Number(value);
  return [1, 7, 30].includes(parsed) ? parsed : DEFAULT_PERIOD_DAYS;
}

function forecastMilk(events, now, periodDays) {
  const milkEvents = pointEventsOfType(events, RULES.milk.type);
  const intervals = intervalStats(milkEvents, RULES.milk);
  const amountStats = valueStats(milkEvents.map((item) => Number(item.event.amountMl?.value)).filter(isPositiveFinite));
  const basis = {
    periodDays,
    sampleCount: milkEvents.length,
    intervalCount: intervals.used.length,
    rawIntervalCount: intervals.raw.length,
    excludedOutliers: intervals.excluded,
    medianIntervalMinutes: intervals.median,
    averageIntervalMinutes: intervals.average,
    intervalMinutes: intervals.used.slice(-8),
    intervalSamples: intervals.usedSamples.slice(-8),
    amountSampleCount: amountStats.count,
    medianAmountMl: amountStats.median,
    amountRangeMl: amountStats.range,
    lastEventAt: milkEvents.at(-1)?.time.toISOString() || null,
  };

  if (milkEvents.length < RULES.milk.minimumSamples || !intervals.median) {
    return notEnoughData('Add at least two milk logs in this baseline to estimate the next feed.', basis);
  }

  const last = milkEvents.at(-1);
  const nextAt = new Date(last.time.getTime() + intervals.median * MINUTE_MS);
  const remainingMinutes = Math.round((nextAt.getTime() - now.getTime()) / MINUTE_MS);
  return {
    status: dueStatus(remainingMinutes),
    nextAt: nextAt.toISOString(),
    remainingMinutes,
    amountMl: amountStats.count ? {
      value: amountStats.median,
      range: amountStats.range,
    } : null,
    message: amountStats.count ? 'Estimated from recent milk amounts.' : 'Add milk amounts to estimate how much to offer.',
    basis,
  };
}

function forecastDiaper(events, now, periodDays) {
  const diaperEvents = pointEventsOfType(events, RULES.diaper.type);
  const intervals = intervalStats(diaperEvents, RULES.diaper);
  const kindCounts = diaperEvents.reduce((counts, item) => {
    const kind = item.event.diaperKind?.value || 'wet_or_unspecified';
    counts[kind] = (counts[kind] || 0) + 1;
    return counts;
  }, {});
  const basis = {
    periodDays,
    sampleCount: diaperEvents.length,
    intervalCount: intervals.used.length,
    rawIntervalCount: intervals.raw.length,
    excludedOutliers: intervals.excluded,
    medianIntervalMinutes: intervals.median,
    averageIntervalMinutes: intervals.average,
    intervalMinutes: intervals.used.slice(-8),
    intervalSamples: intervals.usedSamples.slice(-8),
    diaperKinds: kindCounts,
    lastEventAt: diaperEvents.at(-1)?.time.toISOString() || null,
  };

  if (diaperEvents.length < RULES.diaper.minimumSamples || !intervals.median) {
    return notEnoughData('Add at least two diaper logs in this baseline to estimate the next change.', basis);
  }

  const last = diaperEvents.at(-1);
  const nextAt = new Date(last.time.getTime() + intervals.median * MINUTE_MS);
  const remainingMinutes = Math.round((nextAt.getTime() - now.getTime()) / MINUTE_MS);
  return {
    status: dueStatus(remainingMinutes),
    nextAt: nextAt.toISOString(),
    remainingMinutes,
    message: 'Estimated from recent diaper-change intervals.',
    basis,
  };
}

function pointEventsOfType(events, type) {
  return events
    .filter((event) => event.type === type)
    .map((event) => ({ event, time: eventPointDate(event) }))
    .filter((item) => item.time)
    .sort((a, b) => a.time.getTime() - b.time.getTime());
}

function intervalStats(items, rules) {
  const rawSamples = [];
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    const minutes = Math.round((current.time.getTime() - previous.time.getTime()) / MINUTE_MS);
    if (Number.isFinite(minutes) && minutes > 0) {
      rawSamples.push({
        minutes,
        startedAt: previous.time.toISOString(),
        endedAt: current.time.toISOString(),
      });
    }
  }
  const usedSamples = rawSamples.filter((sample) => sample.minutes >= rules.minimumIntervalMinutes && sample.minutes <= rules.maximumIntervalMinutes);
  const raw = rawSamples.map((sample) => sample.minutes);
  const used = usedSamples.map((sample) => sample.minutes);
  return {
    raw,
    used,
    rawSamples,
    usedSamples,
    excluded: Math.max(0, raw.length - used.length),
    median: median(used),
    average: used.length ? Math.round(used.reduce((sum, value) => sum + value, 0) / used.length) : null,
  };
}

function valueStats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = median(sorted);
  if (!sorted.length) return { count: 0, median: null, range: null };
  if (sorted.length === 1) return { count: 1, median: midpoint, range: [midpoint, midpoint] };
  return {
    count: sorted.length,
    median: midpoint,
    range: [quantile(sorted, 0.25), quantile(sorted, 0.75)],
  };
}

function notEnoughData(message, basis) {
  return {
    status: 'not_enough_data',
    nextAt: null,
    remainingMinutes: null,
    message,
    basis,
  };
}

function dueStatus(remainingMinutes) {
  if (remainingMinutes < -10) return 'overdue';
  if (remainingMinutes <= 20) return 'due_soon';
  return 'ready';
}

function eventPointDate(event) {
  const value = event?.occurredAt?.value || event?.startAt?.value || event?.endAt?.value;
  return coerceDate(value);
}

function coerceDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function quantile(sortedValues, percentile) {
  if (!sortedValues.length) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const index = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weighted = sortedValues[lower] * (upper - index) + sortedValues[upper] * (index - lower);
  return Math.round(weighted);
}

function isPositiveFinite(value) {
  return Number.isFinite(value) && value > 0;
}
