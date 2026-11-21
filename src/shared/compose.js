// Builds the print-ready PDF: the sticker picture (300 dpi, with bleed) placed
// at exact sizes in every slot, plus optional crop marks and cut outlines.
// pdf-lib is passed in so the same code runs in the window and in the tests.

import { cornerRadius } from "./catalog.js";
import { cropMarks } from "./layout.js";

const PT = 72; // PDF points per inch

/**
 * @typedef {object} ComposeJob
 * @property {Uint8Array} png the design, upright, covering the cut size plus bleed on every side
 * @property {{w:number,h:number}} size cut size of one design, in
 * @property {number} bleed in
 * @property {"circle"|"rect"|"rounded"} shape
 * @property {import("./layout.js").Slot[]} slots cut boxes on one sheet (already nudged)
 * @property {{w:number,h:number}} paper
 * @property {number} sheets how many identical sheets
 * @property {boolean} marks crop marks in the margin
 * @property {boolean} outline thin cut line around each design
 */

/**
 * @param {any} PDFLib the pdf-lib module namespace
 * @param {ComposeJob} job
 * @returns {Promise<Uint8Array>}
 */
export async function composePdf(PDFLib, job) {
  const { PDFDocument, degrees, rgb } = PDFLib;
  const { size, bleed: b, paper } = job;
  if (!job.slots.length) throw new Error("Nothing fits on this sheet.");
  const sheets = Math.max(1, Math.min(100, Math.floor(job.sheets) || 1));
  const out = await PDFDocument.create();
  out.setTitle("Stickers");
  out.setCreator("Robin");
  out.setProducer("Robin");
  const image = await out.embedPng(job.png);
  const marks = job.marks ? cropMarks(job.slots, paper) : [];
  const fromTop = (yIn) => (paper.h - yIn) * PT;
  const grey = rgb(0.55, 0.55, 0.55);

  for (let n = 0; n < sheets; n++) {
    const page = out.addPage([paper.w * PT, paper.h * PT]);
    for (const s of job.slots) {
      const width = (size.w + 2 * b) * PT;
      const height = (size.h + 2 * b) * PT;
      if (s.turned) {
        // Rotated -90° about its bottom-left corner: the picture's width runs
        // down the page and its height runs right, so anchor at the top-left.
        page.drawImage(image, { x: (s.x - b) * PT, y: fromTop(s.y - b), width, height, rotate: degrees(-90) });
      } else {
        page.drawImage(image, { x: (s.x - b) * PT, y: fromTop(s.y + s.h + b), width, height });
      }
      if (job.outline) drawOutline(page, s, job.shape, size, fromTop, grey);
    }
    for (const m of marks) {
      page.drawLine({ start: { x: m.x1 * PT, y: fromTop(m.y1) }, end: { x: m.x2 * PT, y: fromTop(m.y2) }, thickness: 0.5, color: rgb(0, 0, 0) });
    }
  }
  return out.save();
}

/**
 * Thin line exactly on the cut edge, for cutting with scissors or a punch.
 * @param {any} page
 * @param {import("./layout.js").Slot} s
 * @param {"circle"|"rect"|"rounded"} shape
 * @param {{w:number,h:number}} size
 * @param {(y:number)=>number} fromTop
 * @param {any} color
 */
function drawOutline(page, s, shape, size, fromTop, color) {
  const borderWidth = 0.5;
  if (shape === "circle") {
    page.drawEllipse({ x: (s.x + s.w / 2) * PT, y: fromTop(s.y + s.h / 2), xScale: (s.w / 2) * PT, yScale: (s.h / 2) * PT, borderColor: color, borderWidth });
  } else if (shape === "rounded") {
    page.drawSvgPath(roundedRectPath(s.w * PT, s.h * PT, cornerRadius(size) * PT), { x: s.x * PT, y: fromTop(s.y), borderColor: color, borderWidth });
  } else {
    page.drawRectangle({ x: s.x * PT, y: fromTop(s.y + s.h), width: s.w * PT, height: s.h * PT, borderColor: color, borderWidth });
  }
}

/**
 * SVG path of a rounded rectangle with its top-left corner at 0,0 (y down).
 * @param {number} w @param {number} h @param {number} r
 */
export function roundedRectPath(w, h, r) {
  const k = 0.5523 * r; // cubic Bézier approximation of a quarter circle
  return [
    `M ${r} 0`,
    `H ${w - r}`,
    `C ${w - r + k} 0 ${w} ${r - k} ${w} ${r}`,
    `V ${h - r}`,
    `C ${w} ${h - r + k} ${w - r + k} ${h} ${w - r} ${h}`,
    `H ${r}`,
    `C ${r - k} ${h} 0 ${h - r + k} 0 ${h - r}`,
    `V ${r}`,
    `C 0 ${r - k} ${r - k} 0 ${r} 0`,
    "Z",
  ].join(" ");
}
