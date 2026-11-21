import * as PDFLib from "pdf-lib";
import { describe, expect, it } from "vitest";
import { BLEED, PAPERS, PLAIN_MARGIN, sizeById } from "../src/shared/catalog.js";
import { composePdf, roundedRectPath } from "../src/shared/compose.js";
import { packPlan } from "../src/shared/layout.js";
import { artPixels, templateSvg } from "../src/shared/template.js";

// 1×1 white PNG.
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

function job(overrides = {}) {
  const size = sizeById("r4x6");
  return {
    png: PNG,
    size,
    bleed: BLEED,
    shape: "rounded",
    slots: packPlan(PAPERS.letter, size, { margin: PLAIN_MARGIN, gap: 0.25 }).slots,
    paper: PAPERS.letter,
    sheets: 3,
    marks: true,
    outline: true,
    ...overrides,
  };
}

describe("composePdf", () => {
  it("makes one page per sheet at the paper size", async () => {
    const doc = await PDFLib.PDFDocument.load(await composePdf(PDFLib, job()));
    expect(doc.getPageCount()).toBe(3);
    const { width, height } = doc.getPage(0).getSize();
    expect([width, height]).toEqual([612, 792]);
    expect(doc.getCreator()).toBe("Robin");
  });

  it("works for circles and square corners without marks", async () => {
    for (const shape of ["circle", "rect"]) {
      const size = sizeById(shape === "circle" ? "c2" : "s2");
      const bytes = await composePdf(PDFLib, job({ shape, size, slots: packPlan(PAPERS.a4, size, { margin: 0.4, gap: 0.25 }).slots, paper: PAPERS.a4, sheets: 1, marks: false }));
      const doc = await PDFLib.PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
    }
  });

  it("clamps the sheet count", async () => {
    const doc = await PDFLib.PDFDocument.load(await composePdf(PDFLib, job({ sheets: 0, outline: false })));
    expect(doc.getPageCount()).toBe(1);
  });

  it("refuses an empty layout", async () => {
    await expect(composePdf(PDFLib, job({ slots: [] }))).rejects.toThrow(/fits/);
  });
});

describe("roundedRectPath", () => {
  it("is a closed path that starts after the corner", () => {
    const p = roundedRectPath(100, 50, 10);
    expect(p.startsWith("M 10 0")).toBe(true);
    expect(p.endsWith("Z")).toBe(true);
    expect(p).toContain("H 90");
    expect(p).toContain("V 40");
  });
});

describe("templateSvg", () => {
  it("sizes the artboard to the cut size plus bleed", () => {
    const svg = templateSvg(sizeById("c2"), "circle", BLEED);
    expect(svg).toContain('width="2.125in"');
    expect(svg).toContain('viewBox="0 0 153 153"');
    expect(svg).toContain("<ellipse");
    expect(svg).toContain("export 638 × 638 px");
  });

  it("uses rounded rectangles for rounded shapes", () => {
    const svg = templateSvg(sizeById("r4x6"), "rounded", BLEED);
    expect(svg).toMatch(/<rect x="4.5" y="4.5" width="288" height="432" rx="[1-9]/);
  });

  it("escapes names", () => {
    expect(templateSvg({ w: 2, h: 2, name: "<x & y>" }, "rect", 0)).toContain("&lt;x &amp; y&gt;");
  });

  it("gives the export size in pixels at 300 dpi", () => {
    expect(artPixels(sizeById("r4x6"), BLEED)).toEqual({ w: 1238, h: 1838 });
  });
});
