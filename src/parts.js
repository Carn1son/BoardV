/* BoardV part numbers: what a capacitor or resistor really is.
   decode(mpn)   -> { kind: 'C'|'R', val, volt, size, diel, tol, mfr } from manufacturer part numbers
   fromBom(text) -> the same from a BOM line ("100nF 16V", "10k 1% 0402", "CAP_0402", "4u7", "100 нФ")
   match(a, b)   -> how well a scanned part fits a BOM line
   Sizes are imperial codes (0402, 0603…); capacitance in farads, resistance in ohms, voltage in volts. */
var PARTS = (function () {
  'use strict';
  var METRIC = { '0402': '01005', '0603': '0201', '1005': '0402', '1608': '0603', '2012': '0805', '3216': '1206', '3225': '1210', '4532': '1812', '5750': '2220', '6432': '2512' };
  var MURATA_SIZE = { '02': '01005', '03': '0201', '15': '0402', '18': '0603', '21': '0805', '31': '1206', '32': '1210', '43': '1812', '55': '2220' };
  var SAMSUNG_SIZE = { '02': '01005', '03': '0201', '05': '0402', '10': '0603', '21': '0805', '31': '1206', '32': '1210', '43': '1812', '55': '2220' };
  var TY_SIZE = { '042': '01005', '063': '0201', '105': '0402', '107': '0603', '212': '0805', '316': '1206', '325': '1210', '432': '1812' };
  // two-character voltage code used by Murata, TDK and others (EIA style)
  var V2 = { '0E': 2.5, '0G': 4, '0J': 6.3, '1A': 10, '1C': 16, '1E': 25, 'YA': 35, '1V': 35, '1H': 50, '1J': 63, '2A': 100, '2D': 200, '2E': 250, '2W': 450, '2H': 500, '2J': 630, '3A': 1000, '3D': 2000, '3F': 3150 };
  var MURATA_DIEL = { '5C': 'C0G', '6C': 'C0G', 'R6': 'X5R', 'R7': 'X7R', 'C7': 'X7S', 'C8': 'X6S', 'D7': 'X7T', 'E7': 'X7U', 'F5': 'Y5V', 'L8': 'X8L', 'R9': 'X8R', 'Z7': 'X7R', '7U': 'U2J' };
  var TOL = { A: 0.05, B: 0.1, C: 0.25, D: 0.5, F: 1, G: 2, J: 5, K: 10, M: 20, Z: 80 };
  function cap3(code) { // "104" -> 100 nF, "1R0" -> 1 pF, "R50" -> 0.5 pF
    if (/R/.test(code)) return parseFloat(code.replace('R', '.')) * 1e-12;
    var m = /^(\d\d)(\d)$/.exec(code); if (!m) return NaN;
    var e = +m[2]; if (e === 9) return +m[1] * 1e-13; if (e === 8) return +m[1] * 1e-14;
    return +m[1] * Math.pow(10, e) * 1e-12;
  }
  function res(code) { // "1002" -> 10k, "103" -> 10k, "10K0" / "4K7" / "100R" / "0R" -> ohms
    if (/^[0-9]*[RKM][0-9]*$/.test(code)) {
      var mul = /K/.test(code) ? 1e3 : /M/.test(code) ? 1e6 : 1, s = code.replace(/[RKM]/, '.');
      var v = parseFloat(s.charAt(0) === '.' ? '0' + s : s); return isNaN(v) ? NaN : v * mul;
    }
    var m = /^(\d{2,3})(\d)$/.exec(code); if (!m) return NaN;
    return +m[1] * Math.pow(10, +m[2]);
  }
  function C(o) { o.kind = 'C'; return o; }
  function R(o) { o.kind = 'R'; return o; }
  var RULES = [
    // ---- ceramic capacitors
    [/^(?:GRM|GCM|GRT|GJM|GCJ|GQM|GCQ|GMD|KRM|ZRB)(\d{2})[0-9A-Z]([0-9A-Z]{2})([0-9A-Z]{2})([0-9R]{3})([A-Z])/, function (m) {
      return C({ mfr: 'Murata', size: MURATA_SIZE[m[1]], diel: MURATA_DIEL[m[2]], volt: V2[m[3]], val: cap3(m[4]), tol: TOL[m[5]] }); }],
    [/^CL(\d{2})([A-Z])([0-9R]{3})([A-Z])([A-Z])/, function (m) {
      var D = { A: 'X5R', B: 'X7R', C: 'C0G', F: 'Y5V', X: 'X6S', Y: 'X7S', Z: 'X7T', E: 'Z5U' };
      var V = { R: 4, Q: 6.3, P: 10, O: 16, A: 25, L: 35, B: 50, C: 100, D: 200, E: 250, G: 500, H: 630, I: 1000, J: 2000 };
      return C({ mfr: 'Samsung', size: SAMSUNG_SIZE[m[1]], diel: D[m[2]], val: cap3(m[3]), tol: TOL[m[4]], volt: V[m[5]] }); }],
    [/^CC(0201|0402|0603|0805|1206|1210|1812)([A-Z])R(X7R|X5R|NPO|COG|C0G|Y5V|X7S|X6S)(\d)BB([0-9R]{3})/, function (m) {
      var V = { 4: 4, 5: 6.3, 6: 10, 7: 16, 8: 25, 9: 50, 0: 100, 1: 200, 2: 500 };
      return C({ mfr: 'Yageo', size: m[1], tol: TOL[m[2]], diel: m[3].replace(/NPO|COG/, 'C0G'), volt: V[m[4]], val: cap3(m[5]) }); }],
    [/^C(0402|0603|1005|1608|2012|3216|3225|4532|5750)(X7R|X5R|C0G|X7S|X6S|X7T|NP0|JB|CH|X8R|Y5V)(\d[A-Z])([0-9R]{3})([A-Z])/, function (m) {
      return C({ mfr: 'TDK', size: METRIC[m[1]], diel: m[2].replace('NP0', 'C0G'), volt: V2[m[3]], val: cap3(m[4]), tol: TOL[m[5]] }); }],
    [/^CGA(\d)[A-Z]\d(X7R|X5R|C0G|X7S|X6S|X7T|X8R|NP0)(\d[A-Z])([0-9R]{3})([A-Z])/, function (m) {
      var S = { 1: '0201', 2: '0402', 3: '0603', 4: '0805', 5: '1206', 6: '1210', 8: '1812', 9: '2220' };
      return C({ mfr: 'TDK', size: S[m[1]], diel: m[2].replace('NP0', 'C0G'), volt: V2[m[3]], val: cap3(m[4]), tol: TOL[m[5]] }); }],
    [/^C(0201|0402|0603|0805|1206|1210|1812|2220)C([0-9R]{3})([A-Z])([0-9A-Z])([A-Z])/, function (m) {
      var V = { 9: 6.3, 8: 10, 4: 16, 3: 25, 6: 35, 5: 50, 1: 100, 2: 200, A: 250 }, D = { R: 'X7R', P: 'X5R', G: 'C0G', U: 'Z5U', V: 'Y5V', Q: 'X7S' };
      return C({ mfr: 'KEMET', size: m[1], val: cap3(m[2]), tol: TOL[m[3]], volt: V[m[4]], diel: D[m[5]] }); }],
    [/^(0201|0402|0603|0805|1206|1210|1812|2220)([0-9A-Z])([A-Z])([0-9R]{3})([A-Z])AT/, function (m) {
      var V = { 4: 4, 6: 6.3, Z: 10, Y: 16, 3: 25, D: 35, 5: 50, 1: 100, 2: 200, 7: 500 }, D = { C: 'X7R', D: 'X5R', A: 'C0G', G: 'Y5V', Z: 'X7S', W: 'X6S' };
      return C({ mfr: 'AVX', size: m[1], volt: V[m[2]], diel: D[m[3]], val: cap3(m[4]), tol: TOL[m[5]] }); }],
    [/^(?:[A-Z])?(0201|0402|0603|0805|1206|1210|1812)(B|X|CG|F|N)([0-9R]{3})([A-Z])(\d{3}|\dR\d)[A-Z]{2}/, function (m) { // Fenghua, Walsin, many Chinese makers: 0402B104K160NT
      var D = { B: 'X7R', X: 'X5R', CG: 'C0G', N: 'C0G', F: 'Y5V' }, v = m[5];
      return C({ mfr: 'Fenghua/Walsin', size: m[1], diel: D[m[2]], val: cap3(m[3]), tol: TOL[m[4]], volt: /R/.test(v) ? parseFloat(v.replace('R', '.')) : +v.slice(0, 2) * Math.pow(10, +v.charAt(2)) }); }],
    [/^([AJLETGUHQ])MK(042|063|105|107|212|316|325|432)([A-Z0-9]{2})([0-9R]{3})([A-Z])/, function (m) {
      var V = { A: 4, J: 6.3, L: 10, E: 16, T: 25, G: 35, U: 50, H: 100, Q: 250 }, D = { B7: 'X7R', BJ: 'X5R', C6: 'X6S', C7: 'X7S', CG: 'C0G', F: 'Y5V' };
      return C({ mfr: 'Taiyo Yuden', volt: V[m[1]], size: TY_SIZE[m[2]], diel: D[m[3]], val: cap3(m[4]), tol: TOL[m[5]] }); }],
    // ---- chip resistors
    [/^RC(0201|0402|0603|0805|1206|1210|2010|2512)([A-Z])R-?\d{2}([0-9RKM.]+?)L?$/, function (m) {
      return R({ mfr: 'Yageo', size: m[1], tol: TOL[m[2]], val: res(m[3].replace('.', 'R')) }); }],
    [/^CRCW(0201|0402|0603|0805|1206|1210|2010|2512)([0-9RKM]{3,5})([A-Z])/, function (m) {
      return R({ mfr: 'Vishay', size: m[1], val: res(m[2]), tol: TOL[m[3]] }); }],
    [/^ERJ-?(1G|2G|3G|6G|8G|1R|2R|3R|6R|8R|3E|6E|8E|2B|3B|6B|8B|U02|U03|U06|P03|P06|PA3)[A-Z]{1,3}?([FDGJ])(\d{3,4}|R\d{2}|\dR\d{1,2})[A-Z]?$/, function (m) {
      var S = { 1: '0201', 2: '0402', 3: '0603', 6: '0805', 8: '1206' }, d = (m[1].match(/\d/) || [''])[0];
      return R({ mfr: 'Panasonic', size: S[d], tol: TOL[m[2]], val: res(m[3]) }); }],
    [/^ERJ-?([1-8])[A-Z]{2,3}([FDGJ])?(\d{3,4})[A-Z]?$/, function (m) { // ERJ-3GEYJ103V, ERJ-2RKF1002X
      var S = { 1: '0201', 2: '0402', 3: '0603', 6: '0805', 8: '1206' };
      return R({ mfr: 'Panasonic', size: S[m[1]], tol: m[3].length === 4 ? 1 : 5, val: res(m[3]) }); }],
    [/^(0201|0402|0603|0805|1206|1210|2010|2512)W[A-Z0-9]([FJDB])(\d{4}|[0-9RKM]{4})T/, function (m) { // UNI-ROYAL 0402WGF1002TCE
      var c = m[3]; return R({ mfr: 'Uni-Royal', size: m[1], tol: TOL[m[2]], val: m[2] === 'J' && /^0\d{3}$/.test(c) ? res(c.slice(1)) : res(c) }); }],
    [/^RC(0603|1005|1608|2012|3216)([FJD])([0-9RKM]{3,4})/, function (m) {
      return R({ mfr: 'Samsung', size: METRIC[m[1]], tol: TOL[m[2]], val: res(m[3]) }); }],
    [/^CR(0201|0402|0603|0805|1206)-?([FJ])[XW]-?([0-9RKM]{3,4})/, function (m) {
      return R({ mfr: 'Bourns', size: m[1], tol: TOL[m[2]], val: res(m[3]) }); }],
    [/^RK73[HB](1H|1E|1J|2A|2B|2E|3A)[A-Z]{2,4}?([0-9RKM]{3,4})([FJDG])/, function (m) {
      var S = { '1H': '0201', '1E': '0402', '1J': '0603', '2A': '0805', '2B': '1206', '2E': '1210', '3A': '2512' };
      return R({ mfr: 'KOA', size: S[m[1]], val: res(m[2]), tol: TOL[m[3]] }); }],
    [/^(?:RT|RS|RM|AR|AC|AF)(0201|0402|0603|0805|1206)([A-Z])R-?\d{2}([0-9RKM.]+?)L?$/, function (m) { // Yageo RT/AC series
      return R({ mfr: 'Yageo', size: m[1], tol: TOL[m[2]], val: res(m[3].replace('.', 'R')) }); }]
  ];
  function decode(pn) {
    var s = String(pn || '').toUpperCase().replace(/\s+/g, '');
    for (var i = 0; i < RULES.length; i++) {
      var m = RULES[i][0].exec(s); if (!m) continue;
      var o = RULES[i][1](m); if (o && isFinite(o.val) && o.val >= 0) { o.pn = s; return o; }
    }
    return null;
  }

  // ---- BOM side: "100nF 16V", "0.1uF", "4u7", "100 нФ 50В X7R", "10k 1%", "4K7", "100R", "10 кОм", footprint "C0402"
  var PFX = { p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, m: 1e-3, 'п': 1e-12, 'н': 1e-9, 'мк': 1e-6, 'м': 1e-3 };
  function num(t) { return parseFloat(String(t).replace(',', '.')); }
  function fromBom(text, refPrefix) {
    var t = ' ' + String(text || '') + ' ', o = {}, m;
    var size = /(?:^|[^0-9])(01005|0201|0402|0603|0805|1206|1210|1812|2010|2220|2512)(?![0-9])/.exec(t); if (size) o.size = size[1];
    var ipc = /(?:CAP|RES)[CM]?(0603|1005|1608|2012|3216|3225|4532|5750|6432)/i.exec(t); if (ipc) o.size = METRIC[ipc[1]]; // IPC-7351 names: CAPC1005X55N
    var d = /\b(X7R|X5R|X7S|X6S|X7T|X8R|C0G|NP0|NPO|COG|Y5V|Z5U)\b/i.exec(t); if (d) o.diel = d[1].toUpperCase().replace(/NP0|NPO|COG/, 'C0G');
    var v = /(?:^|[^0-9.,])(\d+(?:[.,]\d+)?)\s*(?:V|В|VDC)(?![A-Za-zА-Яа-я])/i.exec(t); if (v) o.volt = num(v[1]);
    var tol = /(?:±|\+\/-)?\s*(\d+(?:[.,]\d+)?)\s*%/.exec(t); if (tol) o.tol = num(tol[1]);
    // capacitance: 100nF, 0.1uF, 100 нФ, 4u7, 4n7 (also without F when the line is a capacitor)
    var cf = /(?:^|[^0-9A-Za-z.,])(\d+(?:[.,]\d+)?)\s*(мк|[pnuµμmпнм])\s*(?:F|Ф)(?![A-Za-zА-Яа-я])/i.exec(t)
          || /(?:^|[^0-9A-Za-z.,])(\d+)(мк|[pnuµμпн])(\d+)(?:F|Ф)?(?![A-Za-zА-Яа-я0-9])/i.exec(t)
          || (refPrefix === 'C' ? /(?:^|[^0-9A-Za-z.,])(\d+(?:[.,]\d+)?)\s*(мк|[pnuµμпн])(?![A-Za-zА-Яа-я0-9])/i.exec(t) : null);
    if (cf) {
      var k = PFX[cf[2].toLowerCase()] || PFX[cf[2]];
      var val = cf.length > 3 && cf[3] !== undefined && /^\d+$/.test(cf[3] || '') ? num(cf[1] + '.' + cf[3]) : num(cf[1]);
      if (k && isFinite(val)) { o.kind = 'C'; o.val = val * k; }
    }
    if (!o.kind) { // resistance: 10k, 4K7, 100R, 0R, 1M, 10 кОм, 100 Ом, 10kΩ; a bare number only on an R line
      var u = t.replace(/(?:^|[^0-9])(?:01005|0201|0402|0603|0805|1206|1210|1812|2010|2220|2512)(?![0-9])/g, ' ')
               .replace(/\d+(?:[.,]\d+)?\s*%/g, ' ').replace(/\d+(?:[.,\/]\d+)?\s*(?:W|Вт|V|В|ppm)\b/gi, ' ');
      var r = /(?:^|[^0-9A-Za-z.,])(\d+)([RKMrkmкКМ])(\d+)(?![A-Za-zА-Яа-я0-9])/.exec(u), rv = NaN, mul = 1;
      if (r) { rv = num(r[1] + '.' + r[3]); mul = /[kKкК]/.test(r[2]) ? 1e3 : /[MМ]/.test(r[2]) ? 1e6 : 1; }
      else if ((r = /(?:^|[^0-9A-Za-z.,])(\d+(?:[.,]\d+)?)\s*(k|K|M|к|К|М|m?)\s*(Ω|ohms?|Ом|R)(?![A-Za-zА-Яа-я0-9])/i.exec(u))
            || (r = /(?:^|[^0-9A-Za-z.,])(\d+(?:[.,]\d+)?)\s*(k|K|M|к|К|М)()(?![A-Za-zА-Яа-я0-9])/.exec(u))
            || (refPrefix === 'R' && (r = /(?:^|[^0-9A-Za-z.,])(\d+(?:[.,]\d+)?)()()(?![A-Za-zА-Яа-я0-9.,])/.exec(u)))) {
        rv = num(r[1]); mul = /^[kKкК]$/.test(r[2]) ? 1e3 : /^[MМ]$/.test(r[2]) ? 1e6 : 1;
      }
      if (isFinite(rv) && (refPrefix === 'R' || refPrefix == null || r[0].match(/[a-zΩа-я]/i))) { o.kind = 'R'; o.val = rv * mul; }
    }
    return o.kind ? o : null;
  }

  // a better dielectric may replace a worse one: X7R instead of X5R is fine, the other way round is not
  var DR = { C0G: 9, U2J: 6, X8R: 5, X8L: 5, X7R: 4, X7S: 3, X7T: 3, X7U: 2, X6S: 3, X5R: 2, Y5V: 1, Z5U: 1 };
  function near(a, b) { return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 0.005; }
  // score: 0 = different part; otherwise how sure, plus what does not fit
  function match(part, bom) {
    if (!part || !bom || part.kind !== bom.kind || !near(part.val, bom.val)) return { score: 0 };
    var score = 10, warn = [];
    if (bom.size && part.size) { if (bom.size === part.size) score += 4; else { score -= 6; warn.push('корпус ' + part.size + ', а нужен ' + bom.size); } }
    if (bom.volt && part.volt) { if (part.volt >= bom.volt) score += 2; else { score -= 6; warn.push('напряжение ' + part.volt + '\u00a0' + V() + ', а нужно ' + bom.volt + '\u00a0' + V()); } }
    if (bom.diel && part.diel) { if (bom.diel === part.diel) score += 1; else if ((DR[part.diel] || 0) < (DR[bom.diel] || 0)) warn.push('диэлектрик ' + part.diel + ', а нужен ' + bom.diel); }
    if (bom.tol && part.tol && part.tol > bom.tol) warn.push('допуск ' + part.tol + '%, а нужен ' + bom.tol + '%');
    return { score: Math.max(1, score), warn: warn };
  }
  function DS() { return V() === 'V' ? '.' : ','; }
  function V() { return typeof I18N !== 'undefined' && I18N.get && I18N.get() === 'en' ? 'V' : 'В'; }
  function fmtVal(o) {
    if (!o) return '';
    var v = o.val, u, units = o.kind === 'C' ? [[1e-6, 'мкФ'], [1e-9, 'нФ'], [1e-12, 'пФ']] : [[1e6, 'МОм'], [1e3, 'кОм'], [1, 'Ом']];
    for (var i = 0; i < units.length; i++) if (v >= units[i][0] * 0.999 || i === units.length - 1) { u = units[i]; break; }
    var n = v / u[0]; n = Math.round(n * 100) / 100;
    return [String(n).replace('.', DS()) + '\u00a0' + u[1], o.volt ? String(o.volt).replace('.', DS()) + '\u00a0' + V() : '', o.size || '', o.diel || '', o.tol ? '±' + String(o.tol).replace('.', DS()) + '%' : ''].filter(Boolean).join(' · ');
  }
  return { decode: decode, fromBom: fromBom, match: match, fmt: fmtVal };
})();
if (typeof module !== 'undefined') module.exports = PARTS;
