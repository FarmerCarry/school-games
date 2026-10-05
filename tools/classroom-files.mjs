import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DISTRIBUTION = ['index.html', 'favicon.svg', 'manifest.webmanifest', 'sw.js', 'games', 'css', 'js', 'shared', 'lib', 'icons'];
function filesUnder(root, relative = '') {
  const absolute = path.join(root, relative);
  if (!fs.statSync(absolute).isDirectory()) return [relative];
  return fs.readdirSync(absolute).flatMap(name => filesUnder(root, path.join(relative, name)));
}

// Keep the download fixture faithful to the source/build folder. Verify every
// copied byte before involving the browser so packaging failures are distinct
// from Windows file-URL resolution or browser failures.
export function copyClassroomSite(root, destination, {mode = 'source'} = {}) {
  assert.ok(mode === 'source' || mode === 'build', 'Unknown classroom distribution mode');
  const inventory = [];
  for (const name of DISTRIBUTION) {
    const source = path.join(root, name);
    if (!fs.existsSync(source)) continue;
    // Copy individual files rather than relying on cpSync's recursive traversal.
    // Windows CI failed to produce nested assets despite cpSync
    // returning successfully; the inventory caught this before browser launch.
    for (const relative of filesUnder(root, name)) {
      const copy = path.join(destination, relative);
      fs.mkdirSync(path.dirname(copy), { recursive: true });
      fs.copyFileSync(path.join(root, relative), copy);
      assert.ok(fs.existsSync(copy), `Downloaded fixture is missing ${relative}`);
      const original = fs.readFileSync(path.join(root, relative));
      const bytes = fs.readFileSync(copy);
      assert.ok(original.equals(bytes), `Downloaded fixture differs at ${relative}`);
      inventory.push({ path: relative.split(path.sep).join('/'), bytes: bytes.length });
    }
  }
  const requiredFiles = ['index.html', 'games/tic-tac-toe/index.html'];
  // The optimized build embeds portal scripts/styles in index.html.
  if (mode === 'source') requiredFiles.push('css/site.css', 'js/catalog.js', 'js/site.js');
  for (const required of requiredFiles) {
    assert.ok(inventory.some(file => file.path === required), `Distribution is missing ${required}`);
  }
  return inventory;
}
