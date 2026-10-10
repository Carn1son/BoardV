/* Boardview core: parsers for Altium outputs + BRD/BVR writers. Units inside: mils, Y up. */
var BV = (function () {
  'use strict';
  var MM = 1 / 0.0254; // mm -> mil

  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : NaN; }
  function toMil(v, defUnit) {
    if (v == null) return NaN;
    var s = String(v).trim().toLowerCase();
    var n = parseFloat(s);
    if (!isFinite(n)) return NaN;
    if (/mm$/.test(s)) return n * MM;
    if (/mil$/.test(s)) return n;
    if (/in$|inch$/.test(s)) return n * 1000;
    return defUnit === 'mm' ? n * MM : n;
  }
  function cleanNet(n) {
    n = (n || '').trim();
    if (!n || /^n\/?c$/i.test(n) || /^no[_ ]?net$/i.test(n)) return 'UNCONNECTED';
    return n.replace(/\s+/g, '_');
  }
  function cleanRef(r) { return (r || '').trim().replace(/\s+/g, '_'); }

  /* ---------- detection ---------- */
  function detect(name, text) {
    var head = text.slice(0, 20000);
    if (/^\s*\{/.test(head) && /"altium-boardview/.test(head)) return 'json';
    if (/BVRAW_FORMAT_3/.test(head)) return 'bvr';
    if (/^\s*str_length:/m.test(head) && /^\s*var_data:/m.test(head)) return 'brd';
    if (/\|RECORD=/i.test(head)) return 'ascii';
    if (/^P\s+(JOB|UNITS|CODE)/m.test(head) || /^3[1-6]7\S/m.test(head)) return 'ipc356';
    if (/%FS[LT]?[AI]?X\d\dY\d\d\*%/.test(head) || /^G04 /m.test(head)) return 'gerber';
    if (/designator/i.test(head)) {
      var hl = (head.split(/\r?\n/).filter(function (l) { return /designator/i.test(l); })[0] || '').toLowerCase();
      if (/center|mid[\s-]?x|ref[\s-]?x|pos[\s-]?x|"x"|,x,|\bx\(/.test(hl)) return 'pnp';
      if (/comment|value|quantity|qty/.test(hl)) return 'bom';
      return 'pnp';
    }
    return null;
  }

  /* ---------- Altium PCB ASCII ---------- */
  function parseRecordLine(line) {
    var o = {};
    var parts = line.split('|');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], k = p.indexOf('=');
      if (k > 0) o[p.slice(0, k).toUpperCase()] = p.slice(k + 1);
    }
    return o;
  }
  function parseAscii(text) {
    var nets = [], comps = [], pads = [], texts = [], board = null;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i];
      if (L.indexOf('RECORD=') < 0) continue;
      var r = parseRecordLine(L), t = (r.RECORD || '').toLowerCase();
      if (t === 'net') nets.push(r.NAME || '');
      else if (t === 'component') comps.push(r);
      else if (t === 'pad') pads.push(r);
      else if (t === 'board' && !board && 'VX0' in r) board = r;
      else if (t === 'text' && /true/i.test(r.COMMENT || '') && r.COMPONENT != null) texts.push(r);
    }
    texts.forEach(function (tr) {
      var ci = parseInt(tr.COMPONENT, 10), v = (tr.TEXT || '').trim();
      if (ci >= 0 && ci < comps.length && v && v.charAt(0) !== '=') comps[ci]._value = v;
    });
    var parts = {}, order = [];
    for (var c = 0; c < comps.length; c++) {
      var cr = comps[c];
      var ref = cleanRef(cr.SOURCEDESIGNATOR || cr.DESIGNATOR || cr.NAME || '');
      var bottom = /bottom/i.test(cr.LAYER || '');
      comps[c]._ref = ref; comps[c]._bottom = bottom;
    }
    var noref = 0;
    for (var j = 0; j < pads.length; j++) {
      var pr = pads[j];
      var ci = parseInt(pr.COMPONENT, 10);
      if (!(ci >= 0 && ci < comps.length)) continue; // free pads
      var comp = comps[ci];
      if (!comp._ref) comp._ref = 'NOREF' + (++noref);
      var key = comp._ref;
      if (!parts[key]) {
        parts[key] = { ref: key, bottom: comp._bottom, smd: true, pins: [],
                       value: comp._value || '', footprint: comp.PATTERN || '', desc: comp.SOURCEDESCRIPTION || comp.DESCRIPTION || '' };
        order.push(key);
      }
      var ni = parseInt(pr.NET, 10);
      var net = (ni >= 0 && ni < nets.length) ? nets[ni] : '';
      var hole = toMil(pr.HOLESIZE, 'mil');
      if (hole > 0) parts[key].smd = false;
      var sx = toMil(pr.XSIZE || pr.TOPXSIZE, 'mil'), sy = toMil(pr.YSIZE || pr.TOPYSIZE, 'mil');
      parts[key].pins.push({
        x: toMil(pr.X, 'mil'), y: toMil(pr.Y, 'mil'), net: cleanNet(net), name: (pr.NAME || '').trim(),
        r: (isFinite(sx) && isFinite(sy)) ? Math.min(sx, sy) / 2 : NaN
      });
    }
    var outline = board ? asciiOutline(board) : null;
    return { parts: order.map(function (k) { return parts[k]; }), outline: outline,
             info: comps.length + ' компонентов, ' + pads.length + ' падов, ' + nets.length + ' цепей' };
  }
  function asciiOutline(b) {
    var v = [];
    for (var i = 0; ('VX' + i) in b; i++) {
      v.push({ x: toMil(b['VX' + i], 'mil'), y: toMil(b['VY' + i], 'mil'), kind: b['KIND' + i] || '0',
               cx: toMil(b['CX' + i], 'mil'), cy: toMil(b['CY' + i], 'mil'), r: toMil(b['R' + i], 'mil'),
               sa: num(b['SA' + i]), ea: num(b['EA' + i]) });
    }
    if (v.length < 3) return null;
    var pts = [];
    for (var k = 0; k < v.length; k++) {
      var a = v[k], n = v[(k + 1) % v.length];
      pts.push([a.x, a.y]);
      if (a.kind === '1' && isFinite(a.r) && a.r > 0) {
        var a0 = Math.atan2(a.y - a.cy, a.x - a.cx), a1 = Math.atan2(n.y - a.cy, n.x - a.cx);
        var ccw = a1 - a0; while (ccw <= 0) ccw += 2 * Math.PI;
        var cw = ccw - 2 * Math.PI;
        // choose direction matching SA->EA span
        var span = isFinite(a.sa) && isFinite(a.ea) ? ((a.ea - a.sa + 360) % 360 || 360) * Math.PI / 180 : Math.min(ccw, -cw);
        var sweep = Math.abs(ccw - span) <= Math.abs(-cw - span) ? ccw : cw;
        for (var s = 1; s < 16; s++) {
          var ang = a0 + sweep * s / 16;
          pts.push([a.cx + a.r * Math.cos(ang), a.cy + a.r * Math.sin(ang)]);
        }
      }
    }
    pts.push(pts[0]);
    return pts;
  }

  /* ---------- IPC-D-356A ---------- */
  function parseIpc356(text) {
    var lines = text.split(/\r?\n/);
    var scale = 0.1; // CUST 0 / 2: 0.0001 inch -> mil
    var alias = {};
    var parts = {}, order = [], edge = [], inEdge = false, nPins = 0;
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i];
      if (/^P\s/.test(L)) {
        var u = L.match(/UNITS\s+(CUST\s*(\d)|SI|ENGLISH)/i);
        if (u) {
          if (/SI/i.test(u[1]) || u[2] === '1') scale = 0.001 * MM; else scale = 0.1;
        }
        var nn = L.match(/^P\s+(NNAME\d+)\s+(\S+)/);
        if (nn) alias[nn[1]] = nn[2];
        continue;
      }
      var code = L.slice(0, 3);
      if (code === '389') { inEdge = true; edgeXY(L.slice(3), edge, scale); continue; }
      if (code === '089' && inEdge) { edgeXY(L.slice(3), edge, scale); continue; }
      if (code !== '089') inEdge = false;
      if (!/^3[12]7$/.test(code)) continue;
      var net = L.slice(3, 17).trim();
      if (alias[net]) net = alias[net];
      var body = L.slice(17);
      var rp = body.match(/^\s*(\S+?)\s*-\s*(\S*?)(?=\s|D\d|M|$)/) || body.match(/^\s*(\S+)/);
      if (!rp) continue;
      var ref = cleanRef(rp[1]), pin = (rp[2] || '').trim();
      if (!ref || /^via$/i.test(ref)) continue;
      var rest = body.slice(rp[0].length);
      var acc = rest.match(/A(0\d)/);
      var after = acc ? rest.slice(acc.index + 3) : rest;
      var re = /X\s*([+-]?\d+)\s*Y\s*([+-]?\d+)/g, xy = re.exec(after), sz = re.exec(after);
      if (!xy) continue;
      var side = acc ? acc[1] : '00';
      var hole = /D\d+P/.test(acc ? rest.slice(0, acc.index) : rest) || code === '317';
      if (!parts[ref]) { parts[ref] = { ref: ref, bottom: null, smd: !hole, pins: [], sides: {} }; order.push(ref); }
      var P = parts[ref];
      if (hole) P.smd = false;
      P.sides[side] = (P.sides[side] || 0) + 1;
      P.pins.push({ x: parseInt(xy[1], 10) * scale, y: parseInt(xy[2], 10) * scale, net: cleanNet(net), name: pin,
                    r: sz ? Math.min(+sz[1], +sz[2]) * scale / 2 : NaN });
      nPins++;
    }
    var list = order.map(function (k) {
      var p = parts[k], s = p.sides;
      p.bottom = (s['02'] || 0) > (s['01'] || 0);
      delete p.sides; return p;
    });
    return { parts: list, outline: edge.length > 2 ? closeLoop(edge) : null,
             info: list.length + ' компонентов, ' + nPins + ' пинов' };
  }
  function edgeXY(s, out, scale) {
    var re = /X\s*([+-]?\d+)\s*Y\s*([+-]?\d+)/g, m;
    while ((m = re.exec(s))) out.push([parseInt(m[1], 10) * scale, parseInt(m[2], 10) * scale]);
  }
  function closeLoop(p) {
    var a = p[0], b = p[p.length - 1];
    if (Math.abs(a[0] - b[0]) > 0.5 || Math.abs(a[1] - b[1]) > 0.5) p = p.concat([a]);
    return p;
  }

  /* ---------- Pick & Place ---------- */
  function splitRow(line, sep) {
    if (sep === ',') {
      var out = [], cur = '', q = false;
      for (var i = 0; i < line.length; i++) {
        var c = line[i];
        if (c === '"') q = !q; else if (c === ',' && !q) { out.push(cur); cur = ''; } else cur += c;
      }
      out.push(cur); return out.map(function (s) { return s.trim(); });
    }
    var m = line.match(/"[^"]*"|\S+/g) || [];
    return m.map(function (s) { return s.replace(/^"|"$/g, '').trim(); });
  }
  function parsePnp(text) {
    var lines = text.split(/\r?\n/), hi = -1;
    for (var i = 0; i < lines.length; i++) if (/designator/i.test(lines[i])) { hi = i; break; }
    if (hi < 0) throw new Error('В Pick&Place не найдена строка заголовка с колонкой Designator');
    var sep = lines[hi].indexOf(',') >= 0 ? ',' : 'ws';
    var H = splitRow(lines[hi], sep).map(function (h) { return h.toLowerCase(); });
    function col(re) { for (var k = 0; k < H.length; k++) if (re.test(H[k])) return k; return -1; }
    var cD = col(/designator/), cL = col(/layer|side/), cC = col(/^comment$|^value$|comment|value/), cF = col(/footprint|pattern|package/), cDe = col(/description/);
    var cX = col(/center-?x|mid\s*x|^x\b|center x|pos.?x/), cY = col(/center-?y|mid\s*y|^y\b|center y|pos.?y/);
    if (cX < 0) cX = col(/ref.?x/); if (cY < 0) cY = col(/ref.?y/);
    var unit = /\(mm\)/.test(lines[hi].toLowerCase()) || /units used\s*=\s*mm/i.test(lines.slice(0, hi).join('\n')) ? 'mm' : 'mil';
    var comps = [];
    for (var j = hi + 1; j < lines.length; j++) {
      if (!lines[j].trim()) continue;
      var r = splitRow(lines[j], sep);
      if (!r[cD]) continue;
      comps.push({ ref: cleanRef(r[cD]), bottom: cL >= 0 ? /^b/i.test(r[cL]) || /bottom/i.test(r[cL]) : false,
                   x: toMil(r[cX], unit), y: toMil(r[cY], unit),
                   value: cC >= 0 ? r[cC] || '' : '', footprint: cF >= 0 ? r[cF] || '' : '', desc: cDe >= 0 ? r[cDe] || '' : '' });
    }
    return { comps: comps, info: comps.length + ' компонентов (единицы: ' + unit + ')' };
  }

  /* ---------- Gerber outline ---------- */
  function parseGerber(text) {
    var fs = text.match(/%FS[LT]?[AI]?X(\d)(\d)Y(\d)(\d)\*%/);
    var dec = fs ? +fs[2] : 4, decY = fs ? +fs[4] : 4;
    var unit = /%MOMM\*%/.test(text) ? 'mm' : 'in';
    var k = unit === 'mm' ? MM : 1000;
    var cx = 0, cy = 0, mode = 1, segs = [], cur = null;
    var cmds = text.replace(/%[^%]*%/g, '').split('*');
    for (var i = 0; i < cmds.length; i++) {
      var c = cmds[i].replace(/\s+/g, '');
      if (!c) continue;
      var g = c.match(/G0?([123])(?!\d)/); if (g) mode = +g[1];
      var mx = c.match(/X([+-]?\d+)/), my = c.match(/Y([+-]?\d+)/), mi = c.match(/I([+-]?\d+)/), mj = c.match(/J([+-]?\d+)/);
      var d = c.match(/D0?([123])(?!\d)/);
      var nx = mx ? parseInt(mx[1], 10) / Math.pow(10, dec) * k : cx;
      var ny = my ? parseInt(my[1], 10) / Math.pow(10, decY) * k : cy;
      if (!d && (mx || my)) d = [0, '1'];
      if (!d) continue;
      if (d[1] === '2') { cur = [[nx, ny]]; segs.push(cur); }
      else if (d[1] === '1') {
        if (!cur) { cur = [[cx, cy]]; segs.push(cur); }
        if (mode === 1) cur.push([nx, ny]);
        else {
          var ox = cx + (mi ? parseInt(mi[1], 10) / Math.pow(10, dec) * k : 0);
          var oy = cy + (mj ? parseInt(mj[1], 10) / Math.pow(10, decY) * k : 0);
          var r = Math.hypot(cx - ox, cy - oy), a0 = Math.atan2(cy - oy, cx - ox), a1 = Math.atan2(ny - oy, nx - ox);
          var sw = a1 - a0;
          if (mode === 3) { while (sw <= 0) sw += 2 * Math.PI; } else { while (sw >= 0) sw -= 2 * Math.PI; }
          for (var s = 1; s <= 16; s++) cur.push([ox + r * Math.cos(a0 + sw * s / 16), oy + r * Math.sin(a0 + sw * s / 16)]);
          cur[cur.length - 1] = [nx, ny];
        }
      }
      cx = nx; cy = ny;
    }
    var lines = chain(segs.filter(function (s) { return s.length > 1; }));
    if (!lines.length) throw new Error('В Gerber не найдено линий контура');
    lines.sort(function (a, b) { return bboxArea(b) - bboxArea(a); });
    return { outline: closeLoop(lines[0]), info: segs.length + ' отрезков, контур ' + lines[0].length + ' точек' };
  }
  function bboxArea(p) {
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    p.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
    return (x1 - x0) * (y1 - y0);
  }
  function chain(segs) {
    var tol = 1, res = [];
    function close(a, b) { return Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol; }
    segs = segs.slice();
    while (segs.length) {
      var line = segs.shift().slice(), grown = true;
      while (grown) {
        grown = false;
        for (var i = 0; i < segs.length; i++) {
          var s = segs[i];
          if (close(line[line.length - 1], s[0])) line = line.concat(s.slice(1));
          else if (close(line[line.length - 1], s[s.length - 1])) line = line.concat(s.slice().reverse().slice(1));
          else if (close(line[0], s[s.length - 1])) line = s.slice(0, -1).concat(line);
          else if (close(line[0], s[0])) line = s.slice().reverse().slice(0, -1).concat(line);
          else continue;
          segs.splice(i, 1); grown = true; break;
        }
      }
      res.push(line);
    }
    return res;
  }

  /* ---------- build board model ---------- */
  function build(src) {
    // src: {pins: parsed ascii/ipc result or null, pnp: parsed pnp or null, outline: gerber result or null}
    var warnings = [];
    var parts = (src.pins ? src.pins.parts : []).map(function (p) {
      return { ref: p.ref, bottom: p.bottom, smd: p.smd, pins: p.pins.map(function (q) { return Object.assign({}, q); }), fromPnp: false,
               value: p.value || '', footprint: p.footprint || '', desc: p.desc || '' };
    });
    var byRef = {}; parts.forEach(function (p) { byRef[p.ref] = p; });
    if (src.pnp) {
      var added = 0;
      src.pnp.comps.forEach(function (c) {
        var p = byRef[c.ref];
        if (p) { p.bottom = c.bottom; }
        else if (isFinite(c.x) && isFinite(c.y)) {
          p = { ref: c.ref, bottom: c.bottom, smd: true, fromPnp: true, value: '', footprint: '', desc: '',
                pins: [{ x: c.x, y: c.y, net: 'UNCONNECTED', name: '1', r: NaN }] };
          parts.push(p); byRef[c.ref] = p; added++;
        }
      });
      if (added && src.pins) warnings.push(added + ' компонентов без пинов — показаны точкой в центре.');
      if (added && !src.pins) warnings.push('Без файла с пинами (PCB ASCII или IPC-D-356A) детали показаны только точками, цепей не будет.');
    }
    if (src.pnp) applyMeta(parts, src.pnp.comps);
    if (src.bom) applyMeta(parts, src.bom.comps);
    parts = parts.filter(function (p) {
      p.pins = p.pins.filter(function (q) { return isFinite(q.x) && isFinite(q.y); });
      return p.pins.length > 0;
    });
    if (!parts.length) throw new Error('Нет ни одной детали с координатами. Нужен файл платы: .PcbDoc (или PCB ASCII / IPC-D-356A).');
    parts.forEach(function (p) {
      p.pins.sort(function (a, b) { return natCmp(a.name, b.name); });
      if (!p.ref) p.ref = 'NOREF';
    });
    var outline = (src.outline && src.outline.outline) || (src.pins && src.pins.outline) || null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    function ext(x, y) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    parts.forEach(function (p) { p.pins.forEach(function (q) { ext(q.x, q.y); }); });
    if (!outline) {
      var m = 60;
      outline = [[x0 - m, y0 - m], [x1 + m, y0 - m], [x1 + m, y1 + m], [x0 - m, y1 + m], [x0 - m, y0 - m]];
      warnings.push('Контур платы не найден — нарисован прямоугольник по габаритам пинов. Добавьте Gerber контура (GKO/GM1), если нужен точный.');
    } else {
      var ox0 = Infinity, oy0 = Infinity, ox1 = -Infinity, oy1 = -Infinity, out = 0, tot = 0;
      outline.forEach(function (q) { ox0 = Math.min(ox0, q[0]); oy0 = Math.min(oy0, q[1]); ox1 = Math.max(ox1, q[0]); oy1 = Math.max(oy1, q[1]); });
      parts.forEach(function (p) { p.pins.forEach(function (q) { tot++; if (q.x < ox0 - 20 || q.x > ox1 + 20 || q.y < oy0 - 20 || q.y > oy1 + 20) out++; }); });
      if (out > tot * 0.2) warnings.push(out + ' из ' + tot + ' пинов лежат вне контура — похоже, у контура и пинов разное начало координат или единицы.');
    }
    outline.forEach(function (q) { ext(q[0], q[1]); });
    // shift so everything is positive, integer mils
    var dx = -x0 + 10, dy = -y0 + 10;
    parts.forEach(function (p) { p.pins.forEach(function (q) { q.x += dx; q.y += dy; }); });
    outline = outline.map(function (q) { return [q[0] + dx, q[1] + dy]; });
    var nets = {};
    parts.forEach(function (p) { p.pins.forEach(function (q) { nets[q.net] = 1; }); });
    return { parts: parts, outline: outline, warnings: warnings, w: x1 - x0 + 20, h: y1 - y0 + 20,
             nPins: parts.reduce(function (s, p) { return s + p.pins.length; }, 0),
             nNets: Object.keys(nets).filter(function (n) { return n !== 'UNCONNECTED'; }).length };
  }
  function natCmp(a, b) {
    var re = /(\d+)|(\D+)/g, A = String(a).match(re) || [], B = String(b).match(re) || [];
    for (var i = 0; i < Math.min(A.length, B.length); i++) {
      var x = A[i], y = B[i];
      if (/^\d/.test(x) && /^\d/.test(y)) { if (+x !== +y) return +x - +y; }
      else if (x !== y) return x < y ? -1 : 1;
    }
    return A.length - B.length;
  }


  /* ---------- BOM (values only) ---------- */
  function parseBom(text) {
    var lines = text.split(/\r?\n/), hi = -1;
    for (var i = 0; i < lines.length; i++) if (/designator/i.test(lines[i])) { hi = i; break; }
    if (hi < 0) throw new Error('В BOM не найдена колонка Designator');
    var sep = lines[hi].indexOf(',') >= 0 ? ',' : (lines[hi].indexOf(';') >= 0 ? ';' : (lines[hi].indexOf('\t') >= 0 ? '\t' : ','));
    function split(l) { return sep === ',' ? splitRow(l, ',') : l.split(sep).map(function (x) { return x.replace(/^"|"$/g, '').trim(); }); }
    var H = split(lines[hi]).map(function (h) { return h.toLowerCase(); });
    function col(re) { for (var k = 0; k < H.length; k++) if (re.test(H[k])) return k; return -1; }
    var cD = col(/designator/), cC = col(/^comment$|^value$/); if (cC < 0) cC = col(/comment|value/);
    var cF = col(/footprint|pattern|package/), cDe = col(/description/);
    var comps = [];
    for (var j = hi + 1; j < lines.length; j++) {
      if (!lines[j].trim()) continue;
      var r = split(lines[j]); if (!r[cD]) continue;
      r[cD].split(/[,;\s]+/).forEach(function (ref) {
        ref = cleanRef(ref); if (!ref) return;
        comps.push({ ref: ref, value: cC >= 0 ? r[cC] || '' : '', footprint: cF >= 0 ? r[cF] || '' : '', desc: cDe >= 0 ? r[cDe] || '' : '' });
      });
    }
    return { comps: comps, info: comps.length + ' позиций с номиналами' };
  }
  /* Merge value/footprint/description into parts (in place). Returns number of parts updated. */
  function applyMeta(parts, comps) {
    var by = {}; comps.forEach(function (c) { by[c.ref.toUpperCase()] = c; });
    var n = 0;
    parts.forEach(function (p) {
      var c = by[String(p.ref).toUpperCase()]; if (!c) return;
      if (c.value) p.value = c.value; if (c.footprint) p.footprint = c.footprint; if (c.desc) p.desc = c.desc;
      n++;
    });
    return n;
  }

  /* ---------- readers for finished boardview files ---------- */
  function finalize(parts, outline) {
    parts = parts.filter(function (p) { return p.pins.length; });
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    function ext(x, y) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    parts.forEach(function (p) { p.pins.forEach(function (q) { ext(q.x, q.y); }); });
    if (!outline || outline.length < 3) {
      var m = 60; outline = [[x0 - m, y0 - m], [x1 + m, y0 - m], [x1 + m, y1 + m], [x0 - m, y1 + m], [x0 - m, y0 - m]];
    }
    outline.forEach(function (q) { ext(q[0], q[1]); });
    // estimate pin size where the file has none: half the closest pin spacing inside the part
    parts.forEach(function (p) {
      var need = p.pins.some(function (q) { return !isFinite(q.r); });
      if (!need) return;
      var dmin = Infinity;
      for (var i = 0; i < p.pins.length && i < 200; i++) for (var j = i + 1; j < p.pins.length && j < 200; j++) {
        var d = Math.hypot(p.pins[i].x - p.pins[j].x, p.pins[i].y - p.pins[j].y); if (d > 0.5 && d < dmin) dmin = d;
      }
      var r = isFinite(dmin) ? Math.max(4, Math.min(45, dmin * 0.38)) : 18;
      p.pins.forEach(function (q) { if (!isFinite(q.r)) q.r = r; });
    });
    var nets = {};
    parts.forEach(function (p) { p.value = p.value || ''; p.footprint = p.footprint || ''; p.desc = p.desc || '';
      p.pins.forEach(function (q) { nets[q.net] = 1; }); });
    return { parts: parts, outline: outline, x0: x0, y0: y0, w: x1 - x0, h: y1 - y0,
             nPins: parts.reduce(function (s, p) { return s + p.pins.length; }, 0),
             nNets: Object.keys(nets).filter(function (n) { return n !== 'UNCONNECTED'; }).length };
  }
  function decodeBrdIfNeeded(text) {
    if (text.charCodeAt(0) !== 0x23 || text.charCodeAt(1) !== 0xe2) return text;
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var x = text.charCodeAt(i);
      if (x === 13 || x === 10 || !x) { out += text[i]; continue; }
      out += String.fromCharCode((~(((x >> 6) & 3) | (x << 2))) & 255);
    }
    return out;
  }
  function readBrd(text) {
    text = decodeBrdIfNeeded(text);
    var blk = 0, parts = [], pins = [], nails = [], outline = [];
    var H = { 'str_length:': 1, 'var_data:': 2, 'format:': 3, 'parts:': 4, 'pins1:': 4, 'pins:': 5, 'pins2:': 5, 'nails:': 6 };
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim(); if (!l) continue;
      var hk = H[l.toLowerCase()]; if (hk) { blk = hk; continue; }
      var t = l.split(/\s+/);
      if (blk === 3 && t.length >= 2) outline.push([+t[0], +t[1]]);
      else if (blk === 4 && t.length >= 3) {
        var ty = parseInt(t[1], 10);
        parts.push({ ref: t[0], bottom: ty === 2 || ty >= 8, smd: !!(ty & 0xc), end: parseInt(t[2], 10), pins: [] });
      } else if (blk === 5 && t.length >= 4) pins.push({ x: +t[0], y: +t[1], probe: +t[2], part: parseInt(t[3], 10), net: t.slice(4).join('_') });
      else if (blk === 6 && t.length >= 4) nails.push({ probe: +t[0], net: t.slice(4).join('_') });
    }
    if (!parts.length || !pins.length) throw new Error('В .brd не нашлось деталей или пинов');
    var byProbe = {}; nails.forEach(function (n) { if (n.net) byProbe[n.probe] = n.net; });
    var counters = {};
    pins.forEach(function (q) {
      var p = parts[q.part - 1]; if (!p) return;
      var net = q.net || byProbe[q.probe] || 'UNCONNECTED';
      counters[q.part] = (counters[q.part] || 0) + 1;
      p.pins.push({ x: q.x, y: q.y, net: net, name: String(counters[q.part]), r: NaN });
    });
    parts.forEach(function (p) { delete p.end; });
    return finalize(parts, outline);
  }
  function readBvr(text) {
    var parts = [], part = null, pin = null, outline = [];
    text.split(/\r?\n/).forEach(function (raw) {
      var l = raw.trim(); if (!l) return;
      var sp = l.indexOf(' '), key = sp < 0 ? l : l.slice(0, sp), val = sp < 0 ? '' : l.slice(sp + 1).trim();
      switch (key) {
        case 'PART_NAME': part = { ref: val, bottom: false, smd: true, pins: [] }; break;
        case 'PART_SIDE': if (part) part.bottom = val === 'B'; break;
        case 'PART_MOUNT': if (part) part.smd = val === 'SMD'; break;
        case 'PIN_ID': pin = { x: 0, y: 0, net: 'UNCONNECTED', name: '', r: NaN }; break;
        case 'PIN_NUMBER': case 'PIN_NAME': if (pin && !pin.name) pin.name = val; break;
        case 'PIN_ORIGIN': if (pin) { var t = val.split(/\s+/); pin.x = +t[0]; pin.y = +t[1]; } break;
        case 'PIN_RADIUS': if (pin) pin.r = +val; break;
        case 'PIN_NET': if (pin) pin.net = val || 'UNCONNECTED'; break;
        case 'PIN_END': if (part && pin) part.pins.push(pin); pin = null; break;
        case 'PART_END': if (part) parts.push(part); part = null; break;
        case 'OUTLINE_POINTS': var n = val.split(/\s+/).map(Number); for (var i = 0; i + 1 < n.length; i += 2) outline.push([n[i], n[i + 1]]); break;
      }
    });
    if (!parts.length) throw new Error('В .bvr не нашлось деталей');
    return finalize(parts, outline);
  }
  function readJson(text) {
    var d = JSON.parse(text);
    if (!d || !/^altium-boardview/.test(d.format || '')) throw new Error('Это не файл конвертера');
    var parts = d.parts.map(function (p) {
      return { ref: p.ref, bottom: p.side === 'B', smd: !!p.smd, value: p.value || '', footprint: p.footprint || '', desc: p.desc || '',
               pins: p.pins.map(function (q) { return { x: q[0], y: q[1], name: String(q[2]), net: q[3] || 'UNCONNECTED', r: q[4] == null ? NaN : q[4] }; }) };
    });
    var m = finalize(parts, d.outline); m.title = d.name || ''; return m;
  }
  function writeJson(b, name) {
    function r1(v) { return Math.round(v * 10) / 10; }
    return JSON.stringify({
      format: 'altium-boardview/1', name: name || '', units: 'mil',
      outline: b.outline.map(function (q) { return [r1(q[0]), r1(q[1])]; }),
      parts: b.parts.map(function (p) {
        return { ref: p.ref, side: p.bottom ? 'B' : 'T', smd: !!p.smd, value: p.value || '', footprint: p.footprint || '', desc: p.desc || '',
                 pins: p.pins.map(function (q) { return [r1(q.x), r1(q.y), q.name, q.net, isFinite(q.r) ? r1(q.r) : null]; }) };
      })
    });
  }

  /* ---------- unzip (stored + deflate) ---------- */
  function unzip(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) return Promise.reject(new Error('Повреждённый .zip'));
    var n = dv.getUint16(eocd + 10, true), off = dv.getUint32(eocd + 16, true), jobs = [];
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      var method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true);
      var nlen = dv.getUint16(off + 28, true), elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
      var lho = dv.getUint32(off + 42, true);
      var name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nlen));
      var dataStart = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      var data = u8.subarray(dataStart, dataStart + csize);
      jobs.push((function (name, method, data) {
        if (method === 0) return Promise.resolve({ name: name, data: data });
        if (method === 8 && typeof DecompressionStream !== 'undefined') {
          var ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          return new Response(ds).arrayBuffer().then(function (b) { return { name: name, data: new Uint8Array(b) }; });
        }
        return Promise.resolve({ name: name, data: null });
      })(name, method, data));
      off += 46 + nlen + elen + clen;
    }
    return Promise.all(jobs);
  }

  /* ---------- native Altium .PcbDoc (needs PCBDOC from pcbdoc.js) ---------- */
  function parsePcbDoc(u8) {
    var P = typeof PCBDOC !== 'undefined' ? PCBDOC : require('./pcbdoc.js');
    var r = P.parse(u8);
    return { parts: r.parts, outline: r.board ? asciiOutline(r.board) : null, info: r.info };
  }

  /* ---------- writers ---------- */
  function R(v) { return Math.round(v); }
  function safe(s, d) { s = String(s || '').replace(/\s+/g, '_'); return s || d; }
  function writeBrd(b) {
    // Nets are numbered; each pin's probe field points at its net, and one nail per net carries the name
    // (the layout found in laptop .brd files; some viewers read net names only from Nails).
    var netId = {}, nails = [], n = 0;
    b.parts.forEach(function (p) {
      p.pins.forEach(function (q) {
        var net = safe(q.net, 'UNCONNECTED');
        if (net === 'UNCONNECTED' || netId[net]) return;
        netId[net] = ++n;
        nails.push(n + ' ' + R(q.x) + ' ' + R(q.y) + ' ' + (p.bottom ? 2 : 1) + ' ' + net);
      });
    });
    var L = ['str_length:', '0', 'var_data:', b.outline.length + ' ' + b.parts.length + ' ' + b.nPins + ' ' + nails.length, 'Format:'];
    b.outline.forEach(function (q) { L.push(R(q[0]) + ' ' + R(q[1])); });
    L.push('Parts:');
    var end = 0;
    b.parts.forEach(function (p) {
      end += p.pins.length;
      var type = p.bottom ? (p.smd ? 10 : 2) : (p.smd ? 5 : 1);
      L.push(safe(p.ref, 'NOREF') + ' ' + type + ' ' + end);
    });
    L.push('Pins:');
    b.parts.forEach(function (p, i) {
      p.pins.forEach(function (q) {
        var net = safe(q.net, 'UNCONNECTED');
        L.push(R(q.x) + ' ' + R(q.y) + ' ' + (netId[net] || -99) + ' ' + (i + 1) + ' ' + net);
      });
    });
    L.push('Nails:');
    L = L.concat(nails);
    return L.join('\r\n') + '\r\n';
  }
  function writeBvr(b) {
    var L = ['BVRAW_FORMAT_3', ''];
    b.parts.forEach(function (p) {
      var side = p.bottom ? 'B' : 'T', ref = safe(p.ref, 'NOREF');
      L.push('PART_NAME ' + ref, '   PART_SIDE ' + side, '   PART_ORIGIN 0.000 0.000',
             '   PART_MOUNT ' + (p.smd ? 'SMD' : 'THT'), '');
      p.pins.forEach(function (q, k) {
        var nm = safe(q.name, String(k + 1));
        L.push('   PIN_ID ' + ref + '-' + nm, '      PIN_NUMBER ' + nm, '      PIN_NAME ' + nm,
               '      PIN_SIDE ' + side, '      PIN_ORIGIN ' + R(q.x) + ' ' + R(q.y),
               '      PIN_RADIUS ' + Math.max(4, R(isFinite(q.r) ? q.r : 12)),
               '      PIN_NET ' + safe(q.net, 'UNCONNECTED'), '      PIN_TYPE 2', '      PIN_COMMENT', '   PIN_END', '');
      });
      L.push('PART_END', '');
    });
    L.push('OUTLINE_POINTS ' + b.outline.map(function (q) { return R(q[0]) + ' ' + R(q[1]); }).join(' '));
    return L.join('\r\n') + '\r\n';
  }

  /* Validate a BRD text the way OpenBoardView's parser does. */
  function checkBrd(text) {
    var blk = 0, nf = 0, np = 0, npin = 0, nn = 0, c = { f: 0, p: 0, q: 0, n: 0 };
    var H = { 'str_length:': 1, 'var_data:': 2, 'Format:': 3, 'Parts:': 4, 'Pins:': 5, 'Nails:': 6 };
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim(); if (!l) continue;
      if (H[l]) { blk = H[l]; continue; }
      var t = l.split(/\s+/);
      if (blk === 2) { nf = +t[0]; np = +t[1]; npin = +t[2]; nn = +t[3] || 0; }
      else if (blk === 3) { if (c.f >= nf || t.length !== 2) return 'Format, строка ' + (i + 1); c.f++; }
      else if (blk === 4) { if (c.p >= np || t.length !== 3 || +t[2] > npin) return 'Parts, строка ' + (i + 1); c.p++; }
      else if (blk === 5) { if (c.q >= npin || t.length !== 5 || +t[3] > np) return 'Pins, строка ' + (i + 1); c.q++; }
      else if (blk === 6) { if (c.n >= nn || t.length !== 5) return 'Nails, строка ' + (i + 1); c.n++; }
    }
    if (c.f !== nf || c.p !== np || c.q !== npin || c.n !== nn) return 'счётчики не совпадают';
    return null;
  }

  /* ---------- tiny ZIP (store) ---------- */
  var CRC = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) { // [{name, text}]
    var enc = new TextEncoder(), chunks = [], central = [], off = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      var head = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      chunks.push(new Uint8Array(head), name, data);
      central.push([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off)), name);
      off += head.length + name.length + data.length;
    });
    var cdStart = off, cdLen = 0;
    central.forEach(function (c, i) { var h = i % 2 === 0 ? new Uint8Array(c) : c; chunks.push(h); cdLen += h.length; });
    chunks.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdLen), u32(cdStart), u16(0))));
    var total = chunks.reduce(function (s, c) { return s + c.length; }, 0), out = new Uint8Array(total), p = 0;
    chunks.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  }

  return { detect: detect, parseAscii: parseAscii, parseIpc356: parseIpc356, parsePnp: parsePnp, parseGerber: parseGerber,
           parseBom: parseBom, applyMeta: applyMeta, readBrd: readBrd, readBvr: readBvr, readJson: readJson, writeJson: writeJson,
           unzip: unzip, finalize: finalize, build: build, asciiOutline: asciiOutline, parsePcbDoc: parsePcbDoc, writeBrd: writeBrd, writeBvr: writeBvr, checkBrd: checkBrd, zip: zip, crc32: crc32, chain: chain };
})();
if (typeof module !== 'undefined') module.exports = BV;
