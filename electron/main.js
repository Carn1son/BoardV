// BoardV for Windows: the same web app in its own window.
const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let pending = [];
let rendererReady = false;

// updates: installed copies update from the newest GitHub release; nothing installs without the user's click
const FEED = 'https://github.com/Carn1son/BoardV/releases/latest/download';
const PORTABLE = !!process.env.PORTABLE_EXECUTABLE_FILE;
let updater = null;
try { updater = require('electron-updater').autoUpdater; } catch (e) { updater = null; }
function upd(type, data) { if (win) win.webContents.send('upd', { type, data }); }
if (updater && !PORTABLE) {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.setFeedURL({ provider: 'generic', url: FEED });
  updater.on('update-available', (i) => upd('available', { version: i.version }));
  updater.on('update-not-available', () => upd('none'));
  updater.on('download-progress', (p) => upd('progress', Math.round(p.percent || 0)));
  updater.on('update-downloaded', () => upd('downloaded'));
  updater.on('error', (e) => upd('error', String((e && e.message) || e)));
}
ipcMain.handle('upd-check', async () => {
  if (PORTABLE) return { mode: 'portable', version: app.getVersion() };
  if (!updater || !app.isPackaged) return { mode: 'none', version: app.getVersion() };
  try { const r = await updater.checkForUpdates(); return { mode: 'installer', version: app.getVersion(), latest: r && r.updateInfo && r.updateInfo.version }; }
  catch (e) { return { mode: 'installer', version: app.getVersion(), error: String((e && e.message) || e) }; }
});
ipcMain.handle('upd-download', async () => {
  try { await updater.downloadUpdate(); return true; } catch (e) { upd('error', String((e && e.message) || e)); return false; }
});
ipcMain.on('upd-install', () => { if (updater) updater.quitAndInstall(true, true); }); // silent: files are replaced in place, no installer wizard, then BoardV starts again

const BOARD = /\.(pcbdoc|brd|bvr|zip|json)$/i;
function boardFiles(argv) { return argv.filter((a) => BOARD.test(a) && fs.existsSync(a)); }

function sendFiles(paths) {
  const list = paths.map((p) => ({ name: path.basename(p), data: new Uint8Array(fs.readFileSync(p)) }));
  if (list.length) win.webContents.send('open-files', list);
}

function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#1b1d1c', title: 'BoardV',
    icon: path.join(__dirname, 'www', 'icon-512.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.maximize(); // fill the screen this window opens on, whatever its size and scaling
  win.loadFile(path.join(__dirname, 'www', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
}

// keep settings and layout from installs made before the rename to BoardV
app.setPath('userData', path.join(app.getPath('appData'), 'Boardview Reader'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // a second launch (double-click on another board) opens it in the running window
  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const files = boardFiles(argv.slice(1));
    if (rendererReady) sendFiles(files); else pending.push(...files);
  });
  app.whenReady().then(() => {
    pending = boardFiles(process.argv.slice(1));
    createWindow();
  });
  ipcMain.on('renderer-ready', () => { rendererReady = true; if (pending.length) { sendFiles(pending); pending = []; } });
  app.on('window-all-closed', () => app.quit());
}
