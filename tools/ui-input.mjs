import assert from 'node:assert/strict';

// Playwright's locator.click waits for a stable box. Several game buttons
// deliberately bounce forever, so sample their center and use actual pointer
// input while retaining visibility, enabled-state and occlusion checks.
// Accepts a Page or Frame; boundingBox coordinates are main-page coordinates.
// An explicit timeout bounds every step: a page that is busy with its first
// software-rendered frames can answer the visibility wait and then stall the
// next call (Windows Edge: boundingBox past the 10 s page default). Without one,
// the visibility wait is 5 s and the other steps keep the page default.
export async function clickControl(scope, selector, { timeout } = {}) {
  const button = scope.locator(selector).first();
  const step = timeout === undefined ? {} : { timeout };
  await button.waitFor({ state: 'visible', timeout: timeout ?? 5000 });
  assert.ok(await button.isEnabled(step), `${selector}: control must be enabled`);
  assert.ok(await button.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit === element || element.contains(hit);
  }, undefined, step), `${selector}: control must receive pointer input at its center`);
  const box = await button.boundingBox(step);
  assert.ok(box && box.width > 0 && box.height > 0, `${selector}: control must have a visible hit area`);
  const page = typeof scope.page === 'function' ? scope.page() : scope;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
