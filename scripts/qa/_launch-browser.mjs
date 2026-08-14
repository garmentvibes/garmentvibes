import { chromium } from "playwright-core";
import { existsSync } from "fs";

// This repo depends on playwright-core (no bundled browser download) rather
// than the full playwright package, to keep node_modules light. The Claude
// Code sandbox this was built in ships a pre-installed Chromium at a fixed
// path; on any other machine, fall back to playwright-core's own resolution
// (works if `npx playwright install chromium` has been run) and surface a
// clear error otherwise instead of a cryptic launch failure.
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium";

export async function launchBrowser() {
  const executablePath = existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined;
  try {
    return await chromium.launch({ executablePath });
  } catch (err) {
    console.error(
      "Failed to launch Chromium for QA scripts.\n" +
        "If you're not running inside the original sandbox, install a browser first:\n" +
        "  npx playwright install chromium\n"
    );
    throw err;
  }
}
