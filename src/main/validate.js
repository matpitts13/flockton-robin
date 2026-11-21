// Checks on everything the window sends to the main process. No Electron
// imports here, so the tests can load it directly.

export const MAX_BYTES = 300 * 1024 * 1024;

/** Page sizes for webContents.print, in microns. */
export const PRINT_SIZES = {
  letter: { width: 215900, height: 279400 },
  a4: { width: 210000, height: 297000 },
};

/** What the window may save, and how to recognise each kind. */
export const FILE_KINDS = {
  pdf: { ext: "pdf", filter: "PDF", title: "Save stickers as PDF", isValid: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  png: { ext: "png", filter: "PNG image", title: "Save picture for Cricut", isValid: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  svg: { ext: "svg", filter: "SVG template", title: "Save design template", isValid: (b) => /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/.test(new TextDecoder().decode(b.subarray(0, 200))) },
};

/** @param {Uint8Array} bytes @param {number[]} magic */
function startsWith(bytes, magic) {
  return bytes.length >= magic.length && magic.every((v, i) => bytes[i] === v);
}

/**
 * Keeps a suggested file name to safe, ordinary characters and the right extension.
 * @param {unknown} name
 * @param {string} ext
 */
export function safeFileName(name, ext) {
  const base = typeof name === "string" ? name : "";
  const cleaned = base
    .replace(new RegExp(`\\.${ext}$`, "i"), "")
    .replace(/[^\p{L}\p{N} ._()-]+/gu, "-")
    .replace(/^[ .-]+|[ .-]+$/g, "")
    .slice(0, 80);
  return `${cleaned || "stickers"}.${ext}`;
}

/**
 * Validates the save payload.
 * @param {unknown} p
 * @returns {{kind: keyof typeof FILE_KINDS, name:string, bytes:Uint8Array}}
 */
export function checkSavePayload(p) {
  if (!p || typeof p !== "object") throw new Error("Nothing to save.");
  const { kind, name, bytes } = /** @type {any} */ (p);
  if (!Object.hasOwn(FILE_KINDS, kind)) throw new Error("Unknown file type.");
  if (!(bytes instanceof Uint8Array) || bytes.length < 8 || bytes.length > MAX_BYTES) throw new Error("The file data is missing or too large.");
  const k = FILE_KINDS[/** @type {keyof typeof FILE_KINDS} */ (kind)];
  if (!k.isValid(bytes)) throw new Error(`That isn't a ${k.ext.toUpperCase()} file.`);
  return { kind, name: safeFileName(name, k.ext), bytes };
}

/** @param {unknown} p */
export function checkPrintPayload(p) {
  const paper = /** @type {any} */ (p)?.paper;
  if (!Object.hasOwn(PRINT_SIZES, paper)) throw new Error("Unknown paper size.");
  return { paper: /** @type {keyof typeof PRINT_SIZES} */ (paper) };
}
