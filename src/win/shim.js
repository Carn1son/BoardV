// BoardV for Windows (WebView2): the same window.bvDesktop bridge the page had under Electron, over chrome.webview messages.
(function () {
  'use strict';
  var wv = window.chrome && window.chrome.webview; if (!wv || window.bvDesktop) return;
  var seq = 0, waits = {}, subs = { open: [], share: [], upd: [] };
  function send(m) { wv.postMessage(m); }
  function ask(t, extra) { return new Promise(function (res, rej) { var id = ++seq; waits[id] = { res: res, rej: rej }; var m = extra || {}; m.t = t; m.req = id; send(m); }); }
  function b64(u8) { var s = '', k = 0x8000; for (var i = 0; i < u8.length; i += k) s += String.fromCharCode.apply(null, u8.subarray(i, i + k)); return btoa(s); }
  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  wv.addEventListener('message', function (e) {
    var m = e.data; if (!m || typeof m !== 'object') return;
    if (m.t === 'res') { var w = waits[m.req]; delete waits[m.req]; if (w) { if (m.error) w.rej(new Error(m.error)); else w.res(m.data); } return; }
    if (m.t === 'open-files') { var list = (m.files || []).map(function (f) { return { name: f.name, data: unb64(f.b64) }; }); subs.open.forEach(function (cb) { cb(list); }); return; }
    if (m.t === 'share') subs.share.forEach(function (cb) { cb(m.m); });
    if (m.t === 'upd') subs.upd.forEach(function (cb) { cb(m.m); });
  });
  window.bvDesktop = {
    host: 'webview2',
    onOpenFiles: function (cb) { subs.open.push(cb); },
    ready: function () { send({ t: 'ready' }); },
    share: {
      start: function (blob) { return ask('share-start', { b64: b64(blob instanceof Uint8Array ? blob : new Uint8Array(blob)) }); },
      decide: function (id, ok) { send({ t: 'share-decide', id: id, ok: !!ok }); },
      stop: function () { send({ t: 'share-stop' }); },
      reply: function (rid, body) { send({ t: 'share-reply', rid: rid, body: String(body || '') }); },
      on: function (cb) { subs.share.push(cb); }
    },
    update: {
      check: function () { return ask('upd-check'); },
      download: function () { return ask('upd-download'); },
      install: function () { send({ t: 'upd-install' }); },
      on: function (cb) { subs.upd.push(cb); }
    }
  };
  if (window.BV_WIN) window.bvDesktop.portableName = window.BV_WIN.portable; // the file the portable copy updates from
})();
