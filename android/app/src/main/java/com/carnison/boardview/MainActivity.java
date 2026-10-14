package com.carnison.boardview;

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
import android.Manifest;
import android.content.pm.PackageManager;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
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

    private static final int CAMERA_REQUEST = 1003;
    private volatile String byeUrl;

    /** BoardV is closing: tell the PC right away that this phone is gone (the board lived only in memory). */
    private void sayBye() {
        final String u = byeUrl; byeUrl = null;
        if (u == null) return;
        Thread t = new Thread(new Runnable() {
            @Override public void run() {
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
                    c.setConnectTimeout(1500); c.setReadTimeout(1500);
                    c.getResponseCode(); c.disconnect();
                } catch (Exception e) { /* the PC is gone too */ }
            }
        });
        t.start();
        try { t.join(1600); } catch (InterruptedException e) { /* closing anyway */ }
    }
    @Override
    protected void onDestroy() { sayBye(); super.onDestroy(); }
    /** Back (button or swipe) first closes what is open inside BoardV - scanner, settings, panels; only then leaves the app. */
    @Override
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("(window.bvBack && window.bvBack()) ? 1 : 0", new ValueCallback<String>() {
            @Override public void onReceiveValue(String v) { if (!"1".equals(v)) MainActivity.super.onBackPressed(); }
        });
    }
    private PermissionRequest pendingCamera;

    /** Lets the page save a text file (exported settings) through the system "Save as" screen. */
    public class Bridge {
        /** A board received from a PC is view-only: block screenshots and screen recording while it is open. */
        @JavascriptInterface
        public void setSecure(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                }
            });
        }
        /** The page tells where to say goodbye to the PC that shared the board; empty = no link. */
        @JavascriptInterface
        public void setLink(String url) { byeUrl = (url == null || url.isEmpty()) ? null : url; }
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
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == CAMERA_REQUEST && pendingCamera != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) pendingCamera.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
            else pendingCamera.deny();
            pendingCamera = null;
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, results);
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
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) { // camera for the QR scanner only
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        boolean wantsCamera = false;
                        for (String r : request.getResources()) if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCamera = true;
                        if (!wantsCamera) { request.deny(); return; }
                        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                            request.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
                        } else {
                            if (pendingCamera != null) pendingCamera.deny();
                            pendingCamera = request;
                            requestPermissions(new String[] { Manifest.permission.CAMERA }, CAMERA_REQUEST);
                        }
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*"); // .PcbDoc / .brd have no registered MIME type
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(pick, "BoardV"), FILE_REQUEST);
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
