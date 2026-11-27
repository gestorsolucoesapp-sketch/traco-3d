// 🧊 Modelagem 3D — núcleo de geometria (sem internet, sem biblioteca externa).
// Contorno 2D com furos → sólido extrudado (malha fechada), transformações, STL, volume.
// Triangulação: corte de orelhas com ponte para os furos (mesmo princípio do "earcut").
(() => {
  const G = {};
  const SEG = 48;

  // ---------- formas 2D (mm) ----------
  const rot2 = (p, a, cx = 0, cy = 0) => {
    if (!a) return p;
    const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180);
    return p.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
  };
  G.circulo = (d, x = 0, y = 0, n = SEG) => Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2; return [x + d / 2 * Math.cos(t), y + d / 2 * Math.sin(t)];
  });
  G.retangulo = (w, h, r = 0, x = 0, y = 0, a = 0) => {
    r = Math.max(0, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3));
    let pts;
    if (r <= 0.01) pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    else {
      pts = []; const n = 8;
      const cantos = [[w / 2 - r, -h / 2 + r, -90], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180]];
      for (const [cx, cy, a0] of cantos) for (let i = 0; i <= n; i++) {
        const t = (a0 + 90 * i / n) * Math.PI / 180; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
      }
    }
    return rot2(pts, a).map(([px, py]) => [px + x, py + y]);
  };
  G.rasgo = (x1, y1, x2, y2, d) => {
    const L = Math.hypot(x2 - x1, y2 - y1);
    if (L < 1e-6) return G.circulo(d, x1, y1);
    const a = Math.atan2(y2 - y1, x2 - x1), r = d / 2, n = 16, pts = [];
    for (let i = 0; i <= n; i++) { const t = a - Math.PI / 2 + Math.PI * i / n; pts.push([x2 + r * Math.cos(t), y2 + r * Math.sin(t)]); }
    for (let i = 0; i <= n; i++) { const t = a + Math.PI / 2 + Math.PI * i / n; pts.push([x1 + r * Math.cos(t), y1 + r * Math.sin(t)]); }
    return pts;
  };
  // forma salva → pontos
  G.pontos = (f) => {
    switch (f?.t) {
      case 'circ': return G.circulo(+f.d, +f.x || 0, +f.y || 0);
      case 'ret': return G.retangulo(+f.w, +f.h, +f.r || 0, +f.x || 0, +f.y || 0, +f.a || 0);
      case 'rasgo': return G.rasgo(+f.x1, +f.y1, +f.x2, +f.y2, +f.d);
      case 'poli': return (f.pts || []).map(([x, y]) => [+x, +y]);
      default: return [];
    }
  };
  G.area = (p) => { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] - p[i][0]) * (p[i][1] + p[j][1]); return s / 2; };
  // área > 0 = anti-horário
  G.antiHorario = (p) => (G.area(p) >= 0 ? p.slice() : p.slice().reverse());
  G.horario = (p) => (G.area(p) < 0 ? p.slice() : p.slice().reverse());
  G.dentro = (pt, poly) => {
    let d = false; const [x, y] = pt;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d;
    }
    return d;
  };
  const cruza = (a, b, c, d) => {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
  };
  const bordasCruzam = (p, q) => {
    for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length];
      for (let j = 0; j < q.length; j++) if (cruza(a, b, q[j], q[(j + 1) % q.length])) return true; }
    return false;
  };
  const caixa2 = (p) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
  const sobrepoe = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
  // Separa furos válidos (dentro do contorno e sem encostar em outro) dos inválidos.
  G.validarFuros = (contorno, furos) => {
    const ok = [], ruins = [], caixas = [];
    furos.forEach((h, i) => {
      if (h.length < 3 || Math.abs(G.area(h)) < 1e-4) { ruins.push(i); return; }
      if (!h.every((q) => G.dentro(q, contorno)) || bordasCruzam(h, contorno)) { ruins.push(i); return; }
      const bh = caixa2(h);
      for (const k of ok) {
        if (!sobrepoe(bh, caixas[k])) continue;
        if (bordasCruzam(h, furos[k]) || G.dentro(h[0], furos[k]) || G.dentro(furos[k][0], h)) { ruins.push(i); return; }
      }
      ok.push(i); caixas[i] = bh;
    });
    return { ok, ruins };
  };
  G.limpar = (p) => { // remove pontos repetidos e colineares
    const out = [];
    for (const q of p) { const u = out[out.length - 1]; if (!u || Math.hypot(u[0] - q[0], u[1] - q[1]) > 1e-6) out.push(q); }
    if (out.length > 1 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) < 1e-6) out.pop();
    return out;
  };

  // ---------- triangulação com furos ----------
  function earcut(data, holeIndices) {
    const hasHoles = holeIndices && holeIndices.length;
    const outerLen = hasHoles ? holeIndices[0] * 2 : data.length;
    let outer = linkedList(data, 0, outerLen, true);
    const tris = [];
    if (!outer || outer.next === outer.prev) return tris;
    if (hasHoles) outer = eliminateHoles(data, holeIndices, outer);
    earcutLinked(outer, tris, 0);
    return tris;
  }
  function linkedList(data, start, end, clockwise) {
    let last = null;
    if (clockwise === (signedArea(data, start, end) > 0)) for (let i = start; i < end; i += 2) last = insertNode(i / 2, data[i], data[i + 1], last);
    else for (let i = end - 2; i >= start; i -= 2) last = insertNode(i / 2, data[i], data[i + 1], last);
    if (last && equals(last, last.next)) { removeNode(last); last = last.next; }
    return last;
  }
  function filterPoints(start, end) {
    if (!start) return start; if (!end) end = start;
    let p = start, again;
    do {
      again = false;
      if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) { removeNode(p); p = end = p.prev; if (p === p.next) break; again = true; }
      else p = p.next;
    } while (again || p !== end);
    return end;
  }
  function earcutLinked(ear, tris, pass) {
    if (!ear) return;
    let stop = ear, prev, next;
    while (ear.prev !== ear.next) {
      prev = ear.prev; next = ear.next;
      if (isEar(ear)) { tris.push(prev.i, ear.i, next.i); removeNode(ear); ear = next.next; stop = next.next; continue; }
      ear = next;
      if (ear === stop) {
        if (!pass) earcutLinked(filterPoints(ear), tris, 1);
        else if (pass === 1) { ear = cureLocalIntersections(filterPoints(ear), tris); earcutLinked(ear, tris, 2); }
        else if (pass === 2) splitEarcut(ear, tris);
        break;
      }
    }
  }
  function isEar(ear) {
    const a = ear.prev, b = ear, c = ear.next;
    if (area(a, b, c) >= 0) return false;
    let p = ear.next.next;
    while (p !== ear.prev) {
      if (pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
      p = p.next;
    }
    return true;
  }
  function cureLocalIntersections(start, tris) {
    let p = start;
    do {
      const a = p.prev, b = p.next.next;
      if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
        tris.push(a.i, p.i, b.i); removeNode(p); removeNode(p.next); p = start = b;
      }
      p = p.next;
    } while (p !== start);
    return filterPoints(p);
  }
  function splitEarcut(start, tris) {
    let a = start;
    do {
      let b = a.next.next;
      while (b !== a.prev) {
        if (a.i !== b.i && isValidDiagonal(a, b)) {
          let c = splitPolygon(a, b);
          a = filterPoints(a, a.next); c = filterPoints(c, c.next);
          earcutLinked(a, tris, 0); earcutLinked(c, tris, 0); return;
        }
        b = b.next;
      }
      a = a.next;
    } while (a !== start);
  }
  function eliminateHoles(data, holeIndices, outerNode) {
    const queue = [];
    for (let i = 0; i < holeIndices.length; i++) {
      const start = holeIndices[i] * 2, end = i < holeIndices.length - 1 ? holeIndices[i + 1] * 2 : data.length;
      const list = linkedList(data, start, end, false);
      if (list === list.next) list.steiner = true;
      queue.push(getLeftmost(list));
    }
    queue.sort((a, b) => a.x - b.x || a.y - b.y);
    for (const h of queue) outerNode = eliminateHole(h, outerNode);
    return outerNode;
  }
  function eliminateHole(hole, outerNode) {
    const bridge = findHoleBridge(hole, outerNode);
    if (!bridge) return outerNode;
    const bridgeReverse = splitPolygon(bridge, hole);
    filterPoints(bridgeReverse, bridgeReverse.next);
    return filterPoints(bridge, bridge.next);
  }
  function findHoleBridge(hole, outerNode) {
    let p = outerNode, qx = -Infinity, m;
    const hx = hole.x, hy = hole.y;
    do {
      if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
        const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
        if (x <= hx && x > qx) { qx = x; m = p.x < p.next.x ? p : p.next; if (x === hx) return m; }
      }
      p = p.next;
    } while (p !== outerNode);
    if (!m) return null;
    const stop = m, mx = m.x, my = m.y;
    let tanMin = Infinity;
    p = m;
    do {
      if (hx >= p.x && p.x >= mx && hx !== p.x &&
          pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
        const tan = Math.abs(hy - p.y) / (hx - p.x);
        if (locallyInside(p, hole) && (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) { m = p; tanMin = tan; }
      }
      p = p.next;
    } while (p !== stop);
    return m;
  }
  const sectorContainsSector = (m, p) => area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
  function getLeftmost(start) { let p = start, l = start; do { if (p.x < l.x || (p.x === l.x && p.y < l.y)) l = p; p = p.next; } while (p !== start); return l; }
  const pointInTriangle = (ax, ay, bx, by, cx, cy, px, py) =>
    (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py);
  function isValidDiagonal(a, b) {
    return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) &&
      ((locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && (area(a.prev, a, b.prev) || area(a, b.prev, b))) ||
       (equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0));
  }
  const area = (p, q, r) => (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  const equals = (p1, p2) => p1.x === p2.x && p1.y === p2.y;
  function intersects(p1, q1, p2, q2) {
    const o1 = sign(area(p1, q1, p2)), o2 = sign(area(p1, q1, q2)), o3 = sign(area(p2, q2, p1)), o4 = sign(area(p2, q2, q1));
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSegment(p1, p2, q1)) return true;
    if (o2 === 0 && onSegment(p1, q2, q1)) return true;
    if (o3 === 0 && onSegment(p2, p1, q2)) return true;
    if (o4 === 0 && onSegment(p2, q1, q2)) return true;
    return false;
  }
  const onSegment = (p, q, r) => q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
  const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
  function intersectsPolygon(a, b) {
    let p = a;
    do { if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && intersects(p, p.next, a, b)) return true; p = p.next; } while (p !== a);
    return false;
  }
  const locallyInside = (a, b) => (area(a.prev, a, a.next) < 0 ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0);
  function middleInside(a, b) {
    let p = a, inside = false; const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
    do { if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y && (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x)) inside = !inside; p = p.next; } while (p !== a);
    return inside;
  }
  function splitPolygon(a, b) {
    const a2 = new Node(a.i, a.x, a.y), b2 = new Node(b.i, b.x, b.y), an = a.next, bp = b.prev;
    a.next = b; b.prev = a; a2.next = an; an.prev = a2; b2.next = a2; a2.prev = b2; bp.next = b2; b2.prev = bp;
    return b2;
  }
  function insertNode(i, x, y, last) {
    const p = new Node(i, x, y);
    if (!last) { p.prev = p; p.next = p; } else { p.next = last.next; p.prev = last; last.next.prev = p; last.next = p; }
    return p;
  }
  function removeNode(p) { p.next.prev = p.prev; p.prev.next = p.next; }
  function Node(i, x, y) { this.i = i; this.x = x; this.y = y; this.prev = null; this.next = null; this.steiner = false; }
  function signedArea(data, start, end) { let s = 0; for (let i = start, j = end - 2; i < end; i += 2) { s += (data[j] - data[i]) * (data[i + 1] + data[j + 1]); j = i; } return s; }
  G.triangular = earcut;

  // ---------- sólido extrudado ----------
  // Devolve triângulos [[x,y,z]x3] no sistema LOCAL (contorno no plano XY, de z0 a z0+h).
  G.extrudar = (contorno, furos, z0, h) => {
    const out = G.antiHorario(G.limpar(contorno));
    const hs = furos.map((f) => G.horario(G.limpar(f))).filter((f) => f.length >= 3);
    const flat = [], idx = [], todos = [];
    for (const q of out) { flat.push(q[0], q[1]); todos.push(q); }
    for (const f of hs) { idx.push(todos.length); for (const q of f) { flat.push(q[0], q[1]); todos.push(q); } }
    const t = earcut(flat, idx), z1 = z0 + h, tris = [];
    for (let i = 0; i < t.length; i += 3) {
      let a = todos[t[i]], b = todos[t[i + 1]], c = todos[t[i + 2]];
      if (G.area([a, b, c]) < 0) [b, c] = [c, b];
      tris.push([[a[0], a[1], z1], [b[0], b[1], z1], [c[0], c[1], z1]]);
      tris.push([[a[0], a[1], z0], [c[0], c[1], z0], [b[0], b[1], z0]]);
    }
    for (const anel of [out, ...hs]) for (let i = 0; i < anel.length; i++) {
      const a = anel[i], b = anel[(i + 1) % anel.length];
      tris.push([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1]]);
      tris.push([[a[0], a[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]]);
    }
    return tris;
  };

  // ---------- transformações ----------
  G.matriz = (t = {}) => { // rotação X → Y → Z, depois translação
    const r = (g) => (+g || 0) * Math.PI / 180, [ax, ay, az] = [r(t.rx), r(t.ry), r(t.rz)];
    const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
    const Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]], Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
    const mul = (A, B) => A.map((l, i) => B[0].map((_, j) => l.reduce((s, _, k) => s + A[i][k] * B[k][j], 0)));
    return { R: mul(Rz, mul(Ry, Rx)), T: [+t.x || 0, +t.y || 0, +t.z || 0] };
  };
  G.aplicar = (tris, M) => tris.map((tri) => tri.map(([x, y, z]) => [
    M.R[0][0] * x + M.R[0][1] * y + M.R[0][2] * z + M.T[0],
    M.R[1][0] * x + M.R[1][1] * y + M.R[1][2] * z + M.T[1],
    M.R[2][0] * x + M.R[2][1] * y + M.R[2][2] * z + M.T[2]]));
  G.espelharX = (tris) => tris.map(([a, b, c]) => [[-a[0], a[1], a[2]], [-c[0], c[1], c[2]], [-b[0], b[1], b[2]]]);

  // ---------- medidas ----------
  G.volume = (tris) => { let v = 0; for (const [a, b, c] of tris) v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; return Math.abs(v); };
  G.caixa = (tris) => { const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (const t of tris) for (const q of t) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], q[k]); b[k + 3] = Math.max(b[k + 3], q[k]); } return b; };
  G.normal = ([a, b, c]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1;
    return n.map((x) => x / l);
  };
  G.stl = (tris) => { // STL binário em mm
    const buf = new ArrayBuffer(84 + tris.length * 50), dv = new DataView(buf);
    const nome = 'Traco - Modelagem 3D'; for (let i = 0; i < nome.length; i++) dv.setUint8(i, nome.charCodeAt(i));
    dv.setUint32(80, tris.length, true);
    let o = 84;
    for (const t of tris) {
      for (const v of [G.normal(t), ...t]) for (const k of v) { dv.setFloat32(o, k, true); o += 4; }
      dv.setUint16(o, 0, true); o += 2;
    }
    return buf;
  };
  G.lerSTL = (buf) => { // binário ou texto → triângulos
    const dv = new DataView(buf), n = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
    if (buf.byteLength === 84 + n * 50 && n > 0) {
      const tris = []; let o = 84;
      for (let i = 0; i < n; i++) { o += 12; const t = []; for (let v = 0; v < 3; v++) { t.push([dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)]); o += 12; } o += 2; tris.push(t); }
      return tris;
    }
    const txt = new TextDecoder().decode(buf), vs = [...txt.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    const tris = []; for (let i = 0; i + 2 < vs.length; i += 3) tris.push([vs[i], vs[i + 1], vs[i + 2]]);
    return tris;
  };

  // ---------- corpo do modelo → malha no mundo ----------
  // corpo = { contorno: forma, furos: [formas], h, x, y, z, rx, ry, rz, grupo }  ·  grupos = { nome: {x,y,z,rx,ry,rz} }
  G.corpo = (c, grupos = {}) => {
    const cont = G.limpar(G.pontos(c.contorno));
    if (cont.length < 3 || !(+c.h > 0)) return { tris: [], ruins: [], erro: 'contorno ou altura inválidos' };
    const furos = (c.furos || []).map((f) => G.limpar(G.pontos(f)));
    const v = G.validarFuros(cont, furos);
    let tris = G.extrudar(cont, v.ok.map((i) => furos[i]), 0, +c.h);
    tris = G.aplicar(tris, G.matriz(c));
    const g = grupos[c.grupo]; if (g) tris = G.aplicar(tris, G.matriz(g));
    return { tris, ruins: v.ruins };
  };

  if (typeof window !== 'undefined') window.tracoGeo3D = G;
  if (typeof module !== 'undefined') module.exports = G;
})();
