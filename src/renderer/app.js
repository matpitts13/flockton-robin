// Robin window: design a sticker or insert card, see it laid out on a sheet,
// then print, save a PDF, export a picture for a Cricut, or save a blank template.
import * as PDFLib from "../vendor/pdf-lib/pdf-lib.esm.min.js";
import { BLEED, PAPERS, PLAIN_MARGIN, SIZES, cornerRadius, cutShape, sizeById, sizeSlug } from "../shared/catalog.js";
import { composePdf } from "../shared/compose.js";
import { cleanGrid, cropMarks, defaultGrid, gridPlan, packPlan, shiftSlots } from "../shared/layout.js";
import { artPixels, templateSvg } from "../shared/template.js";
import { BORDERS, FONTS, MOTIFS, PRESETS, cleanDesign, drawDesign, loadFonts } from "./designs.js";

const DPI = 300;
const PLAIN_GAP = 0.25; // room between stickers on plain sheets, so each can be cut cleanly
const MAX_ART_BYTES = 50 * 1024 * 1024;
const PREVIEW_W = 440; // on-screen sheet width, px

const $ = (id) => /** @type {any} */ (document.getElementById(id));
const el = {
  size: $("size"),
  cornersRow: $("corners-row"),
  gallery: $("gallery"),
  headline: $("headline"),
  subline: $("subline"),
  shop: $("shop"),
  font: $("font"),
  bg: $("bg"),
  ink: $("ink"),
  accent: $("accent"),
  border: $("border"),
  motif: $("motif"),
  artPick: $("art-pick"),
  artFile: $("art-file"),
  artRemove: $("art-remove"),
  artLayout: $("art-layout"),
  artHint: $("art-hint"),
  designImg: $("design-img"),
  mode: $("mode"),
  paper: $("paper"),
  sheets: $("sheets"),
  marks: $("marks"),
  marksWrap: $("marks-wrap"),
  outline: $("outline"),
  gridBox: $("grid-box"),
  grid: { cols: $("g-cols"), rows: $("g-rows"), left: $("g-left"), top: $("g-top"), hgap: $("g-hgap"), vgap: $("g-vgap") },
  gridReset: $("g-reset"),
  nudgeX: $("nudge-x"),
  nudgeY: $("nudge-y"),
  summary: $("summary"),
  status: $("status"),
  sheetsView: $("sheet-view"),
  template: $("template"),
  cricut: $("cricut"),
  save: $("save"),
  print: $("print"),
  veil: $("veil"),
  printRoot: $("print-root"),
};

// ---------- State and saved settings ----------

const saved = loadPrefs();
const state = {
  design: cleanDesign(saved.design),
  sizeId: sizeById(saved.sizeId).id,
  corners: saved.corners === "round" ? "round" : "sharp",
  mode: saved.mode === "precut" ? "precut" : "plain",
  paper: Object.hasOwn(PAPERS, saved.paper) ? saved.paper : "letter",
  sheets: clampInt(saved.sheets, 1, 100, 1),
  marks: saved.marks !== false,
  outline: saved.outline === true,
  /** Pre-cut sheet measurements by "paper:size". @type {Record<string, import("../shared/layout.js").Grid>} */
  grids: saved.grids && typeof saved.grids === "object" ? saved.grids : {},
  nudge: { x: clampNum(saved.nudge?.x, -1, 1, 0), y: clampNum(saved.nudge?.y, -1, 1, 0) },
  artLayout: saved.artLayout === "fill" ? "fill" : "top",
  /** @type {{img: HTMLImageElement, w:number, h:number, url:string, name:string}|null} */
  art: null,
  /** The 300 dpi print picture of the current design. @type {{url:string, blob:Blob, bleed:number}|null} */
  picture: null,
  busy: false,
};

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem("robin.prefs") ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function savePrefs() {
  const { design, sizeId, corners, mode, paper, sheets, marks, outline, grids, nudge, artLayout } = state;
  try {
    localStorage.setItem("robin.prefs", JSON.stringify({ design, sizeId, corners, mode, paper, sheets, marks, outline, grids, nudge, artLayout }));
  } catch {
    // storage unavailable: settings just won't be remembered
  }
}

function clampInt(v, min, max, dflt) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}

function clampNum(v, min, max, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}

const size = () => sizeById(state.sizeId);
const paper = () => PAPERS[state.paper];
const shape = () => cutShape(size(), state.corners);
const gridKey = () => `${state.paper}:${state.sizeId}`;
const grid = () => cleanGrid(state.grids[gridKey()], defaultGrid(paper(), size()));

/** Bleed for the current layout: never more than half the space between stickers. */
function bleed() {
  if (state.mode === "plain") return BLEED;
  const g = grid();
  return Math.min(BLEED, g.cols > 1 ? g.hgap / 2 : BLEED, g.rows > 1 ? g.vgap / 2 : BLEED);
}

/** Where every sticker goes on one sheet (printer adjustment applied). */
function plan() {
  const p = paper();
  const s = size();
  const base = state.mode === "plain" ? packPlan(p, s, { margin: PLAIN_MARGIN, gap: PLAIN_GAP }) : gridPlan(p, s, grid());
  return { ...base, slots: shiftSlots(base.slots, state.nudge.x, state.nudge.y) };
}

// ---------- Jobs run one at a time ----------

let queue = Promise.resolve();
/** @template T @param {() => Promise<T>|T} fn @returns {Promise<T|undefined>} */
function enqueue(fn) {
  const run = queue.then(async () => {
    state.busy = true;
    updateButtons();
    try {
      return await fn();
    } catch (err) {
      setStatus(`Something went wrong: ${err instanceof Error ? err.message : err}`, true);
      return undefined;
    } finally {
      state.busy = false;
      updateButtons();
    }
  });
  queue = run;
  return run;
}

// ---------- Drawing ----------

let renderTimer = 0;
let renderSeq = 0;
/** @type {Promise<void>} */
let rendering = Promise.resolve();

/** Redraws soon (typing in a text box shouldn't redraw on every key). */
function scheduleRender(delay = 120) {
  clearTimeout(renderTimer);
  renderSeq++;
  updateButtons();
  renderTimer = window.setTimeout(startRender, delay);
}

function startRender() {
  clearTimeout(renderTimer);
  renderTimer = 0;
  rendering = renderNow().catch((err) => setStatus(`Couldn't draw the design: ${err instanceof Error ? err.message : err}`, true));
}

/** Waits until the picture matches the latest change. */
async function settled() {
  for (let i = 0; i < 10 && state.picture?.seq !== renderSeq; i++) {
    if (renderTimer) startRender();
    const current = rendering;
    await current;
    if (state.picture?.seq !== renderSeq && rendering === current && !renderTimer) startRender();
  }
  await rendering;
  // Never pair an old picture with new settings.
  if (state.picture?.seq !== renderSeq) throw new Error("The design couldn't be drawn. Change something and try again.");
}

function drawJob(overrides = {}) {
  const art = state.art ? { img: state.art.img, w: state.art.w, h: state.art.h, layout: state.artLayout } : null;
  return { design: state.design, size: size(), shape: shape(), bleed: bleed(), dpi: DPI, art, ...overrides };
}

async function renderNow() {
  const seq = renderSeq;
  renderTimer = 0;
  const s = size();
  // Editor preview: just the sticker (no bleed), about 440 px on its long side.
  const heroDpi = 440 / Math.max(s.w, s.h);
  const hero = await toBlob(drawDesign(drawJob({ bleed: 0, dpi: heroDpi })));
  const b = bleed();
  const print = await toBlob(drawDesign(drawJob({ bleed: b })));
  if (seq !== renderSeq) return; // a newer change is already on its way
  swapUrl(el.designImg, hero);
  if (state.picture) URL.revokeObjectURL(state.picture.url);
  state.picture = { url: URL.createObjectURL(print), blob: print, bleed: b, seq };
  renderSheets();
  updateButtons();
}

/** @param {HTMLCanvasElement} canvas @returns {Promise<Blob>} */
function toBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the design."))), "image/png"));
}

/** @param {HTMLImageElement} img @param {Blob} blob */
function swapUrl(img, blob) {
  const old = img.src;
  img.src = URL.createObjectURL(blob);
  if (old.startsWith("blob:")) URL.revokeObjectURL(old);
}

let galleryKey = "";
/** Thumbnails of every preset in the current shape (redrawn only when the shape changes). */
async function renderGallery() {
  const key = `${state.sizeId}:${state.corners}`;
  if (key === galleryKey) return;
  galleryKey = key;
  const s = size();
  const dpi = 128 / Math.max(s.w, s.h);
  try {
    for (const p of PRESETS) {
      const img = el.gallery.querySelector(`img[data-preset="${p.preset}"]`);
      if (!img) continue;
      const blob = await toBlob(drawDesign({ design: p, size: s, shape: shape(), bleed: 0, dpi, art: null }));
      if (galleryKey !== key) return;
      swapUrl(img, blob);
    }
  } catch {
    if (galleryKey === key) galleryKey = ""; // try again next time; the designs still work without thumbnails
  }
}

// ---------- Sheet preview and print sheets ----------

function renderSheets() {
  const p = paper();
  const s = size();
  const pl = plan();
  const total = pl.perSheet * state.sheets;
  el.summary.classList.toggle("is-warn", pl.perSheet === 0 || !!pl.overflow);
  if (pl.perSheet === 0) {
    el.summary.textContent = `A ${s.name} doesn't fit on ${p.name} paper.`;
  } else {
    const sheetsText = `${state.sheets} ${state.sheets === 1 ? "sheet" : "sheets"}`;
    let text = `${pl.perSheet} per sheet × ${sheetsText} = ${total} ${s.group === "insert" ? "cards" : "stickers"}. Each prints at ${s.name.replace(/ \(.*\)$/, "")}.`;
    if (pl.turned) text += " Turned sideways to fit more.";
    if (pl.overflow) text = `Some stickers run off the paper. Check the sheet measurements. ${text}`;
    el.summary.textContent = text;
  }
  el.sheetsView.style.setProperty("--paper-ratio", `${p.w} / ${p.h}`);
  el.sheetsView.style.setProperty("--sheet-w", `${PREVIEW_W}px`);
  el.sheetsView.replaceChildren(buildSheet(pl, true));
}

/**
 * One sheet of paper, positioned in % of the sheet so the same markup works
 * for the on-screen preview and the true-size print.
 * @param {ReturnType<typeof plan>} pl
 * @param {boolean} preview
 */
function buildSheet(pl, preview) {
  const p = paper();
  const s = size();
  const b = state.picture?.bleed ?? bleed();
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  // Preview: % of the sheet. Print: real inches, so nothing depends on the sheet's height.
  const pct = (v, of) => (preview ? `${(v / of) * 100}%` : `${v}in`);
  const place = (node, x, y, w, h) => {
    node.style.setProperty("--x", pct(x, p.w));
    node.style.setProperty("--y", pct(y, p.h));
    node.style.setProperty("--w", pct(w, p.w));
    node.style.setProperty("--h", pct(h, p.h));
  };
  const cutClass = shape() === "circle" ? "is-circle" : shape() === "rounded" ? "is-rounded" : "";
  for (const slot of pl.slots) {
    if (state.picture) {
      const img = document.createElement("img");
      img.className = "art";
      img.src = state.picture.url;
      img.alt = "";
      // The picture is upright; turned stickers rotate about their centre into the footprint.
      const w = s.w + 2 * b;
      const h = s.h + 2 * b;
      place(img, slot.x + slot.w / 2 - w / 2, slot.y + slot.h / 2 - h / 2, w, h);
      if (slot.turned) img.style.setProperty("--turn", "90deg");
      sheet.append(img);
    }
    if (state.outline) {
      const c = document.createElement("div");
      c.className = `cut ${cutClass}`;
      place(c, slot.x, slot.y, slot.w, slot.h);
      if (cutClass === "is-rounded") c.style.setProperty("--r", preview ? `${(cornerRadius(s) / p.w) * PREVIEW_W}px` : `${cornerRadius(s)}in`);
      sheet.append(c);
    }
  }
  if (state.mode === "plain" && state.marks) {
    const t = 0.5 / 72; // 0.5 pt lines
    for (const m of cropMarks(pl.slots, p)) {
      const d = document.createElement("div");
      d.className = "mark";
      if (m.x1 === m.x2) place(d, m.x1 - t / 2, Math.min(m.y1, m.y2), t, Math.abs(m.y2 - m.y1));
      else place(d, Math.min(m.x1, m.x2), m.y1 - t / 2, Math.abs(m.x2 - m.x1), t);
      sheet.append(d);
    }
  }
  return sheet;
}

const pageRule = new CSSStyleSheet();
document.adoptedStyleSheets = [...document.adoptedStyleSheets, pageRule];

/** Builds the true-size sheets that only show when printing. */
async function preparePrint() {
  await settled();
  const p = paper();
  const pl = plan();
  if (!pl.perSheet) throw new Error("Nothing fits on this paper.");
  pageRule.replaceSync(`@page { size: ${p.w}in ${p.h}in; margin: 0; }`);
  el.printRoot.style.setProperty("--paper-w", `${p.w}in`);
  el.printRoot.style.setProperty("--paper-h", `${p.h}in`);
  el.printRoot.replaceChildren(...Array.from({ length: state.sheets }, () => buildSheet(pl, false)));
  await Promise.all([...el.printRoot.querySelectorAll("img")].map((img) => img.decode().catch(() => {})));
  return p;
}

// ---------- Print, save, Cricut, template ----------

function canOutput() {
  return !state.busy && plan().perSheet > 0;
}

function updateButtons() {
  const ok = canOutput();
  el.print.disabled = el.save.disabled = !ok;
  el.cricut.disabled = el.template.disabled = state.busy;
}

const today = () => new Date().toISOString().slice(0, 10);

function printSheets() {
  if (!canOutput()) return;
  return enqueue(async () => {
    try {
      const p = await preparePrint();
      setStatus("Opening the print dialog… Choose your printer, set the paper type, and keep the scale at 100% (Actual size).");
      const r = await window.api.print(p.id);
      setStatus(r.printed ? "Sent to the printer." : r.reason === "cancelled" ? "" : `Didn't print: ${r.reason}`, !r.printed && r.reason !== "cancelled");
    } catch (err) {
      setStatus(`Couldn't print: ${err instanceof Error ? err.message : err}`, true);
    } finally {
      el.printRoot.replaceChildren();
    }
  });
}

async function buildPdf() {
  await settled();
  if (!state.picture) throw new Error("The design isn't ready yet.");
  // Take everything now, before any await, so a change mid-build can't mix settings.
  const job = {
    picture: state.picture,
    size: size(),
    bleed: state.picture.bleed,
    shape: shape(),
    slots: plan().slots,
    paper: paper(),
    sheets: state.sheets,
    marks: state.mode === "plain" && state.marks,
    outline: state.outline,
  };
  const { picture, ...rest } = job;
  return composePdf(PDFLib, { ...rest, png: new Uint8Array(await picture.blob.arrayBuffer()) });
}

function savePdf() {
  if (!canOutput()) return;
  return enqueue(async () => {
    try {
      setStatus("Building the PDF…");
      const bytes = await buildPdf();
      const r = await window.api.saveFile("pdf", `robin-${sizeSlug(size())}-${today()}`, bytes);
      setStatus(r.saved ? `Saved to ${r.path}` : "");
    } catch (err) {
      setStatus(`Couldn't save the PDF: ${err instanceof Error ? err.message : err}`, true);
    }
  });
}

/** One 300 dpi picture of the sticker with a transparent outside, for Print Then Cut. */
async function cricutPng() {
  await settled();
  const blob = await toBlob(drawDesign(drawJob({ bleed: 0 })));
  return new Uint8Array(await blob.arrayBuffer());
}

function exportCricut() {
  if (state.busy) return;
  return enqueue(async () => {
    try {
      const s = size();
      const r = await window.api.saveFile("png", `robin-${sizeSlug(s)}-cricut`, await cricutPng());
      setStatus(r.saved ? `Saved to ${r.path}. In Cricut Design Space, upload it as a Print Then Cut image, set the width to ${s.w} in, then set how many you want.` : "");
    } catch (err) {
      setStatus(`Couldn't export: ${err instanceof Error ? err.message : err}`, true);
    }
  });
}

function templateBytes() {
  return new TextEncoder().encode(templateSvg(size(), shape(), BLEED));
}

function saveTemplate() {
  if (state.busy) return;
  return enqueue(async () => {
    try {
      const px = artPixels(size(), BLEED);
      const r = await window.api.saveFile("svg", `robin-template-${sizeSlug(size())}`, templateBytes());
      setStatus(
        r.saved
          ? `Saved to ${r.path}. Design on the artboard, hide the guides, export a ${px.w} × ${px.h} px PNG, then add it under Your art and choose "Fill the whole sticker".`
          : "",
      );
    } catch (err) {
      setStatus(`Couldn't save the template: ${err instanceof Error ? err.message : err}`, true);
    }
  });
}

function setStatus(text, isError = false) {
  el.status.textContent = text;
  el.status.classList.toggle("is-error", isError);
}

// ---------- Your art ----------

/** @param {{name:string, bytes:Uint8Array, type?:string}} f */
async function addArt(f) {
  if (f.bytes.length > MAX_ART_BYTES) throw new Error(`${f.name} is larger than 50 MB.`);
  const type = sniffImage(f.bytes);
  if (!type) throw new Error(`${f.name} isn't a PNG, JPG, WebP or SVG picture.`);
  const url = URL.createObjectURL(new Blob([f.bytes], { type }));
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(`${f.name} couldn't be opened as a picture.`);
  }
  const w = img.naturalWidth || 1000;
  const h = img.naturalHeight || 1000;
  if (state.art) URL.revokeObjectURL(state.art.url);
  state.art = { img, w, h, url, name: f.name };
  // A full design made from the template fills the sticker; a logo sits above the words.
  const s = size();
  const sameShape = Math.abs(w / h - (s.w + 2 * BLEED) / (s.h + 2 * BLEED)) < 0.04;
  const bigEnough = w >= artPixels(s, BLEED).w * 0.6;
  state.artLayout = sameShape && bigEnough ? "fill" : "top";
  showArt();
  setStatus(`Added ${f.name}.`);
  scheduleRender(0);
}

/** @param {Uint8Array} b @returns {string|null} */
function sniffImage(b) {
  const at = (sig, off = 0) => sig.every((v, i) => b[off + i] === v);
  if (at([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (at([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  const head = new TextDecoder().decode(b.subarray(0, 400));
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}

function removeArt() {
  if (state.art) URL.revokeObjectURL(state.art.url);
  state.art = null;
  showArt();
  setStatus("");
  scheduleRender(0);
}

function showArt() {
  el.artRemove.hidden = !state.art;
  el.artLayout.hidden = !state.art;
  el.artPick.lastChild.textContent = state.art ? "Change picture…" : "Add picture…";
  el.artHint.textContent = state.art
    ? `Using ${state.art.name}.`
    : "Add a logo or a finished design (PNG, JPG, WebP or SVG). You can also drop a picture anywhere in the window.";
  for (const r of el.artLayout.querySelectorAll("input")) r.checked = r.value === state.artLayout;
}

/** @param {File|undefined} file */
async function pickArt(file) {
  if (!file) return;
  if (file.size > MAX_ART_BYTES) {
    setStatus(`${file.name} is larger than 50 MB.`, true);
    return;
  }
  try {
    await addArt({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true);
  }
}

// ---------- Controls ----------

function fillControls() {
  const groups = { sticker: "Stickers", insert: "Cards and inserts" };
  for (const [g, label] of Object.entries(groups)) {
    const og = document.createElement("optgroup");
    og.label = label;
    for (const s of SIZES.filter((x) => x.group === g)) og.append(new Option(s.name, s.id));
    el.size.append(og);
  }
  for (const p of Object.values(PAPERS)) el.paper.add(new Option(p.name, p.id));
  for (const [id, f] of Object.entries(FONTS)) el.font.add(new Option(f.name, id));
  for (const [id, name] of Object.entries(BORDERS)) el.border.add(new Option(name, id));
  for (const [id, name] of Object.entries(MOTIFS)) el.motif.add(new Option(name, id));
  for (const p of PRESETS) {
    const label = document.createElement("label");
    label.className = "tile";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "preset";
    input.value = p.preset;
    const img = document.createElement("img");
    img.alt = "";
    img.dataset.preset = p.preset;
    const name = document.createElement("span");
    name.textContent = p.name;
    label.append(input, img, name);
    el.gallery.append(label);
  }
}

/** Puts the state into the controls. */
function showState() {
  const d = state.design;
  el.size.value = state.sizeId;
  const circle = size().kind === "circle";
  for (const r of el.cornersRow.querySelectorAll("input")) {
    r.checked = r.value === state.corners;
    r.disabled = circle;
  }
  for (const r of el.gallery.querySelectorAll("input")) r.checked = r.value === d.preset;
  el.headline.value = d.headline;
  el.subline.value = d.subline;
  el.shop.value = d.shop;
  el.font.value = d.font;
  el.bg.value = d.bg;
  el.ink.value = d.ink;
  el.accent.value = d.accent;
  el.border.value = d.border;
  el.motif.value = d.motif;
  el.mode.value = state.mode;
  el.paper.value = state.paper;
  el.sheets.value = String(state.sheets);
  el.marks.checked = state.marks;
  el.marksWrap.hidden = state.mode !== "plain";
  el.outline.checked = state.outline;
  el.gridBox.hidden = state.mode !== "precut";
  const g = grid();
  for (const [k, input] of Object.entries(el.grid)) input.value = String(g[k]);
  el.nudgeX.value = String(state.nudge.x);
  el.nudgeY.value = String(state.nudge.y);
}

/** After any change: remember it and redraw. */
function changed({ gallery = false } = {}) {
  savePrefs();
  showState();
  if (gallery) renderGallery();
  scheduleRender();
}

el.size.addEventListener("change", () => {
  state.sizeId = sizeById(el.size.value).id;
  changed({ gallery: true });
});
el.cornersRow.addEventListener("change", (e) => {
  state.corners = e.target.value === "round" ? "round" : "sharp";
  changed({ gallery: true });
});
el.gallery.addEventListener("change", (e) => {
  const p = PRESETS.find((x) => x.preset === e.target.value);
  if (!p) return;
  state.design = cleanDesign({ ...p, shop: state.design.shop }); // the shop name stays
  changed();
});
for (const key of ["headline", "subline", "shop"]) {
  el[key].addEventListener("input", () => {
    state.design = { ...state.design, [key]: el[key].value.slice(0, 80) };
    savePrefs();
    scheduleRender(250);
  });
}
for (const key of ["font", "border", "motif"]) {
  el[key].addEventListener("change", () => {
    state.design = cleanDesign({ ...state.design, [key]: el[key].value });
    changed();
  });
}
for (const key of ["bg", "ink", "accent"]) {
  el[key].addEventListener("input", () => {
    state.design = cleanDesign({ ...state.design, [key]: el[key].value });
    savePrefs();
    scheduleRender(60);
  });
}
el.artPick.addEventListener("click", () => el.artFile.click());
el.artFile.addEventListener("change", () => {
  const f = el.artFile.files?.[0];
  el.artFile.value = "";
  pickArt(f);
});
el.artRemove.addEventListener("click", () => {
  removeArt();
  el.artPick.focus();
});
el.artLayout.addEventListener("change", (e) => {
  state.artLayout = e.target.value === "fill" ? "fill" : "top";
  changed();
});
el.mode.addEventListener("change", () => {
  state.mode = el.mode.value === "precut" ? "precut" : "plain";
  if (state.mode === "precut") el.gridBox.open = true;
  changed();
});
el.paper.addEventListener("change", () => {
  state.paper = Object.hasOwn(PAPERS, el.paper.value) ? el.paper.value : "letter";
  changed();
});
el.sheets.addEventListener("change", () => {
  state.sheets = clampInt(el.sheets.value, 1, 100, 1);
  changed();
});
el.marks.addEventListener("change", () => {
  state.marks = el.marks.checked;
  changed();
});
el.outline.addEventListener("change", () => {
  state.outline = el.outline.checked;
  changed();
});
for (const input of Object.values(el.grid)) {
  input.addEventListener("change", () => {
    const raw = Object.fromEntries(Object.entries(el.grid).map(([k, i]) => [k, i.value]));
    state.grids = { ...state.grids, [gridKey()]: cleanGrid(raw, grid()) };
    changed();
  });
}
el.gridReset.addEventListener("click", () => {
  const { [gridKey()]: _drop, ...rest } = state.grids;
  state.grids = rest;
  changed();
});
for (const [input, axis] of [
  [el.nudgeX, "x"],
  [el.nudgeY, "y"],
]) {
  input.addEventListener("change", () => {
    state.nudge = { ...state.nudge, [axis]: clampNum(input.value, -1, 1, 0) };
    changed();
  });
}
el.print.addEventListener("click", printSheets);
el.save.addEventListener("click", savePdf);
el.cricut.addEventListener("click", exportCricut);
el.template.addEventListener("click", saveTemplate);

document.addEventListener("keydown", (e) => {
  if (!e.ctrlKey || e.altKey || e.shiftKey) return;
  const k = e.key.toLowerCase();
  // A number box still being edited commits its value on blur, before the output is made.
  if ((k === "p" || k === "s") && document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
  if (k === "p") {
    e.preventDefault();
    printSheets();
  } else if (k === "s") {
    e.preventDefault();
    savePdf();
  }
});

// A picture can be dropped anywhere in the window.
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
window.addEventListener("dragenter", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  if (dragDepth++ === 0) el.veil.hidden = false;
});
window.addEventListener("dragover", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});
const endDrag = () => {
  dragDepth = 0;
  el.veil.hidden = true;
};
window.addEventListener("dragleave", (e) => {
  if (!hasFiles(e)) return;
  if (--dragDepth <= 0) endDrag();
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  endDrag();
  pickArt(e.dataTransfer?.files?.[0]);
});

// ---------- Start ----------

fillControls();
showState();
showArt();
updateButtons();
const ready = (async () => {
  try {
    await loadFonts();
  } catch {
    setStatus("Some fonts didn't load; the system font is used instead.", true);
  }
  await renderGallery();
  startRender();
  await rendering;
})();

// Test hooks for `npm run smoke`.
// @ts-ignore
window.__smokeReady = ready;
// @ts-ignore
window.__smokeSet = async (c, artData) => {
  await ready;
  const p = PRESETS.find((x) => x.preset === c.preset) ?? PRESETS[0];
  state.design = cleanDesign({ ...p, shop: c.shop ?? "" });
  state.sizeId = sizeById(c.sizeId).id;
  state.corners = c.corners === "round" ? "round" : "sharp";
  state.mode = c.mode === "precut" ? "precut" : "plain";
  state.paper = c.paper === "a4" ? "a4" : "letter";
  state.outline = !!c.outline;
  state.sheets = 1;
  if (artData) await addArt({ name: artData.name, bytes: new Uint8Array(artData.data) });
  else if (state.art) removeArt();
  showState();
  galleryKey = "";
  await renderGallery();
  scheduleRender(0);
  await settled();
  const pdf = await buildPdf();
  return {
    pdf: Array.from(pdf),
    cricut: Array.from(await cricutPng()),
    template: Array.from(templateBytes()),
    status: el.status.classList.contains("is-error") ? el.status.textContent : "",
  };
};
// @ts-ignore
window.__smokePreparePrint = () => enqueue(preparePrint).then(() => true);
// @ts-ignore
window.__smokeEndPrint = () => el.printRoot.replaceChildren();
