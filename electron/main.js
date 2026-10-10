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
// ---- show the open board on a phone: one-time, encrypted by the page, sent only after the user allows it ----
const http = require('http');
const os = require('os');
const crypto = require('crypto');
let share = null;
function lanIPs() {
  const out = [];
  Object.values(os.networkInterfaces()).forEach((list) => (list || []).forEach((a) => { if (a.family === 'IPv4' && !a.internal) out.push(a.address); }));
  return out;
}
function shareSend(type, data) { if (win) win.webContents.send('share', { type, data }); }
function shareStop(reason) {
  if (!share) return;
  const s = share; share = null; clearTimeout(s.timer);
  try { s.server.close(); } catch (e) { /* not listening */ }
  shareSend('ended', reason || '');
}
ipcMain.handle('share-start', (_e, blob) => new Promise((resolve, reject) => {
  shareStop('restart');
  // phone: GET /bv/<token>/hello -> 202 {id} right away (and this PC asks the user);
  //        GET /bv/<token>/data?id=N -> 204 while undecided, 403 declined, 200 encrypted board once
  const s = { token: crypto.randomBytes(16).toString('hex'), blob0: Buffer.from(blob), reqs: new Map(), bad: 0, seq: 0, sent: false };
  s.server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const u = new URL(req.url, 'http://x'), base = '/bv/' + s.token;
    if (share !== s || (req.method !== 'GET' && req.method !== 'POST') || !u.pathname.startsWith(base + '/')) {
      s.bad++; res.writeHead(404); res.end();
      if (s.bad > 30) shareStop('too many wrong requests');
      return;
    }
    const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    // after the board went over, only that phone may talk: it sends what it scans (encrypted by the page with the same key)
    if (s.sent) {
      if (req.method === 'POST' && u.pathname === base + '/scan' && ip === s.linkIp && Number(u.searchParams.get('id')) === s.linkId) {
        let body = '', big = false;
        req.on('data', (c) => { body += c; if (body.length > 16384) { big = true; req.destroy(); } });
        req.on('end', () => {
          if (big || share !== s) return;
          clearTimeout(s.timer); s.timer = setTimeout(() => shareStop('idle'), 12 * 3600 * 1000);
          shareSend('scan', body); res.writeHead(204); res.end();
        });
        return;
      }
      res.writeHead(410); res.end(); return;
    }
    if (req.method !== 'GET') { res.writeHead(404); res.end(); return; }
    if (u.pathname === base + '/hello') {
      let id = 0;
      s.reqs.forEach((r, k) => { if (r.ip === ip && r.ok === null) id = k; }); // the same phone asking again
      if (!id) { id = ++s.seq; s.reqs.set(id, { ip, ok: null, at: Date.now() }); shareSend('request', { id, ip }); }
      res.writeHead(202, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id }));
      return;
    }
    if (u.pathname === base + '/data') {
      const r = s.reqs.get(Number(u.searchParams.get('id')));
      if (!r || r.ip !== ip) { res.writeHead(404); res.end(); return; }
      if (r.ok === null) { res.writeHead(204); res.end(); return; }
      if (!r.ok) { res.writeHead(403); res.end(); return; }
      s.sent = true; s.linkIp = ip; s.linkId = Number(u.searchParams.get('id'));
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(s.blob0); s.blob0 = null;
      shareSend('sent', { ip });
      // the board goes once; the link stays only for scans from this phone, until the PC disconnects it
      clearTimeout(s.timer); s.timer = setTimeout(() => shareStop('idle'), 12 * 3600 * 1000);
      return;
    }
    res.writeHead(404); res.end();
  });
  s.server.on('error', (e) => { shareSend('error', String((e && e.message) || e)); reject(e); });
  s.server.listen(0, '0.0.0.0', () => {
    share = s;
    s.timer = setTimeout(() => shareStop('timeout'), 10 * 60 * 1000);
    resolve({ port: s.server.address().port, ips: lanIPs(), token: s.token });
  });
}));
ipcMain.on('share-decide', (_e, m) => {
  const s = share; if (!s || !m) return;
  const r = s.reqs.get(m.id); if (r && r.ok === null) r.ok = !!m.ok;
});
ipcMain.on('share-stop', () => shareStop('stopped'));

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
