// The image asset registry: the only pictures a stream can show. A stream names an asset
// (Image(asset="cabin-pines", …)); it can never supply a URL. Like the tool registry, this is
// application code, shared by the parser (which rejects unknown names), the renderer, the server's
// prompt and the tests.
//
// These assets are small SVG illustrations embedded as data URIs, so nothing is fetched from the web.

export interface ImageAsset {
  src: string;
  width: number;
  height: number;
}

export type AssetRegistry = Readonly<Record<string, ImageAsset>>;

const svg = (width: number, height: number, body: string): ImageAsset => ({
  src: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}</svg>`)}`,
  width,
  height,
});

export const ASSETS: AssetRegistry = {
  // A wooden cabin among pine trees, at dusk.
  "cabin-pines": svg(
    640,
    400,
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c7d2fe"/><stop offset="1" stop-color="#fde68a"/></linearGradient></defs>` +
      `<rect width="640" height="400" fill="url(#s)"/>` +
      `<path d="M0 300 Q160 250 320 290 T640 270 V400 H0Z" fill="#94a3b8"/>` +
      `<path d="M0 330 Q200 300 400 330 T640 320 V400 H0Z" fill="#475569"/>` +
      `<g fill="#14532d"><path d="M90 330 l45-150 45 150Z"/><path d="M60 340 l40-120 40 120Z"/><path d="M500 330 l50-170 50 170Z"/><path d="M560 345 l35-110 35 110Z"/></g>` +
      `<path d="M250 340 V255 L320 205 L390 255 V340Z" fill="#92400e"/>` +
      `<path d="M235 262 L320 196 L405 262" fill="none" stroke="#451a03" stroke-width="12" stroke-linejoin="round"/>` +
      `<rect x="305" y="290" width="30" height="50" fill="#451a03"/>` +
      `<rect x="265" y="270" width="28" height="24" fill="#fde68a"/><rect x="348" y="270" width="28" height="24" fill="#fde68a"/>`,
  ),
  // A linen overshirt, sand colour.
  shirt: svg(
    200,
    200,
    `<rect width="200" height="200" rx="24" fill="#f5f0e6"/>` +
      `<path d="M70 40 L100 52 L130 40 L170 62 L156 98 L140 90 V166 H60 V90 L44 98 L30 62Z" fill="#d6c3a1" stroke="#a8916a" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M100 52 V166" stroke="#a8916a" stroke-width="3"/>` +
      `<g fill="#a8916a"><circle cx="100" cy="78" r="3"/><circle cx="100" cy="104" r="3"/><circle cx="100" cy="130" r="3"/></g>`,
  ),
  // A canvas tote bag, natural colour.
  tote: svg(
    200,
    200,
    `<rect width="200" height="200" rx="24" fill="#eef2f7"/>` +
      `<path d="M78 76 C78 44 122 44 122 76" fill="none" stroke="#a8916a" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="M52 76 H148 L156 164 H44Z" fill="#e7dcc6" stroke="#a8916a" stroke-width="3" stroke-linejoin="round"/>`,
  ),
};
