import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { PROFILE_DIR, ensureDir, log } from './util.js';
import { launchBrowser, isLoggedIn } from './browser/worker.js';

/**
 * Google blocks OAuth sign-in inside automation-controlled browsers
 * ("this browser or app may not be secure"). So for login we launch a PLAIN
 * Chrome — zero automation attached — on the same profile folder. The user
 * logs in normally, closes the window, and Playwright reuses the session.
 */
const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
];
const chrome = CHROME_PATHS.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error('Chrome not found in the standard install locations.');
  process.exit(1);
}

ensureDir(PROFILE_DIR);
log('Opening a normal (non-automated) Chrome window on the automation profile.');
log('1. Log in to higgsfield.ai (Google login works normally here).');
log('2. When you can see your account avatar, CLOSE that Chrome window.');
log('This script verifies the session automatically after the window closes.');

const proc = spawn(
  chrome,
  [`--user-data-dir=${PROFILE_DIR}`, '--no-first-run', '--no-default-browser-check', 'https://higgsfield.ai/ai/image'],
  { stdio: 'ignore' },
);

await new Promise((resolve) => proc.on('exit', resolve));
log('Window closed — verifying session…');

const context = await launchBrowser({ headless: true });
const page = context.pages()[0] || (await context.newPage());
const ok = await isLoggedIn(page);
await context.close();

if (ok) {
  log('✓ Logged in — session saved to .profile/. The autopilot is ready to run.');
  process.exit(0);
} else {
  log('✗ Session not detected. Run `npm run login` again and make sure you finish logging in before closing the window.');
  process.exit(1);
}
