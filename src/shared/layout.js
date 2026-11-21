// Where each sticker goes on a sheet. Two ways to lay out:
//  - packPlan: plain paper, cardstock or full-sheet sticker paper. Fits as many
//    as possible (turning them sideways if that fits more), centred, with room
//    for crop marks.
//  - gridPlan: pre-cut label sheets. The user's columns, rows, margins and gaps,
//    because every brand's sheet is a little different.
// Slots are cut boxes in inches from the sheet's top-left corner.

const EPS = 1e-6;

/**
 * @typedef {object} Slot
 * @property {number} x
 * @property {number} y
 * @property {number} w footprint width on the sheet (h of the design when turned)
 * @property {number} h footprint height on the sheet
 * @property {boolean} turned design is rotated a quarter turn clockwise
 */

/**
 * @typedef {object} Plan
 * @property {Slot[]} slots
 * @property {number} cols
 * @property {number} rows
 * @property {number} perSheet
 * @property {boolean} turned
 * @property {boolean} [overflow] a pre-cut grid runs off the paper
 */

/**
 * How many of a w×h box fit along one side.
 * @param {number} avail @param {number} item @param {number} gap
 */
function fit(avail, item, gap) {
  if (item <= 0) return 0;
  return Math.max(0, Math.floor((avail + gap + EPS) / (item + gap)));
}

/**
 * Centred grid of boxes.
 * @param {{w:number,h:number}} paper
 * @param {number} w @param {number} h box size on the sheet
 * @param {number} cols @param {number} rows @param {number} gap
 * @param {boolean} turned
 * @returns {Slot[]}
 */
function centred(paper, w, h, cols, rows, gap, turned) {
  const gridW = cols * w + (cols - 1) * gap;
  const gridH = rows * h + (rows - 1) * gap;
  const left = (paper.w - gridW) / 2;
  const top = (paper.h - gridH) / 2;
  const slots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) slots.push({ x: left + c * (w + gap), y: top + r * (h + gap), w, h, turned });
  }
  return slots;
}

/**
 * Plain-sheet layout: as many as fit inside the margins.
 * @param {{w:number,h:number}} paper
 * @param {{w:number,h:number}} size cut size of one design
 * @param {{margin:number, gap:number, allowTurn?:boolean}} opts
 * @returns {Plan}
 */
export function packPlan(paper, size, { margin, gap, allowTurn = true }) {
  const availW = paper.w - 2 * margin;
  const availH = paper.h - 2 * margin;
  const tryIt = (w, h, turned) => {
    const cols = fit(availW, w, gap);
    const rows = fit(availH, h, gap);
    return { cols, rows, turned, w, h, n: cols * rows };
  };
  let best = tryIt(size.w, size.h, false);
  if (allowTurn && Math.abs(size.w - size.h) > EPS) {
    const side = tryIt(size.h, size.w, true);
    if (side.n > best.n) best = side;
  }
  const slots = best.n ? centred(paper, best.w, best.h, best.cols, best.rows, gap, best.turned) : [];
  return { slots, cols: best.cols, rows: best.rows, perSheet: best.n, turned: best.turned };
}

/**
 * @typedef {object} Grid
 * @property {number} cols
 * @property {number} rows
 * @property {number} left distance from the paper's left edge to the first sticker, in
 * @property {number} top distance from the paper's top edge to the first sticker, in
 * @property {number} hgap space between columns, in
 * @property {number} vgap space between rows, in
 */

/**
 * A reasonable starting grid for a pre-cut sheet of this size: centred,
 * 1/4 in margins, 1/8 in gaps. The user adjusts it to match their sheet.
 * @param {{w:number,h:number}} paper
 * @param {{w:number,h:number}} size
 * @returns {Grid}
 */
export function defaultGrid(paper, size) {
  const gap = 0.125;
  const p = packPlan(paper, size, { margin: 0.25, gap, allowTurn: false });
  const cols = Math.max(1, p.cols);
  const rows = Math.max(1, p.rows);
  const round = (v) => Math.round(v * 1000) / 1000;
  return {
    cols,
    rows,
    left: round(Math.max(0, (paper.w - (cols * size.w + (cols - 1) * gap)) / 2)),
    top: round(Math.max(0, (paper.h - (rows * size.h + (rows - 1) * gap)) / 2)),
    hgap: gap,
    vgap: gap,
  };
}

/**
 * Cleans a grid that came from the user or from saved settings.
 * @param {unknown} g
 * @param {Grid} fallback
 * @returns {Grid}
 */
export function cleanGrid(g, fallback) {
  const src = /** @type {any} */ (g && typeof g === "object" ? g : {});
  const num = (v, min, max, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
  };
  return {
    cols: Math.round(num(src.cols, 1, 20, fallback.cols)),
    rows: Math.round(num(src.rows, 1, 30, fallback.rows)),
    left: num(src.left, 0, 12, fallback.left),
    top: num(src.top, 0, 12, fallback.top),
    hgap: num(src.hgap, 0, 6, fallback.hgap),
    vgap: num(src.vgap, 0, 6, fallback.vgap),
  };
}

/**
 * Pre-cut sheet layout from an explicit grid.
 * @param {{w:number,h:number}} paper
 * @param {{w:number,h:number}} size
 * @param {Grid} grid
 * @returns {Plan}
 */
export function gridPlan(paper, size, grid) {
  const slots = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      slots.push({ x: grid.left + c * (size.w + grid.hgap), y: grid.top + r * (size.h + grid.vgap), w: size.w, h: size.h, turned: false });
    }
  }
  const overflow = slots.some((s) => s.x < -EPS || s.y < -EPS || s.x + s.w > paper.w + 0.001 || s.y + s.h > paper.h + 0.001);
  return { slots, cols: grid.cols, rows: grid.rows, perSheet: slots.length, turned: false, overflow };
}

/**
 * Moves every slot (printer calibration).
 * @param {Slot[]} slots @param {number} dx @param {number} dy
 * @returns {Slot[]}
 */
export function shiftSlots(slots, dx, dy) {
  if (!dx && !dy) return slots;
  return slots.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy }));
}

/**
 * Crop marks in the sheet margin, one in line with every cut edge, so the
 * whole sheet can be cut on a paper trimmer. Segments in inches.
 * @param {Slot[]} slots
 * @param {{w:number,h:number}} paper
 * @returns {{x1:number,y1:number,x2:number,y2:number}[]}
 */
export function cropMarks(slots, paper) {
  if (!slots.length) return [];
  const EDGE = 0.12; // stay clear of the printer's unprintable edge
  const CLEAR = 0.0625 + 0.04; // stay clear of the bleed
  const uniq = (vals) => [...new Set(vals.map((v) => Math.round(v * 10000) / 10000))].sort((a, b) => a - b);
  const xs = uniq(slots.flatMap((s) => [s.x, s.x + s.w]));
  const ys = uniq(slots.flatMap((s) => [s.y, s.y + s.h]));
  const minX = Math.min(...slots.map((s) => s.x));
  const maxX = Math.max(...slots.map((s) => s.x + s.w));
  const minY = Math.min(...slots.map((s) => s.y));
  const maxY = Math.max(...slots.map((s) => s.y + s.h));
  const out = [];
  const add = (x1, y1, x2, y2) => {
    if (Math.hypot(x2 - x1, y2 - y1) >= 0.05) out.push({ x1, y1, x2, y2 });
  };
  for (const x of xs) {
    add(x, EDGE, x, minY - CLEAR);
    add(x, maxY + CLEAR, x, paper.h - EDGE);
  }
  for (const y of ys) {
    add(EDGE, y, minX - CLEAR, y);
    add(maxX + CLEAR, y, paper.w - EDGE, y);
  }
  return out;
}
