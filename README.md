# Higgsfield Autopilot

Scrapes an ecommerce store (Shopify-first, generic fallback) **or a local folder
of images** and mass-generates product images + videos through the **Higgsfield
web UI** with browser automation — because unlimited generations are only
available in the browser, never via CLI/MCP/API.

## Desktop app

```bash
npm install
npm run app        # Electron UI: paste a URL or pick a folder, set styles, Start
```

The app has a Log-in button (opens plain Chrome for Google login), image/video
style pickers, a Build-queue + Start button, a live progress bar with per-job
status, a streaming log, and Open-output. It uses the same engine as the CLI.

## CLI

## Setup (once)

```bash
npm install
npm run login   # opens Chrome — log in to higgsfield.ai manually, script exits by itself
```

The session is stored in `.profile/` and reused forever. If it expires, just
run `npm run login` again.

## Usage

The `source` can be a **store URL** or a **local folder of images** (each image
becomes a "product" and its own reference):

```bash
node src/run.js "C:\Users\ADMIN\Desktop\my-products"   # folder of images
node src/run.js https://gotbeef.us                       # ecommerce store
```

```bash
# Everything: scrape → queue → generate all images+videos per product
node src/run.js https://gotbeef.us

# Common flags
node src/run.js https://gotbeef.us --limit 3 --images 2 --videos 0   # small test
node src/run.js https://gotbeef.us --image-types hero,lifestyle,ugc
node src/run.js https://gotbeef.us --only-failed                      # retry failures
node src/run.js https://gotbeef.us --rescrape                         # refresh catalog
node src/run.js https://gotbeef.us --scrape-only                      # no browser
```

Image types: `hero, lifestyle, flatlay, ugc, macro, occasion`
Video types: `product-motion, ugc-video`

Everything is resumable — kill it anytime, rerun the same command and it picks
up pending/failed jobs. Outputs land in `output/<store>/<product>/<type>/`.

## How the unlimited guarantee works

The worker refuses to submit unless unlimited mode is proven:

- **Video**: the model is selected from the dropdown only if it carries the
  `Unlimited` badge (default: *Seedance 2.0 Mini*), and the Generate button
  must literally read **"Generate Unlimited"**.
- **Image**: the model must carry the `Unlimited` badge (default: *Nano Banana
  Pro*) and the quality menu's **1K Unlimited** option is selected before every
  submit. (The image Generate button shows a nominal credit number even for
  unlimited models — the badges are the source of truth; credits are not
  deducted.)

If either check fails, the job is marked failed and the run stops rather than
burning credits.

## Recalibrating selectors

All DOM knowledge lives in `src/browser/selectors.js` (URLs, model names,
selector strings) — if Higgsfield redesigns, fix it there. Failures drop a
full-page screenshot + HTML into `errors/` for diagnosis.

## Layout

```
data/<store>/products.json     scraped catalog
data/<store>/images/<handle>/  downloaded reference photos
data/<store>/queue.json        job queue w/ statuses
output/<store>/...             generated results
.profile/                      logged-in Chrome profile
errors/                        failure screenshots + HTML dumps
```
