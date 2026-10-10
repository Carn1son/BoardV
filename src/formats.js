/* BoardV: more board file formats.
   Boardview .brd (Test_Link, also the encrypted kind), BRD2 (BRDOUT:), Honhan .bdv, .asc sets, BVRAW_FORMAT_1, ###Panel .cad,
   CastWide .cst, GenCAD, Eagle .brd (XML), KiCad .kicad_pcb.
   The boardview readers follow OpenBoardView (MIT licence, (c) Chloridite and OpenBoardView contributors).
   Units inside: mils, Y up. Every reader returns BV.finalize(parts, outline). */
var FMT = (function () {
  'use strict';
  var MM = 1 / 0.0254;
  function u8text(u8) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) {}
    try { return new TextDecoder('windows-1251').decode(u8); } catch (e) {}
    var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return s;
  }
  function has(u8, str, limit) { // is the ASCII string anywhere in the bytes (first `limit` bytes)
    var n = Math.min(u8.length, limit || u8.length) - str.length, c0 = str.charCodeAt(0);
    outer: for (var i = 0; i <= n; i++) {
      if (u8[i] !== c0) continue;
      for (var j = 1; j < str.length; j++) if (u8[i + j] !== str.charCodeAt(j)) continue outer;
      return true;
    }
    return false;
  }
  function ext(name) { var m = /\.([^.]+)$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
  function fail(msg) { var e = new Error(msg); e.known = true; throw e; }

  /* ---------- decoders for files that are not plain text ---------- */
  function decodeTestLink(u8) { // laptop .brd files starting with 23 E2 63 28
    var o = new Uint8Array(u8.length);
    for (var i = 0; i < u8.length; i++) { var x = u8[i]; o[i] = (x === 13 || x === 10 || !x) ? x : (~(((x >> 6) & 3) | (x << 2))) & 255; }
    return o;
  }
  function decodeBdv(u8) { // Honhan .bdv: the key goes up by one on every line
    var o = new Uint8Array(u8.length), count = 0xa0;
    for (var i = 0; i < u8.length; i++) {
      if (u8[i] === 13 && u8[i + 1] === 10) count++;
      var x = u8[i]; if (!(x === 13 || x === 10 || !x)) x = (count - (x > 127 ? x - 256 : x)) & 255;
      if (count > 285) count = 159;
      o[i] = x;
    }
    return o;
  }
  /* first look at the bytes: encrypted and binary formats, and formats that cannot be read at all */
  function sniff(u8, name) {
    var e = ext(name);
    if (u8.length > 4 && u8[0] === 0x23 && u8[1] === 0xe2 && u8[2] === 0x63 && u8[3] === 0x28) return { type: 'brd', text: u8text(decodeTestLink(u8)) };
    if (has(u8, 'dd:1.3?,r?-=bb', 4096)) return { type: 'bdv', text: u8text(decodeBdv(u8)) };
    if ((u8.length > 6 && String.fromCharCode.apply(null, u8.subarray(0, 6)) === 'XZZPCB') || (u8.length > 0x10 && u8[0x10] && xorIs(u8, 'XZZPCB')))
      return { error: 'Файл XZZ (.pcb) зашифрован ключом программы XZZ', detail: 'Ключа в открытом доступе нет, поэтому такие файлы не открываются. Попросите файл в другом формате.' };
    if (e === 'fz') return { error: 'Файл ASUS .fz зашифрован ключом производителя', detail: 'Без ключа ASUS его не прочитать. Попросите файл в формате .brd, .bdv или .bvr.' };
    if (e === 'cae') return { error: 'Файл .cae зашифрован ключом производителя', detail: 'Без ключа его не прочитать. Попросите файл в другом формате.' };
    if (e === 'cst') return { type: 'cst', bin: u8 };
    if (u8.length >= 0xfb && (String.fromCharCode(u8[0xf8], u8[0xf9], u8[0xfa]) === 'all' || String.fromCharCode(u8[0xf8], u8[0xf9], u8[0xfa]) === 'vie'))
      return { error: 'Это .brd из Cadence Allegro', detail: 'Это закрытый двоичный формат самой САПР, а не boardview. Выгрузите из Allegro файл GenCAD (.cad) или IPC-D-356 — их BoardV откроет.' };
    return null;
  }
  function xorIs(u8, s) { var k = u8[0x10]; for (var i = 0; i < s.length; i++) if ((u8[i] ^ k) !== s.charCodeAt(i)) return false; return true; }

  /* text formats */
  function detect(name, text) {
    var head = text.slice(0, 40000), e = ext(name);
    if (/<eagle[\s>]/.test(head) && /<board[\s>]/.test(text)) return 'eagle';
    if (/^\s*\((?:kicad_pcb|kicad-pcb)\b/.test(head)) return 'kicad';
    if (/BRDOUT:/.test(head) && /NETS:/.test(text)) return 'brd2';
    if (/BVRAW_FORMAT_1/.test(head)) return 'bvr1';
    if (/\$HEADER/i.test(head) && /GENCAD/i.test(head)) return 'gencad';
    if (/###Panel Added/.test(head) && /C_PIN/.test(text)) return 'cad';
    if (/<<format\.asc>>/.test(head) && /<<pins\.asc>>/.test(text)) return 'bdv';
    if (e === 'asc') {
      if (/^\s*Part\s+\S+\s+\((?:T|B)\)/m.test(head)) return 'ascpins';
      if (/format/i.test(name)) return 'ascformat';
      if (/nails/i.test(name)) return 'ascnails';
    }
    return null;
  }

  function T(line) { return line.trim().split(/\s+/); }
  function lines(text) { return text.split(/\r\n|\r|\n/); }

  /* ---------- BRD2: BRDOUT / NETS / PARTS / PINS / NAILS ---------- */
  function readBrd2(text) {
    var blk = 0, max = [0, 0], fmt = [], nets = {}, parts = [], pins = [];
    lines(text).forEach(function (l) {
      l = l.trim(); if (!l) return;
      var m;
      if ((m = /^BRDOUT:\s*(\d+)\s+(-?\d+)\s+(-?\d+)/.exec(l))) { blk = 1; max = [+m[2], +m[3]]; return; }
      if (/^NETS:/.test(l)) { blk = 2; return; } if (/^PARTS:/.test(l)) { blk = 3; return; }
      if (/^PINS:/.test(l)) { blk = 4; return; } if (/^NAILS:/.test(l)) { blk = 5; return; }
      var t = T(l);
      if (blk === 1 && t.length >= 2) fmt.push([+t[0], +t[1]]);
      else if (blk === 2 && t.length >= 2) nets[t[0]] = t.slice(1).join('_');
      else if (blk === 3 && t.length >= 7) parts.push({ ref: t[0], first: +t[5], side: +t[6], pins: [] });
      else if (blk === 4 && t.length >= 4) pins.push({ x: +t[0], y: +t[1], net: nets[t[2]] || 'UNCONNECTED', side: +t[3] });
    });
    if (!parts.length || !pins.length) fail('В файле BRD2 не нашлось деталей или пинов');
    var out = [], cpi = 0;
    parts.forEach(function (p, i) {
      var pei = i === parts.length - 1 ? pins.length : parts[i + 1].first, dip = true, part = { ref: p.ref, bottom: p.side === 2, smd: true, pins: [] }, n = 0;
      while (cpi < pei && cpi < pins.length) {
        var q = pins[cpi]; if ((q.side === 1 && p.side === 1) || (q.side === 2 && p.side === 2)) dip = false;
        part.pins.push({ x: q.x, y: q.side !== 1 ? max[1] - q.y : q.y, net: q.net, name: String(++n), r: NaN }); cpi++;
      }
      if (dip) { part.smd = false; part.bottom = false; }
      out.push(part);
    });
    return BV.finalize(out, fmt);
  }

  /* ---------- Honhan .bdv, .asc sets, BVRAW_FORMAT_1: "Part NAME (T)" then pin lines ---------- */
  function partsFromPinLines(text, tabs) {
    var parts = [], part = null, prevName = null;
    lines(text).forEach(function (raw) {
      var l = raw.trim(); if (!l) return;
      var m = /^Part\s+(\S+)\s+\((T|B)\)/.exec(l);
      if (m) { part = { ref: m[1], bottom: m[2] === 'B', smd: true, pins: [] }; parts.push(part); return; }
      var t = tabs ? l.split('\t').map(function (s) { return s.trim(); }) : T(l);
      if (tabs) { // BVRAW_FORMAT_1: name (T) id pin x y layer net
        if (t.length < 8 || !/^\((T|B)\)$/.test(t[1]) || !isFinite(+t[4])) return;
        if (t[0] !== prevName) { part = { ref: t[0], bottom: t[1] === '(B)', smd: true, pins: [] }; parts.push(part); prevName = t[0]; }
        part.pins.push({ x: +t[4] * 1000, y: +t[5] * 1000, name: t[3], net: t[7] || 'UNCONNECTED', r: NaN });
        return;
      }
      // id name x y layer net probe
      if (!part || t.length < 6 || !/^-?\d+$/.test(t[0]) || !isFinite(+t[2]) || !isFinite(+t[3])) return;
      part.pins.push({ x: +t[2] * 1000, y: +t[3] * 1000, name: t[1], net: t[5] || 'UNCONNECTED', r: NaN });
    });
    return parts;
  }
  function formatPoints(text) {
    var pts = [];
    lines(text).forEach(function (l) { var m = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(l); if (m) pts.push([+m[1] * 1000, +m[2] * 1000]); });
    return pts;
  }
  function section(text, tag) { // <<pins.asc>> … up to the next <<…>>
    var i = text.indexOf('<<' + tag + '>>'); if (i < 0) return '';
    var j = text.indexOf('<<', i + tag.length + 4); return text.slice(i + tag.length + 4, j < 0 ? text.length : j);
  }
  function readBdv(text) {
    var parts = partsFromPinLines(section(text, 'pins.asc'));
    if (!parts.length) fail('В файле .bdv не нашлось деталей');
    return BV.finalize(parts, formatPoints(section(text, 'format.asc')));
  }
  function readAsc(items) { // format.asc + pins.asc (+ nails.asc), dropped together or in one zip
    var pins = items.filter(function (i) { return i.type === 'ascpins'; })[0], fm = items.filter(function (i) { return i.type === 'ascformat'; })[0];
    var parts = partsFromPinLines(pins.text);
    if (!parts.length) fail('В pins.asc не нашлось деталей');
    return BV.finalize(parts, fm ? formatPoints(fm.text) : null);
  }
  function readBvr1(text) {
    var lay = section2(text, '<<Layout>>'), pin = section2(text, '<<Pin>>');
    var parts = partsFromPinLines(pin, true);
    if (!parts.length) fail('В файле .bvr не нашлось деталей');
    return BV.finalize(parts, formatPoints(lay));
  }
  function section2(text, tag) { var i = text.indexOf(tag); if (i < 0) return ''; var j = text.indexOf('<<', i + tag.length); return text.slice(i + tag.length, j < 0 ? text.length : j); }

  /* ---------- ###Panel .cad: COMP / C_PIN / NET ---------- */
  function readCad(text) {
    var parts = [], byName = {};
    lines(text).forEach(function (l) {
      l = l.trim(); var t = T(l);
      if (/^COMP/.test(l) && t.length >= 8) { var p = { ref: t[1], bottom: t[7] !== '1', smd: true, pins: [] }; parts.push(p); byName[p.ref] = p; }
      else if (/^C_PIN/.test(l) && t.length >= 9) {
        var pn = t[1], dash = pn.indexOf('-'), ref = dash >= 0 ? pn.slice(0, dash) : pn, part = byName[ref]; if (!part) return;
        part.pins.push({ x: +t[2] * 1000, y: +t[3] * 1000, name: dash >= 0 ? pn.slice(dash + 1) : String(part.pins.length + 1), net: t[8].replace(/^\//, '') || 'UNCONNECTED', r: NaN });
      }
    });
    if (!parts.length) fail('В файле .cad не нашлось деталей');
    return BV.finalize(parts, null);
  }

  /* ---------- CastWide .cst (binary) ---------- */
  function readCst(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), p = 0;
    function s16() { var v = dv.getInt16(p, true); p += 2; return v; }
    function s8() { var v = dv.getInt8(p); p += 1; return v; }
    function str(n) { var s = ''; for (var i = 0; i < n; i++) s += String.fromCharCode(u8[p + i]); p += n; return s; }
    var nParts = s16(); p += 4; var l = s16(); p += l;
    var parts = [];
    for (var i = 0; i < nParts; i++) { l = s8(); var name = str(l); p += 4; var layer = s8(); parts.push({ ref: name, bottom: layer === 1, smd: true, pins: [] }); p += 6; }
    p -= 2; var nNets = s16(), nets = [];
    for (i = 0; i < nNets; i++) { l = s8(); nets.push(str(l)); }
    var orphan = { ref: '...', bottom: false, smd: false, pins: [] };
    while (p < u8.length - 4 && !(u8[p] === 67 && u8[p + 1] === 80 && u8[p + 2] === 97 && u8[p + 3] === 100)) p++; // "CPad"
    if (p >= u8.length - 4) fail('В файле .cst не нашлось контактов');
    p -= 8; var nPins = s16(); p += 10;
    for (i = 0; i < nPins && p + 16 <= u8.length; i++) {
      var pid = s16(); s16(); var nid = s16(), x = s16(), y = s16(); s16(); p += 4;
      var part = pid >= 0 && parts[pid] ? parts[pid] : orphan;
      part.pins.push({ x: x, y: y, net: nets[nid] || 'UNCONNECTED', name: String(part.pins.length + 1), r: NaN });
    }
    parts.push(orphan);
    return BV.finalize(parts, null);
  }

  /* ---------- GenCAD 1.4 ---------- */
  function gTok(l) { var out = [], re = /"([^"]*)"|(\S+)/g, m; while ((m = re.exec(l))) out.push(m[1] != null ? m[1] : m[2]); return out; }
  function readGencad(text) {
    var k = 1, sec = '', shapes = {}, shape = null, comps = [], comp = null, sig = null, net = {}, devs = {}, dev = null, outline = [];
    function u(v) { return +v * k; }
    lines(text).forEach(function (raw) {
      var t = gTok(raw); if (!t.length) return;
      var w = t[0].toUpperCase();
      if (w.charAt(0) === '$') { sec = w; return; }
      if (sec === '$HEADER' && w === 'UNITS') {
        var un = (t[1] || '').toUpperCase(), n = +t[2] || 1;
        k = un === 'INCH' ? 1000 : un === 'THOU' ? 1 : un === 'MM' ? MM : un === 'MM100' ? MM / 100 : un === 'USER' ? n / 1000 : un === 'USERMM' ? n * MM : un === 'USERCM' ? n * MM * 10 : 1;
      } else if (sec === '$BOARD') {
        if (w === 'LINE') outline.push([[u(t[1]), u(t[2])], [u(t[3]), u(t[4])]]);
        else if (w === 'ARC') outline.push(arcPts(u(t[1]), u(t[2]), u(t[3]), u(t[4]), u(t[5]), u(t[6])));
        else if (w === 'RECTANGLE') { var x = u(t[1]), y = u(t[2]), ww = u(t[3]), hh = u(t[4]); outline.push([[x, y], [x + ww, y], [x + ww, y + hh], [x, y + hh], [x, y]]); }
        else if (w === 'CIRCLE') { var c = [], r = u(t[3]); for (var a = 0; a <= 36; a++) c.push([u(t[1]) + r * Math.cos(a * Math.PI / 18), u(t[2]) + r * Math.sin(a * Math.PI / 18)]); outline.push(c); }
      } else if (sec === '$SHAPES') {
        if (w === 'SHAPE') { shape = shapes[t[1]] = { pins: [], smd: true }; }
        else if (w === 'PIN' && shape) { shape.pins.push({ name: t[1], x: +t[3], y: +t[4], layer: (t[5] || '').toUpperCase() }); if ((t[5] || '').toUpperCase() === 'ALL') shape.smd = false; }
      } else if (sec === '$COMPONENTS') {
        if (w === 'COMPONENT') { comp = { ref: t[1], x: 0, y: 0, rot: 0, bottom: false, shape: null, mx: false, my: false, flip: false, dev: '' }; comps.push(comp); }
        else if (!comp) return;
        else if (w === 'PLACE') { comp.x = +t[1]; comp.y = +t[2]; }
        else if (w === 'ROTATION') comp.rot = +t[1] || 0;
        else if (w === 'LAYER') comp.bottom = /BOTTOM/i.test(t[1]);
        else if (w === 'SHAPE') { comp.shape = t[1]; comp.mx = /MIRRORX/i.test(t[2] || ''); comp.my = /MIRRORY/i.test(t[2] || ''); comp.flip = /FLIP/i.test(t[3] || ''); }
        else if (w === 'DEVICE') comp.dev = t.slice(1).join(' ');
        else if (w === 'VALUE') comp.value = t.slice(1).join(' ');
      } else if (sec === '$DEVICES') {
        if (w === 'DEVICE') { dev = devs[t.slice(1).join(' ')] = {}; }
        else if (dev && w === 'VALUE') dev.value = t.slice(1).join(' ');
        else if (dev && w === 'PACKAGE') dev.pkg = t.slice(1).join(' ');
        else if (dev && w === 'PART') dev.part = t.slice(1).join(' ');
      } else if (sec === '$SIGNALS') {
        if (w === 'SIGNAL') sig = t.slice(1).join(' ');
        else if (w === 'NODE' && sig) net[t[1] + '\u0001' + t[2]] = sig;
      }
    });
    var parts = [], seen = {};
    comps.forEach(function (c) {
      var sh = shapes[c.shape]; if (!sh) return;
      var key = c.bottom + ':' + c.x + ':' + c.y + ':' + c.shape; if (seen[key]) return; seen[key] = 1; // duplicate placement
      var a = c.rot * Math.PI / 180, sx = c.mx ? -1 : 1, sy = c.my ? -1 : 1;
      if (sx * sy === -1) a = Math.PI - a;
      var cs = Math.cos(a), sn = Math.sin(a), d = devs[c.dev] || {};
      var p = { ref: c.ref, bottom: c.bottom, smd: sh.smd, value: c.value || d.value || '', footprint: d.pkg || c.shape || '', desc: d.part || '', pins: [] };
      if (!sh.smd) p.bottom = false;
      sh.pins.forEach(function (q) {
        p.pins.push({ x: u(c.x + sx * (q.x * cs - q.y * sn)), y: u(c.y + sy * (q.x * sn + q.y * cs)), name: q.name, net: net[c.ref + '\u0001' + q.name] || 'UNCONNECTED', r: NaN });
      });
      parts.push(p);
    });
    if (!parts.length) fail('В файле GenCAD не нашлось деталей');
    return BV.finalize(parts, bestOutline(outline));
  }
  function arcPts(x1, y1, x2, y2, cx, cy) {
    var r = Math.hypot(x1 - cx, y1 - cy), a0 = Math.atan2(y1 - cy, x1 - cx), a1 = Math.atan2(y2 - cy, x2 - cx), pts = [];
    if (a1 <= a0) a1 += Math.PI * 2;
    var n = Math.max(2, Math.ceil((a1 - a0) / 0.15));
    for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    pts[0] = [x1, y1]; pts[pts.length - 1] = [x2, y2]; return pts;
  }
  function bestOutline(segs) { // join pieces and keep the biggest closed shape
    if (!segs.length) return null;
    var loops = BV.chain(segs), best = null, ba = -1;
    loops.forEach(function (l) {
      var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      l.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
      var a = (x1 - x0) * (y1 - y0); if (a > ba) { ba = a; best = l; }
    });
    return best && best.length >= 3 ? best : null;
  }

  /* ---------- Eagle / Fusion .brd (XML) ---------- */
  function readEagle(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) fail('Файл Eagle повреждён');
    function A(el, n) { return el.getAttribute(n); }
    function f(el, n) { return parseFloat(A(el, n)) || 0; }
    var pk = {};
    Array.prototype.forEach.call(doc.getElementsByTagName('library'), function (lib) {
      var ln = A(lib, 'name'), urn = A(lib, 'urn') || '';
      Array.prototype.forEach.call(lib.getElementsByTagName('package'), function (p) {
        var pads = [];
        Array.prototype.forEach.call(p.childNodes, function (c) {
          if (c.nodeName === 'smd') pads.push({ name: A(c, 'name'), x: f(c, 'x'), y: f(c, 'y'), r: Math.min(f(c, 'dx'), f(c, 'dy')) / 2, smd: true, bottom: A(c, 'layer') === '16' });
          else if (c.nodeName === 'pad') { var dia = f(c, 'diameter') || f(c, 'drill') * 1.6; pads.push({ name: A(c, 'name'), x: f(c, 'x'), y: f(c, 'y'), r: dia / 2, smd: false }); }
        });
        pk[ln + '\u0001' + A(p, 'name')] = pads; if (urn) pk[urn + '\u0001' + A(p, 'name')] = pads;
      });
    });
    var net = {};
    Array.prototype.forEach.call(doc.getElementsByTagName('signal'), function (s) {
      Array.prototype.forEach.call(s.getElementsByTagName('contactref'), function (c) { net[A(c, 'element') + '\u0001' + A(c, 'pad')] = A(s, 'name'); });
    });
    var parts = [];
    Array.prototype.forEach.call(doc.getElementsByTagName('element'), function (el) {
      var pads = pk[(A(el, 'library_urn') || A(el, 'library')) + '\u0001' + A(el, 'package')] || pk[A(el, 'library') + '\u0001' + A(el, 'package')];
      if (!pads || !pads.length) return;
      var rot = A(el, 'rot') || 'R0', mir = /M/.test(rot), ang = (parseFloat(rot.replace(/[^0-9.\-]/g, '')) || 0) * Math.PI / 180;
      var cs = Math.cos(ang), sn = Math.sin(ang), ex = f(el, 'x'), ey = f(el, 'y'), name = A(el, 'name');
      var smd = pads.some(function (q) { return q.smd; });
      var p = { ref: name, bottom: smd && (mir ? !pads[0].bottom : !!pads[0].bottom), smd: smd, value: A(el, 'value') || '', footprint: A(el, 'package') || '', desc: '', pins: [] };
      pads.forEach(function (q) {
        var x = q.x * cs - q.y * sn, y = q.x * sn + q.y * cs; if (mir) x = -x; // rotate, then mirror for the bottom side
        p.pins.push({ x: (ex + x) * MM, y: (ey + y) * MM, name: q.name, net: net[name + '\u0001' + q.name] || 'UNCONNECTED', r: q.r * MM });
      });
      parts.push(p);
    });
    if (!parts.length) fail('В файле Eagle не нашлось деталей');
    var segs = [];
    Array.prototype.forEach.call(doc.getElementsByTagName('plain'), function (pl) {
      Array.prototype.forEach.call(pl.childNodes, function (w) {
        if (w.nodeName !== 'wire' || A(w, 'layer') !== '20') return;
        var a = [f(w, 'x1') * MM, f(w, 'y1') * MM], b = [f(w, 'x2') * MM, f(w, 'y2') * MM], cu = parseFloat(A(w, 'curve'));
        segs.push(cu ? curve(a, b, cu) : [a, b]);
      });
    });
    return BV.finalize(parts, bestOutline(segs));
  }
  function curve(a, b, deg) { // Eagle arc between two points with the given sweep
    var t = deg * Math.PI / 180, dx = b[0] - a[0], dy = b[1] - a[1], ch = Math.hypot(dx, dy); if (!ch) return [a, b];
    var r = ch / 2 / Math.sin(Math.abs(t) / 2), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, h = Math.sqrt(Math.max(0, r * r - ch * ch / 4)) * (Math.abs(t) > Math.PI ? -1 : 1);
    var s = t > 0 ? 1 : -1, cx = mx - s * h * dy / ch, cy = my + s * h * dx / ch, a0 = Math.atan2(a[1] - cy, a[0] - cx), pts = [], n = Math.max(2, Math.ceil(Math.abs(t) / 0.15));
    for (var i = 0; i <= n; i++) { var aa = a0 + t * i / n; pts.push([cx + r * Math.cos(aa), cy + r * Math.sin(aa)]); }
    pts[0] = a; pts[pts.length - 1] = b; return pts;
  }

  /* ---------- KiCad .kicad_pcb (S-expressions) ---------- */
  function sexp(text) {
    var i = 0, n = text.length, stack = [[]];
    while (i < n) {
      var c = text.charCodeAt(i);
      if (c === 40) { var l = []; stack[stack.length - 1].push(l); stack.push(l); i++; }
      else if (c === 41) { stack.pop(); i++; }
      else if (c <= 32) i++;
      else if (c === 34) { var j = i + 1, s = ''; while (j < n && text.charCodeAt(j) !== 34) { if (text.charCodeAt(j) === 92) { j++; } s += text[j]; j++; } stack[stack.length - 1].push({ s: s }); i = j + 1; }
      else { var k = i; while (k < n) { var d = text.charCodeAt(k); if (d <= 32 || d === 40 || d === 41) break; k++; } stack[stack.length - 1].push(text.slice(i, k)); i = k; }
    }
    return stack[0][0];
  }
  function sv(x) { return x && typeof x === 'object' && 's' in x ? x.s : x; }
  function kids(l, name) { return l.filter(function (c) { return Array.isArray(c) && c[0] === name; }); }
  function kid(l, name) { return kids(l, name)[0]; }
  function readKicad(text) {
    var root = sexp(text); if (!root) fail('Файл KiCad повреждён');
    var netNames = {}; kids(root, 'net').forEach(function (n) { netNames[n[1]] = sv(n[2]); });
    var parts = [];
    kids(root, 'footprint').concat(kids(root, 'module')).forEach(function (fp) {
      var at = kid(fp, 'at') || ['at', 0, 0], fx = +at[1], fy = +at[2], frot = +(at[3] || 0), layer = sv((kid(fp, 'layer') || [])[1]) || 'F.Cu';
      var ref = '', val = '';
      kids(fp, 'property').forEach(function (p) { if (sv(p[1]) === 'Reference') ref = sv(p[2]); if (sv(p[1]) === 'Value') val = sv(p[2]); });
      kids(fp, 'fp_text').forEach(function (p) { if (p[1] === 'reference' && !ref) ref = sv(p[2]); if (p[1] === 'value' && !val) val = sv(p[2]); });
      var a = frot * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), smd = false, pins = [];
      kids(fp, 'pad').forEach(function (pd) {
        var pa = kid(pd, 'at'), sz = kid(pd, 'size') || ['size', 1, 1], nt = kid(pd, 'net'), name = sv(pd[1]);
        if (!pa) return;
        if (pd[2] === 'smd') smd = true;
        if (pd[2] === 'np_thru_hole' && !nt) return; // mounting hole
        var px = +pa[1], py = +pa[2], x = fx + px * cs + py * sn, y = fy - px * sn + py * cs; // KiCad: Y down, angles counter-clockwise on screen
        var netName = nt ? (nt.length > 2 ? sv(nt[2]) : (typeof nt[1] === 'object' ? sv(nt[1]) : netNames[nt[1]])) : '';
        pins.push({ x: x * MM, y: -y * MM, name: name, net: netName || 'UNCONNECTED', r: Math.min(+sz[1], +sz[2]) / 2 * MM });
      });
      if (!pins.length) return;
      parts.push({ ref: ref || '?', bottom: smd && /^B\./.test(layer), smd: smd, value: val, footprint: String(sv(fp[1]) || '').split(':').pop(), desc: '', pins: pins });
    });
    if (!parts.length) fail('В файле KiCad не нашлось деталей');
    var segs = [];
    root.forEach(function (g) {
      if (!Array.isArray(g) || sv((kid(g, 'layer') || [])[1]) !== 'Edge.Cuts') return;
      function P(n) { var e = kid(g, n); return e ? [+e[1] * MM, -e[2] * MM] : null; }
      if (g[0] === 'gr_line') segs.push([P('start'), P('end')]);
      else if (g[0] === 'gr_rect') { var s = P('start'), e = P('end'); segs.push([s, [e[0], s[1]], e, [s[0], e[1]], s]); }
      else if (g[0] === 'gr_arc' && kid(g, 'mid')) segs.push(arc3(P('start'), P('mid'), P('end')));
      else if (g[0] === 'gr_circle') { var c = P('center'), en = P('end'), r = Math.hypot(en[0] - c[0], en[1] - c[1]), pts = []; for (var q = 0; q <= 36; q++) pts.push([c[0] + r * Math.cos(q * Math.PI / 18), c[1] + r * Math.sin(q * Math.PI / 18)]); segs.push(pts); }
    });
    return BV.finalize(parts, bestOutline(segs));
  }
  function arc3(a, m, b) { // circle through three points
    var d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1])); if (!d) return [a, m, b];
    var ux = ((a[0] * a[0] + a[1] * a[1]) * (m[1] - b[1]) + (m[0] * m[0] + m[1] * m[1]) * (b[1] - a[1]) + (b[0] * b[0] + b[1] * b[1]) * (a[1] - m[1])) / d;
    var uy = ((a[0] * a[0] + a[1] * a[1]) * (b[0] - m[0]) + (m[0] * m[0] + m[1] * m[1]) * (a[0] - b[0]) + (b[0] * b[0] + b[1] * b[1]) * (m[0] - a[0])) / d;
    var r = Math.hypot(a[0] - ux, a[1] - uy), t0 = Math.atan2(a[1] - uy, a[0] - ux), tm = Math.atan2(m[1] - uy, m[0] - ux), t1 = Math.atan2(b[1] - uy, b[0] - ux);
    function norm(x) { while (x < t0) x += 2 * Math.PI; while (x >= t0 + 2 * Math.PI) x -= 2 * Math.PI; return x; }
    var em = norm(tm), e1 = norm(t1), sweep = em < e1 ? e1 - t0 : e1 - t0 - 2 * Math.PI, n = Math.max(2, Math.ceil(Math.abs(sweep) / 0.15)), pts = [];
    for (var i = 0; i <= n; i++) { var t = t0 + sweep * i / n; pts.push([ux + r * Math.cos(t), uy + r * Math.sin(t)]); }
    pts[0] = a; pts[pts.length - 1] = b; return pts;
  }

  function read(type, it) {
    switch (type) {
      case 'brd2': return readBrd2(it.text);
      case 'bdv': return readBdv(it.text);
      case 'bvr1': return readBvr1(it.text);
      case 'cad': return readCad(it.text);
      case 'cst': return readCst(it.bin);
      case 'gencad': return readGencad(it.text);
      case 'eagle': return readEagle(it.text);
      case 'kicad': return readKicad(it.text);
    }
    return null;
  }
  return { sniff: sniff, detect: detect, read: read, readAsc: readAsc, TYPES: ['brd2', 'bdv', 'bvr1', 'cad', 'cst', 'gencad', 'eagle', 'kicad'] };
})();
if (typeof module !== 'undefined') module.exports = FMT;
