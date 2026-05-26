import { describe, it, expect, vi } from 'vitest';
import { wireMealDragHandle } from '../../app/meal-drag.js';

describe('meal drag handle wiring', () => {
  it('enables drag only from handle and moves id into dataTransfer', () => {
    const row = document.createElement('article');
    row.className = 'meal-item';
    row.draggable = false;
    const dragHandle = document.createElement('button');
    row.appendChild(dragHandle);
    document.body.appendChild(row);

    wireMealDragHandle({ row, dragHandle, mealId: 'meal-1' });

    dragHandle.onpointerdown();
    expect(row.draggable).toBe(true);

    const dataTransfer = {
      effectAllowed: 'none',
      setData: vi.fn(),
    };
    row.ondragstart({ dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'meal-1');
    expect(document.body.classList.contains('meal-dragging')).toBe(true);

    row.ondragend();
    expect(row.draggable).toBe(false);
    expect(document.body.classList.contains('meal-dragging')).toBe(false);
  });
});
