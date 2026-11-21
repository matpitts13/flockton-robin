import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAppUrl, servedFolders } from "../src/main/serve.js";
import { MAX_BYTES, checkPrintPayload, checkSavePayload, safeFileName } from "../src/main/validate.js";

const enc = (s) => new TextEncoder().encode(s);
const PDF = enc("%PDF-1.7 rest of file");
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe("checkSavePayload", () => {
  it("accepts each kind with its own extension", () => {
    expect(checkSavePayload({ kind: "pdf", name: "robin-2in-circle", bytes: PDF }).name).toBe("robin-2in-circle.pdf");
    expect(checkSavePayload({ kind: "png", name: "x.png", bytes: PNG }).name).toBe("x.png");
    expect(checkSavePayload({ kind: "svg", name: "t", bytes: enc('<?xml version="1.0"?>\n<svg xmlns="x"></svg>') }).name).toBe("t.svg");
  });

  it("rejects a mismatch between kind and bytes", () => {
    expect(() => checkSavePayload({ kind: "png", name: "x", bytes: PDF })).toThrow(/PNG/);
    expect(() => checkSavePayload({ kind: "svg", name: "x", bytes: enc("<html><svg></svg></html>") })).toThrow(/SVG/);
  });

  it("rejects unknown kinds, inherited keys and bad data", () => {
    expect(() => checkSavePayload({ kind: "exe", name: "x", bytes: PDF })).toThrow(/type/);
    expect(() => checkSavePayload({ kind: "toString", name: "x", bytes: PDF })).toThrow(/type/);
    expect(() => checkSavePayload({ kind: "pdf", name: "x", bytes: "%PDF-" })).toThrow(/missing/);
    expect(() => checkSavePayload({ kind: "pdf", name: "x", bytes: { length: MAX_BYTES + 1 } })).toThrow(/missing/);
    expect(() => checkSavePayload(null)).toThrow();
  });
});

describe("safeFileName", () => {
  it("strips path characters and keeps one extension", () => {
    expect(safeFileName("..\\..\\Windows\\evil.pdf", "pdf")).toBe("Windows-evil.pdf");
    expect(safeFileName("a/b:c*?.png", "png")).toBe("a-b-c.png");
    expect(safeFileName("", "svg")).toBe("stickers.svg");
    expect(safeFileName(42, "pdf")).toBe("stickers.pdf");
  });
});

describe("checkPrintPayload", () => {
  it("only allows known paper sizes", () => {
    expect(checkPrintPayload({ paper: "a4" }).paper).toBe("a4");
    expect(() => checkPrintPayload({ paper: "label4x6" })).toThrow();
    expect(() => checkPrintPayload({ paper: "constructor" })).toThrow();
    expect(() => checkPrintPayload(undefined)).toThrow();
  });
});

describe("resolveAppUrl", () => {
  const src = path.resolve("/app/src");
  const served = servedFolders(src, path.resolve("/app"));

  it("maps app files", () => {
    expect(resolveAppUrl("app://robin/renderer/index.html", served)).toBe(path.join(src, "renderer", "index.html"));
    expect(resolveAppUrl("app://robin/vendor/pdf-lib/pdf-lib.esm.min.js", served)).toBe(path.resolve("/app/node_modules/pdf-lib/dist/pdf-lib.esm.min.js"));
  });

  it("refuses other hosts, traversal and unknown folders", () => {
    expect(resolveAppUrl("app://other/renderer/index.html", served)).toBeNull();
    expect(resolveAppUrl("app://robin/renderer/..%2f..%2fpackage.json", served)).toBeNull();
    expect(resolveAppUrl("app://robin/main/main.js", served)).toBeNull();
    expect(resolveAppUrl("app://robin/renderer/%E0%A4%A", served)).toBeNull();
    expect(resolveAppUrl("not a url", served)).toBeNull();
  });
});
