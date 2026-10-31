// Downloaded-folder checks open file:// URLs. On Windows, Edge often never
// fires `load` for those (a font or the site icon stays pending) and sometimes
// aborts the navigation with net::ERR_ABORTED while the file is on disk.
// DOMContentLoaded still means the document and its classic scripts have run.
// The case's own checks are the ready signal. Only a navigation timeout or
// ERR_ABORTED is retried; a gameplay timeout or a missing control is not.

export const classroomNavigation = { waitUntil: 'domcontentloaded', timeout: 10000 };

export function isRetryableNavigationError(error) {
  const text = String(error && error.message ? error.message : error);
  if (text.includes('net::ERR_ABORTED')) return true;
  return text.includes('page.goto:') && /Timeout \d+ms exceeded/.test(text);
}
