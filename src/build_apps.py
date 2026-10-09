"""One source -> artifact page, local html file, installable PWA folder, and a GitHub project that builds .apk and .exe."""
import os, re, shutil, json, subprocess

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'out')
# the viewer carries only a build date (no version numbers); app version codes are derived from it
VDATE = re.search(r'Сборка от (\d\d\.\d\d\.\d{4})', open(os.path.join(ROOT, 'viewer-ui.html')).read()).group(1)
_d, _m, _y = VDATE.split('.')
VCODE = int(_y + _m + _d)                      # Android versionCode, e.g. 20261009
VSEM = '%d.%d.%d' % (int(_y), int(_m), int(_d))  # Electron version, e.g. 2026.10.9


def lib():
    pcb = open(os.path.join(ROOT, 'pcbdoc.js')).read().replace("if (typeof module !== 'undefined') module.exports = PCBDOC;", "")
    core = open(os.path.join(ROOT, 'core.js')).read().replace("if (typeof module !== 'undefined') module.exports = BV;", "")
    return pcb + '\n' + core


def logo_uri(px=96):
    import base64, io
    from PIL import Image
    im = Image.open(os.path.join(ROOT, 'logo.png')).convert('RGBA').resize((px, px), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()


def fragment():
    return open(os.path.join(ROOT, 'viewer-ui.html')).read().replace('/*CORE*/', lib()).replace('__LOGO__', logo_uri())


def full_doc(extra_head='', extra_body=''):
    return ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<meta name="theme-color" content="#131716">\n' + ('' if 'rel="icon"' in extra_head else '<link rel="icon" type="image/png" href="' + logo_uri(64) + '">\n') + extra_head + '</head>\n<body style="margin:0">\n'
            + fragment() + '\n' + extra_body + '</body>\n</html>\n')


PWA_HEAD = '''<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="256x256" href="favicon-256.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="BoardV">
'''
PWA_BODY = '''<script>
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
}
</script>
'''

MANIFEST = {
    "name": "BoardV",
    "short_name": "BoardV",
    "description": "Просмотр плат Altium (.PcbDoc), .brd, .bvr: цепи, детали, BOM.",
    "id": "./",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "orientation": "any",
    "background_color": "#1b1d1c",
    "theme_color": "#131716",
    "lang": "ru",
    "icons": [
        {"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
    ],
    "file_handlers": [{
        "action": "./",
        "accept": {
            "application/octet-stream": [".PcbDoc", ".pcbdoc", ".brd", ".bvr"],
            "application/zip": [".zip"],
            "application/json": [".json"]
        }
    }]
}

import hashlib
CACHE_ID = VDATE.replace('.', '') + '-' + hashlib.sha1(fragment().encode()).hexdigest()[:8]  # new cache whenever the app changes

SW = '''// BoardV service worker: the app works offline; when online, fresh files win.
const CACHE = 'boardview-%s';
const SHELL = ['./', './index.html', './BoardV-config.js', './build-info.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-256.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    // network first, so a new version on the server shows up right away; cache when offline
    e.respondWith(fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
  } else if (/fonts\\.(googleapis|gstatic)\\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res;
    })));
  }
});
''' % CACHE_ID

NGINX = '''# /etc/nginx/sites-available/boardview  (замените board.example.com на ваш домен)
server {
    listen 80;
    server_name board.example.com;
    root /var/www/boardview;
    index index.html;

    location = /sw.js { add_header Cache-Control "no-cache"; }
    location = /index.html { add_header Cache-Control "no-cache"; }
    location = /BoardV-config.js { add_header Cache-Control "no-cache"; }
    location ~* \\.webmanifest$ { default_type application/manifest+json; add_header Cache-Control "no-cache"; }
    location / { try_files $uri $uri/ /index.html; }
}
# HTTPS: sudo certbot --nginx -d board.example.com   (certbot сам допишет блок listen 443)
'''

PWA_README = '''# BoardV — установка как приложение (PWA)

Сборка от %(d)s

## Что внутри
- `index.html` — приложение;
- `BoardV-config.js` — настройки по умолчанию (можно править);
- `manifest.webmanifest`, `sw.js`, иконки — чтобы браузер ставил его как программу и оно работало без интернета.

## Вариант 1. Свой VPS (nginx)
Нужен домен (подойдёт и бесплатный, например duckdns.org) — без HTTPS браузеры не дают установить приложение.

```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo mkdir -p /var/www/boardview
# скопируйте содержимое этой папки на сервер, например:
scp -r ./* user@VPS:/tmp/boardview/ && ssh user@VPS 'sudo cp -r /tmp/boardview/* /var/www/boardview/'
sudo cp nginx.conf.example /etc/nginx/sites-available/boardview   # поправьте домен внутри
sudo ln -s /etc/nginx/sites-available/boardview /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d board.example.com
```

## Вариант 2. GitHub Pages (бесплатно, без своего сервера)
Проще всего через проект `boardview-app-project`: там сборка сама публикует эту же папку на GitHub Pages.

## Установка
- **Android (Chrome):** откройте адрес → меню ⋮ → «Установить приложение». Chrome сам соберёт и установит APK, иконка появится на рабочем столе.
- **Windows / Linux / macOS (Chrome или Edge):** откройте адрес → значок «Установить» справа в адресной строке. Появится отдельное окно и ярлык в меню «Пуск». После установки `.PcbDoc`, `.brd`, `.bvr` можно открывать через «Открыть с помощью → BoardV».
- **iPhone (Safari):** «Поделиться» → «На экран „Домой“».

## Обновление
Замените файлы на сервере — приложение подхватит новую версию при следующем запуске с интернетом. Без интернета работает последняя загруженная версия.

## Настройки
Настройки, которые вы меняете в приложении, хранятся на устройстве. Чтобы у всех по умолчанию были свои цвета, отредактируйте `BoardV-config.js` на сервере (или сохраните его из «Настройки → Сохранить в файл…» и залейте на сервер).
'''

# ---------------- GitHub project ----------------
ANDROID_SETTINGS = '''pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "BoardviewReader"
include(":app")
'''
ANDROID_ROOT = '''plugins {
    id("com.android.application") version "8.5.2" apply false
}
'''
ANDROID_APP = '''plugins {
    id("com.android.application")
}

android {
    namespace = "com.carnison.boardview"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.carnison.boardview"
        minSdk = 24
        targetSdk = 34
        versionCode = (System.getenv("BV_VCODE") ?: "%(code)s").toInt()
        versionName = System.getenv("BV_VER") ?: "%(d)s"
    }

    // One permanent key (decrypted in CI from src/keys/boardv.jks.enc) so every new APK installs over the old one.
    // Without it the build falls back to a throw-away debug key.
    val bvKeystore = System.getenv("BV_KEYSTORE")
    signingConfigs {
        if (bvKeystore != null) create("boardv") {
            storeFile = file(bvKeystore)
            storePassword = System.getenv("BV_KEYPASS")
            keyAlias = "boardv"
            keyPassword = System.getenv("BV_KEYPASS")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (bvKeystore != null) signingConfigs.getByName("boardv") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
'''
ANDROID_PROPS = '''org.gradle.jvmargs=-Xmx2g -Dfile.encoding=UTF-8
android.useAndroidX=false
android.nonTransitiveRClass=true
'''
ANDROID_MANIFEST = '''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="BoardV"
        android:hardwareAccelerated="true"
        android:theme="@android:style/Theme.Material.NoActionBar">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTask"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden|smallestScreenSize|uiMode"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
'''
ANDROID_ACTIVITY = '''package com.carnison.boardview;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.provider.Settings;
import org.json.JSONObject;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Window;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** BoardV: the web app from assets/www in a full-screen WebView. */
public class MainActivity extends Activity {
    private static final int FILE_REQUEST = 1001;
    private static final int SAVE_REQUEST = 1002;
    private WebView web;
    private ValueCallback<Uri[]> pendingFiles;
    private String pendingSave;

    /** Lets the page save a text file (exported settings) through the system "Save as" screen. */
    public class Bridge {
        @JavascriptInterface
        public void saveText(final String name, final String text) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    pendingSave = text;
                    Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    save.addCategory(Intent.CATEGORY_OPENABLE);
                    save.setType("application/json");
                    save.putExtra(Intent.EXTRA_TITLE, name);
                    try { startActivityForResult(save, SAVE_REQUEST); } catch (Exception e) { pendingSave = null; notifySaved(false); }
                }
            });
        }
    }

    // ---- updates: download the newest APK and hand it to the system installer (the user confirms) ----
    private static final String ACTION_INSTALL_STATUS = "com.carnison.boardview.INSTALL_STATUS";

    public class Updater {
        @JavascriptInterface
        public boolean canInstall() {
            if (Build.VERSION.SDK_INT >= 26) return getPackageManager().canRequestPackageInstalls();
            return true;
        }
        @JavascriptInterface
        public void openInstallSettings() {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    try { startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); }
                    catch (Exception e) { updEvent("error", "Не удалось открыть настройки"); }
                }
            });
        }
        @JavascriptInterface
        public void install(final String url) {
            new Thread(new Runnable() { @Override public void run() { downloadAndInstall(url); } }).start();
        }
    }

    private void updEvent(final String type, final String arg) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                web.evaluateJavascript("window.bvUpdateEvent && window.bvUpdateEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(arg == null ? "" : arg) + ")", null);
            }
        });
    }

    private void downloadAndInstall(String url) {
        PackageInstaller.Session session = null;
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(true);
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            c.connect();
            if (c.getResponseCode() != 200) throw new Exception("сервер ответил " + c.getResponseCode());
            long total = c.getContentLength();
            PackageInstaller pi = getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            session = pi.openSession(pi.createSession(params));
            try (InputStream in = c.getInputStream(); OutputStream out = session.openWrite("BoardV.apk", 0, total > 0 ? total : -1)) {
                byte[] buf = new byte[65536];
                long done = 0; int last = -1, n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n); done += n;
                    if (total > 0) { int pct = (int) (done * 100 / total); if (pct != last) { last = pct; updEvent("progress", String.valueOf(pct)); } }
                }
                session.fsync(out);
            }
            Intent cb = new Intent(this, MainActivity.class).setAction(ACTION_INSTALL_STATUS);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            session.commit(PendingIntent.getActivity(this, 0, cb, flags).getIntentSender());
            session.close();
            updEvent("installing", "");
        } catch (Exception e) {
            if (session != null) try { session.abandon(); } catch (Exception ignored) { }
            updEvent("error", e.getMessage() == null ? e.toString() : e.getMessage());
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent == null || !ACTION_INSTALL_STATUS.equals(intent.getAction())) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT); // the system "Update this app?" screen
            if (confirm != null) { try { startActivity(confirm); updEvent("confirm", ""); } catch (Exception e) { updEvent("error", "Не удалось открыть установщик"); } }
        } else if (status != PackageInstaller.STATUS_SUCCESS) {
            String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            updEvent(status == PackageInstaller.STATUS_FAILURE_ABORTED ? "cancelled" : "error", msg == null ? "установка не удалась" : msg);
        }
    }

    private void notifySaved(boolean ok) {
        web.evaluateJavascript("window.bvSaved && window.bvSaved(" + ok + ")", null);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#131716"));
        w.setNavigationBarColor(Color.parseColor("#131716"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#1b1d1c"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // settings are kept in localStorage
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setBuiltInZoomControls(false);
        s.setSupportZoom(false);
        s.setUserAgentString(s.getUserAgentString() + " BoardviewAndroid");
        web.addJavascriptInterface(new Bridge(), "BoardVAndroid");
        web.addJavascriptInterface(new Updater(), "BoardVUpdater");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file:")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) { }
                return true; // links open in the browser, the app stays on the board
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*"); // .PcbDoc / .brd have no registered MIME type
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(pick, "Файл платы"), FILE_REQUEST);
                } catch (Exception e) {
                    pendingFiles = null;
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == SAVE_REQUEST) {
            boolean ok = false;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingSave != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "wt")) {
                    out.write(pendingSave.getBytes(StandardCharsets.UTF_8));
                    ok = true;
                } catch (Exception ignored) { }
            }
            pendingSave = null;
            notifySaved(ok);
            return;
        }
        if (requestCode == FILE_REQUEST && pendingFiles != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    result = new Uri[n];
                    for (int i = 0; i < n; i++) result[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    result = new Uri[] { data.getData() };
                }
            }
            pendingFiles.onReceiveValue(result);
            pendingFiles = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }
}
'''

ELECTRON_PKG = {
    "name": "boardv",
    "productName": "BoardV",
    "version": "1.%s.0",
    "description": "BoardV — просмотр плат Altium",
    "author": "carnison",
    "main": "main.js",
    "scripts": {"start": "electron .", "dist": "electron-builder --win nsis portable --publish never"},
    "dependencies": {"electron-updater": "^6.3.9"},
    "devDependencies": {"electron": "^31.7.7", "electron-builder": "^25.1.8"},
    "build": {
        "appId": "com.carnison.boardview",
        "productName": "BoardV",
        "files": ["main.js", "preload.js", "www/**/*"],
        "directories": {"buildResources": "build", "output": "dist"},
        "publish": [{"provider": "generic", "url": "https://github.com/Carn1son/BoardV/releases/latest/download"}],  # makes electron-builder write latest.yml for the updater
        "win": {"target": ["nsis", "portable"], "icon": "build/icon.ico"},
        "nsis": {"artifactName": "BoardV-Setup.exe", "oneClick": False, "allowToChangeInstallationDirectory": True, "createDesktopShortcut": True},
        "portable": {"artifactName": "BoardV-portable.exe"},
        "fileAssociations": [
            {"ext": "PcbDoc", "name": "Altium PCB", "role": "Viewer"},
            {"ext": "brd", "name": "Boardview", "role": "Viewer"},
            {"ext": "bvr", "name": "Boardview BVR", "role": "Viewer"}
        ]
    }
}
ELECTRON_MAIN = '''// BoardV for Windows: the same web app in its own window.
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
ipcMain.on('upd-install', () => { if (updater) updater.quitAndInstall(false, true); });

const BOARD = /\\.(pcbdoc|brd|bvr|zip|json)$/i;
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
'''
ELECTRON_PRELOAD = '''// Exposes one safe bridge to the page: boards opened from Windows (double-click / "Open with") and app updates.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bvDesktop', {
  onOpenFiles: (cb) => ipcRenderer.on('open-files', (_e, files) => cb(files)),
  ready: () => ipcRenderer.send('renderer-ready'),
  update: {
    check: () => ipcRenderer.invoke('upd-check'),
    download: () => ipcRenderer.invoke('upd-download'),
    install: () => ipcRenderer.send('upd-install'),
    on: (cb) => ipcRenderer.on('upd', (_e, m) => cb(m)),
  },
});
'''

WORKFLOW = r'''name: Build apps

on:
  push:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  meta:
    name: Build number
    runs-on: ubuntu-latest
    outputs:
      ver: ${{ steps.v.outputs.ver }}
      vcode: ${{ steps.v.outputs.vcode }}
      day: ${{ steps.v.outputs.day }}
    steps:
      - id: v
        run: |
          export TZ=Europe/Moscow
          RUN=${{ github.run_number }}
          echo "ver=$(date +%Y).$((10#$(date +%m%d))).$RUN" >> "$GITHUB_OUTPUT"
          echo "vcode=$(date +%Y%m%d)$(printf %02d $((RUN % 100)))" >> "$GITHUB_OUTPUT"
          echo "day=$(date +%d.%m.%Y)" >> "$GITHUB_OUTPUT"

  android:
    name: Android APK
    needs: meta
    runs-on: ubuntu-latest
    env:
      BV_VER: ${{ needs.meta.outputs.ver }}
      BV_VCODE: ${{ needs.meta.outputs.vcode }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'
      - uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.9'
      - name: Signing key
        env:
          KS_PASS: ${{ secrets.ANDROID_KEYSTORE_PASS }}
        run: |
          if [ -n "$KS_PASS" ] && [ -f src/keys/boardv.jks.enc ]; then
            openssl enc -d -aes-256-cbc -pbkdf2 -in src/keys/boardv.jks.enc -out "$RUNNER_TEMP/boardv.jks" -pass env:KS_PASS
            echo "BV_KEYSTORE=$RUNNER_TEMP/boardv.jks" >> "$GITHUB_ENV"
            echo "BV_KEYPASS=$KS_PASS" >> "$GITHUB_ENV"
            echo "Signing with the permanent BoardV key"
          else
            echo "::warning::Secret ANDROID_KEYSTORE_PASS is not set: the APK is signed with a temporary key and will not install over a previous build"
          fi
      - name: Put the web app into the APK
        run: |
          echo "window.BV_BUILD = { version: '$BV_VER', day: '${{ needs.meta.outputs.day }}', app: 'android' };" > www/build-info.js
          rm -rf android/app/src/main/assets/www
          mkdir -p android/app/src/main/assets
          cp -r www android/app/src/main/assets/www
      - name: Build
        run: gradle -p android assembleRelease
      - name: Rename
        run: cp android/app/build/outputs/apk/release/app-release.apk BoardV.apk
      - uses: actions/upload-artifact@v4
        with:
          name: BoardV-android
          path: BoardV.apk

  windows:
    name: Windows EXE
    needs: meta
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Copy the web app
        shell: bash
        run: |
          echo "window.BV_BUILD = { version: '${{ needs.meta.outputs.ver }}', day: '${{ needs.meta.outputs.day }}', app: 'windows' };" > www/build-info.js
          rm -rf electron/www
          cp -r www electron/www
          mkdir -p electron/build
          cp www/icon-512.png electron/build/icon.png
      - name: Install
        working-directory: electron
        shell: bash
        run: |
          npm install --save-dev electron@31.7.7 electron-builder@25.1.8
          npm install --save electron-updater@^6.3.9
          npm pkg set version=${{ needs.meta.outputs.ver }}
      - name: Build
        working-directory: electron
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: 'false'
        run: npx electron-builder --win nsis portable --publish never
      - uses: actions/upload-artifact@v4
        with:
          name: BoardV-windows
          path: |
            electron/dist/*.exe
            electron/dist/*.blockmap
            electron/dist/latest.yml

  release:
    name: Release (download links, updates)
    needs: [meta, android, windows]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: dl
      - name: Publish the release
        env:
          GH_TOKEN: ${{ github.token }}
          VER: ${{ needs.meta.outputs.ver }}
          DAY: ${{ needs.meta.outputs.day }}
        run: |
          set -e
          ls -R dl
          BASE="https://github.com/$GITHUB_REPOSITORY/releases/latest/download"
          printf '%s\n' "Сборка от $DAY (версия $VER)." "" "Всегда последняя версия:" "- Android: $BASE/BoardV.apk" "- Windows, установщик: $BASE/BoardV-Setup.exe" "- Windows, без установки: $BASE/BoardV-portable.exe" "" "Приложения сами проверяют обновления: Настройки → Обновления." > notes.md
          gh release create "v$VER" dl/BoardV-android/BoardV.apk dl/BoardV-windows/* --repo "$GITHUB_REPOSITORY" --title "BoardV — сборка от $DAY" --notes-file notes.md --latest
      - name: Keep only the newest release
        env:
          GH_TOKEN: ${{ github.token }}
          VER: ${{ needs.meta.outputs.ver }}
        run: |
          for t in $(gh api "repos/$GITHUB_REPOSITORY/releases?per_page=100" -q '.[].tag_name'); do
            [ "$t" = "v$VER" ] || gh release delete "$t" --repo "$GITHUB_REPOSITORY" --yes --cleanup-tag || true
          done
          for t in $(gh api "repos/$GITHUB_REPOSITORY/tags?per_page=100" -q '.[].name'); do
            [ "$t" = "v$VER" ] || gh api -X DELETE "repos/$GITHUB_REPOSITORY/git/refs/tags/$t" || true
          done
'''

PROJECT_README = '''<p align="center"><img src="src/logo.png" width="120" alt="BoardV"></p>

<h1 align="center">BoardV</h1>

<p align="center">Просмотр плат Altium на ПК и телефоне: открываете <code>.PcbDoc</code> — и сразу видите детали, цепи, номиналы и BOM.</p>

<p align="center">
  <a href="https://github.com/Carn1son/BoardV/releases/latest/download/BoardV.apk"><b>Android (APK)</b></a> ·
  <a href="https://github.com/Carn1son/BoardV/releases/latest/download/BoardV-Setup.exe"><b>Windows — установщик</b></a> ·
  <a href="https://github.com/Carn1son/BoardV/releases/latest/download/BoardV-portable.exe"><b>Windows — без установки</b></a>
</p>

## Что умеет
- Открывает **Altium .PcbDoc** напрямую, а также `.brd` (Test_Link), `.bvr`, `.json` и `.zip`.
- Поиск по деталям, цепям и номиналам; клик по пину подсвечивает всю цепь, питание и земля окрашены отдельно.
- **BOM** справа: клик по позиции показывает все места установки, сверху и снизу платы.
- Верх / низ / обе стороны, поворот, зеркалирование нижней стороны.
- Темы, режимы **День / Ночь**, настройка цветов, подписей и выделения, свои цвета цепей.
- Горячие клавиши работают в любой раскладке и переназначаются в настройках.
- Настройки выгружаются в файл и загружаются на другом устройстве.
- Приложения сами проверяют обновления и ставят их после подтверждения.

## Установка
- **Android:** скачайте `BoardV.apk`, откройте и разрешите установку. Следующие версии ставятся поверх, из самого приложения: *Настройки → Обновления*.
- **Windows:** `BoardV-Setup.exe` — обычная установка, `.PcbDoc` открываются двойным кликом, обновления из программы. `BoardV-portable.exe` — запуск без установки.
  Windows может показать «Неизвестный издатель» — *Подробнее → Выполнить в любом случае* (программа не подписана платным сертификатом).

## Сборка
Каждый push в `main` собирает APK и `.exe` в GitHub Actions и публикует их в [Releases](https://github.com/Carn1son/BoardV/releases).

```
src/        исходники вьювера (viewer-ui.html, core.js, pcbdoc.js) и сборка build_apps.py
www/        готовое веб-приложение, которое показывают обе обёртки
android/    обёртка WebView (Java): выбор файлов, сохранение настроек, установка обновлений
electron/   обёртка для Windows: открытие плат двойным кликом, обновления
```
'''


def write(path, text, mode='w'):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, mode) as f:
        f.write(text)


def main():
    # 1) published artifact page (platform adds <head>) and the plain local file
    write(os.path.join(ROOT, 'BoardV.html'), fragment())
    write(os.path.join(ROOT, 'dist', 'BoardV.html'), full_doc())
    cfg = os.path.join(ROOT, 'dist', 'BoardV-config.js')
    icons = os.path.join(ROOT, 'build', 'icons')
    subprocess.check_call(['python3', os.path.join(ROOT, 'make_icons.py'), icons], stdout=subprocess.DEVNULL)

    # 2) PWA folder
    pwa = os.path.join(OUT, 'boardview-pwa')
    shutil.rmtree(pwa, ignore_errors=True)
    write(os.path.join(pwa, 'index.html'), full_doc(PWA_HEAD, PWA_BODY))
    write(os.path.join(pwa, 'manifest.webmanifest'), json.dumps(MANIFEST, ensure_ascii=False, indent=2))
    write(os.path.join(pwa, 'sw.js'), SW)
    shutil.copy(cfg, os.path.join(pwa, 'BoardV-config.js'))
    write(os.path.join(pwa, 'build-info.js'), "// replaced by the app build with its version\nwindow.BV_BUILD = { version: '0', day: '%s', app: 'web' };\n" % VDATE)
    for f in ('icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-256.png'):
        shutil.copy(os.path.join(icons, f), os.path.join(pwa, f))
    write(os.path.join(pwa, 'nginx.conf.example'), NGINX)
    write(os.path.join(pwa, 'README.md'), PWA_README % {'d': VDATE})

    # 3) GitHub project
    prj = os.path.join(OUT, 'boardview-app-project')
    shutil.rmtree(prj, ignore_errors=True)
    shutil.copytree(pwa, os.path.join(prj, 'www'), ignore=shutil.ignore_patterns('README.md', 'nginx.conf.example'))
    a = os.path.join(prj, 'android')
    write(os.path.join(a, 'settings.gradle.kts'), ANDROID_SETTINGS)
    write(os.path.join(a, 'build.gradle.kts'), ANDROID_ROOT)
    write(os.path.join(a, 'gradle.properties'), ANDROID_PROPS)
    write(os.path.join(a, 'app', 'build.gradle.kts'), ANDROID_APP % {'code': VCODE, 'd': VDATE})
    write(os.path.join(a, 'app', 'src', 'main', 'AndroidManifest.xml'), ANDROID_MANIFEST)
    write(os.path.join(a, 'app', 'src', 'main', 'java', 'com', 'carnison', 'boardview', 'MainActivity.java'), ANDROID_ACTIVITY)
    for d in os.listdir(os.path.join(icons, 'android')):
        dst = os.path.join(a, 'app', 'src', 'main', 'res', d)
        os.makedirs(dst, exist_ok=True)
        shutil.copy(os.path.join(icons, 'android', d, 'ic_launcher.png'), dst)
    e = os.path.join(prj, 'electron')
    pkg = json.loads(json.dumps(ELECTRON_PKG)); pkg['version'] = VSEM
    write(os.path.join(e, 'package.json'), json.dumps(pkg, ensure_ascii=False, indent=2) + '\n')
    write(os.path.join(e, 'main.js'), ELECTRON_MAIN)
    write(os.path.join(e, 'preload.js'), ELECTRON_PRELOAD)
    os.makedirs(os.path.join(e, 'build'), exist_ok=True)
    shutil.copy(os.path.join(icons, 'icon.ico'), os.path.join(e, 'build', 'icon.ico'))
    write(os.path.join(prj, '.github', 'workflows', 'build.yml'), WORKFLOW)
    write(os.path.join(prj, '.gitignore'), 'android/.gradle/\nandroid/build/\nandroid/app/build/\nandroid/app/src/main/assets/www/\nelectron/node_modules/\nelectron/dist/\nelectron/www/\nsrc/out/\nsrc/build/\nsrc/BoardV.html\nsrc/dist/BoardV.html\n')
    write(os.path.join(prj, 'README.md'), PROJECT_README)
    print('built %s into %s' % (VDATE, OUT))


if __name__ == '__main__':
    main()
