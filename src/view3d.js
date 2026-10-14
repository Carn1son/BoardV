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
        // one geometry per colour for the whole model: a few draw calls instead of hundreds
        var G = {}, order = [];
        (r && r.meshes || []).forEach(function (me) {
          var P = me.attributes.position.array, N = me.attributes.normal ? me.attributes.normal.array : null, I = me.index.array, nt = I.length / 3;
          var tc = new Array(nt), base = me.color ? me.color.join(',') : '';
          for (var t = 0; t < nt; t++) tc[t] = base;
          (me.brep_faces || []).forEach(function (f) { if (f.color) for (var t2 = f.first; t2 <= f.last && t2 < nt; t2++) tc[t2] = f.color.join(','); });
          var used = {};
          for (var t3 = 0; t3 < nt; t3++) (used[tc[t3]] = used[tc[t3]] || []).push(t3);
          Object.keys(used).forEach(function (k) {
            var g = G[k]; if (!g) { g = G[k] = { c: k ? k.split(',').map(Number) : null, P: [], N: [], I: [], nv: 0, hasN: true }; order.push(k); }
            var off = g.nv; g.P.push(P); g.N.push(N); if (!N) g.hasN = false; g.nv += P.length / 3;
            var tris = used[k], ix = new Uint32Array(tris.length * 3);
            for (var q = 0; q < tris.length; q++) { var b0 = tris[q] * 3; ix[q * 3] = I[b0] + off; ix[q * 3 + 1] = I[b0 + 1] + off; ix[q * 3 + 2] = I[b0 + 2] + off; }
            g.I.push(ix);
          });
        });
        var out = [], tr = [];
        function cat(list, n, Ctor) { var a = new Ctor(n), o = 0; list.forEach(function (x) { a.set(x, o); o += x.length; }); return a; }
        order.forEach(function (k) {
          var g = G[k], p = cat(g.P, g.nv * 3, Float32Array), n = g.hasN ? cat(g.N, g.nv * 3, Float32Array) : null;
          var ni = g.I.reduce(function (s, x) { return s + x.length; }, 0), i = cat(g.I, ni, Uint32Array);
          out.push({ p: p, n: n, i: i, c: g.c }); tr.push(p.buffer, i.buffer); if (n) tr.push(n.buffer);
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
    worker.onmessage = function (e) { var j = jobs[e.data.id]; delete jobs[e.data.id]; if (j) j(e.data); idleCheck(); };
    return worker;
  }
  var idleT = 0;
  function idleCheck() { clearTimeout(idleT); idleT = setTimeout(function () { if (!Object.keys(jobs).length) reset(); }, 3000); } // nothing left to read: free the STEP reader
  function reset() { if (worker) { worker.terminate(); worker = null; } jobs = {}; clearTimeout(idleT); }
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
  /* ---------- the view ---------- */
  function open(host, M, opt) {
    opt = opt || {};
    var T = THREE, W = host.clientWidth || 300, H = host.clientHeight || 300, dpr = Math.min(1.75, window.devicePixelRatio || 1);
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
      var tex = new T.CanvasTexture(c); if ('colorSpace' in tex) tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
      var m = new T.Mesh(new T.PlaneGeometry(mmW, mmH), new T.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.45, metalness: 0.3, side: bottom ? T.BackSide : T.FrontSide, depthWrite: false }));
      m.position.set(bx0 * MIL + mmW / 2, by0 * MIL + mmH / 2, bottom ? -THICK - 0.02 : 0.02); m.renderOrder = 1; root.add(m);
    }
    decal(false); decal(true);

    // components: every STEP model is read once and drawn with instancing (one draw call per model colour for all its copies)
    var cache = M._mesh3d || (M._mesh3d = {}), pending = 0, done = 0, alive = true, inst = {}, picks = [];
    var bodyMat = new T.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 0.6, metalness: 0.1 }), mats = {};
    function matFor(c) { var k = c ? c.join(',') : ''; if (!mats[k]) { var col = new T.Color(); if (c) col.setRGB(c[0], c[1], c[2], T.SRGBColorSpace); else col.setHex(0x9e9e9e); mats[k] = new T.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.15, side: T.DoubleSide }); } return mats[k]; }
    function bodyMatrix(b) { // Altium: model rotations X, Y, Z about its origin, then to the board point; bottom bodies are turned under the board
      var g = new T.Object3D(), inner = new T.Object3D(), outer = new T.Object3D();
      g.rotation.order = 'ZYX'; g.rotation.set(deg(b.rx), deg(b.ry), deg(b.rz + b.rot)); inner.add(g); outer.add(inner);
      if (b.bottom) { inner.rotation.x = Math.PI; outer.position.set(b.x * MIL, b.y * MIL, -THICK - b.dz * MIL); }
      else outer.position.set(b.x * MIL, b.y * MIL, b.dz * MIL);
      outer.updateMatrixWorld(true); return g.matrixWorld.clone();
    }
    function build(key) {
      var e = inst[key], groups = cache[key] && cache[key].meshes; if (!groups || !groups.length) return;
      e.geos = groups.map(function (gr) {
        var geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(gr.p, 3));
        if (gr.n) geo.setAttribute('normal', new T.BufferAttribute(gr.n, 3)); geo.setIndex(new T.BufferAttribute(gr.i, 1));
        if (!gr.n) geo.computeVertexNormals();
        var im = new T.InstancedMesh(geo, matFor(gr.c), e.list.length);
        e.list.forEach(function (it, i) { im.setMatrixAt(i, it.m); });
        im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.userData.parts = e.list.map(function (it) { return it.p; });
        root.add(im); return geo;
      });
    }
    function placeBox(p, b, color) { // an extruded body outline from the file
      var s = new T.Shape(), z0 = b.z0 * MIL, z1 = b.z1 > 0 ? b.z1 * MIL : 1;
      b.poly.forEach(function (q, i) { i ? s.lineTo(q[0] * MIL, q[1] * MIL) : s.moveTo(q[0] * MIL, q[1] * MIL); });
      var key = color + ':' + (b.alpha < 1 ? b.alpha : 1);
      if (!mats[key]) mats[key] = new T.MeshStandardMaterial({ color: new T.Color().setHex(color, T.SRGBColorSpace), roughness: 0.6, metalness: 0.1, transparent: b.alpha < 1, opacity: b.alpha });
      var m = new T.Mesh(new T.ExtrudeGeometry(s, { depth: Math.max(0.05, z1 - z0), bevelEnabled: false }), mats[key]);
      m.position.z = z0; if (b.bottom) { m.scale.z = -1; m.position.z = -THICK - z0; }
      m.userData.part = p; root.add(m); return m;
    }
    M.parts.forEach(function (p) {
      (p.bodies || []).forEach(function (b) {
        if (b.type !== 1) { if (b.poly && b.poly.length >= 3) placeBox(p, b, altiumColor(b.color)); return; }
        if (!b.step) return; // no 3D data for this part in the file: bare pads only
        var key = b.ck || b.id; // same model (by checksum) = read once
        (inst[key] = inst[key] || { list: [], b: b }).list.push({ p: p, m: bodyMatrix(b) });
      });
    });
    Object.keys(inst).forEach(function (key) {
      if (cache[key] && cache[key].meshes) { build(key); return; }
      pending++;
      if (!cache[key]) { var bytes = inst[key].b.step(); cache[key] = { promise: bytes ? tessellate(bytes) : Promise.resolve(null) }; cache[key].promise.then(function (g) { cache[key].meshes = g; }); }
      cache[key].promise.then(function () { done++; if (!alive) return; build(key); if (lit) { var l = lit; lit = null; highlight(l); } if (opt.progress) opt.progress(done, pending); req(); });
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
      var hits = ray.intersectObjects(root.children, false), part = null;
      for (var i = 0; i < hits.length && !part; i++) { var o = hits[i].object; part = o.isInstancedMesh ? o.userData.parts[hits[i].instanceId] : o.userData.part || null; }
      opt.pick(part);
    }
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('wheel', function (e) { e.preventDefault(); V.r = Math.max(span * 0.03, Math.min(span * 8, V.r * Math.exp(e.deltaY * 0.0012))); req(); }, { passive: false });
    el.addEventListener('dblclick', function () { view(); });
    function resize() { // redraw in the same frame: a resized canvas is blank until it is drawn again
      W = host.clientWidth; H = host.clientHeight; if (!W || !H || !alive) return;
      var d = Math.min(1.75, window.devicePixelRatio || 1); if (d !== dpr) { dpr = d; renderer.setPixelRatio(dpr); }
      renderer.setSize(W, H); cam.aspect = W / H; place(); renderer.render(scene, cam);
    }
    window.addEventListener('resize', resize);
    // the GPU can drop the picture (window moved to another screen, app in background): build the view again
    el.addEventListener('webglcontextlost', function (e) { e.preventDefault(); if (alive && opt.lost) setTimeout(opt.lost, 0); });
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; if (ro) ro.observe(host);
    var lit = null, hl = [], hlMats = {};
    function highlight(p) { // a warm glow on the selected part: extra copies of its geometry drawn over it
      if (lit === p) return; lit = p;
      hl.forEach(function (m) { root.remove(m); }); hl = [];
      if (p) root.children.forEach(function (o) {
        var mk = function (geo, mat, mx) {
          var k = mat.uuid; if (!hlMats[k]) { hlMats[k] = mat.clone(); hlMats[k].emissive = new T.Color(0x8a5c00); hlMats[k].polygonOffset = true; hlMats[k].polygonOffsetFactor = -1; hlMats[k].polygonOffsetUnits = -4; }
          var m = new T.Mesh(geo, hlMats[k]); m.raycast = function () {}; m.matrixAutoUpdate = false; m.matrix.copy(mx); root.add(m); hl.push(m);
        };
        if (o.isInstancedMesh) o.userData.parts.forEach(function (q, i) { if (q === p) { var mx = new T.Matrix4(); o.getMatrixAt(i, mx); mk(o.geometry, o.material, mx); } });
        else if (o.isMesh && o.userData.part === p) { o.updateMatrix(); mk(o.geometry, o.material, o.matrix); }
      });
      req();
    }
    view();
    return { info: function () { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries }; }, highlight: highlight, setBg: function (c) { scene.background = new T.Color(c); req(); },
      view: view, render: req, canvas: el, root: root, setAngles: function (th, ph, r) { V.th = th; V.ph = ph; if (r) V.r = span * r; req(); },
      target: function (x, y, z, r) { V.tx = x; V.ty = y; V.tz = z || 0; if (r) V.r = r; req(); },
      close: function () {
        alive = false; if (ro) ro.disconnect(); window.removeEventListener('resize', resize); cancelAnimationFrame(raf);
        hl.forEach(function (m) { root.remove(m); });
        scene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); [].concat(o.material || []).forEach(function (x) { if (x.map) x.map.dispose(); x.dispose(); }); if (o.isInstancedMesh && o.dispose) o.dispose(); });
        Object.keys(hlMats).forEach(function (k) { hlMats[k].dispose(); }); renderer.forceContextLoss && renderer.forceContextLoss();
        renderer.dispose(); if (el.parentNode) el.parentNode.removeChild(el);
      }
    };
  }
  return { open: open, reset: reset, hasModels: function (M) { return M.parts.some(function (p) { return p.bodies && p.bodies.some(function (b) { return b.step; }); }); } };
})();
