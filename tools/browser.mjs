import { chromium } from 'playwright';

// These flags preserve the existing headless WebGL setup. They affect tests only;
// the games themselves still use the player's hardware and graphics settings.
const GRAPHICS_ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'
];

export function launchChromium(options = {}) {
  const { args = [], ...rest } = options;
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    ...rest,
    args: [...new Set([...GRAPHICS_ARGS, ...args])]
  });
}
