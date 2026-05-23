export function createId(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createTestIdFactory() {
  const counters = new Map();
  return (prefix = 'id') => {
    const next = (counters.get(prefix) || 0) + 1;
    counters.set(prefix, next);
    return `${prefix}-test-${String(next).padStart(3, '0')}`;
  };
}

