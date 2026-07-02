import { program } from 'commander';
import { runAutopilot, DEFAULT_IMAGE_TYPES, DEFAULT_VIDEO_TYPES } from './engine.js';

program
  .argument('<source>', 'ecommerce store URL (https://…) OR a local folder of images')
  .option('--images <n>', 'image jobs per product', '4')
  .option('--videos <n>', 'video jobs per product', '1')
  .option('--image-types <list>', `comma list of: ${DEFAULT_IMAGE_TYPES.join(',')}`)
  .option('--video-types <list>', `comma list of: ${DEFAULT_VIDEO_TYPES.join(',')}`)
  .option('--limit <n>', 'only process the first N products')
  .option('--rescrape', 'ignore cached catalog and scrape again')
  .option('--scrape-only', 'scrape + build queue, skip browser generation')
  .option('--only-failed', 'retry failed jobs only')
  .option('--max-jobs <n>', 'process at most N jobs this run')
  .parse();

const source = program.args[0];
const o = program.opts();

await runAutopilot(source, {
  images: o.images,
  videos: o.videos,
  imageTypes: o.imageTypes?.split(',').map((s) => s.trim()),
  videoTypes: o.videoTypes?.split(',').map((s) => s.trim()),
  limit: o.limit,
  rescrape: o.rescrape,
  scrapeOnly: o.scrapeOnly,
  onlyFailed: o.onlyFailed,
  maxJobs: o.maxJobs,
});
process.exit(0);
