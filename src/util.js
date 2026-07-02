import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROFILE_DIR = path.join(ROOT, '.profile');
export const ERRORS_DIR = path.join(ROOT, 'errors');

/** Source can be a store URL or a local folder path. */
export function isFolderSource(source) {
  return !/^https?:\/\//i.test(source);
}

export function storeSlug(source) {
  if (isFolderSource(source)) {
    return ('folder-' + path.basename(path.resolve(source))).replace(/[^a-z0-9.-]/gi, '_');
  }
  return new URL(source).hostname.replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '_');
}

export function dataDir(storeUrl) {
  return path.join(ROOT, 'data', storeSlug(storeUrl));
}

export function outputDir(storeUrl) {
  return path.join(ROOT, 'output', storeSlug(storeUrl));
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const logSinks = new Set();
/** Register a listener that receives each formatted log line (for the Electron UI). */
export function addLogSink(fn) {
  logSinks.add(fn);
  return () => logSinks.delete(fn);
}

export function log(...args) {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')}`;
  console.log(line);
  for (const fn of logSinks) {
    try {
      fn(line);
    } catch {}
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Human-ish random delay between browser actions. */
export const humanDelay = (min = 2000, max = 5000) =>
  sleep(min + Math.random() * (max - min));

/** Strip HTML to plain text, collapse whitespace, cap length. */
export function stripHtml(html, maxLen = 400) {
  const text = (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen).replace(/\s+\S*$/, '') + '…' : text;
}

export async function downloadFile(url, destPath) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`download ${url} -> HTTP ${res.status}`);
  ensureDir(path.dirname(destPath));
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  return destPath;
}

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
