import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { ERRORS_DIR, PROFILE_DIR, ensureDir, humanDelay, log, outputDir, sleep } from '../util.js';
import { MODELS, SEL, URLS, VIDEO_SETTINGS } from './selectors.js';

const IMAGE_TIMEOUT_MS = 5 * 60 * 1000;
const VIDEO_TIMEOUT_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 15 * 1000;

export async function launchBrowser({ headless = false } = {}) {
  ensureDir(PROFILE_DIR);
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    channel: 'chrome',
    viewport: { width: 1440, height: 960 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
}

export async function isLoggedIn(page) {
  // The marketing homepage can show Sign-up CTAs even with a session, so
  // check the actual workspace: logged-in users get the create form.
  await page.goto(URLS.createImage, { waitUntil: 'domcontentloaded' });
  await sleep(8000); // SPA hydration
  const signIn = await page
    .getByRole(SEL.signInButton.role, { name: SEL.signInButton.name })
    .first()
    .isVisible()
    .catch(() => false);
  const hasForm = (await page.locator(SEL.imageForm).count()) > 0;
  return hasForm && !signIn;
}

async function dumpError(page, label) {
  ensureDir(ERRORS_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(ERRORS_DIR, `${stamp}-${label.replace(/[^a-z0-9-]/gi, '_')}`);
  await page.screenshot({ path: `${base}.png`, fullPage: false }).catch(() => {});
  fs.writeFileSync(`${base}.html`, await page.content().catch(() => ''));
  log(`  ! error artifacts: ${base}.png`);
}

function formFor(page, kind) {
  return page.locator(kind === 'video' ? SEL.videoForm : SEL.imageForm).first();
}

/** Click the form's model chip and pick the first candidate whose dropdown item carries the Unlimited badge. */
async function selectUnlimitedModel(page, form, kind, modelPref) {
  const candidates = Array.isArray(modelPref) ? modelPref : [modelPref];
  const current = (await form.textContent()) || '';
  // Skip only when an exact unlimited candidate is already the selected model.
  // For video the model row must show the candidate name AND "Unlimited".
  const modelRow = kind === 'video'
    ? ((await form.locator('button').filter({ hasText: /^Model/ }).first().textContent().catch(() => '')) || '')
    : current;
  const already = candidates.some((m) => modelRow.includes(m)) && /unlimited/i.test(modelRow);
  if (already) {
    log('  model: already on an Unlimited variant');
    return;
  }

  // Image form: the model chip is the first labelled button in the bar.
  // Video form: the "Model <name>" row opens the dropdown.
  const chip =
    kind === 'video'
      ? form.locator('div,button').filter({ hasText: /^Model/ }).last()
      : form.locator('button', { hasNotText: /generate/i }).filter({ hasText: /\w{4,}/ }).first();
  await chip.click();
  await sleep(1500);

  // Dropdown items render as "<Name>Unlimited<desc>" — require the badge.
  for (const modelName of candidates) {
    const re = new RegExp(`^${modelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z0-9]*Unlimited`, 'i');
    const item = page.locator('div,li,button').filter({ hasText: re }).last();
    if (await item.isVisible().catch(() => false)) {
      await item.click();
      await sleep(2000);
      log(`  model: ${modelName} (Unlimited)`);
      return;
    }
  }
  await page.keyboard.press('Escape');
  throw new Error(`No candidate model (${candidates.join(', ')}) with Unlimited badge found — refusing to submit.`);
}

/** Set video duration (7s) and resolution (720p). Menu options render as "7.0s"/"720p". */
async function setVideoOptions(page, form) {
  // Duration — chip shows e.g. "4s"; options show "7.0s". Match by number.
  try {
    const durChip = form.locator('button').filter({ hasText: /^\d+(\.\d+)?s$/ }).first();
    const cur = ((await durChip.textContent().catch(() => '')) || '').trim();
    if (parseFloat(cur) !== VIDEO_SETTINGS.durationSeconds) {
      await durChip.click();
      await sleep(1200);
      // Duration options in the popover are buttons with a "button-xs" class;
      // history-feed cards also show "7.0s" text but aren't buttons.
      const opt = page
        .locator('button[class*="button-xs"]')
        .filter({ hasText: new RegExp(`^${VIDEO_SETTINGS.durationSeconds}(\\.0)?s$`) })
        .first();
      if (await opt.isVisible().catch(() => false)) {
        await opt.click();
        log(`  video duration: ${VIDEO_SETTINGS.durationSeconds}s`);
      } else {
        await page.keyboard.press('Escape');
        log(`  ! ${VIDEO_SETTINGS.durationSeconds}s not available (staying at ${cur})`);
      }
      await sleep(800);
    }
  } catch (e) {
    log(`  ! could not set duration: ${e.message}`);
  }
  // Resolution — chip shows "480p"/"720p"/"1080p".
  try {
    const resChip = form.locator('button').filter({ hasText: /^\d+p$|^\d+K$/i }).first();
    const cur = ((await resChip.textContent().catch(() => '')) || '').trim();
    if (cur.toLowerCase() !== VIDEO_SETTINGS.resolution.toLowerCase()) {
      await resChip.click();
      await sleep(1200);
      const opt = page.locator('div,li,button,[role="option"]').filter({ hasText: new RegExp(`^${VIDEO_SETTINGS.resolution}$`, 'i') }).last();
      if (await opt.isVisible().catch(() => false)) {
        await opt.click();
        log(`  video resolution: ${VIDEO_SETTINGS.resolution}`);
      } else {
        await page.keyboard.press('Escape');
        log(`  ! ${VIDEO_SETTINGS.resolution} not available (staying at ${cur})`);
      }
      await sleep(800);
    }
  } catch (e) {
    log(`  ! could not set resolution: ${e.message}`);
  }
}

/**
 * Prove unlimited mode before submitting. Video: the Generate button reads
 * "Generate Unlimited". Image: the selected model + quality carry Unlimited
 * badges (button may still show a nominal credit number).
 */
async function ensureUnlimited(page, form, kind) {
  if (kind === 'video') {
    const gen = form.getByRole('button', { name: /generate|unlimited/i }).first();
    const text = (await gen.textContent()) || '';
    if (!/unlimited/i.test(text)) {
      throw new Error(`Generate button says "${text.trim()}" (credits, not Unlimited) — refusing to submit.`);
    }
    log('  unlimited: confirmed (Generate Unlimited)');
    return;
  }
  // Image: the prompt bar has a literal "Unlimited" toggle switch
  // (role=switch, label text next to it). It MUST be on or generations
  // spend credits.
  const sw = form.locator('[role="switch"]').first();
  if (!(await sw.count())) {
    throw new Error('Unlimited toggle switch not found in image form — refusing to submit.');
  }
  const isOn = async () =>
    (await sw.getAttribute('aria-checked')) === 'true' || (await sw.getAttribute('data-state')) === 'on';
  // Click up to 3 times (real trusted clicks) until it reports ON.
  for (let attempt = 0; attempt < 3 && !(await isOn()); attempt++) {
    await sw.scrollIntoViewIfNeeded();
    await humanDelay(1200, 2500);
    await sw.click();
    await sleep(2000);
  }
  if (!(await isOn())) {
    throw new Error('Unlimited toggle would not switch ON after 3 clicks — refusing to submit (would spend credits).');
  }
  // Belt and braces: with Unlimited ON the Generate button text contains
  // "Unlimited" (e.g. "Unlimited2"); if it reads a bare "Generate <n>" the
  // toggle silently reverted.
  const genText = ((await form.getByRole('button', { name: /generate|unlimited/i }).first().textContent()) || '').trim();
  if (!/unlimited/i.test(genText)) {
    throw new Error(`Unlimited not reflected on Generate button ("${genText}") — refusing to submit.`);
  }
  log(`  unlimited: confirmed (toggle ON, Generate="${genText}")`);
}

/**
 * Human-in-the-loop verification handling. If Higgsfield (or its WAF) shows a
 * CAPTCHA / slider / "verify you are human" challenge, the worker pauses,
 * beeps, and waits for YOU to solve it in the visible browser window, then
 * resumes automatically. It never attempts to solve challenges itself.
 */
async function waitOutVerification(page, maxWaitMs = 15 * 60 * 1000) {
  const detect = () =>
    page.evaluate(() => {
      const iframe = [...document.querySelectorAll('iframe')].some((f) =>
        /captcha|turnstile|challenge|geetest|verify/i.test(f.src || ''),
      );
      const el = document.querySelector('[class*="captcha" i], [id*="captcha" i], [class*="geetest" i]');
      const text =
        /verification required|unusual activity|verify (that )?you('| a)re|slide to verify|security verification|press & hold|rapid taps/i.test(
          document.body?.innerText?.slice(0, 6000) || '',
        );
      return iframe || !!el || text;
    }).catch(() => false);

  if (!(await detect())) return false;
  log('  ⚠ VERIFICATION CHALLENGE detected — solve it in the browser window. Waiting…');
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    process.stdout.write('\x07'); // terminal bell
    await sleep(5000);
    if (!(await detect())) {
      log('  ✓ verification cleared — resuming');
      await sleep(3000);
      return true;
    }
  }
  throw new Error('Verification challenge was not solved within the wait window.');
}

/** Fill the contenteditable prompt inside the form. */
async function fillPrompt(page, form, prompt) {
  const input = form.locator(SEL.promptInput).first();
  await input.click();
  await humanDelay(800, 1600);
  await page.keyboard.press('Control+a');
  await sleep(400);
  await page.keyboard.press('Delete');
  await sleep(400);
  // Lexical editor: insertText pastes in one input event (typing char-by-char
  // times out on long prompts).
  await page.keyboard.insertText(prompt);
  await sleep(500);
}

/** Simulate dropping a local file onto a drop zone (bypasses native file pickers). */
async function dropFileOnto(page, locator, filePath) {
  const b64 = fs.readFileSync(filePath).toString('base64');
  const name = path.basename(filePath);
  const ext = name.split('.').pop().toLowerCase();
  const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const handle = await locator.elementHandle();
  if (!handle) throw new Error('drop target not found');
  await page.evaluate(
    async ({ el, b64, name, type }) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], name, { type });
      const dt = new DataTransfer();
      dt.items.add(file);
      const r = el.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, composed: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
      for (const t of ['dragenter', 'dragover', 'drop']) {
        const ev = new DragEvent(t, opts);
        Object.defineProperty(ev, 'dataTransfer', { value: dt });
        el.dispatchEvent(ev);
      }
    },
    { el: handle, b64, name, type },
  );
}

/** Attach the reference image. Image form has a persistent file input; video uses a drop zone. */
async function attachReference(page, form, kind, filePath) {
  const input = form.locator(SEL.fileInput).first();
  if (await input.count()) {
    await input.setInputFiles(filePath);
    await sleep(4000); // upload
    return;
  }
  // Video: try dropping onto the "Upload media" zone first (no native picker).
  const zone = form.getByText(/upload media/i).first();
  if (await zone.count()) {
    await dropFileOnto(page, zone, filePath);
    await sleep(6000);
    const thumb = await form.locator('div[class*="grid-cols"] img, figure img').count();
    if (thumb) {
      log('  reference attached via drop');
      return;
    }
    log('  ! drop produced no thumbnail — falling back to picker');
  }
  // Video: fresh form shows an "Upload media" drop zone. Clicking it opens the
  // OS file chooser (no persistent file input). Once an image is attached the
  // zone turns into a grid of thumbnail slots with a "+" add button.
  const uploadZone = form.getByText(/upload media/i).first();
  const plusBtn = form.locator('div[class*="grid-cols"] button').last();
  const target = (await uploadZone.count()) ? uploadZone : plusBtn;
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 12000 }).catch(() => null);
  await target.click();
  const chooser = await chooserPromise;
  if (chooser) {
    await chooser.setFiles(filePath);
  } else {
    const modalInput = page.locator('input[type="file"]').last();
    if (!(await modalInput.count())) throw new Error('No file chooser or upload input found for reference image.');
    await modalInput.setInputFiles(filePath);
  }
  await sleep(6000); // upload
  const hasThumb = await form.locator('div[class*="grid-cols"] img, figure img').count();
  if (!hasThumb) log('  ! warning: reference thumbnail not detected after upload');
}

/**
 * Media URLs currently in the history feed, to diff before/after. Excludes
 * anything inside the compose form (uploaded-reference thumbnails!) and,
 * for images, anything below generation size — otherwise the poller grabs
 * the reference preview instead of the actual result.
 */
async function collectResultUrls(page, kind) {
  return page.evaluate((k) => {
    const urls = new Set();
    const els = document.querySelectorAll(k === 'video' ? 'video, video source' : 'img');
    for (const el of els) {
      if (el.closest('form')) continue; // compose-bar previews are not results
      if (k !== 'video' && el.tagName === 'IMG' && (el.naturalWidth || 0) < 600) continue;
      const src = el.currentSrc || el.src;
      if (src && /^https?:\/\//.test(src) && !/logo|icon|avatar|favicon/i.test(src)) urls.add(src);
    }
    return [...urls];
  }, kind);
}

export async function runJob(context, page, job, storeUrl) {
  const kind = job.kind;
  const timeout = kind === 'video' ? VIDEO_TIMEOUT_MS : IMAGE_TIMEOUT_MS;

  const createUrl = kind === 'video' ? URLS.createVideo : URLS.createImage;
  await page.goto(createUrl, { waitUntil: 'domcontentloaded' });
  await sleep(6000);

  if (await waitOutVerification(page)) {
    // The challenge replaced the whole page — reload the workspace.
    await page.goto(createUrl, { waitUntil: 'domcontentloaded' });
    await sleep(6000);
  }
  const form = formFor(page, kind);
  await form.waitFor({ timeout: 20000 });

  await selectUnlimitedModel(page, form, kind, MODELS[kind]);
  if (kind === 'video') await setVideoOptions(page, form);
  await ensureUnlimited(page, form, kind);
  await humanDelay();

  await attachReference(page, form, kind, job.referenceImage);
  await humanDelay(2000, 4000);
  await fillPrompt(page, form, job.prompt);
  await humanDelay();

  const before = new Set(await collectResultUrls(page, kind));

  await form.getByRole('button', { name: /generate|unlimited/i }).first().click();
  log(`  submitted ${job.id}`);
  await sleep(8000);

  const started = Date.now();
  while (Date.now() - started < timeout) {
    await sleep(POLL_INTERVAL_MS);
    if (await waitOutVerification(page)) {
      // challenge replaced the page mid-poll — go back to the feed
      await page.goto(createUrl, { waitUntil: 'domcontentloaded' });
      await sleep(6000);
    }
    const failedToast = await page
      .getByText(/generation failed|something went wrong|not enough credits/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (failedToast) throw new Error('Higgsfield reported a failure after submit');

    const fresh = (await collectResultUrls(page, kind)).filter((u) => !before.has(u));
    if (fresh.length) {
      const dir = ensureDir(path.join(outputDir(storeUrl), job.productHandle, job.type));
      const files = [];
      for (const url of fresh.slice(0, 4)) {
        const ext = (url.split('?')[0].match(/\.(mp4|webm|jpe?g|png|webp)$/i) || [, kind === 'video' ? 'mp4' : 'jpg'])[1];
        const dest = path.join(dir, `${job.type}-${Date.now()}-${files.length}.${ext}`);
        const res = await context.request.get(url).catch(() => null);
        if (res?.ok()) {
          fs.writeFileSync(dest, await res.body());
          files.push(dest);
          log(`  ✓ saved ${path.relative(process.cwd(), dest)}`);
        }
      }
      if (files.length) return files;
    }
    log(`  … waiting on ${job.id} (${Math.round((Date.now() - started) / 1000)}s)`);
  }
  throw new Error(`Timed out after ${timeout / 60000} min`);
}

export async function processQueue(queue, storeUrl, { onlyFailed = false, maxJobs = Infinity } = {}) {
  const jobs = queue.pending({ onlyFailed }).slice(0, maxJobs);
  if (!jobs.length) {
    log('Nothing to do — queue has no pending jobs.');
    return;
  }
  log(`Processing ${jobs.length} jobs…`);

  const context = await launchBrowser();
  const page = context.pages()[0] || (await context.newPage());

  try {
    if (!(await isLoggedIn(page))) {
      throw new Error('Not logged in to higgsfield.ai — run `npm run login` first.');
    }
    for (const job of jobs) {
      queue.update(job, { status: 'submitted', attempts: job.attempts + 1, error: null });
      log(`▶ [attempt ${job.attempts}] ${job.id} — "${job.productTitle}" (${job.kind}/${job.type})`);
      try {
        const files = await runJob(context, page, job, storeUrl);
        queue.update(job, { status: 'done', resultFiles: files });
      } catch (e) {
        log(`  ✗ ${job.id}: ${e.message}`);
        await dumpError(page, job.id);
        queue.update(job, { status: 'failed', error: e.message });
        if (/refusing to submit|Not logged in/i.test(e.message)) throw e; // config problem — stop the run
      }
      await humanDelay(3000, 8000);
    }
  } finally {
    await context.close();
  }
}
