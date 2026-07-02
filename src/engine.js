import { isFolderSource, log, outputDir } from './util.js';
import { loadFolder, scrapeStore } from './scrape.js';
import { Queue, DEFAULT_IMAGE_TYPES, DEFAULT_VIDEO_TYPES } from './queue.js';
import { processQueue } from './browser/worker.js';

/**
 * Programmatic entry point used by both the CLI (run.js) and the Electron app.
 * Returns the Queue so callers can read job statuses.
 */
export async function buildQueue(source, opts = {}) {
  const products0 = isFolderSource(source)
    ? loadFolder(source)
    : await scrapeStore(source, { force: !!opts.rescrape });
  const products = opts.limit ? products0.slice(0, Number(opts.limit)) : products0;

  const queue = new Queue(source);
  queue.build(products, {
    images: Number(opts.images ?? 4),
    videos: Number(opts.videos ?? 1),
    imageTypes: (opts.imageTypes?.length ? opts.imageTypes : DEFAULT_IMAGE_TYPES),
    videoTypes: (opts.videoTypes?.length ? opts.videoTypes : DEFAULT_VIDEO_TYPES),
  });
  return { queue, products };
}

export async function runAutopilot(source, opts = {}) {
  const { queue } = await buildQueue(source, opts);
  if (opts.scrapeOnly) {
    log('Scrape-only complete.', JSON.stringify(queue.summary()));
    return queue;
  }
  await processQueue(queue, source, {
    onlyFailed: !!opts.onlyFailed,
    maxJobs: opts.maxJobs ? Number(opts.maxJobs) : Infinity,
  });
  log('──────────────────────────────');
  log('Run complete:', JSON.stringify(queue.summary()));
  log('Output:', outputDir(source));
  return queue;
}

export { DEFAULT_IMAGE_TYPES, DEFAULT_VIDEO_TYPES, outputDir };
