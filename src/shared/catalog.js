// Sticker and insert sizes, paper sizes and the shape rules Robin uses.
// All measurements are inches. No DOM or Electron here, so tests load it directly.

/**
 * @typedef {object} Size
 * @property {string} id
 * @property {"circle"|"square"|"rect"} kind
 * @property {number} w cut width, in
 * @property {number} h cut height, in
 * @property {string} name shown in the size menu
 * @property {"sticker"|"insert"} group
 */

/** @type {Size[]} */
export const SIZES = [
  { id: "c15", kind: "circle", w: 1.5, h: 1.5, name: "1.5 in circle", group: "sticker" },
  { id: "c2", kind: "circle", w: 2, h: 2, name: "2 in circle", group: "sticker" },
  { id: "c25", kind: "circle", w: 2.5, h: 2.5, name: "2.5 in circle", group: "sticker" },
  { id: "c3", kind: "circle", w: 3, h: 3, name: "3 in circle", group: "sticker" },
  { id: "s15", kind: "square", w: 1.5, h: 1.5, name: "1.5 in square", group: "sticker" },
  { id: "s2", kind: "square", w: 2, h: 2, name: "2 in square", group: "sticker" },
  { id: "s3", kind: "square", w: 3, h: 3, name: "3 in square", group: "sticker" },
  { id: "r3x2", kind: "rect", w: 3, h: 2, name: "3 × 2 in rectangle", group: "sticker" },
  { id: "r4x2", kind: "rect", w: 4, h: 2, name: "4 × 2 in rectangle", group: "sticker" },
  { id: "r35x2", kind: "rect", w: 3.5, h: 2, name: "3.5 × 2 in card (business card size)", group: "insert" },
  { id: "r4x6", kind: "rect", w: 4, h: 6, name: "4 × 6 in insert card", group: "insert" },
  { id: "r425x55", kind: "rect", w: 4.25, h: 5.5, name: "4.25 × 5.5 in insert card (quarter sheet)", group: "insert" },
  { id: "r5x7", kind: "rect", w: 5, h: 7, name: "5 × 7 in insert card", group: "insert" },
];

export const PAPERS = {
  letter: { id: "letter", name: "Letter (8.5 × 11 in)", w: 8.5, h: 11 },
  a4: { id: "a4", name: "A4 (210 × 297 mm)", w: 8.27, h: 11.69 },
};

/** Extra artwork printed past the cut line so a slightly-off cut shows no white edge. */
export const BLEED = 1 / 16;

/** Plain-paper sheets leave room around the edge for the crop marks. */
export const PLAIN_MARGIN = 0.4;

/** @param {string} id @returns {Size} */
export function sizeById(id) {
  return SIZES.find((s) => s.id === id) ?? SIZES[1];
}

/**
 * Corner radius of a rounded square or rectangle, in.
 * @param {{w:number,h:number}} size
 */
export function cornerRadius(size) {
  return Math.min(size.w, size.h) * 0.12;
}

/**
 * The cut shape for a size and a corner choice.
 * @param {Size} size
 * @param {"sharp"|"round"} corners
 * @returns {"circle"|"rect"|"rounded"}
 */
export function cutShape(size, corners) {
  if (size.kind === "circle") return "circle";
  return corners === "round" ? "rounded" : "rect";
}

/** Short size text for file names, e.g. "2in-circle", "4x6in-card". @param {Size} size */
export function sizeSlug(size) {
  const n = (v) => String(v).replace(".", "-");
  if (size.kind === "circle") return `${n(size.w)}in-circle`;
  if (size.kind === "square") return `${n(size.w)}in-square`;
  return `${n(size.w)}x${n(size.h)}in-${size.group === "insert" ? "card" : "rectangle"}`;
}
