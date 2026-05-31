export const eventTypes = ['sleep', 'feeding_milk', 'feeding_solid', 'diaper', 'milestone'];

export function createField(value, source, basis, confidence = 1) {
  return { value, source, basis, confidence };
}

export function isInferredField(field) {
  return field?.source === 'inferred';
}

export function eventDisplayTitle(event) {
  if (event.type === 'sleep') {
    if (event.action?.value === 'end') return '수면 종료';
    if (event.status === 'completed') return '수면';
    return '수면 시작';
  }
  if (event.type === 'feeding_milk') return '수유';
  if (event.type === 'feeding_solid') return '이유식';
  if (event.type === 'diaper') {
    if (event.diaperKind?.value === 'mixed') return '똥/오줌';
    return event.diaperKind?.value === 'dirty' ? '응가' : '기저귀';
  }
  return '기록';
}

export function serializeEvent(event) {
  return JSON.stringify(event);
}

export function parseEvent(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

