/* Native Altium .PcbDoc reader (OLE compound file). Field layout follows KiCad's Altium importer. */
var PCBDOC = (function () {
  'use strict';
  var NONE16 = 0xFFFF;

  function isCfb(u8) { return u8.length > 512 && u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0; }

  /* ---- minimal compound-file reader: returns {"Pads6/Data": Uint8Array, ...} ---- */
  function readCfb(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var u16 = function (o) { return dv.getUint16(o, true); }, u32 = function (o) { return dv.getUint32(o, true); };
    var secSize = 1 << u16(0x1E), miniSize = 1 << u16(0x20);
    var nFat = u32(0x2C), dirStart = u32(0x30), cutoff = u32(0x38), miniFatStart = u32(0x3C), nMiniFat = u32(0x40);
    var difatStart = u32(0x44), nDifat = u32(0x48);
    var END = 0xFFFFFFFE, FREE = 0xFFFFFFFF;
    function secOff(s) { return 512 + s * secSize; }
    // FAT sector list from header DIFAT + DIFAT chain
    var fatSecs = [];
    for (var i = 0; i < 109 && fatSecs.length < nFat; i++) { var s = u32(0x4C + i * 4); if (s !== FREE) fatSecs.push(s); }
    var ds = difatStart;
    for (var d = 0; d < nDifat && ds !== END && ds !== FREE; d++) {
      var per = secSize / 4 - 1;
      for (var j = 0; j < per && fatSecs.length < nFat; j++) { var s2 = u32(secOff(ds) + j * 4); if (s2 !== FREE) fatSecs.push(s2); }
      ds = u32(secOff(ds) + per * 4);
    }
    var fat = new Uint32Array(fatSecs.length * secSize / 4);
    fatSecs.forEach(function (s, k) { for (var q = 0; q < secSize / 4; q++) fat[k * secSize / 4 + q] = u32(secOff(s) + q * 4); });
    function chain(start, table) { var out = [], guard = 0; for (var s = start; s !== END && s !== FREE && s < table.length && guard++ < 1e7; s = table[s]) out.push(s); return out; }
    function readChain(start, size) {
      var secs = chain(start, fat), out = new Uint8Array(secs.length * secSize);
      secs.forEach(function (s, k) { out.set(u8.subarray(secOff(s), secOff(s) + secSize), k * secSize); });
      return size == null ? out : out.subarray(0, size);
    }
    var dir = readChain(dirStart), ddv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
    var entries = [];
    for (var e = 0; e * 128 + 128 <= dir.length; e++) {
      var o = e * 128, nl = ddv.getUint16(o + 64, true), name = '';
      for (var c = 0; c + 2 < nl; c += 2) name += String.fromCharCode(ddv.getUint16(o + c, true));
      entries.push({ name: name, type: dir[o + 66], left: ddv.getUint32(o + 68, true), right: ddv.getUint32(o + 72, true),
                     child: ddv.getUint32(o + 76, true), start: ddv.getUint32(o + 116, true), size: ddv.getUint32(o + 120, true) });
    }
    var root = entries[0];
    var miniStream = root ? readChain(root.start, root.size) : new Uint8Array(0);
    var miniFat = new Uint32Array(0);
    if (nMiniFat && miniFatStart !== END) { var mf = readChain(miniFatStart); miniFat = new Uint32Array(mf.buffer.slice(mf.byteOffset, mf.byteOffset + mf.length)); }
    function readStream(en) {
      if (en.size < cutoff) {
        var secs = chain(en.start, miniFat), out = new Uint8Array(secs.length * miniSize);
        secs.forEach(function (s, k) { out.set(miniStream.subarray(s * miniSize, (s + 1) * miniSize), k * miniSize); });
        return out.subarray(0, en.size);
      }
      return readChain(en.start, en.size);
    }
    var files = {};
    function walk(idx, prefix, depth) {
      if (idx === FREE || idx >= entries.length || depth > 64) return;
      var en = entries[idx];
      walk(en.left, prefix, depth + 1); walk(en.right, prefix, depth + 1);
      var path = prefix ? prefix + '/' + en.name : en.name;
      if (en.type === 2) files[path] = function () { return readStream(en); };
      else if (en.type === 1) walk(en.child, path, depth + 1);
    }
    if (root) walk(root.child, '', 0);
    return files;
  }

  /* ---- record helpers ---- */
  function latin1(u8, a, b) { var s = ''; for (var i = a; i < b; i++) s += String.fromCharCode(u8[i]); return s; }
  function props(str) {
    var o = {};
    str.split('|').forEach(function (p) {
      var k = p.indexOf('='); if (k <= 0) return;
      var key = p.slice(0, k).toUpperCase(), val = p.slice(k + 1);
      if (key.indexOf('%UTF8%') === 0) {
        key = key.slice(6);
        try { var b = new Uint8Array(val.length); for (var i = 0; i < val.length; i++) b[i] = val.charCodeAt(i) & 255; val = new TextDecoder('utf-8').decode(b); } catch (e) {}
      }
      o[key] = val;
    });
    return o;
  }
  function propRecords(u8) {
    var out = [], pos = 0, dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    while (pos + 4 <= u8.length) {
      var len = dv.getUint32(pos, true); pos += 4;
      var bin = (len & 0xFF000000) !== 0; len &= 0x00FFFFFF;
      if (pos + len > u8.length) break;
      if (!bin) { var end = pos + len; if (len && u8[end - 1] === 0) end--; out.push(props(latin1(u8, pos, end))); }
      else out.push({});
      pos += len;
    }
    return out;
  }
  function wideStrings(u8) {
    var t = {}, pos = 0, dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    while (pos + 8 <= u8.length) {
      var idx = dv.getUint32(pos, true), len = dv.getUint32(pos + 4, true); pos += 8;
      if (len <= 2) { t[idx] = ''; continue; }
      if (pos + len > u8.length) break;
      t[idx] = new TextDecoder('utf-16le').decode(u8.subarray(pos, pos + len - 2)); pos += len;
    }
    return t;
  }
  var U = 1 / 10000; // Altium internal unit -> mil

  function parse(u8) {
    var f = readCfb(u8);
    function get(name) { var k = Object.keys(f).filter(function (p) { return p.toUpperCase() === name.toUpperCase(); })[0]; return k ? f[k]() : null; }
    var compData = get('Components6/Data'), padData = get('Pads6/Data');
    if (!compData || !padData) throw new Error('В .PcbDoc не найдены потоки компонентов и падов. Это точно файл платы Altium (а не библиотека .PcbLib)?');
    var comps = propRecords(compData);
    var netsData = get('Nets6/Data'), nets = netsData ? propRecords(netsData).map(function (n) { return n.NAME || ''; }) : [];
    var boardData = get('Board6/Data'), board = boardData ? propRecords(boardData)[0] : null;

    // values from comment texts
    var ws = {}, wsData = get('WideStrings6/Data'); if (wsData) try { ws = wideStrings(wsData); } catch (e) {}
    var txtData = get('Texts6/Data'), values = {};
    if (txtData) {
      var tdv = new DataView(txtData.buffer, txtData.byteOffset, txtData.byteLength), tp = 0;
      while (tp + 5 <= txtData.length) {
        if (txtData[tp] !== 5) break;
        var l1 = tdv.getUint32(tp + 1, true), s1 = tp + 5;
        if (s1 + l1 > txtData.length) break;
        var comp = tdv.getUint16(s1 + 7, true), isComment = l1 >= 123 && txtData[s1 + 40] !== 0, wi = l1 >= 123 ? tdv.getUint32(s1 + 115, true) : -1;
        var p2 = s1 + l1; if (p2 + 4 > txtData.length) break;
        var l2 = tdv.getUint32(p2, true), s2 = p2 + 4, text = '';
        if (ws[wi] != null) text = ws[wi];
        else if (l2 > 0) { var sl = txtData[s2]; text = latin1(txtData, s2 + 1, Math.min(s2 + 1 + sl, s2 + l2)); }
        if (isComment && comp !== NONE16 && text && text.charAt(0) !== '.' && text.charAt(0) !== '=') values[comp] = text.replace(/\r?\n/g, ' ').trim();
        tp = s2 + l2;
      }
    }

    var parts = {}, order = [], noref = 0, nPads = 0;
    var pdv = new DataView(padData.buffer, padData.byteOffset, padData.byteLength), pp = 0;
    while (pp + 5 <= padData.length) {
      if (padData[pp] !== 2) break;
      pp++;
      var sub = [];
      for (var k = 0; k < 6 && pp + 4 <= padData.length; k++) { var ln = pdv.getUint32(pp, true); sub.push([pp + 4, ln]); pp += 4 + ln; }
      if (sub.length < 6 || pp > padData.length) break;
      var n1 = sub[0][0], name = latin1(padData, n1 + 1, n1 + 1 + padData[n1]);
      var b = sub[4][0];
      if (sub[4][1] < 110) continue;
      var net = pdv.getUint16(b + 3, true), ci = pdv.getUint16(b + 7, true);
      var x = pdv.getInt32(b + 13, true) * U, y = pdv.getInt32(b + 17, true) * U;
      var sx = pdv.getInt32(b + 21, true) * U, sy = pdv.getInt32(b + 25, true) * U, hole = pdv.getInt32(b + 45, true) * U;
      nPads++;
      if (ci === NONE16 || ci >= comps.length) continue;
      var c = comps[ci], key = ci; // one part per placed component: two footprints with the same designator never merge
      if (!parts[key]) {
        parts[key] = { ref: '', bottom: /bottom/i.test(c.LAYER || ''), smd: true, pins: [], rot: parseFloat(c.ROTATION) || 0,
                       value: values[ci] || '', footprint: c.PATTERN || '', desc: c.SOURCEDESCRIPTION || '' };
        order.push(key);
      }
      if (hole > 0) parts[key].smd = false;
      var nn = net !== NONE16 && net < nets.length ? nets[net] : '';
      // real copper shape: bottom pads use the bottom-layer size and shape; round + "alt" 9 is a rounded rectangle
      var bot = padData[b] === 32, w = bot ? pdv.getInt32(b + 37, true) * U : sx, h = bot ? pdv.getInt32(b + 41, true) * U : sy, shp = padData[b + (bot ? 51 : 49)];
      var rot = pdv.getFloat64(b + 52, true), s5 = sub[5], li = bot ? 31 : 0, sh = 'rr', cr = 0.5;
      if (shp === 2) sh = 'r'; else if (shp === 3) sh = 'oct';
      else if (shp === 1) {
        if (s5[1] >= 596 && padData[s5[0] + 532 + li] === 9) { sh = 'rr'; cr = padData[s5[0] + 564 + li] / 100; }
        else sh = Math.abs(w - h) < 0.01 ? 'c' : 'o';
      }
      if (!(w > 0 && h > 0)) { w = h = Math.max(4, Math.min(sx, sy)); }
      parts[key].pins.push({ x: x, y: y, name: name.trim(), net: nn ? nn.trim().replace(/\s+/g, '_') : 'UNCONNECTED', r: Math.max(2, Math.min(w, h) / 2),
                             w: w, h: h, rot: isFinite(rot) ? rot : 0, sh: sh, cr: cr });
    }
    // names: a footprint placed without a designator is "no designator"; a repeated designator stays on the copy that is wired from the schematic,
    // the other copies get the letters only: "IC?", "T?"; same-looking names differ by invisible zero-width marks; footprints that are not from the schematic (no link, no nets) are kept out of the BOM
    var byName = {}, used = {};
    order.forEach(function (ci) {
      var c = comps[ci], p = parts[ci], nm = (c.SOURCEDESIGNATOR || '').trim().replace(/\s+/g, '_');
      p.free = !c.SOURCEUNIQUEID && p.pins.every(function (q) { return q.net === 'UNCONNECTED'; });
      if (/^comment$/i.test(p.value)) p.value = '';
      if (!nm) { p.ref = uniq('no designator'); return; }
      (byName[nm] = byName[nm] || []).push(p);
    });
    Object.keys(byName).forEach(function (nm) {
      var g = byName[nm].slice().sort(function (a, b) { return (a.free - b.free) || (netCount(b) - netCount(a)); });
      g.forEach(function (p, i) { p.ref = i ? uniq((nm.replace(/\d.*$/, '') || nm) + '?') : nm; });
    });
    function uniq(base) { var r = base; while (used[r]) r += '\u200b'; used[r] = 1; return r; }
    function netCount(p) { return p.pins.filter(function (q) { return q.net !== 'UNCONNECTED'; }).length; }
    // 3D: component bodies (extruded outlines and embedded STEP models), attached to their parts
    try { bodies3d(get, parts); } catch (e) {}
    var list = order.map(function (k) { return parts[k]; });
    var withVal = list.filter(function (p) { return p.value; }).length;
    return { parts: list, board: board, nPads: nPads,
             info: comps.length + ' компонентов, ' + nPads + ' падов, ' + nets.length + ' цепей' + (withVal ? ', номиналы у ' + withVal : '') };
  }
  function mil(v) { var m = /^(-?[\d.eE+-]+)\s*(mil|mm)?$/.exec(String(v || '').trim()); if (!m) return 0; return +m[1] * (m[2] === 'mm' ? 1 / 0.0254 : 1); }
  function bodies3d(get, parts) {
    var d = get('ComponentBodies6/Data'); if (!d) return;
    var models = {}, md = get('Models/Data');
    if (md) propRecords(md).forEach(function (r, i) { if (r.ID) models[r.ID] = i; });
    var dv = new DataView(d.buffer, d.byteOffset, d.byteLength), p = 0, cache = {};
    function step(i) { return function () { if (!(i in cache)) cache[i] = get('Models/' + i); return cache[i]; }; } // zlib-packed STEP, read on demand
    while (p + 5 <= d.length) {
      var len = dv.getUint32(p + 1, true), s0 = p + 5; p = s0 + len;
      if (len < 26 || p > d.length) break;
      var ci = dv.getUint16(s0 + 7, true), pl = dv.getUint32(s0 + 18, true), part = parts[ci];
      if (!part || s0 + 22 + pl > p) continue;
      var e = s0 + 22 + pl, end = e; if (pl && d[e - 1] === 0) end--;
      var o = props(latin1(d, s0 + 22, end)), poly = [];
      if (p - e >= 4) { var n = dv.getUint32(e, true); for (var k = 0; k < n && e + 4 + k * 16 + 16 <= p; k++) poly.push([dv.getFloat64(e + 4 + k * 16, true) / 1e4, dv.getFloat64(e + 12 + k * 16, true) / 1e4]); }
      var b = { type: +(o['MODEL.MODELTYPE'] || 0), poly: poly, z0: mil(o.STANDOFFHEIGHT), z1: mil(o.OVERALLHEIGHT), bottom: o.BODYPROJECTION === '1',
                color: +(o.BODYCOLOR3D || 8421504), alpha: o.BODYOPACITY3D == null ? 1 : +o.BODYOPACITY3D,
                x: mil(o['MODEL.2D.X']), y: mil(o['MODEL.2D.Y']), rot: +(o['MODEL.2D.ROTATION'] || 0),
                rx: +(o['MODEL.3D.ROTX'] || 0), ry: +(o['MODEL.3D.ROTY'] || 0), rz: +(o['MODEL.3D.ROTZ'] || 0), dz: mil(o['MODEL.3D.DZ']),
                id: o.MODELID || '', name: o['MODEL.NAME'] || '', ck: o['MODEL.CHECKSUM'] ? o['MODEL.CHECKSUM'] + '|' + (o['MODEL.NAME'] || '') : '' };
      if (b.type === 1 && o['MODEL.EMBED'] === 'TRUE' && b.id in models) b.step = step(models[b.id]);
      (part.bodies = part.bodies || []).push(b);
    }
  }
  return { isCfb: isCfb, readCfb: readCfb, parse: parse };
})();
if (typeof module !== 'undefined') module.exports = PCBDOC;
