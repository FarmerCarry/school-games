import fs from 'node:fs';
import playwright from 'playwright';

export { playwright };

// These flags preserve the existing headless WebGL setup. They affect tests only;
// the games themselves still use the player's hardware and graphics settings.
const GRAPHICS_ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'
];

export async function launchChromium(options = {}) {
  const { args = [], ...rest } = options;
  const overrideName = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH' : 'PLAYWRIGHT_EXECUTABLE_PATH';
  const executablePath = process.env[overrideName];
  if (executablePath && !fs.existsSync(executablePath)) {
    throw new Error(`${overrideName} does not exist: ${executablePath}. Set it to an installed Chromium executable or unset it and run npm run browsers:install.`);
  }
  try {
    return await playwright.chromium.launch({
      // Exercise desktop Chrome's renderer through its new headless mode.
      ...(executablePath ? {} : { channel: 'chromium' }),
      ...rest,
      ...(executablePath ? { executablePath } : {}),
      args: [...new Set([...GRAPHICS_ARGS, ...args])]
    });
  } catch (error) {
    const help = executablePath
      ? `Check ${overrideName} and the installed browser runtime dependencies.`
      : 'Run npm run browsers:install to install Chromium, or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to an installed Chromium executable.';
    throw new Error(`Could not launch Chromium. ${help}\n${error.message}`, { cause: error });
  }
}
