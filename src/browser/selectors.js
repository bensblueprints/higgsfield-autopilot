/**
 * All Higgsfield web-UI selectors live here so a site redesign means editing
 * ONE file. Calibrated against the live site on 2026-07-02.
 *
 * Key facts discovered:
 * - Image workspace: https://higgsfield.ai/ai/image?model=<id>  (form.image-form)
 *   The ?model= query param preselects the model. Unlimited-eligible models
 *   carry an "Unlimited" badge in the model dropdown, and the quality menu
 *   ("Select quality") badges each unlimited resolution (1K/2K Unlimited).
 *   The Generate button may still show a nominal credit number for images —
 *   unlimited status is proven by the badges, not the button.
 * - Video workspace: https://higgsfield.ai/ai/video (form.generate-form).
 *   Unlimited models (Ben's plan): "Seedance 2.0 Mini" (Exclusive),
 *   "Enhanced Seedance 2.0 Fast". When one is selected the Generate button
 *   literally reads "Generate Unlimited" — that IS the check.
 * - Prompt input is a [contenteditable=true] div, placeholder
 *   "Describe the scene you imagine".
 * - Image page has a persistent input[type=file] (.jpg/.jpeg/.png/.webp,
 *   multiple). Video page has none — the "+" in the media box opens a
 *   picker; handle via Playwright's filechooser event with a modal-input
 *   fallback.
 */
export const URLS = {
  home: 'https://higgsfield.ai/',
  createImage: 'https://higgsfield.ai/ai/image?model=nano-banana-pro',
  createVideo: 'https://higgsfield.ai/ai/video',
};

export const MODELS = {
  image: 'Nano Banana Pro', // display name; must carry the Unlimited badge
  // Ben's spec: 7s @ 720p unlimited hyper-motion ads. Only "Enhanced Seedance
  // 2.0 Fast" (Unlimited) offers 7s at 720p — base "Seedance 2.0" is 4K and
  // costs credits, and "Seedance 2.0 Mini" is locked to 4s. Candidates tried
  // in order; each must carry the Unlimited badge, and "Generate Unlimited" is
  // the final gate.
  video: ['Enhanced Seedance 2.0 Fast', 'Seedance 2.0 Mini'],
};

export const VIDEO_SETTINGS = {
  durationSeconds: 7, // menu options render as "7.0s"; matched numerically
  resolution: '720p',
};

export const SEL = {
  // Visible only when logged OUT. Must be exact-ish: promo banners contain
  // "Sign up and get…" text even for logged-in users.
  signInButton: { role: 'button', name: /^(log ?in|sign ?in|sign ?up)$/i },

  imageForm: 'form.image-form',
  videoForm: 'form.generate-form',

  promptInput: '[contenteditable="true"]', // scoped inside the form
  fileInput: 'input[type="file"]',

  // Chip buttons inside the form are identified by their text content.
  generateButton: { role: 'button', name: /generate/i },

  // Unlimited proof:
  //  - video: generate button text contains "Unlimited"
  //  - image: quality chip menu option that is selected shows an
  //    "Unlimited" badge (menu heading "Select quality")
  qualityMenuHeading: /select quality/i,

  // History feed media (used to diff before/after submit).
  feedImages: 'img',
  feedVideos: 'video',
};
