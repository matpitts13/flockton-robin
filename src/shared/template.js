// Blank design templates (SVG) for making your own sticker art in Canva,
// Inkscape, Affinity, Illustrator and so on. The artboard is the full
// bleed area, so art exported at the artboard size drops straight into Robin.

import { cornerRadius } from "./catalog.js";

const PT = 72;
const SAFE = 0.125; // keep text this far inside the cut line
const DPI = 300;

/**
 * Pixel size to export art at, for a design with bleed.
 * @param {{w:number,h:number}} size @param {number} bleed
 */
export function artPixels(size, bleed) {
  return { w: Math.round((size.w + 2 * bleed) * DPI), h: Math.round((size.h + 2 * bleed) * DPI) };
}

/**
 * @param {{w:number,h:number,name:string}} size
 * @param {"circle"|"rect"|"rounded"} shape
 * @param {number} bleed
 * @returns {string} SVG document
 */
export function templateSvg(size, shape, bleed) {
  const W = (size.w + 2 * bleed) * PT;
  const H = (size.h + 2 * bleed) * PT;
  const b = bleed * PT;
  const s = SAFE * PT;
  const r = cornerRadius(size) * PT;
  const f = (v) => +v.toFixed(2);
  const inch = (v) => +v.toFixed(4);
  const px = artPixels(size, bleed);

  /** @param {number} inset distance inside the cut line (negative = outside) */
  const outline = (inset, attrs) => {
    const x = b + inset;
    const y = b + inset;
    const w = size.w * PT - 2 * inset;
    const h = size.h * PT - 2 * inset;
    if (shape === "circle") return `<ellipse cx="${f(W / 2)}" cy="${f(H / 2)}" rx="${f(w / 2)}" ry="${f(h / 2)}" ${attrs}/>`;
    const rr = shape === "rounded" ? Math.max(0, r - inset) : 0;
    return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rr)}" ${attrs}/>`;
  };

  const fontSize = f(Math.max(5, Math.min(10, W / 16)));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${inch(size.w + 2 * bleed)}in" height="${inch(size.h + 2 * bleed)}in" viewBox="0 0 ${f(W)} ${f(H)}">
  <title>Robin template: ${escapeXml(size.name)}</title>
  <desc>Red: bleed edge (extend your background to here). Black: cut line. Blue dashed: safe zone (keep text and faces inside). Hide this layer before exporting.</desc>
  <g id="guides" fill="none">
    <rect x="0.5" y="0.5" width="${f(W - 1)}" height="${f(H - 1)}" stroke="#e5484d" stroke-width="1"/>
    ${outline(0, 'stroke="#000" stroke-width="0.75"')}
    ${outline(s, 'stroke="#2f62d0" stroke-width="0.75" stroke-dasharray="3 2"')}
    <text font-family="sans-serif" font-size="${fontSize}" fill="#8a8f98" stroke="none" text-anchor="middle">
      <tspan x="${f(W / 2)}" y="${f(H / 2 - fontSize * 0.2)}">${escapeXml(size.name)}</tspan>
      <tspan x="${f(W / 2)}" dy="${f(fontSize * 1.3)}">export ${px.w} × ${px.h} px</tspan>
    </text>
  </g>
</svg>
`;
}

/** @param {string} s */
function escapeXml(s) {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c);
}
