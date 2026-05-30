import { createField } from './baby-events.js';
import { defaultsForProfile } from './profile-defaults.js';

export function applyInferences(events, context = {}) {
  const defaults = defaultsForProfile(context.profile, new Date(context.now || Date.now()));
  return events.map((event) => inferEvent(event, defaults, context));
}

function inferEvent(event, defaults, context) {
  if (event.type === 'feeding_milk') {
    return {
      ...event,
      amountMl: event.amountMl || createField(
        recentAverage(context.recentEvents, 'feeding_milk', 'amountMl') || defaults.milkAmountMl,
        'inferred',
        recentAverage(context.recentEvents, 'feeding_milk', 'amountMl') ? 'recent_average' : 'profile_or_age_default',
        0.62,
      ),
    };
  }

  if (event.type === 'feeding_solid') {
    return {
      ...event,
      amount: event.amount || createField(defaults.solidAmount, 'inferred', 'profile_or_age_default', 0.46),
    };
  }

  if (event.type === 'sleep') {
    return inferSleep(event, defaults, context);
  }

  return event;
}

function inferSleep(event, defaults, context) {
  const napDuration = recentSleepDuration(context.recentEvents) || defaults.napDurationMinutes;

  if (event.action?.value === 'end' && !event.startAt) {
    return {
      ...event,
      startAt: createField(
        addMinutes(event.endAt.value, -napDuration),
        'inferred',
        recentSleepDuration(context.recentEvents) ? 'recent_sleep_average' : 'profile_or_age_default',
        0.55,
      ),
      durationMinutes: createField(napDuration, 'inferred', 'profile_or_age_default', 0.5),
    };
  }

  if (event.action?.value === 'start' && !event.endAt) {
    return event;
  }

  if (event.startAt && event.endAt && !event.durationMinutes) {
    return {
      ...event,
      durationMinutes: createField(minutesBetween(event.startAt.value, event.endAt.value), 'system', 'start_end_difference', 1),
    };
  }

  return event;
}

function recentAverage(events = [], type, fieldName) {
  const values = events
    .filter((event) => event.type === type)
    .map((event) => Number(event[fieldName]?.value))
    .filter(Number.isFinite);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function recentSleepDuration(events = []) {
  const durations = events
    .filter((event) => event.type === 'sleep' && event.status === 'completed')
    .map((event) => Number(event.durationMinutes?.value))
    .filter(Number.isFinite);
  if (!durations.length) return null;
  return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
}

function addMinutes(dateValue, minutes) {
  const date = new Date(dateValue);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function minutesBetween(startValue, endValue) {
  return Math.max(0, Math.round((new Date(endValue) - new Date(startValue)) / 60000));
}

