import { createField } from './baby-events.js';

export function linkSleepSessions(events, existingEvents = []) {
  const openSleep = findOpenSleep(existingEvents);

  return events.map((event) => {
    if (event.type !== 'sleep') return event;
    if (event.action?.value !== 'end' || !openSleep) return event;

    return {
      ...event,
      linkedStartEventId: openSleep.id,
      startAt: openSleep.startAt,
      durationMinutes: createField(minutesBetween(openSleep.startAt.value, event.endAt.value), 'system', 'open_sleep_session', 1),
      status: 'completed',
    };
  });
}

export function createAutoWakeEvents(events, existingEvents = [], options = {}) {
  const openSleep = findOpenSleep(existingEvents);
  if (!openSleep) return [];
  const hasExplicitSleepEnd = events.some((event) => event.type === 'sleep' && event.action?.value === 'end');
  const hasAwakeOnlyActivity = events.some(isAwakeOnlyActivity);
  if (!hasAwakeOnlyActivity || hasExplicitSleepEnd) return [];

  const endAt = firstAwakeOnlyActivityTime(events) || options.now || new Date().toISOString();
  return [{
    rawText: 'auto wake',
    familyId: openSleep.familyId,
    babyId: openSleep.babyId,
    authorId: options.authorId,
    parser: 'system:auto-wake',
    parserInfo: { kind: 'system', provider: 'local', model: 'auto-wake', label: 'System · auto-wake' },
    type: 'sleep',
    action: createField('end', 'system', 'activity_during_open_sleep', 0.9),
    startAt: openSleep.startAt,
    endAt: createField(endAt, 'system', 'activity_during_open_sleep', 0.9),
    durationMinutes: createField(minutesBetween(openSleep.startAt.value, endAt), 'system', 'activity_during_open_sleep', 0.9),
    linkedStartEventId: openSleep.id,
    status: 'completed',
    hiddenFromTimeline: true,
  }];
}

export function completedOpenSleepUpdate(endEvent, openSleep) {
  if (!endEvent?.linkedStartEventId || !openSleep) return null;
  const endAt = endEvent.endAt?.value;
  if (!endAt) return null;
  return {
    ...openSleep,
    endAt: endEvent.endAt,
    durationMinutes: endEvent.durationMinutes || createField(minutesBetween(openSleep.startAt.value, endAt), 'system', 'open_sleep_session', 1),
    linkedEndEventId: endEvent.id,
    status: 'completed',
  };
}

export function isOpenSleepEvent(event) {
  return event.type === 'sleep' && event.action?.value === 'start' && event.status !== 'completed';
}

export function isAwakeOnlyActivity(event) {
  return ['feeding_milk', 'feeding_solid', 'diaper'].includes(event?.type);
}

export function findOpenSleep(events = []) {
  return [...events].reverse().find(isOpenSleepEvent);
}

function minutesBetween(startValue, endValue) {
  return Math.max(0, Math.round((new Date(endValue) - new Date(startValue)) / 60000));
}

function firstAwakeOnlyActivityTime(events) {
  const event = events.find((item) => isAwakeOnlyActivity(item) && (item.occurredAt?.value || item.startAt?.value || item.endAt?.value));
  return event?.occurredAt?.value || event?.startAt?.value || event?.endAt?.value || null;
}
