import fs from 'node:fs';
import playwright from 'playwright';

export { playwright };

// Leave browser selection to Playwright unless the developer explicitly selects
// an installed Chromium. This also supports machines with restricted downloads.
export async function launchChromium(options = {}) {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (executablePath && !fs.existsSync(executablePath)) {
    throw new Error(`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH does not exist: ${executablePath}. Set it to an installed Chromium executable or unset it and run npm run browsers:install.`);
  }
  try {
    return await playwright.chromium.launch({ ...options, ...(executablePath ? { executablePath } : {}) });
  } catch (error) {
    const help = executablePath
      ? 'Check PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH and the installed browser runtime dependencies.'
      : 'Run npm run browsers:install to install Chromium, or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to an installed Chromium executable.';
    throw new Error(`Could not launch Chromium. ${help}\n${error.message}`, { cause: error });
  }
}
