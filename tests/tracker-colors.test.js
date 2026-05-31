import test from 'node:test';
import assert from 'node:assert/strict';
import {
  babyActionIconColors,
  babySummaryLabelColors,
  colorForBabyEventType,
  mealSlotColors,
} from '../src/utils/tracker-colors.js';

test('baby calendar event colors match baby tracker accents', () => {
  assert.equal(colorForBabyEventType('sleep'), babyActionIconColors.sleep);
  assert.equal(colorForBabyEventType('feeding_milk'), babyActionIconColors.formula);
  assert.equal(colorForBabyEventType('feeding_milk'), babySummaryLabelColors.Milk);
  assert.equal(colorForBabyEventType('feeding_solid'), babyActionIconColors.solids);
  assert.equal(colorForBabyEventType('diaper'), babyActionIconColors.dirty);
  assert.equal(colorForBabyEventType('milestone'), babyActionIconColors.moment);
});

test('meal calendar colors match planned meal slot accents', () => {
  assert.deepEqual(Object.keys(mealSlotColors), ['breakfast', 'lunch', 'dinner']);
  assert.equal(mealSlotColors.breakfast, '#f59e0b');
  assert.equal(mealSlotColors.lunch, '#22c55e');
  assert.equal(mealSlotColors.dinner, '#8b5cf6');
});
