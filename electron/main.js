import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { addLogSink, dataDir, outputDir, storeSlug, readJson, PROFILE_DIR, ensureDir } from '../src/util.js';
import { runAutopilot, buildQueue, DEFAULT_IMAGE_TYPES, DEFAULT_VIDEO_TYPES } from '../src/engine.js';
import { launchBrowser, isLoggedIn } from '../src/browser/worker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let win;
let running = false;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 840,
    backgroundColor: '#0a0a0b',
    title: 'Higgsfield Autopilot',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
}

// Forward every engine log line to the renderer.
addLogSink((line) => win?.webContents.send('log', line));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

ipcMain.handle('defaults', () => ({
  imageTypes: DEFAULT_IMAGE_TYPES,
  videoTypes: DEFAULT_VIDEO_TYPES,
}));

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('check-login', async () => {
  const ctx = await launchBrowser({ headless: true });
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    return await isLoggedIn(page);
  } finally {
    await ctx.close();
  }
});

// Open a plain (non-automated) Chrome on the profile so Google login works.
ipcMain.handle('login', async () => {
  const CHROME_PATHS = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  ];
  const chrome = CHROME_PATHS.find((p) => fs.existsSync(p));
  if (!chrome) return { ok: false, error: 'Chrome not found' };
  ensureDir(PROFILE_DIR);
  await new Promise((resolve) => {
    const proc = spawn(
      chrome,
      [`--user-data-dir=${PROFILE_DIR}`, '--no-first-run', '--no-default-browser-check', 'https://higgsfield.ai/ai/image'],
      { stdio: 'ignore' },
    );
    proc.on('exit', resolve);
  });
  const ctx = await launchBrowser({ headless: true });
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    return { ok: await isLoggedIn(page) };
  } finally {
    await ctx.close();
  }
});

ipcMain.handle('build-queue', async (_e, { source, opts }) => {
  const { queue } = await buildQueue(source, opts);
  return { jobs: queue.jobs, summary: queue.summary() };
});

ipcMain.handle('get-queue', (_e, source) => {
  const q = readJson(path.join(dataDir(source), 'queue.json'), []);
  const summary = {};
  for (const j of q) summary[j.status] = (summary[j.status] || 0) + 1;
  return { jobs: q, summary };
});

ipcMain.handle('run', async (_e, { source, opts }) => {
  if (running) return { ok: false, error: 'already running' };
  running = true;
  win?.webContents.send('run-state', true);
  try {
    await runAutopilot(source, opts);
    return { ok: true };
  } catch (e) {
    win?.webContents.send('log', `[ERROR] ${e.message}`);
    return { ok: false, error: e.message };
  } finally {
    running = false;
    win?.webContents.send('run-state', false);
  }
});

ipcMain.handle('open-output', (_e, source) => {
  const dir = outputDir(source);
  ensureDir(dir);
  shell.openPath(dir);
});

ipcMain.handle('slug', (_e, source) => storeSlug(source));
