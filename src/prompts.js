/**
 * Prompt template library. Each template receives the product and returns a
 * generation prompt. The reference image (scraped product photo) is always
 * attached alongside, so prompts describe scene/style — the product itself
 * comes from the reference.
 */

const ctx = (p) => (p.description ? ` Product context: ${p.description}` : '');

export const IMAGE_TEMPLATES = {
  hero: (p) =>
    `Professional studio hero shot of ${p.title}, matching the reference product exactly. Clean seamless background, dramatic soft-box lighting, subtle reflection beneath the product, crisp label text, premium commercial product photography, high resolution.${ctx(p)}`,
  lifestyle: (p) =>
    `Lifestyle photo featuring ${p.title} from the reference image in a natural real-world setting where it would be used or enjoyed. Warm golden-hour light, shallow depth of field, authentic candid feel, editorial quality.${ctx(p)}`,
  flatlay: (p) =>
    `Top-down flat-lay composition featuring ${p.title} from the reference image as the centerpiece, styled with complementary props on a textured surface, balanced negative space, soft natural window light, magazine-quality food/product styling.${ctx(p)}`,
  ugc: (p) =>
    `Casual UGC-style smartphone photo of a person's hand holding ${p.title} from the reference image, slightly imperfect framing, natural indoor lighting, authentic social-media aesthetic, product label clearly visible.${ctx(p)}`,
  macro: (p) =>
    `Extreme macro close-up of ${p.title} from the reference image showing texture and detail, razor-thin depth of field, dramatic side lighting, appetizing/premium feel, advertising quality.${ctx(p)}`,
  occasion: (p) =>
    `Seasonal occasion scene featuring ${p.title} from the reference image — festive gathering table setting, ambient bokeh lights in the background, inviting cozy atmosphere, commercial advertising photography.${ctx(p)}`,
};

export const VIDEO_TEMPLATES = {
  'product-motion': (p) =>
    `Cinematic product commercial shot of ${p.title}: slow orbiting camera move around the product, dramatic studio lighting sweeps across the label, subtle particles in the air, premium advertising style, smooth motion.${ctx(p)}`,
  'ugc-video': (p) =>
    `Handheld UGC-style video: a person picks up ${p.title}, turns it toward the camera and shows it off enthusiastically, natural indoor lighting, authentic social media energy, product label stays readable.${ctx(p)}`,
};

export function buildPrompt(kind, type, product) {
  const lib = kind === 'video' ? VIDEO_TEMPLATES : IMAGE_TEMPLATES;
  const tpl = lib[type];
  if (!tpl) throw new Error(`Unknown ${kind} template "${type}". Available: ${Object.keys(lib).join(', ')}`);
  return tpl(product);
}
