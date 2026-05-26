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

test('meal drag state is cleaned when drop happens without row dragend (re-render scenario)', () => {
  const window = new Window();
  global.document = window.document;

  const row = document.createElement('article');
  row.className = 'meal-item';
  const dragHandle = document.createElement('button');
  row.appendChild(dragHandle);
  document.body.appendChild(row);

  wireMealDragHandle({ row, dragHandle, mealId: 'meal-2' });

  dragHandle.onpointerdown();
  row.ondragstart({ dataTransfer: { setData() {}, effectAllowed: 'none' } });
  assert.equal(document.body.classList.contains('meal-dragging'), true);

  row.remove();
  document.dispatchEvent(new window.Event('drop'));

  assert.equal(document.body.classList.contains('meal-dragging'), false);
});

test('meal drag wiring does not accumulate document drop listeners across re-renders', () => {
  const window = new Window();
  global.document = window.document;

  const originalAddEventListener = document.addEventListener.bind(document);
  let dropListenerCount = 0;
  document.addEventListener = (type, listener, options) => {
    if (type === 'drop') dropListenerCount += 1;
    return originalAddEventListener(type, listener, options);
  };

  const createMealRow = (id) => {
    const row = document.createElement('article');
    const dragHandle = document.createElement('button');
    row.appendChild(dragHandle);
    document.body.appendChild(row);
    wireMealDragHandle({ row, dragHandle, mealId: id });
    return row;
  };

  createMealRow('meal-a');
  createMealRow('meal-b');
  createMealRow('meal-c');

  assert.equal(
    dropListenerCount,
    1,
    'drop listener should be registered once globally; repeated registration indicates re-render leak',
  );
});


test('meal row dragstart is blocked unless drag was armed from the handle', () => {
  const window = new Window();
  global.document = window.document;

  const row = document.createElement('article');
  const dragHandle = document.createElement('button');
  row.appendChild(dragHandle);
  document.body.appendChild(row);

  wireMealDragHandle({ row, dragHandle, mealId: 'meal-3' });

  let blocked = false;
  row.ondragstart({
    preventDefault() { blocked = true; },
    dataTransfer: { setData() {} },
  });

  assert.equal(blocked, true);
  assert.equal(document.body.classList.contains('meal-dragging'), false);

  dragHandle.onpointerdown();
  row.ondragstart({ dataTransfer: { setData() {} } });
  assert.equal(document.body.classList.contains('meal-dragging'), true);
});
