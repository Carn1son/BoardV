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
  function v3(v) { return /R/.test(v) ? parseFloat(v.replace('R', '.')) : +v.slice(0, 2) * Math.pow(10, +v.charAt(2)); } // "160" -> 16 V, "500" -> 50 V, "6R3"
  function dz(d) { return d.replace(/NPO|NP0|COG|CG/, 'C0G'); }
  function tolOf(letters, code) { var t = TOL[letters.slice(-1)]; return t && t <= 5 ? t : code.length === 4 ? 1 : 5; }
  var TANT = { A: '1206', B: '1210', C: '2312', D: '2917', E: '2917', R: '0805', P: '0805', S: '1206', T: '1210', U: '2312', V: '2924', W: '2924', X: '2917', Y: '2917', H: '1206' };
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
    [/^([PAJLETGUHQS])[MV]K(042|063|105|107|212|316|325|432)([A-Z0-9]{2})([0-9R]{3})([A-Z])/, function (m) {
      var V = { P: 2.5, A: 4, J: 6.3, L: 10, E: 16, T: 25, G: 35, U: 50, H: 100, Q: 250, S: 630 }, D = { B7: 'X7R', BJ: 'X5R', C6: 'X6S', C7: 'X7S', CG: 'C0G', F: 'Y5V' };
      return C({ mfr: 'Taiyo Yuden', volt: V[m[1]], size: TY_SIZE[m[2]], diel: D[m[3]], val: cap3(m[4]), tol: TOL[m[5]] }); }],
    // ---- tantalum (case letter instead of size)
    [/^T(?:AJ|PS|CJ|LJ|AC|RJ)([A-EHPRSTUVWXY])(\d{3})([JKM])(\d{3}|\dR\d)/, function (m) { // AVX TAJA106K016RNJ
      return C({ mfr: 'AVX tantalum', size: TANT[m[1]], val: cap3(m[2]), tol: TOL[m[3]], volt: /R/.test(m[4]) ? parseFloat(m[4].replace('R', '.')) : +m[4], diel: 'Ta' }); }],
    [/^T49[1-9]([A-EX])(\d{3})([JKM])(\d{3}|\dR\d)/, function (m) { // KEMET T491A106K016AT
      return C({ mfr: 'KEMET tantalum', size: TANT[m[1]], val: cap3(m[2]), tol: TOL[m[3]], volt: /R/.test(m[4]) ? parseFloat(m[4].replace('R', '.')) : +m[4], diel: 'Ta' }); }],
    // ---- more ceramic capacitors
    [/^TCC(0201|0402|0603|0805|1206|1210|1812)(X7R|X5R|COG|C0G|NPO|NP0|Y5V|X6S|X7S)([0-9R]{3})([A-Z])(\d{3}|\dR\d)/, function (m) { // CCTC TCC0603X7R104K500CT
      return C({ mfr: 'CCTC', size: m[1], diel: dz(m[2]), val: cap3(m[3]), tol: TOL[m[4]], volt: v3(m[5]) }); }],
    [/^CM(03|05|105|21|316|32)(X7R|X5R|X7S|X6S|CG|C0G|SL)([0-9R]{3})([A-Z])(\d{2})A/, function (m) { // Kyocera CM105X5R105K10AT
      var S = { '03': '0201', '05': '0402', '105': '0603', '21': '0805', '316': '1206', '32': '1210' };
      return C({ mfr: 'Kyocera', size: S[m[1]], diel: dz(m[2]), val: cap3(m[3]), tol: TOL[m[4]], volt: m[5] === '06' ? 6.3 : m[5] === '04' ? 4 : +m[5] }); }],
    [/^VJ(0201|0402|0603|0805|1206|1210|1812)([A-Z])([0-9R]{3})([A-Z])/, function (m) { // Vishay VJ0402Y104KXJCW1BC
      return C({ mfr: 'Vishay', size: m[1], diel: { A: 'C0G', Y: 'X7R', G: 'X5R', V: 'Y5V' }[m[2]], val: cap3(m[3]), tol: TOL[m[4]] }); }],
    [/^CGJ(\d)[A-Z]\d(X7R|X5R|C0G|X7S|X6S|X7T|X8R|NP0)(\d[A-Z])([0-9R]{3})([A-Z])/, function (m) { // TDK CGJ
      var S = { 1: '0201', 2: '0402', 3: '0603', 4: '0805', 5: '1206', 6: '1210' };
      return C({ mfr: 'TDK', size: S[m[1]], diel: dz(m[2]), volt: V2[m[3]], val: cap3(m[4]), tol: TOL[m[5]] }); }],
    // ---- chip resistors
    [/^(?:RC|RT|RL|AC|AF|AR|RE|PA|PT|SR|RV)(0075|01005|0100|0201|0402|0603|0805|1206|1210|1218|2010|2512)([A-Z])[RBEKL][A-Z]?-?\d{2}([0-9RKML.]+?)L?$/, function (m) { // Yageo RC0402FR-0710KL, RT, RL, AC, AF…
      return R({ mfr: 'Yageo', size: m[1], tol: TOL[m[2]], val: res(m[3].replace('.', 'R')) }); }],
    [/^(?:CRCW|CRCE|TNPW|TNPU|RCG|RCS|RCV|RCA|RCC|MCT|MCS|MCU|CRMA|PHP|PAT|PNM)(0201|0402|0603|0805|1206|1210|2010|2512|1020|0612|1218)([0-9RKML]{3,5})([A-Z])/, function (m) { // Vishay CRCW040210K0FKED, TNPW, RCG, RCS…
      return R({ mfr: 'Vishay', size: m[1], val: res(m[2]), tol: TOL[m[3]] }); }],
    [/^ER[JA]-?(P03|P06|P08|P14|PA2|PA3|PB3|PB6|PM8|U01|U02|U03|U06|U08|UP3|UP6|UP8|H2|H3|L03|L06|L08)([A-Z]{0,4}?)(\d{3,4}|\dR\d{1,2}|R\d{2,3})[A-Z]?$/, function (m) { // ERJ-PA3F1002V, ERJ-U06J103V
      var S = { P03: '0603', P06: '0805', P08: '1206', P14: '1210', PA2: '0402', PA3: '0603', PB3: '0603', PB6: '0805', PM8: '1206', U01: '0201', U02: '0402', U03: '0603', U06: '0805', U08: '1206', UP3: '0603', UP6: '0805', UP8: '1206', H2: '0402', H3: '0603', L03: '0603', L06: '0805', L08: '1206' };
      return R({ mfr: 'Panasonic', size: S[m[1]], tol: tolOf(m[2], m[3]), val: res(m[3]) }); }],
    [/^ER[JA]-?([1-8XZ])([A-Z0-9]?[A-Z]{1,3})(\d{3,4}|\dR\d{1,2}|R\d{2,3})[A-Z]?$/, function (m) { // ERJ-3GEYJ103V, ERJ-2RKF1002X, ERA-3AEB103V
      var S = { 1: '0201', 2: '0402', 3: '0603', 6: '0805', 8: '1206', 14: '1210', X: '01005', Z: '0201' };
      return R({ mfr: 'Panasonic', size: S[m[1]], tol: tolOf(m[2], m[3]), val: res(m[3]) }); }],
    [/^(0075|0100|01005|0201|0402|0603|0805|1206|1210|1812|2010|2512)(?:W[A-Z0-9]|S[A-Z0-9])([FJDBG])(\d{4}|[0-9RKM]{4})T[0-9A-Z]{1,2}E?/, function (m) { // UNI-ROYAL 0402WGF1002TCE, 0603SAF1002T5E
      var c = m[3]; return R({ mfr: 'Uni-Royal', size: m[1], tol: TOL[m[2]], val: m[2] !== 'F' && m[2] !== 'D' && m[2] !== 'B' && /^0\d{3}$/.test(c) ? res(c.slice(1)) : res(c) }); }],
    [/^RC(0603|1005|1608|2012|3216|3225|5025|6432)([FJDB])([0-9RKM]{3,4})/, function (m) { // Samsung RC1005F103CS
      return R({ mfr: 'Samsung', size: METRIC[m[1]] || { '5025': '2010' }[m[1]], tol: TOL[m[2]], val: res(m[3]) }); }],
    [/^CR-?(01|02|03|05|06|10|0A|12)([BCDFJ])([LEPH])([0-9A-F])-*([0-9RKM]+)$/, function (m) { // Viking CR-05FL7---4K7
      var S = { '01': '0201', '02': '0402', '03': '0603', '05': '0805', '06': '1206', '10': '1210', '0A': '2010', '12': '2512' };
      return R({ mfr: 'Viking', size: S[m[1]], tol: TOL[m[2]], val: res(m[5]) }); }],
    [/^(?:AR|ARG|PR|CS|CSR|AS|PU|HR|TR)-?(01|02|03|05|06|10|0A|12)([BCDFJ])([A-Z]{1,2}|[A-Z]\d)-*([0-9RKM]{3,6})$/, function (m) { // Viking AR03FTC1002, ARG03BTC1002, CS-06…
      var S = { '01': '0201', '02': '0402', '03': '0603', '05': '0805', '06': '1206', '10': '1210', '0A': '2010', '12': '2512' };
      return R({ mfr: 'Viking', size: S[m[1]], tol: TOL[m[2]], val: res(m[4]) }); }],
    [/^CR(0201|0402|0603|0805|1206|1210|2010|2512)-?([FJD])[XWV]-?([0-9RKM]{3,4})/, function (m) { // Bourns CR0402-FX-1002GLF
      return R({ mfr: 'Bourns', size: m[1], tol: TOL[m[2]], val: res(m[3]) }); }],
    [/^R[KN]73[HBGZ](1F|1H|1E|1J|2A|2B|2E|2H|3A|W2A|W2B|W3A)[A-Z]{1,4}?([0-9RKM]{3,4})([BCDFJG])/, function (m) { // KOA RK73H1ETTP1002F, RN73
      var S = { '1F': '01005', '1H': '0201', '1E': '0402', '1J': '0603', '2A': '0805', '2B': '1206', '2E': '1210', '2H': '2010', '3A': '2512', W2A: '0805', W2B: '1206', W3A: '2512' };
      return R({ mfr: 'KOA', size: S[m[1]], val: res(m[2]), tol: TOL[m[3]] }); }],
    [/^(?:MCR|ESR|KTR|SFR|SDR|UCR|LTR|PMR|MCT)(004|006|01|03|10|18|25|50|100)[A-Z]{2,3}([FJDGB])X?(\d{3,4}|[0-9RKML]{3,5})$/, function (m) { // ROHM MCR03EZPFX1002, ESR03EZPJ103
      var S = { '004': '01005', '006': '0201', '01': '0402', '03': '0603', '10': '0805', '18': '1206', '25': '2010', '50': '2512', '100': '2512' };
      return R({ mfr: 'ROHM', size: S[m[1]], tol: TOL[m[2]], val: res(m[3]) }); }],
    [/^RS-?(03|05|06|10|12|20|25)[A-Z](\d{3,4}|[0-9R]{3,4})([FJDB])T/, function (m) { // Fenghua RS-05K1002FT
      var S = { '03': '0201', '05': '0402', '06': '0603', '10': '0805', '12': '1206', '20': '2010', '25': '2512' };
      return R({ mfr: 'Fenghua', size: S[m[1]], val: res(m[2]), tol: TOL[m[3]] }); }],
    [/^W[RFA](01|02|04|06|08|10|12|20|25)[A-Z](\d{3,4}|[0-9RKM]{3,4}|000)([FJDBP])T/, function (m) { // Walsin WR04X1002FTL, WR06X103JTL
      var S = { '01': '01005', '02': '0201', '04': '0402', '06': '0603', '08': '0805', '10': '1210', '12': '1206', '20': '2010', '25': '2512' };
      return R({ mfr: 'Walsin', size: S[m[1]], val: m[2] === '000' ? 0 : res(m[2]), tol: TOL[m[3]] }); }],
    [/^FRC(0201|0402|0603|0805|1206|1210|2010|2512)([FJDB])(\d{3,4}|[0-9RKM]{3,4})T/, function (m) { // FOJAN FRC0402F1002TS
      return R({ mfr: 'FOJAN', size: m[1], tol: TOL[m[2]], val: res(m[3]) }); }],
    [/^RTT(01|02|03|05|06|10|12|20|25)(\d{3,4}|[0-9R]{3,4})([FJDB])T/, function (m) { // RALEC RTT031002FTP
      var S = { '01': '0201', '02': '0402', '03': '0603', '05': '0805', '06': '1206', '10': '1210', '12': '2512', '20': '2010', '25': '2512' };
      return R({ mfr: 'RALEC', size: S[m[1]], val: res(m[2]), tol: TOL[m[3]] }); }],
    [/^RM(02|04|06|10|12|20|25)([FJDB])T[A-Z](\d{3,4}|[0-9R]{3,4})/, function (m) { // TA-I RM04FTN1002
      var S = { '02': '0201', '04': '0402', '06': '0603', '10': '0805', '12': '1206', '20': '2010', '25': '2512' };
      return R({ mfr: 'TA-I', size: S[m[1]], tol: TOL[m[2]], val: res(m[3]) }); }],
    [/^RMC[FPH](0201|0402|0603|0805|1206|1210|2010|2512)([FJGD])T([0-9RKML]{2,6})$/, function (m) { // Stackpole RMCF0402FT10K0
      return R({ mfr: 'Stackpole', size: m[1], tol: TOL[m[2]], val: res(m[3]) }); }],
    [/^RNC[PSF](0201|0402|0603|0805|1206|1210|2010|2512)([BCDFJ])T[A-Z]([0-9RKML]{2,6})$/, function (m) { // Stackpole RNCP0402FTD10K0
      return R({ mfr: 'Stackpole', size: m[1], tol: TOL[m[2]], val: res(m[3]) }); }],
    [/^R[RG](0306|0510|0816|1220|1608|1005|2012|3216)[A-Z]{1,2}-?([0-9RKM]{3,4})-?([BCDFJ])/, function (m) { // Susumu RR0510P-103-D, RG1608P-103-B-T5
      var S = { '0306': '0201', '0510': '0402', '0816': '0603', '1220': '0805' };
      return R({ mfr: 'Susumu', size: S[m[1]] || METRIC[m[1]], val: res(m[2]), tol: TOL[m[3]] }); }],
    [/^CRG(0201|0402|0603|0805|1206|1210|2010|2512)([FJ])([0-9RKML]{2,6})$/, function (m) { // TE CRG0402F10K
      return R({ mfr: 'TE', size: m[1], tol: TOL[m[2]], val: res(m[3]) }); }],
    [/^(?:CR|CQ)(0201|0402|0603|0805|1206)([FJ])([0-9RKM]{3,5})[A-Z]/, function (m) { // Ever Ohms and similar CR0603F10K0P05Z
      return R({ mfr: 'Ever Ohms', size: m[1], tol: TOL[m[2]], val: res(m[3]) }); }],
    // ---- last resort: size + dielectric + capacitance + tolerance + voltage anywhere in the code (many Chinese makers)
    [/(0201|0402|0603|0805|1206|1210|1812)(X7R|X5R|C0G|COG|NP0|NPO|Y5V|X6S|X7S)([0-9R]{3})([A-Z])(\d{3}|\dR\d)/, function (m) {
      return C({ mfr: '', size: m[1], diel: dz(m[2]), val: cap3(m[3]), tol: TOL[m[4]], volt: v3(m[5]) }); }]
  ];
  function decode(pn) {
    var s0 = String(pn || '').toUpperCase().replace(/\s+/g, '');
    // a few junk characters glued in front ("1P", "PN", "MPN:") are skipped
    for (var cut = 0; cut <= 4 && cut < s0.length - 6; cut++) {
      var s = s0.slice(cut);
      for (var i = 0; i < RULES.length; i++) {
        var m = RULES[i][0].exec(s); if (!m) continue;
        var o = RULES[i][1](m); if (o && isFinite(o.val) && o.val >= 0) { o.pn = s; return o; }
      }
    }
    return null;
  }

  // ---- BOM side: "100nF 16V", "0.1uF", "4u7", "100 нФ 50В X7R", "10k 1%", "4K7", "100R", "10 кОм", footprint "C0402"
  var PFX = { p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, m: 1e-3, 'п': 1e-12, 'н': 1e-9, 'мк': 1e-6, 'м': 1e-3 };
  function num(t) { return parseFloat(String(t).replace(',', '.')); }
  function fromBom(text, refPrefix) {
    var t = ' ' + String(text || '') + ' ', o = {}, m;
    t = t.replace(/(^|[^\d.,])(\d{1,3})[  ](\d{3})(?=\s*(?:мк|[pnuµμmпнм])\s*[FФ])/gi, '$1$2$3') // 1 000 мкФ
         .replace(/([FФ])\s*[xXхХ*×]\s*(?=\d)/g, '$1 ')                                              // 10uFx16V
         .replace(/(^|[^\d])[.,](\d)/g, function (a, b, c) { return b + '0.' + c; });              // .1uF
    var size = /(?:^|[^0-9])(01005|0201|0402|0603|0805|1206|1210|1812|2010|2220|2512)(?![0-9])/.exec(t); if (size) o.size = size[1];
    var ipc = /(?:CAP|RES)[CM]?(0603|1005|1608|2012|3216|3225|4532|5750|6432)/i.exec(t); if (ipc) o.size = METRIC[ipc[1]]; // IPC-7351 names: CAPC1005X55N
    var d = /\b(X7R|X5R|X7S|X6S|X7T|X8R|C0G|NP0|NPO|COG|Y5V|Z5U)\b/i.exec(t); if (d) o.diel = d[1].toUpperCase().replace(/NP0|NPO|COG/, 'C0G');
    var v = /(?:^|[^0-9.,])(\d+(?:[.,]\d+)?)\s*(?:V|В|VDC)(?![A-Za-zА-Яа-я])/i.exec(t); if (v) o.volt = num(v[1]);
    var tol = /(?:±|\+\/-)?\s*(\d+(?:[.,]\d+)?)\s*%/.exec(t); if (tol) o.tol = num(tol[1]);
    // capacitance: 100nF, 0.1uF, 100 нФ, 4u7, 4n7 (also without F when the line is a capacitor)
    var cf = /(?:^|[^0-9A-Za-z.,])(\d+(?:[.,]\d+)?)\s*(мк|[pnuµμmпнм])\s*(?:F|Ф)(?![A-Za-zА-Яа-я])/i.exec(t)
          || /(?:^|[^0-9A-Za-z.,])(\d+)(мк|[pnuµμпн])(\d+)(?:F|Ф)?(?![A-Za-zА-Яа-я0-9])/i.exec(t)
          || (refPrefix !== 'R' ? /(?:^|[^0-9A-Za-z.,])(\d+(?:[.,]\d+)?)\s*(мк|[pnuµμпн])(?![A-Za-zА-Яа-я0-9])/i.exec(t) : null);
    if (!cf && refPrefix === 'C') { // a bare number on a capacitor line
      var bare = /^\s*(\d+(?:[.,]\d+)?)\s*([FФ])?(?=\s|$|\/)/.exec(t);
      if (bare && /^(?:01005|0201|0402|0603|0805|1206|1210|1812|2010|2220|2512)$/.test(bare[1])) bare = null; // that is the package
      if (bare) {
        o.kind = 'C';
        if (bare[2]) o.val = num(bare[1]);                                                   // 1F supercap
        else if (/^\d{3}$/.test(bare[1]) && !/0$/.test(bare[1])) o.val = cap3(bare[1]);     // EIA code: 104 = 100 nF
        else if (/[.,]/.test(bare[1])) o.val = num(bare[1]) * 1e-6;                          // ГОСТ: 0,1 = 0,1 мкФ
        else o.val = num(bare[1]) * 1e-12;                                                   // ГОСТ: 100 = 100 пФ
      }
    }
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
  var DR = { C0G: 9, U2J: 6, X8R: 5, X8L: 5, X7R: 4, X7S: 3, X7T: 3, X7U: 2, X6S: 3, X5R: 2, Y5V: 1, Z5U: 1, Ta: 0 };
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
    var v = o.val, u, units = o.kind === 'C' ? [[1, 'Ф'], [1e-6, 'мкФ'], [1e-9, 'нФ'], [1e-12, 'пФ']] : [[1e6, 'МОм'], [1e3, 'кОм'], [1, 'Ом']];
    for (var i = 0; i < units.length; i++) if (v >= units[i][0] * 0.999 || i === units.length - 1) { u = units[i]; break; }
    var n = v / u[0]; n = Math.round(n * 100) / 100;
    return [String(n).replace('.', DS()) + '\u00a0' + u[1], o.volt ? String(o.volt).replace('.', DS()) + '\u00a0' + V() : '', o.size || '', o.diel || '', o.tol ? '±' + String(o.tol).replace('.', DS()) + '%' : ''].filter(Boolean).join(' · ');
  }
  // label text without a known part number: "RES 10K OHM 1% 0402", "CAP CER 100NF 16V X7R 0402", "Резистор 10 кОм"
  function fromLabel(text) {
    var t = String(text || '').replace(/[\x00-\x1f]+/g, ' ');
    var r = /\b(?:RES|RESISTOR|OHMS?)\b|Ω|Ом|резист/i.test(t), c = /\b(?:CAP|CAPACITOR|MLCC)\b|\d\s*(?:[pnuµμ]F|[пнм]к?Ф)\b|конденс/i.test(t);
    if (r === c) return null;
    var o = fromBom(t, r ? 'R' : 'C'); if (!o || o.kind !== (r ? 'R' : 'C')) return null;
    o.mfr = ''; o.pn = ''; return o;
  }
  return { decode: decode, fromBom: fromBom, fromLabel: fromLabel, match: match, fmt: fmtVal };
})();
if (typeof module !== 'undefined') module.exports = PARTS;
