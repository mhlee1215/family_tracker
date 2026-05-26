import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { wireMealDragHandle } from '../app/meal-drag.js';

test('meal drag handle enables dragging and sets transfer payload', () => {
  const window = new Window();
  global.document = window.document;

  const row = document.createElement('article');
  row.className = 'meal-item';
  row.draggable = false;
  const dragHandle = document.createElement('button');
  row.appendChild(dragHandle);
  document.body.appendChild(row);

  wireMealDragHandle({ row, dragHandle, mealId: 'meal-1' });

  dragHandle.onpointerdown();
  assert.equal(row.draggable, true);

  let transferType = null;
  let transferValue = null;
  row.ondragstart({
    dataTransfer: {
      effectAllowed: 'none',
      setData(type, value) {
        transferType = type;
        transferValue = value;
      },
    },
  });

  assert.equal(transferType, 'text/plain');
  assert.equal(transferValue, 'meal-1');
  assert.equal(document.body.classList.contains('meal-dragging'), true);
  assert.equal(row.classList.contains('dragging'), true);

  row.ondragend();
  assert.equal(row.draggable, false);
  assert.equal(document.body.classList.contains('meal-dragging'), false);
});


test('meal drag handle can initiate drag repeatedly even after pointerup between drags', () => {
  const window = new Window();
  global.document = window.document;

  const row = document.createElement('article');
  const dragHandle = document.createElement('button');
  row.appendChild(dragHandle);
  document.body.appendChild(row);

  wireMealDragHandle({ row, dragHandle, mealId: 'meal-2' });

  dragHandle.onpointerdown();
  row.ondragstart({ dataTransfer: { setData() {} } });
  row.ondragend();

  dragHandle.onpointerdown();
  dragHandle.onpointerup?.();
  row.ondragstart({ dataTransfer: { setData() {} } });

  assert.equal(document.body.classList.contains('meal-dragging'), true);
});
