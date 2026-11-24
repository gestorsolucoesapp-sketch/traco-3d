// Gera a malha das peças do projeto: formas (caixa, cilindro…) somadas/subtraídas → superfície fechada (surface nets).
// Roda fora da tela (Worker) para não travar o app.
'use strict';

// ---------- expressões dos parâmetros (sem eval) ----------
function avalia(v, P) {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  const s = String(v).replace(/(\d),(\d)/g, (m, a, b, k, all) => (/[A-Za-z_(]/.test(all) ? m : `${a}.${b}`)); let i = 0; // vírgula decimal só em número puro
  const esp = () => { while (s[i] === ' ') i++; };
  function prim() {
    esp();
    if (s[i] === '(') { i++; const r = soma(); esp(); if (s[i] === ')') i++; return r; }
    if (s[i] === '-') { i++; return -prim(); }
    if (s[i] === '+') { i++; return prim(); }
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i)); if (m) { i += m[0].length; return +m[0]; }
    const n = /^[A-Za-z_]\w*/.exec(s.slice(i));
    if (n) {
      i += n[0].length; esp();
      if (s[i] === '(') { i++; const a = [soma()]; esp(); while (s[i] === ',' || s[i] === ';') { i++; a.push(soma()); esp(); } if (s[i] === ')') i++;
        const f = { min: Math.min, max: Math.max, sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil }[n[0]]; return f ? f(...a) : NaN; }
      return n[0] in P ? P[n[0]] : NaN;
    }
    return NaN;
  }
  function pot() { let a = prim(); esp(); while (s[i] === '^') { i++; a = a ** prim(); esp(); } return a; }
  function mult() { let a = pot(); esp(); while (s[i] === '*' || s[i] === '/') { const o = s[i++]; const b = pot(); a = o === '*' ? a * b : a / b; esp(); } return a; }
  function soma() { let a = mult(); esp(); while (s[i] === '+' || s[i] === '-') { const o = s[i++]; const b = mult(); a = o === '+' ? a + b : a - b; esp(); } return a; }
  const r = soma(); esp(); return i < s.length ? NaN : r;
}

// ---------- montar a árvore de formas ----------
const RAD = Math.PI / 180;
function matRot([rx = 0, ry = 0, rz = 0]) { // R = Rz·Ry·Rx
  const [a, b, c] = [rx * RAD, ry * RAD, rz * RAD], ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  return [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa, sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa, -sb, cb * sa, cb * ca];
}
let erros = [];
function num(v, P, nome, def) { const x = avalia(v, P); if (Number.isFinite(x)) return x; if (def !== undefined && v == null) return def; erros.push(`Valor inválido em "${nome}": ${v}`); return def ?? 0; }
function vet(v, P, nome, def) { return Array.isArray(v) ? [0, 1, 2].map((k) => num(v[k], P, nome, 0)) : def; }
function monta(n, P, prof = 0) {
  if (!n || typeof n !== 'object' || prof > 30) return null;
  const c = vet(n.centro, P, 'centro', [0, 0, 0]), r = vet(n.rot, P, 'rot', null), M = r && r.some((x) => x) ? matRot(r) : null;
  const t = { c, M };
  if (n.op) {
    if (n.op === 'repetir') {
      const item = monta(n.item, P, prof + 1); if (!item) return null;
      const q = vet(n.n, P, 'n', [1, 1, 1]).map((x) => Math.max(1, Math.min(60, Math.round(x)))), ps = vet(n.passo, P, 'passo', [0, 0, 0]);
      const itens = [];
      for (let i = 0; i < q[0]; i++) for (let j = 0; j < q[1]; j++) for (let k = 0; k < q[2]; k++)
        itens.push({ ...t, tipo: 'grupo', c: [ps[0] * (i - (q[0] - 1) / 2), ps[1] * (j - (q[1] - 1) / 2), ps[2] * (k - (q[2] - 1) / 2)], M: null, op: 'uniao', itens: [item] });
      if (itens.length > 400) { erros.push('Repetição grande demais (máx. 400).'); itens.length = 400; }
      return { ...t, op: 'uniao', itens };
    }
    if (n.op === 'espelho') { const item = monta(n.item, P, prof + 1); if (!item) return null; const e = 'xyz'.indexOf(n.eixo || 'x'); return { ...t, op: 'uniao', itens: [item, { tipo: 'espelho', e: Math.max(0, e), item, c: [0, 0, 0], M: null }] }; }
    const itens = (n.itens || []).map((x) => monta(x, P, prof + 1)).filter(Boolean);
    if (!itens.length) return null;
    return { ...t, op: ['uniao', 'diferenca', 'intersecao'].includes(n.op) ? n.op : 'uniao', itens };
  }
  const nome = n.tipo;
  if (nome === 'caixa') { const s = vet(n.tam, P, 'tam', [10, 10, 10]).map((x) => Math.abs(x) / 2); return { ...t, f: 'caixa', h: s, r: Math.min(num(n.raio, P, 'raio', 0), ...s) }; }
  if (nome === 'cilindro') return { ...t, f: 'cil', R: num(n.d, P, 'd', 10) / 2, H: num(n.h, P, 'h', 10) / 2 };
  if (nome === 'cone') return { ...t, f: 'cone', r1: num(n.d1, P, 'd1', 10) / 2, r2: num(n.d2, P, 'd2', 0) / 2, H: num(n.h, P, 'h', 10) / 2 };
  if (nome === 'esfera') return { ...t, f: 'esf', R: num(n.d, P, 'd', 10) / 2 };
  if (nome === 'hexagono') return { ...t, f: 'hex', a: num(n.s, P, 's', 10) / 2, H: num(n.h, P, 'h', 5) / 2 };
  if (nome === 'toro') return { ...t, f: 'toro', R: num(n.D, P, 'D', 20) / 2, r: num(n.d, P, 'd', 4) / 2 };
  erros.push(`Forma desconhecida: ${nome}`); return null;
}

// caixa de contorno (no mundo) de cada nó, para pular partes longe do ponto
function caixaNo(n) {
  let b;
  if (n.tipo === 'espelho') { const k = caixaNo(n.item); b = k.slice(); b[n.e] = -k[n.e + 3]; b[n.e + 3] = -k[n.e]; n.bb = b; return b; }
  if (n.op) {
    const bs = n.itens.map(caixaNo);
    if (n.op === 'diferenca') b = bs[0].slice();
    else if (n.op === 'intersecao') b = [0, 1, 2].map((k) => Math.max(...bs.map((q) => q[k]))).concat([0, 1, 2].map((k) => Math.min(...bs.map((q) => q[k + 3]))));
    else b = [0, 1, 2].map((k) => Math.min(...bs.map((q) => q[k]))).concat([0, 1, 2].map((k) => Math.max(...bs.map((q) => q[k + 3]))));
  } else {
    let h;
    if (n.f === 'caixa') h = n.h; else if (n.f === 'cil' || n.f === 'hex') h = [n.f === 'hex' ? n.a * 1.1548 : n.R, n.f === 'hex' ? n.a * 1.1548 : n.R, n.H];
    else if (n.f === 'cone') { const R = Math.max(n.r1, n.r2); h = [R, R, n.H]; } else if (n.f === 'esf') h = [n.R, n.R, n.R]; else h = [n.R + n.r, n.R + n.r, n.r];
    b = [-h[0], -h[1], -h[2], h[0], h[1], h[2]];
  }
  if (n.M || n.c.some((x) => x)) { // transforma os 8 cantos
    const m = n.M || [1, 0, 0, 0, 1, 0, 0, 0, 1], o = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) {
      const w = [m[0] * x + m[1] * y + m[2] * z + n.c[0], m[3] * x + m[4] * y + m[5] * z + n.c[1], m[6] * x + m[7] * y + m[8] * z + n.c[2]];
      for (let k = 0; k < 3; k++) { o[k] = Math.min(o[k], w[k]); o[k + 3] = Math.max(o[k + 3], w[k]); }
    }
    b = o;
  }
  n.bb = b; return b;
}

// ---------- distância com sinal (negativo = dentro) ----------
let MARG = 1;
function sdf(n, x, y, z) {
  const b = n.bb, dx = Math.max(b[0] - x, 0, x - b[3]), dy = Math.max(b[1] - y, 0, y - b[4]), dz = Math.max(b[2] - z, 0, z - b[5]);
  const fora = Math.hypot(dx, dy, dz); if (fora > MARG) return fora;
  if (n.tipo === 'espelho') { const p = [x, y, z]; p[n.e] = -p[n.e]; return sdf(n.item, p[0], p[1], p[2]); }
  // para o sistema local
  x -= n.c[0]; y -= n.c[1]; z -= n.c[2];
  if (n.M) { const m = n.M, X = m[0] * x + m[3] * y + m[6] * z, Y = m[1] * x + m[4] * y + m[7] * z, Z = m[2] * x + m[5] * y + m[8] * z; x = X; y = Y; z = Z; }
  if (n.op) {
    const it = n.itens;
    if (n.op === 'uniao') { let d = Infinity; for (const c of it) { const v = sdf(c, x, y, z); if (v < d) d = v; } return d; }
    if (n.op === 'intersecao') { let d = -Infinity; for (const c of it) { const v = sdf(c, x, y, z); if (v > d) d = v; } return d; }
    let d = sdf(it[0], x, y, z); if (d > MARG) return d;
    for (let k = 1; k < it.length; k++) { const v = -sdf(it[k], x, y, z); if (v > d) d = v; }
    return d;
  }
  switch (n.f) {
    case 'caixa': {
      const r = n.r, qx = Math.abs(x) - n.h[0] + r, qy = Math.abs(y) - n.h[1] + r, qz = Math.abs(z) - n.h[2] + r;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
    }
    case 'cil': { const a = Math.hypot(x, y) - n.R, c = Math.abs(z) - n.H; return Math.min(Math.max(a, c), 0) + Math.hypot(Math.max(a, 0), Math.max(c, 0)); }
    case 'esf': return Math.hypot(x, y, z) - n.R;
    case 'toro': return Math.hypot(Math.hypot(x, y) - n.R, z) - n.r;
    case 'cone': { // tronco de cone (iq): r1 embaixo, r2 em cima
      const h = n.H, r1 = n.r1, r2 = n.r2, qx = Math.hypot(x, y), qy = z;
      const k1x = r2, k1y = h, k2x = r2 - r1, k2y = 2 * h;
      const cax = qx - Math.min(qx, qy < 0 ? r1 : r2), cay = Math.abs(qy) - h;
      const kl = k2x * k2x + k2y * k2y, t = Math.max(0, Math.min(1, ((k1x - qx) * k2x + (k1y - qy) * k2y) / kl));
      const cbx = qx - k1x + k2x * t, cby = qy - k1y + k2y * t;
      const s = cbx < 0 && cay < 0 ? -1 : 1;
      return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
    }
    case 'hex': {
      const kx = -0.8660254, ky = 0.5, kz = 0.57735; let px = Math.abs(x), py = Math.abs(y); const pz = Math.abs(z);
      const dt = Math.min(kx * px + ky * py, 0) * 2; px -= dt * kx; py -= dt * ky;
      const cx = Math.max(-kz * n.a, Math.min(kz * n.a, px));
      const d1 = Math.hypot(px - cx, py - n.a) * Math.sign(py - n.a), d2 = pz - n.H;
      return Math.min(Math.max(d1, d2), 0) + Math.hypot(Math.max(d1, 0), Math.max(d2, 0));
    }
  }
  return 1e9;
}

// ---------- superfície (surface nets) ----------
function malha(raiz, celula, refinar) {
  const b = raiz.bb, pad = celula * 2;
  const o = [b[0] - pad, b[1] - pad, b[2] - pad];
  const N = [0, 1, 2].map((k) => Math.max(3, Math.ceil((b[k + 3] - b[k] + 2 * pad) / celula) + 1));
  const tot = N[0] * N[1] * N[2]; if (tot > 9e6) return null;
  const F = new Float32Array(tot), idx = (i, j, k) => i + N[0] * (j + N[1] * k);
  MARG = celula * 2.5;
  for (let k = 0; k < N[2]; k++) { const z = o[2] + k * celula; for (let j = 0; j < N[1]; j++) { const y = o[1] + j * celula; let p = idx(0, j, k); for (let i = 0; i < N[0]; i++, p++) F[p] = sdf(raiz, o[0] + i * celula, y, z); } }
  const C = [N[0] - 1, N[1] - 1, N[2] - 1], cel = new Int32Array(C[0] * C[1] * C[2]).fill(-1), cidx = (i, j, k) => i + C[0] * (j + C[1] * k);
  const V = [];
  const ARE = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cant = new Float32Array(8);
  for (let k = 0; k < C[2]; k++) for (let j = 0; j < C[1]; j++) for (let i = 0; i < C[0]; i++) {
    let neg = 0;
    for (let q = 0; q < 8; q++) { const v = F[idx(i + (q & 1), j + ((q >> 1) & 1), k + ((q >> 2) & 1))]; cant[q] = v; if (v < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, m = 0;
    for (const [a, c] of ARE) {
      const fa = cant[a], fc = cant[c]; if ((fa < 0) === (fc < 0)) continue;
      const t = fa / (fa - fc);
      sx += (a & 1) + t * ((c & 1) - (a & 1)); sy += ((a >> 1) & 1) + t * (((c >> 1) & 1) - ((a >> 1) & 1)); sz += ((a >> 2) & 1) + t * (((c >> 2) & 1) - ((a >> 2) & 1)); m++;
    }
    let px = o[0] + (i + sx / m) * celula, py = o[1] + (j + sy / m) * celula, pz = o[2] + (k + sz / m) * celula;
    if (refinar) { // um passo de Newton: leva o ponto para a superfície (cantos e faces ficam mais fiéis)
      const h = celula * .3, f0 = sdf(raiz, px, py, pz);
      const gx = (sdf(raiz, px + h, py, pz) - sdf(raiz, px - h, py, pz)) / (2 * h), gy = (sdf(raiz, px, py + h, pz) - sdf(raiz, px, py - h, pz)) / (2 * h), gz = (sdf(raiz, px, py, pz + h) - sdf(raiz, px, py, pz - h)) / (2 * h);
      const g2 = gx * gx + gy * gy + gz * gz;
      if (g2 > .25) {
        let nx = px - f0 * gx / g2, ny = py - f0 * gy / g2, nz = pz - f0 * gz / g2;
        const lo = [o[0] + i * celula, o[1] + j * celula, o[2] + k * celula];
        nx = Math.max(lo[0], Math.min(lo[0] + celula, nx)); ny = Math.max(lo[1], Math.min(lo[1] + celula, ny)); nz = Math.max(lo[2], Math.min(lo[2] + celula, nz));
        px = nx; py = ny; pz = nz;
      }
    }
    cel[cidx(i, j, k)] = V.length / 3; V.push(px, py, pz);
  }
  const T = [];
  const vtx = (c) => [V[c * 3], V[c * 3 + 1], V[c * 3 + 2]];
  const tri = (a, b, c, eixo, pos) => {
    const A = vtx(a), B = vtx(b), Cc = vtx(c);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = Cc[0] - A[0], vy = Cc[1] - A[1], vz = Cc[2] - A[2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    if ((n[eixo] > 0) !== pos) T.push(...A, ...Cc, ...B); else T.push(...A, ...B, ...Cc);
  };
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    for (let k = 0; k < N[2]; k++) for (let j = 0; j < N[1]; j++) for (let i = 0; i < N[0]; i++) {
      const p = [i, j, k]; if (p[d] >= C[d]) continue;
      const f0 = F[idx(i, j, k)], q = p.slice(); q[d]++; const f1 = F[idx(q[0], q[1], q[2])];
      if ((f0 < 0) === (f1 < 0)) continue;
      const cc = (du, dv) => { const r = p.slice(); r[u] -= du; r[v] -= dv; if (r[u] < 0 || r[v] < 0 || r[u] >= C[u] || r[v] >= C[v]) return -1; return cel[cidx(r[0], r[1], r[2])]; };
      const a = cc(0, 0), b2 = cc(1, 0), c2 = cc(1, 1), e = cc(0, 1);
      if (a < 0 || b2 < 0 || c2 < 0 || e < 0) continue;
      const pos = f0 < 0; // dentro embaixo → normal aponta para +eixo
      tri(a, b2, c2, d, pos); tri(a, c2, e, d, pos);
    }
  }
  return new Float32Array(T);
}

function volume(T) { let v = 0; for (let i = 0; i < T.length; i += 9) v += (T[i] * (T[i + 4] * T[i + 8] - T[i + 5] * T[i + 7]) - T[i + 1] * (T[i + 3] * T[i + 8] - T[i + 5] * T[i + 6]) + T[i + 2] * (T[i + 3] * T[i + 7] - T[i + 4] * T[i + 6])) / 6; return v; }

self.onmessage = (e) => {
  const { id, projeto, valores, fino } = e.data;
  erros = [];
  const P = {};
  for (const p of projeto.parametros || []) { const v = valores?.[p.id] ?? p.valor; P[p.id] = avalia(v, P); }
  const pecas = [], trans = [];
  (projeto.pecas || []).forEach((pc, i) => {
    const raiz = monta(pc.forma, P);
    if (!raiz) { pecas.push({ i, erro: pc.erroIA || 'Forma vazia.' }); return; }
    const bb = caixaNo(raiz), tam = Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]);
    if (!Number.isFinite(tam) || tam <= 0 || tam > 2000) { pecas.push({ i, erro: 'Tamanho inválido.' }); return; }
    let celula = fino ? Math.max(.4, tam / 170) : Math.max(.6, tam / 70);
    let T = null; while (!(T = malha(raiz, celula, fino))) celula *= 1.3;
    const vol = Math.abs(volume(T));
    pecas.push({ i, T, bb, celula, vol }); trans.push(T.buffer);
  });
  self.postMessage({ id, fino, pecas, calc: P, erros: [...new Set(erros)].slice(0, 10) }, trans);
};
