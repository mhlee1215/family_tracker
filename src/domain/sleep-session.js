import { createField } from './baby-events.js';

export function linkSleepSessions(events, existingEvents = []) {
  const openSleep = [...existingEvents].reverse().find((event) => (
    event.type === 'sleep'
    && event.action?.value === 'start'
    && event.status !== 'completed'
  ));

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

export function isOpenSleepEvent(event) {
  return event.type === 'sleep' && event.action?.value === 'start' && event.status !== 'completed';
}

function minutesBetween(startValue, endValue) {
  return Math.max(0, Math.round((new Date(endValue) - new Date(startValue)) / 60000));
}

