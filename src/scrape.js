import path from 'node:path';
import fs from 'node:fs';
import * as cheerio from 'cheerio';
import { dataDir, downloadFile, ensureDir, log, readJson, stripHtml, UA, writeJson } from './util.js';

const IMAGES_PER_PRODUCT = 2;

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

/** Shopify: paginate /products.json. Returns null if the store isn't Shopify. */
async function scrapeShopify(baseUrl) {
  const products = [];
  for (let page = 1; page <= 40; page++) {
    let data;
    try {
      data = await fetchJson(`${baseUrl}/products.json?limit=250&page=${page}`);
    } catch {
      return page === 1 ? null : products;
    }
    if (!Array.isArray(data?.products)) return page === 1 ? null : products;
    if (data.products.length === 0) break;
    for (const p of data.products) {
      products.push({
        handle: p.handle,
        title: p.title,
        description: stripHtml(p.body_html),
        productType: p.product_type || '',
        tags: p.tags || [],
        imageUrls: (p.images || []).map((i) => i.src),
        url: `${baseUrl}/products/${p.handle}`,
      });
    }
  }
  return products;
}

/** Generic fallback: sitemap -> product pages -> JSON-LD Product / OpenGraph. */
async function scrapeGeneric(baseUrl) {
  const productUrls = new Set();
  const sitemaps = [`${baseUrl}/sitemap.xml`];
  while (sitemaps.length && productUrls.size < 500) {
    const smUrl = sitemaps.shift();
    let xml;
    try {
      xml = await fetchText(smUrl);
    } catch {
      continue;
    }
    const $ = cheerio.load(xml, { xmlMode: true });
    $('sitemap > loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (/product/i.test(loc)) sitemaps.push(loc);
    });
    $('url > loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (/\/products?\//i.test(loc)) productUrls.add(loc);
    });
  }
  if (productUrls.size === 0) {
    throw new Error(
      'Could not find products: not a Shopify store and no product URLs in sitemap.xml',
    );
  }

  const products = [];
  for (const url of productUrls) {
    try {
      const html = await fetchText(url);
      const $ = cheerio.load(html);
      let prod = null;
      $('script[type="application/ld+json"]').each((_, el) => {
        if (prod) return;
        try {
          const data = JSON.parse($(el).contents().text());
          const nodes = Array.isArray(data) ? data : data['@graph'] || [data];
          prod = nodes.find((n) => (n['@type'] === 'Product' || (Array.isArray(n['@type']) && n['@type'].includes('Product'))));
        } catch {}
      });
      const title = prod?.name || $('meta[property="og:title"]').attr('content') || $('title').text().trim();
      const description = stripHtml(
        prod?.description || $('meta[property="og:description"]').attr('content') || '',
      );
      let imageUrls = [];
      if (prod?.image) imageUrls = Array.isArray(prod.image) ? prod.image : [prod.image];
      imageUrls = imageUrls
        .map((i) => (typeof i === 'string' ? i : i?.url))
        .filter(Boolean);
      if (imageUrls.length === 0) {
        const og = $('meta[property="og:image"]').attr('content');
        if (og) imageUrls = [og];
      }
      if (!title || imageUrls.length === 0) continue;
      const handle = url.split('/').filter(Boolean).pop().split('?')[0];
      products.push({ handle, title, description, productType: '', tags: [], imageUrls, url });
      log(`  parsed ${title}`);
    } catch (e) {
      log(`  skip ${url}: ${e.message}`);
    }
  }
  return products;
}

/**
 * Folder mode: every image in the folder becomes a "product" whose reference
 * is that image. Title is derived from the filename.
 */
export function loadFolder(folderPath) {
  const dir = path.resolve(folderPath);
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .map((f) => path.join(dir, f));
  if (!files.length) throw new Error(`No images (.jpg/.png/.webp) found in ${dir}`);
  const products = files.map((file) => {
    const base = path.basename(file).replace(/\.[^.]+$/, '');
    const handle = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'image';
    const title = base.replace(/[-_]+/g, ' ').trim();
    return { handle, title, description: '', productType: '', tags: [], imageUrls: [], url: file, localImages: [file] };
  });
  log(`Folder source: ${products.length} images in ${dir}`);
  return products;
}

/** Scrape a store and download reference images. Returns products with local image paths. */
export async function scrapeStore(storeUrl, { force = false } = {}) {
  const baseUrl = new URL(storeUrl).origin;
  const dir = dataDir(storeUrl);
  const productsFile = path.join(dir, 'products.json');

  let products = force ? null : readJson(productsFile);
  if (!products) {
    log(`Scraping ${baseUrl} ...`);
    products = await scrapeShopify(baseUrl);
    if (products) log(`Shopify store: ${products.length} products`);
    else {
      log('Not Shopify — falling back to sitemap/JSON-LD crawl');
      products = await scrapeGeneric(baseUrl);
      log(`Generic crawl: ${products.length} products`);
    }
    writeJson(productsFile, products);
  } else {
    log(`Using cached catalog (${products.length} products) — pass --rescrape to refresh`);
  }

  // Download reference images locally (needed for browser upload).
  for (const p of products) {
    p.localImages = p.localImages || [];
    const imgDir = ensureDir(path.join(dir, 'images', p.handle));
    const wanted = p.imageUrls.slice(0, IMAGES_PER_PRODUCT);
    for (let i = 0; i < wanted.length; i++) {
      const ext = (wanted[i].split('?')[0].match(/\.(jpe?g|png|webp)$/i) || [, 'jpg'])[1];
      const dest = path.join(imgDir, `ref-${i}.${ext}`);
      if (!fs.existsSync(dest)) {
        try {
          await downloadFile(wanted[i], dest);
          log(`  ↓ ${p.handle}/ref-${i}.${ext}`);
        } catch (e) {
          log(`  ! image failed for ${p.handle}: ${e.message}`);
          continue;
        }
      }
      if (!p.localImages.includes(dest)) p.localImages.push(dest);
    }
  }
  writeJson(productsFile, products);
  return products;
}
