import { buildCareForecast, normalizeForecastPeriodDays } from './care-forecast.js';

const MINUTE_MS = 60 * 1000;
const DEFAULT_OFFSET_MINUTES = 30;
const OFFSET_OPTIONS = Object.freeze([10, 20, 30, 45, 60]);

export function normalizeMilkReminderOffsetMinutes(value) {
  const parsed = Number(value);
  return OFFSET_OPTIONS.includes(parsed) ? parsed : DEFAULT_OFFSET_MINUTES;
}

export function normalizeNotificationSettings(settings = {}) {
  return {
    milkReminderEnabled: Boolean(settings.milkReminderEnabled),
    milkReminderOffsetMinutes: normalizeMilkReminderOffsetMinutes(settings.milkReminderOffsetMinutes),
  };
}

export function buildMilkReminderJob(settings = {}, events = [], options = {}) {
  const normalized = normalizeNotificationSettings(settings);
  if (!normalized.milkReminderEnabled) return null;

  const now = coerceDate(options.now) || new Date();
  const forecast = buildCareForecast(events, {
    now,
    periodDays: normalizeForecastPeriodDays(options.periodDays),
  }).milk;
  const target = coerceDate(forecast?.nextAt);
  if (!target || target.getTime() <= now.getTime()) return null;

  const rawNotifyAt = new Date(target.getTime() - normalized.milkReminderOffsetMinutes * MINUTE_MS);
  const staleCutoff = new Date(now.getTime() - 10 * MINUTE_MS);
  if (rawNotifyAt < staleCutoff) return null;
  const notifyAt = rawNotifyAt < now ? now : rawNotifyAt;
  const targetAt = target.toISOString();
  const offset = normalized.milkReminderOffsetMinutes;
  return {
    familyId: options.familyId,
    babyId: options.babyId,
    userId: options.userId,
    type: 'milk_reminder',
    targetAt,
    notifyAt: notifyAt.toISOString(),
    title: 'Milk reminder',
    body: `Next milk is estimated around ${clockLabel(target)}.`,
    dedupeKey: `milk-reminder:${options.babyId}:${targetAt}:${offset}`,
    metadata: {
      offsetMinutes: offset,
      forecast,
    },
  };
}

function coerceDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clockLabel(date) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}
