import { describe, expect, it } from "vitest";
import { BLEED, PAPERS, PLAIN_MARGIN, SIZES, cutShape, sizeById, sizeSlug } from "../src/shared/catalog.js";
import { cleanGrid, cropMarks, defaultGrid, gridPlan, packPlan, shiftSlots } from "../src/shared/layout.js";

const letter = PAPERS.letter;
const plain = { margin: PLAIN_MARGIN, gap: 0.25 };

/** True when no two slots overlap and all sit inside the paper's margins. */
function tidy(slots, paper, margin) {
  const inside = slots.every((s) => s.x >= margin - 1e-9 && s.y >= margin - 1e-9 && s.x + s.w <= paper.w - margin + 1e-9 && s.y + s.h <= paper.h - margin + 1e-9);
  const apart = slots.every((a, i) => slots.every((b, j) => i === j || a.x + a.w <= b.x + 1e-9 || b.x + b.w <= a.x + 1e-9 || a.y + a.h <= b.y + 1e-9 || b.y + b.h <= a.y + 1e-9));
  return inside && apart;
}

describe("packPlan", () => {
  it("fits 12 two-inch circles on letter, centred", () => {
    const p = packPlan(letter, sizeById("c2"), plain);
    expect(p.perSheet).toBe(12);
    expect([p.cols, p.rows]).toEqual([3, 4]);
    const left = p.slots[0].x;
    const right = letter.w - (p.slots[2].x + p.slots[2].w);
    expect(left).toBeCloseTo(right, 9);
    expect(tidy(p.slots, letter, PLAIN_MARGIN)).toBe(true);
  });

  it("turns 4 × 6 cards sideways to get two per letter sheet", () => {
    const p = packPlan(letter, sizeById("r4x6"), plain);
    expect(p.perSheet).toBe(2);
    expect(p.turned).toBe(true);
    expect(p.slots[0]).toMatchObject({ w: 6, h: 4, turned: true });
  });

  it("keeps the upright layout when turning doesn't fit more", () => {
    const p = packPlan(letter, sizeById("r35x2"), plain);
    expect(p.turned).toBe(false);
    expect(p.perSheet).toBe(8);
  });

  it("never turns when told not to", () => {
    expect(packPlan(letter, sizeById("r4x6"), { ...plain, allowTurn: false }).perSheet).toBe(1);
  });

  it("returns an empty plan when nothing fits", () => {
    const p = packPlan({ w: 3, h: 3 }, sizeById("r5x7"), plain);
    expect(p.perSheet).toBe(0);
    expect(p.slots).toEqual([]);
  });

  it("lays out every size on both papers without overlaps", () => {
    for (const paper of Object.values(PAPERS)) {
      for (const s of SIZES) {
        const p = packPlan(paper, s, plain);
        expect(p.perSheet, `${s.id} on ${paper.id}`).toBeGreaterThan(0);
        expect(tidy(p.slots, paper, PLAIN_MARGIN), `${s.id} on ${paper.id}`).toBe(true);
      }
    }
  });
});

describe("pre-cut grids", () => {
  it("starts from a centred grid that fits the paper", () => {
    const g = defaultGrid(letter, sizeById("c15"));
    expect([g.cols, g.rows]).toEqual([5, 6]);
    const p = gridPlan(letter, sizeById("c15"), g);
    expect(p.perSheet).toBe(30);
    expect(p.overflow).toBe(false);
  });

  it("places stickers by the user's margins and gaps", () => {
    const p = gridPlan(letter, sizeById("c2"), { cols: 3, rows: 4, left: 0.75, top: 0.5, hgap: 0.5, vgap: 0.625 });
    expect(p.slots[1]).toMatchObject({ x: 3.25, y: 0.5 });
    expect(p.slots[3]).toMatchObject({ x: 0.75, y: 3.125 });
  });

  it("flags a grid that runs off the paper", () => {
    expect(gridPlan(letter, sizeById("c3"), { cols: 3, rows: 4, left: 0.5, top: 0.5, hgap: 0.1, vgap: 0.1 }).overflow).toBe(true);
  });

  it("cleans bad saved values", () => {
    const fallback = defaultGrid(letter, sizeById("c2"));
    expect(cleanGrid({ cols: "abc", rows: 999, left: -4, top: "0.5", hgap: null, vgap: 0.2 }, fallback)).toEqual({
      cols: fallback.cols,
      rows: 30,
      left: 0,
      top: 0.5,
      hgap: 0,
      vgap: 0.2,
    });
    expect(cleanGrid(null, fallback)).toEqual(fallback);
  });
});

describe("shiftSlots and cropMarks", () => {
  it("moves every slot by the printer adjustment", () => {
    const p = packPlan(letter, sizeById("c2"), plain);
    const moved = shiftSlots(p.slots, 0.05, -0.03);
    expect(moved[0].x).toBeCloseTo(p.slots[0].x + 0.05, 9);
    expect(moved[0].y).toBeCloseTo(p.slots[0].y - 0.03, 9);
    expect(shiftSlots(p.slots, 0, 0)).toBe(p.slots);
  });

  it("marks every cut edge in the margins and never over a sticker", () => {
    const p = packPlan(letter, sizeById("s2"), plain);
    const marks = cropMarks(p.slots, letter);
    const xs = new Set(p.slots.flatMap((s) => [s.x, s.x + s.w]).map((v) => v.toFixed(4)));
    const vertical = marks.filter((m) => m.x1 === m.x2);
    expect(new Set(vertical.map((m) => m.x1.toFixed(4)))).toEqual(xs);
    const overSticker = (m) => p.slots.some((s) => Math.max(m.x1, m.x2) > s.x - BLEED && Math.min(m.x1, m.x2) < s.x + s.w + BLEED && Math.max(m.y1, m.y2) > s.y - BLEED && Math.min(m.y1, m.y2) < s.y + s.h + BLEED);
    expect(marks.some(overSticker)).toBe(false);
    expect(marks.every((m) => Math.min(m.x1, m.x2, m.y1, m.y2) >= 0.12 - 1e-9)).toBe(true);
  });

  it("makes no marks for an empty sheet", () => {
    expect(cropMarks([], letter)).toEqual([]);
  });
});

describe("catalog", () => {
  it("names files by size", () => {
    expect(sizeSlug(sizeById("c15"))).toBe("1-5in-circle");
    expect(sizeSlug(sizeById("r4x6"))).toBe("4x6in-card");
    expect(sizeSlug(sizeById("r3x2"))).toBe("3x2in-rectangle");
  });

  it("only rounds corners of squares and rectangles", () => {
    expect(cutShape(sizeById("c2"), "round")).toBe("circle");
    expect(cutShape(sizeById("s2"), "round")).toBe("rounded");
    expect(cutShape(sizeById("s2"), "sharp")).toBe("rect");
  });

  it("falls back to a known size", () => {
    expect(sizeById("nope").id).toBe("c2");
  });
});
