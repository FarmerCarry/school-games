import assert from 'node:assert/strict';

// Playwright's locator.click waits for a stable box. Several game buttons
// deliberately bounce forever, so sample their center and use actual pointer
// input while retaining visibility, enabled-state and occlusion checks.
// Accepts a Page or Frame; boundingBox coordinates are main-page coordinates.
export async function clickControl(scope, selector, { timeout = 5000 } = {}) {
  const button = scope.locator(selector).first();
  await button.waitFor({ state: 'visible', timeout });
  assert.ok(await button.isEnabled(), `${selector}: control must be enabled`);
  assert.ok(await button.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit === element || element.contains(hit);
  }), `${selector}: control must receive pointer input at its center`);
  const box = await button.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, `${selector}: control must have a visible hit area`);
  const page = typeof scope.page === 'function' ? scope.page() : scope;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
