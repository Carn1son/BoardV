/* BoardV 3D view: board, copper, silkscreen and component bodies with three.js.
   Embedded STEP models of an Altium board are tessellated by occt-import-js in a worker, the rest are drawn as boxes.
   Units in the scene: millimetres, board top at z = 0. Needs THREE; occt is optional (BV3D_OCCT_SRC + BV3D_OCCT_WASM). */
var BV3D = (function () {
  'use strict';
  var MIL = 0.0254, THICK = 1.6;

  /* ---------- STEP tessellation worker (shared, lives for the session) ---------- */
  var worker = null, jobs = {}, jobN = 0;
  function workerMain() {
    var occt = null, queue = [], ready = null;
    function inflate(u8) {
      return new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer().then(function (b) { return new Uint8Array(b); });
    }
    function run(m) {
      ready.then(function () { return m.zlib ? inflate(m.data) : m.data; }).then(function (step) {
        var r = occt.ReadStepFile(step, { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.002, angularDeflection: 0.5 });
        var out = [], tr = [];
        (r && r.meshes || []).forEach(function (me) {
          var p = new Float32Array(me.attributes.position.array), n = me.attributes.normal ? new Float32Array(me.attributes.normal.array) : null, ix = new Uint32Array(me.index.array);
          var fc = (me.brep_faces || []).filter(function (f) { return f.color; }).map(function (f) { return [f.first, f.last, f.color[0], f.color[1], f.color[2]]; });
          out.push({ p: p, n: n, i: ix, c: me.color || null, f: fc }); tr.push(p.buffer, ix.buffer); if (n) tr.push(n.buffer);
        });
        postMessage({ id: m.id, meshes: out }, tr);
      }).catch(function (e) { postMessage({ id: m.id, error: String(e && e.message || e) }); });
    }
    onmessage = function (e) {
      var m = e.data;
      if (m.wasm) { ready = occtimportjs({ wasmBinary: m.wasm }).then(function (o) { occt = o; }); return; }
      run(m);
    };
  }
  function getWorker() {
    if (worker) return worker;
    if (typeof BV3D_OCCT_SRC === 'undefined' || typeof BV3D_OCCT_WASM === 'undefined') return null;
    var url = URL.createObjectURL(new Blob([BV3D_OCCT_SRC + '\n;(' + workerMain.toString() + ')();'], { type: 'text/javascript' }));
    worker = new Worker(url);
    var bin = atob(BV3D_OCCT_WASM), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    worker.postMessage({ wasm: u8 }, [u8.buffer]);
    worker.onmessage = function (e) { var j = jobs[e.data.id]; delete jobs[e.data.id]; if (j) j(e.data); };
    return worker;
  }
  function tessellate(bytes) { // -> Promise of [{p, n, i, c}] in model millimetres
    return new Promise(function (res) {
      var w = getWorker(); if (!w) { res(null); return; }
      var id = ++jobN, copy = bytes.slice(); jobs[id] = function (d) { res(d.meshes || null); };
      w.postMessage({ id: id, data: copy, zlib: true }, [copy.buffer]);
    });
  }

  /* ---------- helpers ---------- */
  function altiumColor(v) { return ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255); } // Altium stores 0xBBGGRR
  function deg(a) { return (a || 0) * Math.PI / 180; }
  function partBox(p) { // pads bounding box in mm
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    p.pins.forEach(function (q) { var ex = (q.w ? Math.max(q.w, q.h) : 2 * q.r) / 2; x0 = Math.min(x0, q.x - ex); x1 = Math.max(x1, q.x + ex); y0 = Math.min(y0, q.y - ex); y1 = Math.max(y1, q.y + ex); });
    return [x0 * MIL, y0 * MIL, x1 * MIL, y1 * MIL];
  }

  function coreBox(p) { // a body that sits on the inner halves of its pads, so the copper still shows around it
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, m = Infinity;
    p.pins.forEach(function (q) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); m = Math.min(m, q.w ? Math.min(q.w, q.h) : 2 * q.r); });
    var e = (isFinite(m) ? m : 20) * 0.5, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = Math.max(8, (x1 - x0) / 2 + e * (x1 - x0 > 0 ? 0.3 : 1)), hh = Math.max(8, (y1 - y0) / 2 + e * (y1 - y0 > 0 ? 0.3 : 1));
    return [(cx - hw) * MIL, (cy - hh) * MIL, (cx + hw) * MIL, (cy + hh) * MIL];
  }
  /* ---------- the view ---------- */
  function open(host, M, opt) {
    opt = opt || {};
    var T = THREE, W = host.clientWidth || 300, H = host.clientHeight || 300, dpr = Math.min(2, window.devicePixelRatio || 1);
    var renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: !!opt.keep });
    renderer.setPixelRatio(dpr); renderer.setSize(W, H);
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = T.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    var scene = new T.Scene(); scene.background = new T.Color(opt.bg || '#15181a');
    var cam = new T.PerspectiveCamera(30, W / H, 0.1, 5000); cam.up.set(0, 0, 1);
    scene.add(new T.HemisphereLight(0xffffff, 0x404040, 1.1));
    var sun = new T.DirectionalLight(0xffffff, 1.6); sun.position.set(-60, -80, 120); scene.add(sun);
    var sun2 = new T.DirectionalLight(0xffffff, 0.6); sun2.position.set(80, 60, -120); scene.add(sun2);
    var root = new T.Group(); scene.add(root);

    // board slab
    var bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    M.outline.forEach(function (q) { bx0 = Math.min(bx0, q[0]); by0 = Math.min(by0, q[1]); bx1 = Math.max(bx1, q[0]); by1 = Math.max(by1, q[1]); });
    var shape = new T.Shape(); M.outline.forEach(function (q, i) { i ? shape.lineTo(q[0] * MIL, q[1] * MIL) : shape.moveTo(q[0] * MIL, q[1] * MIL); });
    var slab = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: false, curveSegments: 6 }),
      new T.MeshStandardMaterial({ color: opt.mask || 0x1d5236, roughness: 0.55, metalness: 0.05 }));
    slab.position.z = -THICK; root.add(slab);
    var cx = (bx0 + bx1) / 2 * MIL, cy = (by0 + by1) / 2 * MIL, span = Math.max(bx1 - bx0, by1 - by0) * MIL;

    // copper + silkscreen as two decals (one per side)
    function decal(bottom) {
      var mmW = (bx1 - bx0) * MIL, mmH = (by1 - by0) * MIL, max = Math.min(4096, renderer.capabilities.maxTextureSize || 4096);
      var k = Math.min(max / mmW, max / mmH, 60), cw = Math.ceil(mmW * k), ch = Math.ceil(mmH * k);
      var c = document.createElement('canvas'); c.width = cw; c.height = ch;
      var g = c.getContext('2d');
      function X(x) { return (x * MIL - bx0 * MIL) * k; } function Y(y) { return (by1 * MIL - y * MIL) * k; }
      g.fillStyle = opt.copper || '#d9b25a';
      M.parts.forEach(function (p) {
        if (!!p.bottom !== bottom && p.smd) return;
        p.pins.forEach(function (q) {
          g.save(); g.translate(X(q.x), Y(q.y)); g.rotate(-deg(q.rot));
          var w = (q.w || q.r * 2) * MIL * k, h = (q.h || q.r * 2) * MIL * k, r = q.sh === 'c' || q.sh === 'o' ? Math.min(w, h) / 2 : q.sh === 'rr' ? Math.min(w, h) / 2 * (q.cr == null ? 0.5 : q.cr) : q.sh ? 0 : Math.min(w, h) / 4;
          g.beginPath(); if (g.roundRect) g.roundRect(-w / 2, -h / 2, w, h, r); else g.rect(-w / 2, -h / 2, w, h); g.fill(); g.restore();
        });
      });
      g.fillStyle = '#f2f2ec'; g.textAlign = 'center'; g.textBaseline = 'middle';
      M.parts.forEach(function (p) {
        if (!!p.bottom !== bottom) return;
        var b = partBox(p), w = (b[2] - b[0]) * k, h = (b[3] - b[1]) * k, fs = Math.min(Math.max(w, h) / Math.max(3, p.ref.length) * 1.4, Math.min(w, h) * 0.5, 2.2 * k);
        if (fs < 6) return;
        g.save(); g.translate(X((b[0] + b[2]) / 2 / MIL), Y((b[1] + b[3]) / 2 / MIL)); if (h > w * 1.3) g.rotate(-Math.PI / 2);
        if (bottom) g.scale(-1, 1); // read the right way round from below
        g.font = '600 ' + fs + 'px sans-serif'; g.fillText(p.ref, 0, 0); g.restore();
      });
      var tex = new T.CanvasTexture(c); if ('colorSpace' in tex) tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
      var m = new T.Mesh(new T.PlaneGeometry(mmW, mmH), new T.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.45, metalness: 0.3, side: bottom ? T.BackSide : T.FrontSide, depthWrite: false }));
      m.position.set(bx0 * MIL + mmW / 2, by0 * MIL + mmH / 2, bottom ? -THICK - 0.02 : 0.02); m.renderOrder = 1; root.add(m);
    }
    decal(false); decal(true);

    // components
    var cache = M._mesh3d || (M._mesh3d = {}), pending = 0, done = 0, alive = true;
    var bodyMat = new T.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 0.6, metalness: 0.1 });
    function placeStep(p, b, meshes) {
      var grp = new T.Group();
      meshes.forEach(function (me) {
        var geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(me.p, 3));
        if (me.n) geo.setAttribute('normal', new T.BufferAttribute(me.n, 3)); else geo.computeVertexNormals();
        geo.setIndex(new T.BufferAttribute(me.i, 1));
        var base = me.c || [0.62, 0.62, 0.62];
        function mat(c) { var col = new T.Color(); col.setRGB(c[0], c[1], c[2], T.SRGBColorSpace); return new T.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.15, side: T.DoubleSide }); }
        if (me.f && me.f.length) { // colours set on single faces of the model
          var mats = [mat(base)], ntri = me.i.length / 3, at = 0;
          me.f.sort(function (a, b) { return a[0] - b[0]; }).forEach(function (f) {
            if (f[0] > at) geo.addGroup(at * 3, (f[0] - at) * 3, 0);
            mats.push(mat([f[2], f[3], f[4]])); geo.addGroup(f[0] * 3, (f[1] - f[0] + 1) * 3, mats.length - 1); at = f[1] + 1;
          });
          if (at < ntri) geo.addGroup(at * 3, (ntri - at) * 3, 0);
          grp.add(new T.Mesh(geo, mats));
        } else grp.add(new T.Mesh(geo, mat(base)));
      });
      // Altium: model rotations X, Y, Z about its origin, then to the board point; bottom bodies are flipped under the board
      var inner = new T.Group(); inner.add(grp);
      grp.rotation.order = 'ZYX'; grp.rotation.set(deg(b.rx), deg(b.ry), deg(b.rz + b.rot));
      var outer = new T.Group(); outer.add(inner);
      if (b.bottom) { inner.rotation.x = Math.PI; outer.position.set(b.x * MIL, b.y * MIL, -THICK - b.dz * MIL); }
      else outer.position.set(b.x * MIL, b.y * MIL, b.dz * MIL);
      outer.userData.part = p; root.add(outer); return outer;
    }
    function placeBox(p, b, color) { // extruded body outline, or the pads box when the file has no body
      var poly = b && b.poly && b.poly.length >= 3 ? b.poly : null, z0 = b ? b.z0 * MIL : 0, z1 = b && b.z1 > 0 ? b.z1 * MIL : 0, geo;
      if (poly) {
        var s = new T.Shape(); poly.forEach(function (q, i) { i ? s.lineTo(q[0] * MIL, q[1] * MIL) : s.moveTo(q[0] * MIL, q[1] * MIL); });
        if (!z1) z1 = 1; geo = new T.ExtrudeGeometry(s, { depth: Math.max(0.05, z1 - z0), bevelEnabled: false });
      } else {
        var bb = coreBox(p), w = bb[2] - bb[0], h = bb[3] - bb[1], hz = z1 || Math.max(0.3, Math.min(2.5, Math.min(w, h) * 0.45));
        geo = new T.BoxGeometry(w, h, hz); geo.translate((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, hz / 2); z0 = 0; z1 = hz;
      }
      if (color == null && !b) color = /^C\d/i.test(p.ref) ? 0xb48a52 : /^(R|L)\d/i.test(p.ref) ? 0x2a2a2a : null;
      var mat = color == null ? bodyMat : new T.MeshStandardMaterial({ color: new T.Color().setHex(color, T.SRGBColorSpace), roughness: 0.6, metalness: 0.1, transparent: b && b.alpha < 1, opacity: b ? b.alpha : 1 });
      var m = new T.Mesh(geo, mat);
      if (poly) m.position.z = z0;
      var bottom = b ? b.bottom : p.bottom;
      if (bottom) { m.scale.z = -1; m.position.z = -THICK - (poly ? z0 : 0); }
      m.userData.part = p; root.add(m); return m;
    }
    M.parts.forEach(function (p) {
      var bs = (p.bodies || []).filter(function (b) { return b.type === 1 ? !!b.step : b.poly && b.poly.length >= 3; });
      if (!bs.length) return; // no 3D data for this part in the file: bare pads only
      bs.forEach(function (b) {
        if (b.type !== 1) { placeBox(p, b, altiumColor(b.color)); return; }
        var key = b.id;
        if (cache[key] && cache[key].meshes) { placeStep(p, b, cache[key].meshes); return; }
        var stub = placeBox(p, { poly: b.poly, z0: b.z0, z1: b.z1, bottom: b.bottom, alpha: 0.35 }, 0x6b7378);
        pending++;
        if (!cache[key]) {
          var bytes = b.step && b.step();
          cache[key] = { wait: [], promise: bytes ? tessellate(bytes) : Promise.resolve(null) };
          cache[key].promise.then(function (meshes) { cache[key].meshes = meshes; });
        }
        cache[key].promise.then(function (meshes) {
          done++; if (!alive) return;
          if (meshes && meshes.length) { root.remove(stub); placeStep(p, b, meshes); }
          else stub.material.opacity = 1;
          if (opt.progress) opt.progress(done, pending); req();
        });
      });
    });
    if (opt.progress) opt.progress(0, pending);

    /* ---------- camera: orbit around the board ---------- */
    var V = { th: -Math.PI / 2, ph: 0.75, r: span * 2.1, tx: cx, ty: cy, tz: 0 };
    function place() {
      V.ph = Math.max(0.02, Math.min(Math.PI - 0.02, V.ph));
      cam.position.set(V.tx + V.r * Math.sin(V.ph) * Math.cos(V.th), V.ty + V.r * Math.sin(V.ph) * Math.sin(V.th), V.tz + V.r * Math.cos(V.ph));
      cam.lookAt(V.tx, V.ty, V.tz); cam.near = V.r / 100; cam.far = V.r * 20; cam.updateProjectionMatrix();
    }
    var raf = 0;
    function req() { if (!raf && alive) raf = requestAnimationFrame(function () { raf = 0; place(); renderer.render(scene, cam); }); }
    function view(which) { // fit the board to the window; a wide board on an upright screen is turned to fill it
      var bw = (bx1 - bx0) * MIL, bh = (by1 - by0) * MIL, upright = W < H * 0.9 && bw > bh * 1.15, tv = Math.tan(deg(cam.fov / 2));
      var hor = upright ? bh : bw, ver = upright ? bw : bh, th = upright ? 0 : -Math.PI / 2;
      V.tx = cx; V.ty = cy; V.tz = 0; V.th = th;
      V.r = Math.max(ver / (2 * tv), hor / (2 * tv * (W / H))) * (which === 'top' || which === 'bottom' ? 1.08 : 1.2);
      if (which === 'top') V.ph = 0.02; else if (which === 'bottom') V.ph = Math.PI - 0.02; else V.ph = 0.75;
      req();
    }
    var el = renderer.domElement, ptrs = {}, last = null;
    el.style.touchAction = 'none';
    function pan(dx, dy) {
      var s = V.r * 0.0012 * (600 / Math.max(300, H)), right = new T.Vector3(), up = new T.Vector3();
      cam.matrixWorld.extractBasis(right, up, new T.Vector3());
      V.tx -= (right.x * dx - up.x * dy) * s; V.ty -= (right.y * dx - up.y * dy) * s; V.tz -= (right.z * dx - up.z * dy) * s;
    }
    function two() { var k = Object.keys(ptrs); if (k.length < 2) return null; var a = ptrs[k[0]], b = ptrs[k[1]]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    var moved = 0;
    el.addEventListener('pointerdown', function (e) { el.setPointerCapture(e.pointerId); ptrs[e.pointerId] = { x: e.clientX, y: e.clientY, b: e.button, sh: e.shiftKey }; last = two(); moved = Object.keys(ptrs).length > 1 ? 99 : 0; });
    el.addEventListener('pointermove', function (e) {
      var p = ptrs[e.pointerId]; if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      var t = two();
      if (t && last) { V.r = Math.max(span * 0.03, Math.min(span * 8, V.r * last.d / Math.max(1, t.d))); pan(t.x - last.x, t.y - last.y); last = t; }
      else if (p.b === 2 || p.b === 1 || p.sh) pan(dx, dy);
      else { V.th -= dx * 0.008; V.ph -= dy * 0.008; }
      req();
    });
    var ray = new T.Raycaster();
    function up(e) {
      var tap = ptrs[e.pointerId] && moved < 6 && e.type === 'pointerup' && Object.keys(ptrs).length === 1;
      delete ptrs[e.pointerId]; last = two();
      if (!tap || !opt.pick) return;
      var r = el.getBoundingClientRect(); place();
      ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), cam);
      var hits = ray.intersectObjects(root.children, true), part = null;
      for (var i = 0; i < hits.length && !part; i++) for (var o = hits[i].object; o && !part; o = o.parent) if (o.userData.part) part = o.userData.part;
      opt.pick(part);
    }
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('wheel', function (e) { e.preventDefault(); V.r = Math.max(span * 0.03, Math.min(span * 8, V.r * Math.exp(e.deltaY * 0.0012))); req(); }, { passive: false });
    el.addEventListener('dblclick', function () { view(); });
    function resize() { W = host.clientWidth; H = host.clientHeight; if (!W || !H) return; renderer.setSize(W, H); cam.aspect = W / H; req(); }
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; if (ro) ro.observe(host);
    var lit = null;
    function highlight(p) { // a warm glow on the selected part
      if (lit === p) return; lit = p;
      root.children.forEach(function (o) {
        var on = !!p && o.userData.part === p;
        o.traverse(function (m) {
          if (!m.isMesh || !m.material) return;
          if (on && !m.userData.own) { m.material = Array.isArray(m.material) ? m.material.map(function (x) { return x.clone(); }) : m.material.clone(); m.userData.own = true; }
          if (m.userData.own) [].concat(m.material).forEach(function (x) { if (x.emissive) x.emissive.setHex(on ? 0x7a5200 : 0x000000); });
        });
      });
      req();
    }
    var keep = placeStep; placeStep = function (p, b, meshes) { var o = keep(p, b, meshes); if (lit === p) { lit = null; highlight(p); } return o; };
    view();
    return { highlight: highlight,
      view: view, render: req, canvas: el, root: root, setAngles: function (th, ph, r) { V.th = th; V.ph = ph; if (r) V.r = span * r; req(); },
      target: function (x, y, z, r) { V.tx = x; V.ty = y; V.tz = z || 0; if (r) V.r = r; req(); },
      close: function () {
        alive = false; if (ro) ro.disconnect(); cancelAnimationFrame(raf);
        scene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); [].concat(o.material || []).forEach(function (x) { if (x.map) x.map.dispose(); x.dispose(); }); });
        renderer.dispose(); if (el.parentNode) el.parentNode.removeChild(el);
      }
    };
  }
  return { open: open, hasModels: function (M) { return M.parts.some(function (p) { return p.bodies && p.bodies.some(function (b) { return b.step; }); }); } };
})();
