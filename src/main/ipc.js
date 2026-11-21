// The only two things the window can ask the main process to do: save a file
// it made (PDF, Cricut PNG or SVG template), and print the sheets. Every
// payload is checked here before use.
import { BrowserWindow, app, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { FILE_KINDS, PRINT_SIZES, checkPrintPayload, checkSavePayload } from "./validate.js";

export const CHANNELS = {
  saveFile: "robin:save-file",
  print: "robin:print",
};

/**
 * Wraps a handler so the window always gets { ok, value } or { ok:false, error }.
 * @param {string} channel
 * @param {(e: Electron.IpcMainInvokeEvent, p: unknown) => Promise<unknown>} fn
 */
function handle(channel, fn) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (e, p) => {
    try {
      // Only Robin's own page may ask.
      if (!e.senderFrame?.url.startsWith("app://robin/")) throw new Error("Not allowed.");
      return { ok: true, value: await fn(e, p) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

export function registerIpc() {
  handle(CHANNELS.saveFile, async (e, p) => {
    const { kind, name, bytes } = checkSavePayload(p);
    const k = FILE_KINDS[kind];
    const win = BrowserWindow.fromWebContents(e.sender);
    const opts = {
      title: k.title,
      defaultPath: path.join(app.getPath("documents"), name),
      filters: [{ name: k.filter, extensions: [k.ext] }],
    };
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return { saved: false };
    await fs.writeFile(r.filePath, bytes);
    return { saved: true, path: r.filePath };
  });

  handle(CHANNELS.print, async (e, p) => {
    const { paper } = checkPrintPayload(p);
    // Opens Windows' own print dialog; the user picks the printer there.
    return new Promise((resolve) => {
      e.sender.print(
        {
          silent: false,
          printBackground: true,
          margins: { marginType: "none" },
          pageSize: PRINT_SIZES[paper],
          landscape: false,
        },
        (success, reason) => resolve({ printed: success, reason: success ? "" : reason }),
      );
    });
  });
}
