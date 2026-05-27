import { test, expect } from '@playwright/test';
import { AppHarness } from '../helpers/app-harness.js';

async function dragMeal(page, mealName, toSlotSelector) {
  await page.evaluate(({ mealName, toSlotSelector }) => {
    const source = Array.from(document.querySelectorAll('.meal-item')).find((el) =>
      el.textContent?.includes(mealName)
    );
    const target = document.querySelector(toSlotSelector);
    if (!source || !target) {
      throw new Error(`Missing source or target for drag: ${mealName} -> ${toSlotSelector}`);
    }

    const dataTransfer = new DataTransfer();
    const handle = source.querySelector('.meal-item-handle');
    handle?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
  }, { mealName, toSlotSelector });
}

test.describe('Meal drag/drop reliability', () => {
  test('dragging planned menu to empty wish list works with real pointer interaction', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin();

    await page.addInitScript(() => {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem('familyTracker.meals', JSON.stringify({
        lastDay: today,
        breakfast: [{ id: 'meal-b-1', name: 'Egg toast', category: 'korean', url: '', ingredients: '', done: false, day: today }],
        lunch: [],
        dinner: [],
        wish: [],
        log: [],
      }));
    });

    await page.goto('/');
    await page.locator('#meal-tab').click();
    await expect(page.locator('#wish-list .meal-item')).toHaveCount(0);
    await expect(page.locator('#meal-breakfast .meal-item', { hasText: 'Egg toast' })).toHaveCount(1);

    await page.locator('#meal-breakfast .meal-item .meal-item-handle').dragTo(page.locator('#wish-list'));

    await expect(page.locator('#wish-list .meal-item', { hasText: 'Egg toast' })).toHaveCount(1);
    await expect(page.locator('#meal-breakfast .meal-item', { hasText: 'Egg toast' })).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveClass(/meal-dragging/);
  });

  test('BUG: drag should start only from handle, not entire meal card', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin();

    await page.addInitScript(() => {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem('familyTracker.meals', JSON.stringify({
        lastDay: today,
        breakfast: [{ id: 'meal-b-1', name: 'Egg toast', category: 'korean', url: '', ingredients: 'bread, egg', done: false, day: today }],
        lunch: [],
        dinner: [],
        wish: [],
        log: [],
      }));
    });

    await page.goto('/');
    await page.locator('#meal-tab').click();
    await expect(page.locator('#meal-breakfast .meal-item', { hasText: 'Egg toast' })).toHaveCount(1);

    await page.locator('#meal-breakfast .meal-item .meal-thumb').dragTo(page.locator('#wish-list'));

    // Expected UX: non-handle drag should not move item.
    // Current implementation moves it, so this assertion reveals the bug.
    await expect(page.locator('#meal-breakfast .meal-item', { hasText: 'Egg toast' })).toHaveCount(1);
    await expect(page.locator('#wish-list .meal-item', { hasText: 'Egg toast' })).toHaveCount(0);
  });

  

  test('menu (breakfast/lunch/dinner) <-> wish menu drag/drop cases', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin();

    await page.addInitScript(() => {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem('familyTracker.meals', JSON.stringify({
        lastDay: today,
        breakfast: [{ id: 'meal-b-1', name: 'Egg toast', category: 'korean', url: '', ingredients: '', done: false, day: today }],
        lunch: [{ id: 'meal-l-1', name: 'Seaweed soup', category: 'korean', url: '', ingredients: '', done: false, day: today }],
        dinner: [{ id: 'meal-d-1', name: 'Salmon bowl', category: 'korean', url: '', ingredients: '', done: false, day: today }],
        wish: [{ id: 'meal-w-1', name: 'Tofu stew', category: 'korean', url: '', ingredients: '', done: false, day: today }],
        log: [],
      }));
    });

    await page.goto('/');
    await page.locator('#meal-tab').click();

    const scenarios = [
      { slot: 'breakfast', meal: 'Egg toast', target: '#meal-breakfast' },
      { slot: 'lunch', meal: 'Seaweed soup', target: '#meal-lunch' },
      { slot: 'dinner', meal: 'Salmon bowl', target: '#meal-dinner' },
    ];

    for (const { slot, meal, target } of scenarios) {
      const fromHandle = page.locator(`#meal-${slot} .meal-item`, { hasText: meal }).first().locator('.meal-item-handle');
      const wishDropZone = page.locator('.meal-column-wish').first();
      await fromHandle.scrollIntoViewIfNeeded();
      await wishDropZone.scrollIntoViewIfNeeded();
      await fromHandle.dragTo(wishDropZone);
      await expect(page.locator(`#meal-${slot} .meal-item`, { hasText: meal })).toHaveCount(0);
      await expect(page.locator('#wish-list .meal-item', { hasText: meal })).toHaveCount(1);

      const wishHandle = page.locator('#wish-list .meal-item', { hasText: meal }).first().locator('.meal-item-handle');
      const slotDropZone = page.locator(target);
      await wishHandle.scrollIntoViewIfNeeded();
      await slotDropZone.scrollIntoViewIfNeeded();
      await wishHandle.dragTo(slotDropZone);
      await expect(page.locator(target + ' .meal-item', { hasText: meal })).toHaveCount(1);
      await expect(page.locator('#wish-list .meal-item', { hasText: meal })).toHaveCount(0);
    }

    await expect(page.locator('body')).not.toHaveClass(/meal-dragging/);
  });

  test('repeated multi-slot drags preserve integrity and UI state', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin();

    await page.addInitScript(() => {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem('familyTracker.meals', JSON.stringify({
        lastDay: today,
        breakfast: [{ id: 'meal-b-1', name: 'Egg toast', category: 'korean', url: '', ingredients: '', done: false, day: today }],
        lunch: [{ id: 'meal-l-1', name: 'Beef seaweed soup', category: 'korean', url: '', ingredients: '', done: false, day: today }],
        dinner: [{ id: 'meal-d-1', name: 'Salmon rice bowl', category: 'korean', url: '', ingredients: '', done: false, day: today }],
        wish: [
          { id: 'meal-w-1', name: 'Soy-braised tofu', category: 'korean', url: '', ingredients: '', done: false, day: today },
          { id: 'meal-w-2', name: 'Pumpkin porridge', category: 'korean', url: '', ingredients: '', done: false, day: today },
        ],
        log: [],
      }));
    });
    await page.goto('/');
    await page.locator('#meal-tab').click();
    await expect(page.locator('#meal-view.active')).toBeVisible();
    await expect(page.locator('#meal-breakfast .meal-item')).toHaveCount(1);
    await expect(page.locator('#meal-lunch .meal-item')).toHaveCount(1);
    await expect(page.locator('#meal-dinner .meal-item')).toHaveCount(1);
    await expect(page.locator('#wish-list .meal-item')).toHaveCount(2);

    const route = [
      '#meal-breakfast',
      '#meal-lunch',
      '#meal-dinner',
      '#wish-list',
      '#meal-breakfast',
      '#wish-list',
      '#meal-dinner',
    ];

    for (let i = 0; i < 30; i += 1) {
      for (const slot of route) {
        await dragMeal(page, 'Egg toast', slot);
        await expect(page.locator('.meal-item', { hasText: 'Egg toast' })).toHaveCount(1);
        await expect(page.locator('body')).not.toHaveClass(/meal-dragging/);
        await expect(page.locator('.task-list.drag-target')).toHaveCount(0);
      }
    }

    await dragMeal(page, 'Soy-braised tofu', '#meal-lunch');
    await dragMeal(page, 'Pumpkin porridge', '#meal-dinner');
    await dragMeal(page, 'Beef seaweed soup', '#wish-list');

    await expect(page.locator('#meal-dinner .meal-item', { hasText: 'Egg toast' })).toHaveCount(1);
    await expect(page.locator('#meal-lunch .meal-item', { hasText: 'Soy-braised tofu' })).toHaveCount(1);
    await expect(page.locator('#meal-dinner .meal-item', { hasText: 'Pumpkin porridge' })).toHaveCount(1);
    await expect(page.locator('#wish-list .meal-item', { hasText: 'Beef seaweed soup' })).toHaveCount(1);

    const totalMeals = page.locator('#meal-breakfast .meal-item, #meal-lunch .meal-item, #meal-dinner .meal-item, #wish-list .meal-item');
    await expect(totalMeals).toHaveCount(5);
    await expect(page.locator('#meal-log .overview-item')).toHaveCount(10);

    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });
});
