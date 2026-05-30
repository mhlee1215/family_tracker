export const babyTrackerColors = Object.freeze({
  sleep: '#6366f1',
  milk: '#0ea5e9',
  solids: '#f59e0b',
  diaper: '#22c55e',
  fallback: '#9ca3af',
});

export const babyEventTypeColors = Object.freeze({
  sleep: babyTrackerColors.sleep,
  feeding_milk: babyTrackerColors.milk,
  feeding_solid: babyTrackerColors.solids,
  diaper: babyTrackerColors.diaper,
});

export const babyActionIconColors = Object.freeze({
  sleep: babyTrackerColors.sleep,
  wake: babyTrackerColors.sleep,
  formula: babyTrackerColors.milk,
  breast: babyTrackerColors.milk,
  solids: babyTrackerColors.solids,
  dirty: babyTrackerColors.diaper,
  wet: babyTrackerColors.diaper,
});

export const babySummaryLabelColors = Object.freeze({
  Sleep: babyTrackerColors.sleep,
  Milk: babyTrackerColors.milk,
  Solids: babyTrackerColors.solids,
  Diaper: babyTrackerColors.diaper,
});

export const mealSlotColors = Object.freeze({
  breakfast: '#f59e0b',
  lunch: '#22c55e',
  dinner: '#8b5cf6',
});

export function colorForBabyEventType(type) {
  return babyEventTypeColors[type] || babyTrackerColors.fallback;
}
