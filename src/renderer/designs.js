// Ready-made thank-you designs and the canvas code that draws any design at
// any size. One drawing routine makes the editor preview, the gallery
// thumbnails, the 300 dpi print picture and the Cricut PNG, so they always match.

import { cornerRadius } from "../shared/catalog.js";

/** Font families bundled with the app (all SIL Open Font License). */
export const FONTS = {
  script: { name: "Script", css: '700 {px}px "Dancing Script"' },
  serif: { name: "Serif", css: '400 {px}px "DM Serif Display"' },
  round: { name: "Rounded", css: '600 {px}px "Fredoka"' },
  sans: { name: "Clean", css: '600 {px}px "IBM Plex Sans"' },
};
const SMALL_FONT = '400 {px}px "IBM Plex Sans"';

/**
 * @typedef {object} Design
 * @property {string} preset
 * @property {string} bg background colour
 * @property {string} ink text colour
 * @property {string} accent border and decoration colour
 * @property {"none"|"line"|"double"|"dots"} border
 * @property {"none"|"heart"|"star"|"sparkle"} motif
 * @property {string} headline
 * @property {keyof typeof FONTS} font headline font
 * @property {string} subline
 * @property {string} shop
 */

/** @type {(Design & {name:string})[]} */
export const PRESETS = [
  { preset: "classic", name: "Classic", bg: "#ffffff", ink: "#222222", accent: "#a8834f", border: "line", motif: "none", headline: "Thank you", font: "script", subline: "for your order", shop: "" },
  { preset: "blush", name: "Blush", bg: "#f7d9d9", ink: "#7a2e3a", accent: "#c0485b", border: "none", motif: "heart", headline: "Thank you", font: "script", subline: "for supporting my small business", shop: "" },
  { preset: "kraft", name: "Kraft", bg: "#c8a27c", ink: "#3b2a1a", accent: "#3b2a1a", border: "double", motif: "none", headline: "THANK YOU", font: "serif", subline: "for shopping small", shop: "" },
  { preset: "midnight", name: "Midnight", bg: "#1f2a44", ink: "#f6efe3", accent: "#f2c14e", border: "dots", motif: "star", headline: "thank you", font: "script", subline: "you made my day", shop: "" },
  { preset: "sage", name: "Sage", bg: "#cfdcc0", ink: "#2f3e2c", accent: "#2f3e2c", border: "line", motif: "none", headline: "Thank you!", font: "round", subline: "Hope you love it", shop: "" },
  { preset: "sunny", name: "Sunny", bg: "#ffd85c", ink: "#3a2e00", accent: "#ffffff", border: "none", motif: "sparkle", headline: "You’re the best!", font: "round", subline: "thanks for your order", shop: "" },
  { preset: "mono", name: "Bold", bg: "#111111", ink: "#ffffff", accent: "#ffffff", border: "line", motif: "none", headline: "THANK YOU", font: "sans", subline: "for your order", shop: "" },
  { preset: "lavender", name: "Lavender", bg: "#e4dcf3", ink: "#45306b", accent: "#8a63c9", border: "none", motif: "heart", headline: "Made with love", font: "script", subline: "just for you", shop: "" },
  { preset: "ocean", name: "Ocean", bg: "#d6ebf1", ink: "#0f4c5c", accent: "#0f4c5c", border: "double", motif: "none", headline: "Thanks for your order", font: "serif", subline: "Your support means a lot", shop: "" },
  { preset: "happy", name: "Happy mail", bg: "#ffffff", ink: "#d9482b", accent: "#d9482b", border: "dots", motif: "none", headline: "Happy mail!", font: "round", subline: "something good inside", shop: "" },
];

export const BORDERS = { none: "None", line: "Line", double: "Double line", dots: "Dots" };
export const MOTIFS = { none: "None", heart: "Heart", star: "Star", sparkle: "Sparkle" };

/** Waits until the bundled fonts can be drawn on a canvas. */
export async function loadFonts() {
  const specs = [...Object.values(FONTS).map((f) => f.css), SMALL_FONT].map((c) => c.replace("{px}", "40"));
  await Promise.all(specs.map((s) => document.fonts.load(s, "Thank you")));
}

/**
 * Keeps a design read from saved settings to known values.
 * @param {unknown} d
 * @returns {Design}
 */
export function cleanDesign(d) {
  const src = /** @type {any} */ (d && typeof d === "object" ? d : {});
  const base = PRESETS.find((p) => p.preset === src.preset) ?? PRESETS[0];
  const colour = (v, dflt) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : dflt);
  const text = (v, dflt) => (typeof v === "string" ? v.slice(0, 80) : dflt);
  return {
    preset: base.preset,
    bg: colour(src.bg, base.bg),
    ink: colour(src.ink, base.ink),
    accent: colour(src.accent, base.accent),
    border: Object.hasOwn(BORDERS, src.border) ? src.border : base.border,
    motif: Object.hasOwn(MOTIFS, src.motif) ? src.motif : base.motif,
    headline: text(src.headline, base.headline),
    font: Object.hasOwn(FONTS, src.font) ? src.font : base.font,
    subline: text(src.subline, base.subline),
    shop: text(src.shop, ""),
  };
}

/**
 * @typedef {object} DrawJob
 * @property {Design} design
 * @property {{w:number,h:number}} size cut size, in
 * @property {"circle"|"rect"|"rounded"} shape
 * @property {number} bleed in (0 for the Cricut PNG)
 * @property {number} dpi
 * @property {{img: CanvasImageSource, w:number, h:number, layout:"fill"|"top"}|null} art
 */

/**
 * Draws a design onto a new canvas covering the cut size plus bleed.
 * Outside the (bleed-expanded) shape stays transparent.
 * @param {DrawJob} job
 * @returns {HTMLCanvasElement}
 */
export function drawDesign(job) {
  const { design: d, size, shape, bleed, dpi, art } = job;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((size.w + 2 * bleed) * dpi);
  canvas.height = Math.round((size.h + 2 * bleed) * dpi);
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  const u = dpi; // pixels per inch
  const cut = { x: bleed * u, y: bleed * u, w: size.w * u, h: size.h * u };
  const radius = cornerRadius(size) * u;

  ctx.save();
  shapePath(ctx, shape, inflate(cut, bleed * u), radius + bleed * u);
  ctx.clip();
  ctx.fillStyle = d.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const fillArt = art && art.layout === "fill";
  if (fillArt) drawCover(ctx, art, { x: 0, y: 0, w: canvas.width, h: canvas.height });

  // Border, inside the cut line so a slightly-off cut never clips it.
  const inset = 0.09 * u;
  const stroke = Math.max(1, 0.022 * u);
  ctx.strokeStyle = ctx.fillStyle = d.accent;
  if (d.border === "line" || d.border === "double") {
    ctx.lineWidth = stroke;
    shapePath(ctx, shape, inflate(cut, -inset), Math.max(0, radius - inset));
    ctx.stroke();
    if (d.border === "double") {
      const in2 = inset + stroke * 2.6;
      shapePath(ctx, shape, inflate(cut, -in2), Math.max(0, radius - in2));
      ctx.stroke();
    }
  } else if (d.border === "dots") {
    drawDots(ctx, shape, inflate(cut, -inset), Math.max(0, radius - inset), stroke * 1.4);
  }

  if (!fillArt) {
    const pad = (d.border === "none" ? 0.13 : 0.2) * u;
    const content = inflate(cut, -pad);
    let textBox = content;
    if (art && shape === "circle") {
      // Keep the picture's corners inside the circle: a box from 0.85r to 0.25r above the centre.
      const R = cut.w / 2 - pad;
      const cx = cut.x + cut.w / 2;
      const cy = cut.y + cut.h / 2;
      const halfW = Math.sqrt(R * R - (0.85 * R) ** 2);
      drawContain(ctx, art, { x: cx - halfW, y: cy - 0.85 * R, w: 2 * halfW, h: 0.6 * R });
      textBox = { x: content.x, y: cy - 0.18 * R, w: content.w, h: 1.03 * R };
    } else if (art) {
      const artH = content.h * 0.5;
      drawContain(ctx, art, { x: content.x, y: content.y, w: content.w, h: artH });
      textBox = { x: content.x, y: content.y + artH + 0.04 * u, w: content.w, h: content.h - artH - 0.04 * u };
    }
    drawText(ctx, d, textBox, shape === "circle" ? { cx: cut.x + cut.w / 2, cy: cut.y + cut.h / 2, r: cut.w / 2 - pad } : null, 0.6 * u);
  }
  ctx.restore();
  return canvas;
}

/** @param {{x:number,y:number,w:number,h:number}} r @param {number} by */
function inflate(r, by) {
  return { x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {"circle"|"rect"|"rounded"} shape
 * @param {{x:number,y:number,w:number,h:number}} r
 * @param {number} radius corner radius for "rounded"
 */
function shapePath(ctx, shape, r, radius) {
  ctx.beginPath();
  if (shape === "circle") ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
  else if (shape === "rounded") ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  else ctx.rect(r.x, r.y, r.w, r.h);
}

/** Evenly spaced dots along the border line. */
function drawDots(ctx, shape, r, radius, dot) {
  const points = [];
  const spacing = dot * 3.2;
  if (shape === "circle") {
    const rr = r.w / 2;
    const n = Math.max(8, Math.round((2 * Math.PI * rr) / spacing));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      points.push([r.x + rr + rr * Math.cos(a), r.y + r.h / 2 + (r.h / 2) * Math.sin(a)]);
    }
  } else {
    // Walk the (rounded) rectangle's outline.
    const rad = shape === "rounded" ? radius : 0;
    const straightW = r.w - 2 * rad;
    const straightH = r.h - 2 * rad;
    const arc = (Math.PI / 2) * rad;
    const total = 2 * (straightW + straightH) + 4 * arc;
    const n = Math.max(8, Math.round(total / spacing));
    const at = (t) => {
      let s = t;
      const seg = [
        [straightW, (v) => [r.x + rad + v, r.y]],
        [arc, (v) => corner(r.x + r.w - rad, r.y + rad, -Math.PI / 2 + v / rad)],
        [straightH, (v) => [r.x + r.w, r.y + rad + v]],
        [arc, (v) => corner(r.x + r.w - rad, r.y + r.h - rad, v / rad)],
        [straightW, (v) => [r.x + r.w - rad - v, r.y + r.h]],
        [arc, (v) => corner(r.x + rad, r.y + r.h - rad, Math.PI / 2 + v / rad)],
        [straightH, (v) => [r.x, r.y + r.h - rad - v]],
        [arc, (v) => corner(r.x + rad, r.y + rad, Math.PI + v / rad)],
      ];
      for (const [len, f] of seg) {
        if (s <= len) return f(s);
        s -= len;
      }
      return seg[7][1](arc);
    };
    const corner = (cx, cy, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    for (let i = 0; i < n; i++) points.push(at((i / n) * total));
  }
  for (const [x, y] of points) {
    ctx.beginPath();
    ctx.arc(x, y, dot / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Art scaled to cover the whole box (cropping the overflow). */
function drawCover(ctx, art, box) {
  const k = Math.max(box.w / art.w, box.h / art.h);
  const w = art.w * k;
  const h = art.h * k;
  ctx.drawImage(art.img, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
}

/** Art scaled to fit inside the box. */
function drawContain(ctx, art, box) {
  const k = Math.min(box.w / art.w, box.h / art.h);
  const w = art.w * k;
  const h = art.h * k;
  ctx.drawImage(art.img, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
}

/**
 * Headline, second line and shop name, as large as fits. In a circle each line
 * is also kept inside the circle's width at its own height.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Design} d
 * @param {{x:number,y:number,w:number,h:number}} box
 * @param {{cx:number,cy:number,r:number}|null} circle
 * @param {number} maxHeadline largest headline size, px
 */
function drawText(ctx, d, box, circle, maxHeadline) {
  const items = [];
  if (d.motif !== "none") items.push({ kind: "motif", rel: 0.62 });
  if (d.headline.trim()) items.push({ kind: "text", text: d.headline.trim(), font: FONTS[d.font].css, rel: 1, color: d.ink, lh: d.font === "script" ? 1.25 : 1.12 });
  if (d.subline.trim()) items.push({ kind: "text", text: d.subline.trim(), font: SMALL_FONT, rel: 0.4, color: d.ink, lh: 1.25 });
  if (d.shop.trim()) items.push({ kind: "text", text: d.shop.trim(), font: SMALL_FONT, rel: 0.34, color: d.ink, lh: 1.25, alpha: 0.8 });
  if (!items.length) return;

  // Long lines wrap onto two lines before the text shrinks too far.
  const lines = (item, px) => {
    ctx.font = item.font.replace("{px}", String(px));
    // Two-word lines like "Thank you" read better kept together, just smaller.
    if (ctx.measureText(item.text).width <= box.w || item.text.split(" ").length < 3) return [item.text];
    const words = item.text.split(" ");
    let best = [item.text];
    let bestW = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" ");
      const b = words.slice(i).join(" ");
      const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
      if (w < bestW) {
        bestW = w;
        best = [a, b];
      }
    }
    return best;
  };

  const layout = (k) => {
    const gap = 0.14 * k;
    const rows = [];
    for (const it of items) {
      if (it.kind === "motif") rows.push({ it, h: it.rel * k, size: it.rel * k });
      else {
        const px = Math.max(1, it.rel * k);
        for (const t of lines(it, px)) rows.push({ it, h: px * it.lh, size: px, text: t });
      }
    }
    const total = rows.reduce((s, r) => s + r.h, 0) + gap * (items.length - 1);
    let y = box.y + (box.h - total) / 2;
    let prev = null;
    for (const r of rows) {
      if (prev && prev !== r.it) y += gap;
      r.cy = y + r.h / 2;
      y += r.h;
      prev = r.it;
    }
    return { rows, total };
  };

  const availAt = (top, bottom) => {
    if (!circle) return box.w;
    const dy = Math.max(Math.abs(top - circle.cy), Math.abs(bottom - circle.cy));
    if (dy >= circle.r) return 0;
    return Math.min(box.w, 2 * Math.sqrt(circle.r * circle.r - dy * dy) * 0.94);
  };

  // Big cards get a generous but not shouty headline (at most ~0.6 in tall).
  let k = Math.min(box.h * 0.36, box.w * 0.3, maxHeadline);
  let plan = layout(k);
  for (let i = 0; i < 60; i++) {
    const fits =
      plan.total <= box.h &&
      plan.rows.every((r) => {
        const avail = availAt(r.cy - r.size * 0.42, r.cy + r.size * 0.42);
        if (r.it.kind === "motif") return r.size <= avail;
        ctx.font = r.it.font.replace("{px}", String(r.size));
        return ctx.measureText(r.text).width <= avail;
      });
    if (fits) break;
    k *= 0.94;
    plan = layout(k);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = box.x + box.w / 2;
  for (const r of plan.rows) {
    if (r.it.kind === "motif") {
      ctx.fillStyle = d.accent;
      drawMotif(ctx, d.motif, cx, r.cy, r.size);
      continue;
    }
    ctx.globalAlpha = r.it.alpha ?? 1;
    ctx.fillStyle = r.it.color;
    ctx.font = r.it.font.replace("{px}", String(r.size));
    ctx.fillText(r.text, cx, r.cy);
    ctx.globalAlpha = 1;
  }
}

/**
 * Small decoration above the headline.
 * @param {CanvasRenderingContext2D} ctx
 * @param {"heart"|"star"|"sparkle"} motif
 * @param {number} cx @param {number} cy @param {number} s overall size, px
 */
function drawMotif(ctx, motif, cx, cy, s) {
  ctx.beginPath();
  if (motif === "heart") {
    const top = cy - s * 0.28;
    ctx.moveTo(cx, cy + s * 0.42);
    ctx.bezierCurveTo(cx - s * 0.12, cy + s * 0.3, cx - s * 0.5, cy + s * 0.05, cx - s * 0.5, top);
    ctx.bezierCurveTo(cx - s * 0.5, cy - s * 0.52, cx - s * 0.12, cy - s * 0.56, cx, top);
    ctx.bezierCurveTo(cx + s * 0.12, cy - s * 0.56, cx + s * 0.5, cy - s * 0.52, cx + s * 0.5, top);
    ctx.bezierCurveTo(cx + s * 0.5, cy + s * 0.05, cx + s * 0.12, cy + s * 0.3, cx, cy + s * 0.42);
  } else if (motif === "star") {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.21 : s * 0.5;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(cx + r * Math.cos(a), cy + s * 0.04 + r * Math.sin(a));
    }
    ctx.closePath();
  } else {
    const r = s * 0.5;
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx, cy, cx + r * 0.8, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy + r);
    ctx.quadraticCurveTo(cx, cy, cx - r * 0.8, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy - r);
  }
  ctx.fill();
}
