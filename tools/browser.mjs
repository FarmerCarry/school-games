import fs from 'node:fs';
import playwright from 'playwright';

export { playwright };

// Software rendering keeps CI reproducible. SG_GRAPHICS=native removes these
// overrides for measurements on the actual classroom hardware.
const GRAPHICS_ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'
];

export async function launchChromium(options = {}) {
  const { args = [], graphics = process.env.SG_GRAPHICS || 'software',
    channel = process.env.PLAYWRIGHT_CHANNEL || 'chromium', ...rest } = options;
  if (!['software', 'native'].includes(graphics)) {
    throw new Error('SG_GRAPHICS must be software or native.');
  }
  const overrideName = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH' : 'PLAYWRIGHT_EXECUTABLE_PATH';
  const executablePath = process.env[overrideName];
  if (executablePath && !fs.existsSync(executablePath)) {
    throw new Error(`${overrideName} does not exist: ${executablePath}. Set it to an installed Chromium executable or unset it and run npm run browsers:install.`);
  }
  try {
    return await playwright.chromium.launch({
      // Exercise desktop Chrome's renderer through its new headless mode.
      ...(executablePath ? {} : { channel }),
      ...rest,
      ...(executablePath ? { executablePath } : {}),
      args: [...new Set([...(graphics === 'native' ? [] : GRAPHICS_ARGS), ...args])]
    });
  } catch (error) {
    const help = executablePath
      ? `Check ${overrideName} and the installed browser runtime dependencies.`
      : channel === 'chromium'
        ? 'Run npm run browsers:install to install Chromium, or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to an installed Chromium executable.'
        : `Install the ${channel} browser selected by PLAYWRIGHT_CHANNEL, or unset PLAYWRIGHT_CHANNEL to use Chromium.`;
    throw new Error(`Could not launch Chromium. ${help}\n${error.message}`, { cause: error });
  }
}
