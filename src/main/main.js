// Robin: main process. Serves the window's files from app://robin/ (ES modules
// under a strict Content Security Policy) and registers the two IPC channels
// in ipc.js. Nothing in the window touches the disk directly.
import { app, BrowserWindow, net, protocol } from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerIpc } from "./ipc.js";
import { resolveAppUrl, servedFolders } from "./serve.js";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.join(SRC, "..");
const SERVED = servedFolders(SRC, ROOT);

if (process.env.ROBIN_USER_DATA) app.setPath("userData", process.env.ROBIN_USER_DATA);

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function serveApp() {
  protocol.handle("app", (request) => {
    const file = resolveAppUrl(request.url, SERVED);
    if (!file) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 820,
    minHeight: 560,
    title: "Robin",
    icon: path.join(ROOT, "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(SRC, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  // The window never opens popups or navigates away (a stray drop would otherwise open the file).
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.loadURL("app://robin/renderer/index.html");
  if (process.env.ROBIN_SMOKE) smokeTest(win, process.env.ROBIN_SMOKE, process.env.ROBIN_SMOKE_ART);
}

/** Designs the smoke test walks through: presets, every shape, both layouts, a big insert. */
const SMOKE_CASES = [
  { preset: "classic", sizeId: "c2", mode: "plain" },
  { preset: "blush", sizeId: "c15", mode: "precut" },
  { preset: "kraft", sizeId: "r3x2", corners: "round", mode: "plain", outline: true },
  { preset: "midnight", sizeId: "s2", corners: "round", mode: "precut" },
  { preset: "sage", sizeId: "r4x6", mode: "plain" },
  { preset: "sunny", sizeId: "r5x7", mode: "plain", paper: "a4" },
  { preset: "mono", sizeId: "c3", mode: "plain", outline: true },
  { preset: "ocean", sizeId: "r35x2", mode: "plain", shop: "Follicle Root" },
];

/**
 * `npm run smoke`: loads the app, walks through SMOKE_CASES, reports console
 * errors, and saves a screenshot, the PDF and the print-path PDF for each.
 * @param {BrowserWindow} win
 * @param {string} outFile screenshot path (smoke.png)
 * @param {string|undefined} art optional picture to load as "your art"
 */
function smokeTest(win, outFile, art) {
  const problems = [];
  win.webContents.on("console-message", (e) => {
    const level = e.level ?? "info";
    if (level === "error" || level === "warning") problems.push(`${level}: ${e.message}`);
  });
  win.webContents.on("render-process-gone", (_e, d) => problems.push(`renderer gone: ${d.reason}`));
  win.webContents.once("did-finish-load", async () => {
    const fs = await import("node:fs");
    const js = (code) => win.webContents.executeJavaScript(code);
    const out = (suffix) => outFile.replace(/\.png$/, suffix);
    try {
      await js("window.__smokeReady");
      const cases = art ? [...SMOKE_CASES, { preset: "classic", sizeId: "c25", mode: "plain", art: true }] : SMOKE_CASES;
      for (const [i, c] of cases.entries()) {
        const artData = c.art ? { name: path.basename(art), data: [...fs.readFileSync(art)] } : null;
        const r = await js(`window.__smokeSet(${JSON.stringify(c)}, ${JSON.stringify(artData)}).then((x) => x, (e) => ({ error: e.message }))`);
        if (r.error) {
          problems.push(`case ${i}: ${r.error}`);
          continue;
        }
        if (r.status) problems.push(`case ${i}: app showed an error: ${r.status}`);
        fs.writeFileSync(out(`-${i}.png`), (await win.webContents.capturePage()).toPNG());
        fs.writeFileSync(out(`-${i}.pdf`), Buffer.from(r.pdf));
        // The print path, minus the dialog: same sheets and options, sent to a PDF instead of a printer.
        await js("window.__smokePreparePrint()");
        const pdf = await win.webContents.printToPDF({ printBackground: true, margins: { marginType: "none" }, preferCSSPageSize: true });
        fs.writeFileSync(out(`-${i}-print.pdf`), pdf);
        await js("window.__smokeEndPrint()");
        if (i === 0) {
          fs.writeFileSync(out("-cricut.png"), Buffer.from(r.cricut));
          fs.writeFileSync(out("-template.svg"), Buffer.from(r.template));
        }
      }
      fs.writeFileSync(outFile, (await win.webContents.capturePage()).toPNG());
    } catch (err) {
      problems.push(`smoke crashed: ${err instanceof Error ? err.message : err}`);
    }
    console.log(problems.length ? `SMOKE problems:\n${problems.join("\n")}` : "SMOKE ok: no console errors");
    app.exit(problems.length ? 1 : 0);
  });
}

app.setAppUserModelId("app.flockton.robin");

if (!process.env.ROBIN_SMOKE && !app.requestSingleInstanceLock()) app.exit(0);
app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
// The app never asks for camera, microphone, location or notifications.
app.on("web-contents-created", (_e, contents) => {
  contents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
});

app.whenReady().then(() => {
  serveApp();
  registerIpc();
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
