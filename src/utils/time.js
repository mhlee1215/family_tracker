export function utcRangeForLocalDay(day, timeZone = 'UTC') {
  const [year, month, date] = String(day).split('-').map(Number);
  if (!year || !month || !date) throw new Error('Day must be formatted as YYYY-MM-DD.');
  const start = zonedTimeToUtc({ year, month, date, hour: 0, minute: 0, second: 0, millisecond: 0 }, timeZone);
  const nextDay = new Date(Date.UTC(year, month - 1, date + 1));
  const end = zonedTimeToUtc({
    year: nextDay.getUTCFullYear(),
    month: nextDay.getUTCMonth() + 1,
    date: nextDay.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  }, timeZone);
  return { start: start.toISOString(), end: end.toISOString() };
}

function zonedTimeToUtc(target, timeZone) {
  let utc = new Date(Date.UTC(
    target.year,
    target.month - 1,
    target.date,
    target.hour,
    target.minute,
    target.second,
    target.millisecond,
  ));
  const targetUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.date,
    target.hour,
    target.minute,
    target.second,
    target.millisecond,
  );

  for (let index = 0; index < 4; index += 1) {
    const parts = zonedParts(utc, timeZone);
    const actualUtc = Date.UTC(parts.year, parts.month - 1, parts.date, parts.hour, parts.minute, parts.second, 0);
    const diff = actualUtc - targetUtc;
    if (diff === 0) break;
    utc = new Date(utc.getTime() - diff);
  }
  return utc;
}

function zonedParts(date, timeZone) {
  const values = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    year: Number(values.year),
    month: Number(values.month),
    date: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}
