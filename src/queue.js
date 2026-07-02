import path from 'node:path';
import { dataDir, log, readJson, writeJson } from './util.js';
import { buildPrompt, IMAGE_TEMPLATES, VIDEO_TEMPLATES } from './prompts.js';

export class Queue {
  constructor(storeUrl) {
    this.file = path.join(dataDir(storeUrl), 'queue.json');
    this.jobs = readJson(this.file, []);
  }

  save() {
    writeJson(this.file, this.jobs);
  }

  /** Add jobs for every product; skips jobs that already exist (resumable). */
  build(products, { images, videos, imageTypes, videoTypes }) {
    const existing = new Set(this.jobs.map((j) => j.id));
    let added = 0;
    for (const p of products) {
      if (!p.localImages?.length) {
        log(`  ! skipping ${p.handle} — no local reference image`);
        continue;
      }
      const specs = [
        ...imageTypes.slice(0, images).map((t) => ['image', t]),
        ...videoTypes.slice(0, videos).map((t) => ['video', t]),
      ];
      for (const [kind, type] of specs) {
        const id = `${p.handle}:${kind}:${type}`;
        if (existing.has(id)) continue;
        this.jobs.push({
          id,
          productHandle: p.handle,
          productTitle: p.title,
          kind,
          type,
          prompt: buildPrompt(kind, type, p),
          referenceImage: p.localImages[0],
          status: 'pending',
          resultFiles: [],
          attempts: 0,
          error: null,
        });
        added++;
      }
    }
    this.save();
    log(`Queue: ${added} new jobs added, ${this.jobs.length} total`);
    return added;
  }

  pending({ onlyFailed = false } = {}) {
    // 'submitted' jobs are leftovers from a crashed run — treat as retryable.
    return this.jobs.filter((j) =>
      onlyFailed
        ? j.status === 'failed'
        : ['pending', 'submitted'].includes(j.status) || (j.status === 'failed' && j.attempts < 2),
    );
  }

  update(job, patch) {
    Object.assign(job, patch);
    this.save();
  }

  summary() {
    const counts = {};
    for (const j of this.jobs) counts[j.status] = (counts[j.status] || 0) + 1;
    return counts;
  }
}

export const DEFAULT_IMAGE_TYPES = Object.keys(IMAGE_TEMPLATES);
export const DEFAULT_VIDEO_TYPES = Object.keys(VIDEO_TEMPLATES);
