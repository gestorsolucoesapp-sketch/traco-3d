// Núcleo de simulação por elementos finitos (estilo Fusion 360 Simulation) — roda num Web Worker.
// Malha de voxels hexaédricos de 8 nós (todos do mesmo tamanho h), resolvida sem montar matriz (CG com Jacobi).
// Unidades: mm, N, MPa (N/mm²), toneladas/mm³ para massa, W e °C no térmico.
function tracoNucleoFEA() {
  'use strict';
  // ---------- matrizes do elemento (cubo de lado 1, E = 1) ----------
  const NO = []; for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) NO.push([i * 2 - 1, j * 2 - 1, k * 2 - 1]);
  function dN(xi, eta, ze) { // derivadas em x,y,z para cubo unitário (dx = dξ/2)
    return NO.map(([a, b, c]) => [a * (1 + eta * b) * (1 + ze * c) / 4, b * (1 + xi * a) * (1 + ze * c) / 4, c * (1 + xi * a) * (1 + eta * b) / 4]);
  }
  function matD(nu) {
    const l = nu / ((1 + nu) * (1 - 2 * nu)), m = 1 / (2 * (1 + nu));
    return [[l + 2 * m, l, l, 0, 0, 0], [l, l + 2 * m, l, 0, 0, 0], [l, l, l + 2 * m, 0, 0, 0], [0, 0, 0, m, 0, 0], [0, 0, 0, 0, m, 0], [0, 0, 0, 0, 0, m]];
  }
  function matB(d) {
    const B = Array.from({ length: 6 }, () => new Float64Array(24));
    d.forEach(([x, y, z], n) => {
      B[0][3 * n] = x; B[1][3 * n + 1] = y; B[2][3 * n + 2] = z;
      B[3][3 * n] = y; B[3][3 * n + 1] = x; B[4][3 * n + 1] = z; B[4][3 * n + 2] = y; B[5][3 * n] = z; B[5][3 * n + 2] = x;
    });
    return B;
  }
  const G = 1 / Math.sqrt(3);
  function elemento(nu) {
    const D = matD(nu), K = new Float64Array(576), Kt = new Float64Array(64);
    for (const xi of [-G, G]) for (const eta of [-G, G]) for (const ze of [-G, G]) {
      const d = dN(xi, eta, ze), B = matB(d), w = 1 / 8; // det J = 1/8, peso 1
      const DB = D.map((row) => { const r = new Float64Array(24); for (let c = 0; c < 24; c++) { let s = 0; for (let k = 0; k < 6; k++) s += row[k] * B[k][c]; r[c] = s; } return r; });
      for (let a = 0; a < 24; a++) for (let b = 0; b < 24; b++) { let s = 0; for (let k = 0; k < 6; k++) s += B[k][a] * DB[k][b]; K[a * 24 + b] += s * w; }
      for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) Kt[a * 8 + b] += (d[a][0] * d[b][0] + d[a][1] * d[b][1] + d[a][2] * d[b][2]) * w;
    }
    const B0 = matB(dN(0, 0, 0));
    return { K, Kt, B0, D };
  }

  // ---------- voxelização (número de voltas: aceita peças sobrepostas) ----------
  function voxelizar(tris, alvo, extra) {
    let b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const t of tris) for (const q of t) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], q[k]); b[k + 3] = Math.max(b[k + 3], q[k]); }
    const L = [b[3] - b[0], b[4] - b[1], b[5] - b[2]].map((v) => Math.max(v, 1e-6));
    let vol = 0;
    for (const [a, c, d] of tris) vol += (a[0] * (c[1] * d[2] - c[2] * d[1]) - a[1] * (c[0] * d[2] - c[2] * d[0]) + a[2] * (c[0] * d[1] - c[1] * d[0])) / 6;
    const sinal = vol < 0 ? -1 : 1, volAbs = Math.abs(vol);
    let h = Math.cbrt(Math.max(volAbs, L[0] * L[1] * L[2] * .02) / alvo);
    let grade;
    for (let tent = 0; tent < 6; tent++) {
      grade = montar(h);
      if (grade.n >= alvo * .55 || grade.n === 0 && tent > 3) break;
      h *= Math.cbrt(grade.n / alvo) || .7;
    }
    return grade;
    function montar(h) {
      const nx = Math.max(1, Math.ceil(L[0] / h)), ny = Math.max(1, Math.ceil(L[1] / h)), nz = Math.max(1, Math.ceil(L[2] / h));
      const o = [b[0] - (nx * h - L[0]) / 2, b[1] - (ny * h - L[1]) / 2, b[2] - (nz * h - L[2]) / 2];
      // 2×2 colunas por voxel: fração cheia de cada voxel (borda inclinada/fina pesa só o que tem de material)
      const S = 2, cx = nx * S, col = Array.from({ length: cx * ny * S }, () => []), hs = h / S;
      const ex = 1.37e-4 * h, ey = 2.11e-4 * h;
      for (const [p, q, r] of tris) {
        const nzv = ((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) * sinal;
        if (Math.abs(nzv) < 1e-14) continue;
        const i0 = Math.max(0, Math.floor((Math.min(p[0], q[0], r[0]) - o[0]) / hs - .5)), i1 = Math.min(cx - 1, Math.ceil((Math.max(p[0], q[0], r[0]) - o[0]) / hs - .5));
        const j0 = Math.max(0, Math.floor((Math.min(p[1], q[1], r[1]) - o[1]) / hs - .5)), j1 = Math.min(ny * S - 1, Math.ceil((Math.max(p[1], q[1], r[1]) - o[1]) / hs - .5));
        const d = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = o[0] + (i + .5) * hs + ex, y = o[1] + (j + .5) * hs + ey;
          const u = ((x - p[0]) * (r[1] - p[1]) - (y - p[1]) * (r[0] - p[0])) / d, v = ((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])) / d;
          if (u < 0 || v < 0 || u + v > 1) continue;
          col[i + cx * j].push([p[2] + u * (q[2] - p[2]) + v * (r[2] - p[2]), nzv < 0 ? 1 : -1]);
        }
      }
      const fr = new Float32Array(nx * ny * nz);
      for (let j = 0; j < ny * S; j++) for (let i = 0; i < cx; i++) {
        const c = col[i + cx * j]; if (!c.length) continue; c.sort((a, b2) => a[0] - b2[0]);
        let w = 0, ini = null; const I = Math.floor(i / S), J = Math.floor(j / S);
        for (const [z, s2] of c) {
          const antes = w > 0; w += s2; const agora = w > 0;
          if (!antes && agora) ini = z;
          else if (antes && !agora && ini != null) { // intervalo cheio [ini, z]
            const k0 = Math.max(0, Math.floor((ini - o[2]) / h)), k1 = Math.min(nz - 1, Math.floor((z - o[2]) / h));
            for (let k = k0; k <= k1; k++) { const a = Math.max(ini, o[2] + k * h), b2 = Math.min(z, o[2] + (k + 1) * h); if (b2 > a) fr[I + nx * (J + ny * k)] += (b2 - a) / h / (S * S); }
            ini = null;
          }
        }
      }
      const solido = new Uint8Array(nx * ny * nz); let n = 0;
      for (let e = 0; e < fr.length; e++) { if (fr[e] > .12) { solido[e] = 1; n++; } fr[e] = Math.min(1, fr[e]); }
      return { nx, ny, nz, h, o, solido, n, fr };
    }
  }

  // ---------- modelo ----------
  function modelo(tris, alvo) {
    const g = voxelizar(tris, alvo);
    const { nx, ny, nz } = g, NX = nx + 1, NY = ny + 1, NZ = nz + 1;
    const els = [], nos = new Int32Array(NX * NY * NZ).fill(-1); let nn = 0;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!g.solido[i + nx * (j + ny * k)]) continue;
      const c = new Int32Array(8);
      for (let a = 0; a < 8; a++) { const gi = (i + (a & 1)) + NX * ((j + ((a >> 1) & 1)) + NY * (k + (a >> 2))); if (nos[gi] < 0) nos[gi] = nn++; c[a] = nos[gi]; }
      els.push({ i, j, k, c });
    }
    const conec = new Int32Array(els.length * 8); els.forEach((e, n) => conec.set(e.c, n * 8));
    const pos = new Float64Array(nn * 3);
    for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const id = nos[i + NX * (j + NY * k)]; if (id >= 0) { pos[3 * id] = g.o[0] + i * g.h; pos[3 * id + 1] = g.o[1] + j * g.h; pos[3 * id + 2] = g.o[2] + k * g.h; } }
    const elIdx = new Int32Array(nx * ny * nz).fill(-1); els.forEach((e, n) => { elIdx[e.i + nx * (e.j + ny * e.k)] = n; });
    const cheio = new Float64Array(els.length); els.forEach((e, n) => { cheio[n] = g.fr[e.i + nx * (e.j + ny * e.k)]; });
    return { ...g, NX, NY, NZ, nos, nn, ne: els.length, els, conec, pos, elIdx, cheio };
  }

  // nós perto de um conjunto de triângulos (distância ponto-triângulo ≤ 0,9 h)
  function nosPerto(M, tris) {
    const sel = new Set(), lim = .9 * M.h;
    for (const t of tris) {
      const lo = [0, 1, 2].map((k) => Math.max(0, Math.floor((Math.min(t[0][k], t[1][k], t[2][k]) - lim - M.o[k]) / M.h)));
      const hi = [0, 1, 2].map((k, n) => Math.min([M.NX, M.NY, M.NZ][n] - 1, Math.ceil((Math.max(t[0][k], t[1][k], t[2][k]) + lim - M.o[k]) / M.h)));
      for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++) {
        const id = M.nos[i + M.NX * (j + M.NY * k)]; if (id < 0 || sel.has(id)) continue;
        if (distTri([M.pos[3 * id], M.pos[3 * id + 1], M.pos[3 * id + 2]], t) <= lim) sel.add(id);
      }
    }
    return [...sel];
  }
  function distTri(p, [a, b, c]) { // Ericson, ponto mais próximo no triângulo
    const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
    const at = (q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), mix = (s, t) => [a[0] + ab[0] * s + ac[0] * t, a[1] + ab[1] * s + ac[1] * t, a[2] + ab[2] * s + ac[2] * t];
    if (d1 <= 0 && d2 <= 0) return at(a);
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return at(b);
    const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(mix(d1 / (d1 - d3), 0));
    const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return at(c);
    const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(mix(0, d2 / (d2 - d6)));
    const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return at([b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]); }
    const den = 1 / (va + vb + vc); return at(mix(vb * den, vc * den));
  }
  function area(t) { const u = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]], v = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]]; return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2; }
  function normal(t) { const u = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]], v = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]]; const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; return n.map((x) => x / l); }

  // ---------- operadores ----------
  function opElastico(M, Ke, fator) { // y = K x  (fator[e] multiplica o elemento)
    const loc = new Float64Array(24), out = new Float64Array(24), h = M.h;
    return (x, y) => {
      y.fill(0);
      for (let e = 0; e < M.ne; e++) {
        const f = (fator ? fator[e] : 1) * M.cheio[e] * h; if (!f) continue;
        const c = e * 8;
        for (let a = 0; a < 8; a++) { const n = M.conec[c + a] * 3; loc[3 * a] = x[n]; loc[3 * a + 1] = x[n + 1]; loc[3 * a + 2] = x[n + 2]; }
        for (let r = 0; r < 24; r++) { let s = 0; const o = r * 24; for (let q = 0; q < 24; q++) s += Ke[o + q] * loc[q]; out[r] = s * f; }
        for (let a = 0; a < 8; a++) { const n = M.conec[c + a] * 3; y[n] += out[3 * a]; y[n + 1] += out[3 * a + 1]; y[n + 2] += out[3 * a + 2]; }
      }
    };
  }
  function diagElastico(M, Ke, fator) {
    const d = new Float64Array(M.nn * 3);
    for (let e = 0; e < M.ne; e++) { const f = (fator ? fator[e] : 1) * M.cheio[e] * M.h; for (let a = 0; a < 8; a++) for (let q = 0; q < 3; q++) d[M.conec[e * 8 + a] * 3 + q] += Ke[(3 * a + q) * 25] * f; }
    return d;
  }
  // Gradiente conjugado com Jacobi; fixo[d] = 1 trava o grau de liberdade (valor de x mantido).
  function cg(A, b, x, diag, fixo, tol, maxIt, prog) {
    const n = b.length, r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), q = new Float64Array(n);
    A(x, q); for (let i = 0; i < n; i++) r[i] = fixo[i] ? 0 : b[i] - q[i];
    let bn = 0; for (let i = 0; i < n; i++) if (!fixo[i]) bn += b[i] * b[i]; bn = Math.sqrt(bn) || 1;
    for (let i = 0; i < n; i++) { z[i] = diag[i] ? r[i] / diag[i] : 0; p[i] = z[i]; }
    let rz = 0; for (let i = 0; i < n; i++) rz += r[i] * z[i];
    let it = 0, res = 1;
    for (; it < maxIt; it++) {
      let rn = 0; for (let i = 0; i < n; i++) rn += r[i] * r[i]; res = Math.sqrt(rn) / bn;
      if (res < tol) break;
      A(p, q); for (let i = 0; i < n; i++) if (fixo[i]) q[i] = 0;
      let pq = 0; for (let i = 0; i < n; i++) pq += p[i] * q[i];
      if (!(pq > 0)) break;
      const al = rz / pq;
      for (let i = 0; i < n; i++) { x[i] += al * p[i]; r[i] -= al * q[i]; }
      let rz2 = 0; for (let i = 0; i < n; i++) { z[i] = diag[i] ? r[i] / diag[i] : 0; rz2 += r[i] * z[i]; }
      const be = rz2 / rz; rz = rz2;
      for (let i = 0; i < n; i++) p[i] = z[i] + be * p[i];
      if (prog && it % 25 === 0) prog(it, res);
    }
    return { it, res };
  }

  // ---------- cargas e apoios ----------
  function condicoes(M, cfg) {
    const nd = M.nn * 3, fixo = new Uint8Array(nd), F = new Float64Array(nd);
    const fix = nosPerto(M, cfg.fixo || []);
    for (const id of fix) fixo[3 * id] = fixo[3 * id + 1] = fixo[3 * id + 2] = 1;
    for (const c of cfg.cargas || []) {
      const ns = nosPerto(M, c.tris); if (!ns.length) continue;
      const A = c.tris.reduce((s, t) => s + area(t), 0);
      let dir = c.dir;
      if (c.dir === 'normal' || c.tipo === 'pressao') { // empurrando a face (contra a normal de fora), média ponderada pela área
        const n = [0, 0, 0]; for (const t of c.tris) { const nt = normal(t), a = area(t); n[0] -= nt[0] * a; n[1] -= nt[1] * a; n[2] -= nt[2] * a; }
        const l = Math.hypot(...n) || 1; dir = n.map((v) => v / l);
      }
      const total = c.tipo === 'pressao' ? c.valor * A : c.valor;
      for (const id of ns) for (let q = 0; q < 3; q++) F[3 * id + q] += total * dir[q] / ns.length;
    }
    if (cfg.gravidade) { // peso próprio, -Z
      const m = cfg.rho * M.h ** 3 / 8 * 9810; // t/mm³ · mm³ · mm/s² = N
      for (let e = 0; e < M.ne; e++) for (let a = 0; a < 8; a++) F[M.conec[e * 8 + a] * 3 + 2] -= m * M.cheio[e];
    }
    return { fixo, F, nfix: fix.length };
  }

  // tensão de von Mises por elemento e média nos nós
  function tensoes(M, u, E, el, fator) {
    const vm = new Float64Array(M.ne), loc = new Float64Array(24), s = new Float64Array(6), eps = new Float64Array(6);
    for (let e = 0; e < M.ne; e++) {
      for (let a = 0; a < 8; a++) { const n = M.conec[e * 8 + a] * 3; loc[3 * a] = u[n]; loc[3 * a + 1] = u[n + 1]; loc[3 * a + 2] = u[n + 2]; }
      for (let k = 0; k < 6; k++) { let v = 0; for (let q = 0; q < 24; q++) v += el.B0[k][q] * loc[q]; eps[k] = v / M.h; }
      for (let k = 0; k < 6; k++) { let v = 0; for (let q = 0; q < 6; q++) v += el.D[k][q] * eps[q]; s[k] = v * E * (fator ? fator[e] : 1); }
      vm[e] = Math.sqrt(.5 * ((s[0] - s[1]) ** 2 + (s[1] - s[2]) ** 2 + (s[2] - s[0]) ** 2) + 3 * (s[3] ** 2 + s[4] ** 2 + s[5] ** 2));
    }
    return { vm, vmNo: mediaNos(M, vm) };
  }
  function mediaNos(M, v) {
    const s = new Float64Array(M.nn), c = new Float64Array(M.nn);
    for (let e = 0; e < M.ne; e++) for (let a = 0; a < 8; a++) { const n = M.conec[e * 8 + a]; s[n] += v[e]; c[n]++; }
    for (let n = 0; n < M.nn; n++) s[n] /= c[n] || 1;
    return s;
  }


  // ---------- solução direta (Cholesky em perfil, nós reordenados por RCM) ----------
  // Peças compridas e finas (mola, viga, haste) fazem o gradiente conjugado andar devagar; nelas a fatoração
  // direta é rápida porque a "largura de banda" fica pequena. Se ficar cara demais, devolve null e usa o CG.
  function direto(M, Ke, fator, fixo, prog, limite = 2e9) {
    const nn = M.nn, adj = Array.from({ length: nn }, () => new Set());
    for (let e = 0; e < M.ne; e++) for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) if (a !== b) adj[M.conec[e * 8 + a]].add(M.conec[e * 8 + b]);
    const viz = adj.map((s) => [...s]);
    const bfs = (ini) => { const nivel = new Int32Array(nn).fill(-1), ordem = [ini]; nivel[ini] = 0; for (let q = 0; q < ordem.length; q++) for (const v of viz[ordem[q]]) if (nivel[v] < 0) { nivel[v] = nivel[ordem[q]] + 1; ordem.push(v); } return { nivel, ordem }; };
    let semente = 0; for (let i = 1; i < nn; i++) if (viz[i].length < viz[semente].length) semente = i;
    for (let k = 0; k < 2; k++) { const { ordem } = bfs(semente); semente = ordem[ordem.length - 1]; } // nó periférico
    const visto = new Uint8Array(nn), cm = [];
    for (let s0 = semente; cm.length < nn;) {
      cm.push(s0); visto[s0] = 1;
      for (let q = cm.length - 1; q < cm.length; q++) { const vs = viz[cm[q]].filter((v) => !visto[v]).sort((a, b) => viz[a].length - viz[b].length); for (const v of vs) { visto[v] = 1; cm.push(v); } }
      if (cm.length < nn) { s0 = 0; while (visto[s0]) s0++; }
    }
    cm.reverse();
    const id = new Int32Array(nn * 3).fill(-1); let n = 0;
    for (const no of cm) for (let q = 0; q < 3; q++) if (!fixo[3 * no + q]) id[3 * no + q] = n++;
    const f = new Int32Array(n); for (let i = 0; i < n; i++) f[i] = i;
    const ids = new Int32Array(24);
    for (let e = 0; e < M.ne; e++) {
      let mn = Infinity; for (let a = 0; a < 8; a++) for (let q = 0; q < 3; q++) { const d = id[3 * M.conec[e * 8 + a] + q]; if (d >= 0 && d < mn) mn = d; }
      for (let a = 0; a < 8; a++) for (let q = 0; q < 3; q++) { const d = id[3 * M.conec[e * 8 + a] + q]; if (d >= 0 && mn < f[d]) f[d] = mn; }
    }
    const ini = new Float64Array(n + 1); let flops = 0;
    for (let i = 0; i < n; i++) { const l = i - f[i] + 1; ini[i + 1] = ini[i] + l; flops += l * l / 2; }
    if (ini[n] > 3.5e7 || flops > limite) return null; // grande demais para fazer direto no navegador
    const L = new Float64Array(ini[n]);
    for (let e = 0; e < M.ne; e++) {
      const fac = (fator ? fator[e] : 1) * M.cheio[e] * M.h; if (!fac) continue;
      for (let a = 0; a < 8; a++) for (let q = 0; q < 3; q++) ids[3 * a + q] = id[3 * M.conec[e * 8 + a] + q];
      for (let a = 0; a < 24; a++) { const ra = ids[a]; if (ra < 0) continue; const o = ini[ra] - f[ra];
        for (let b = 0; b < 24; b++) { const rb = ids[b]; if (rb < 0 || rb > ra) continue; L[o + rb] += Ke[a * 24 + b] * fac; } }
    }
    for (let i = 0; i < n; i++) { // Cholesky (Crout por linha)
      const fi = f[i], oi = ini[i] - fi;
      for (let j = fi; j < i; j++) {
        const fj = f[j], oj = ini[j] - fj, k0 = fi > fj ? fi : fj; let s = L[oi + j];
        for (let k = k0; k < j; k++) s -= L[oi + k] * L[oj + k];
        L[oi + j] = s / L[oj + j];
      }
      let s = L[oi + i]; for (let k = fi; k < i; k++) s -= L[oi + k] * L[oi + k];
      if (!(s > 0)) return null; // solto (sem apoio suficiente)
      L[oi + i] = Math.sqrt(s);
      if (prog && i % 800 === 0) prog({ fase: 'Fatorando', it: Math.round(i / n * 100) + '%', res: 0 });
    }
    return (b, x) => { // resolve K x = b (graus fixos ficam como estão em x)
      const y = new Float64Array(n);
      for (let no = 0; no < nn * 3; no++) if (id[no] >= 0) y[id[no]] = b[no];
      for (let i = 0; i < n; i++) { const fi = f[i], oi = ini[i] - fi; let s = y[i]; for (let k = fi; k < i; k++) s -= L[oi + k] * y[k]; y[i] = s / L[oi + i]; }
      for (let i = n - 1; i >= 0; i--) { const fi = f[i], oi = ini[i] - fi; y[i] /= L[oi + i]; const v = y[i]; for (let k = fi; k < i; k++) y[k] -= L[oi + k] * v; }
      for (let no = 0; no < nn * 3; no++) if (id[no] >= 0) x[no] = y[id[no]];
      return x;
    };
  }

  // ---------- estudos ----------
  function estatico(tris, cfg, prog) {
    const M = modelo(tris, cfg.alvo || 12000); if (!M.ne) throw new Error('não deu para montar a malha');
    const el = elemento(cfg.nu), E = cfg.E;
    const { fixo, F, nfix } = condicoes(M, cfg);
    if (!nfix) throw new Error('nenhum nó ficou preso nas faces fixas');
    const A = opElastico(M, el.K), dg = diagElastico(M, el.K);
    const u = new Float64Array(M.nn * 3);
    for (let i = 0; i < F.length; i++) F[i] /= E; // resolve com E = 1 e divide a carga
    let r; const dir = direto(M, el.K, null, fixo, prog);
    if (dir) { dir(F, u); r = { it: 0, res: 0, direto: true }; }
    else {
      r = cg(A, F, u, dg, fixo, 1e-6, 400, (it, res) => prog?.({ fase: 'Resolvendo', it, res })); // peça compacta converge antes disso
      if (r.res >= 1e-6) { const d2 = direto(M, el.K, null, fixo, prog, 9e9); // peça fina e comprida: termina direto
        if (d2) { d2(F, u); r = { it: r.it, res: 0, direto: true }; } else r = cg(A, F, u, dg, fixo, 1e-6, 4000, (it, res) => prog?.({ fase: 'Resolvendo', it: it + 400, res })); }
    }
    const { vm, vmNo } = tensoes(M, u, E, el);
    return { tipo: 'estatico', malha: resumo(M), u, vmNo, it: r.it, res: r.res, maxVM: Math.max(...vmNo), M };
  }

  function modal(tris, cfg, prog) {
    const M = modelo(tris, cfg.alvo || 6000); if (!M.ne) throw new Error('não deu para montar a malha');
    const el = elemento(cfg.nu), nd = M.nn * 3;
    const { fixo, nfix } = condicoes(M, { fixo: cfg.fixo });
    if (!nfix) throw new Error('modal precisa de pelo menos uma face fixa');
    const A = opElastico(M, el.K), dg = diagElastico(M, el.K);
    const mas = new Float64Array(nd); const me = cfg.rho * M.h ** 3 / 8;
    for (let e = 0; e < M.ne; e++) for (let a = 0; a < 8; a++) for (let q = 0; q < 3; q++) mas[M.conec[e * 8 + a] * 3 + q] += me;
    for (let e = 0; e < M.ne; e++) for (let a = 0; a < 8; a++) for (let q = 0; q < 3; q++) mas[M.conec[e * 8 + a] * 3 + q] += me * (M.cheio[e] - 1);
    const dirM = direto(M, el.K, null, fixo, prog, 6e9);
    // Lanczos em K⁻¹M (produto interno de M), reortogonalização completa
    const passos = Math.min(30, Math.max(12, cfg.modos * 4 + 4)), V = [], alfa = [], beta = [];
    let semente = 7; const rnd = () => (semente = (semente * 16807) % 2147483647) / 2147483647 - .5;
    const mdot = (a, c) => { let s = 0; for (let i = 0; i < nd; i++) if (!fixo[i]) s += a[i] * mas[i] * c[i]; return s; };
    let v = new Float64Array(nd); for (let i = 0; i < nd; i++) v[i] = fixo[i] ? 0 : rnd();
    let nv = Math.sqrt(mdot(v, v)); for (let i = 0; i < nd; i++) v[i] /= nv;
    const b = new Float64Array(nd);
    for (let j = 0; j < passos; j++) {
      V.push(v); for (let i = 0; i < nd; i++) b[i] = fixo[i] ? 0 : mas[i] * v[i];
      const w = new Float64Array(nd); if (dirM) dirM(b, w); else cg(A, b, w, dg, fixo, 1e-6, 3000);
      prog?.({ fase: `Frequências — passo ${j + 1} de ${passos}`, it: j, res: 0 });
      alfa.push(mdot(w, v));
      for (let rep = 0; rep < 2; rep++) for (const u of V) { const c = mdot(w, u); for (let i = 0; i < nd; i++) w[i] -= c * u[i]; }
      const bt = Math.sqrt(mdot(w, w)); beta.push(bt);
      if (bt < 1e-30) break;
      v = w.map((x) => x / bt);
    }
    const m = V.length, sim = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => i === j ? alfa[i] : Math.abs(i - j) === 1 ? beta[Math.min(i, j)] : 0));
    const I = sim.map((r, i) => r.map((_, j) => +(i === j)));
    const { val, vec } = autoGeneral(sim.map((r) => r.map((x) => -x)), I); // maiores de K⁻¹M = menores λ
    const lam = val.map((x) => -1 / x), X = [];
    for (let j = 0; j < cfg.modos && j < m; j++) { const u = new Float64Array(nd); for (let a = 0; a < m; a++) { const c = vec[a][j]; for (let i = 0; i < nd; i++) u[i] += c * V[a][i]; } X.push(u); }
    const modos = [];
    for (let j = 0; j < X.length; j++) {
      const w2 = lam[j] * cfg.E; const v = X[j]; let mx = 0; for (let i = 0; i < nd; i++) mx = Math.max(mx, Math.abs(v[i]));
      modos.push({ f: Math.sqrt(Math.max(w2, 0)) / (2 * Math.PI), u: v.map((x) => x / (mx || 1)) });
    }
    return { tipo: 'modal', malha: resumo(M), modos, M };
  }
  function autoGeneral(K, Mm) { // K v = λ M v, q pequeno: Cholesky + Jacobi
    const q = K.length, L = Array.from({ length: q }, () => new Float64Array(q));
    for (let i = 0; i < q; i++) for (let j = 0; j <= i; j++) { let s = Mm[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-300)) : s / L[j][j]; }
    const Li = Array.from({ length: q }, () => new Float64Array(q));
    for (let i = 0; i < q; i++) { Li[i][i] = 1 / L[i][i]; for (let j = 0; j < i; j++) { let s = 0; for (let k = j; k < i; k++) s -= L[i][k] * Li[k][j]; Li[i][j] = s / L[i][i]; } }
    const A = Array.from({ length: q }, (_, i) => Array.from({ length: q }, (_, j) => { let s = 0; for (let a = 0; a < q; a++) for (let c = 0; c < q; c++) s += Li[i][a] * K[a][c] * Li[j][c]; return s; }));
    const V = Array.from({ length: q }, (_, i) => Array.from({ length: q }, (_, j) => +(i === j)));
    for (let sw = 0; sw < 60; sw++) {
      let off = 0; for (let i = 0; i < q; i++) for (let j = i + 1; j < q; j++) off += A[i][j] ** 2; if (off < 1e-22) break;
      for (let p = 0; p < q; p++) for (let r = p + 1; r < q; r++) {
        if (Math.abs(A[p][r]) < 1e-300) continue;
        const th = (A[r][r] - A[p][p]) / (2 * A[p][r]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < q; k++) { const a = A[k][p], b = A[k][r]; A[k][p] = c * a - s * b; A[k][r] = s * a + c * b; }
        for (let k = 0; k < q; k++) { const a = A[p][k], b = A[r][k]; A[p][k] = c * a - s * b; A[r][k] = s * a + c * b; }
        for (let k = 0; k < q; k++) { const a = V[k][p], b = V[k][r]; V[k][p] = c * a - s * b; V[k][r] = s * a + c * b; }
      }
    }
    const ord = [...Array(q).keys()].sort((a, b) => A[a][a] - A[b][b]);
    const val = ord.map((i) => A[i][i]);
    const vec = Array.from({ length: q }, (_, a) => ord.map((j) => { let s = 0; for (let k = 0; k < q; k++) s += Li[k][a] * V[k][j]; return s; })); // L^-T V
    return { val, vec };
  }

  function termico(tris, cfg, prog) {
    const M = modelo(tris, cfg.alvo || 12000); if (!M.ne) throw new Error('não deu para montar a malha');
    const el = elemento(.3), k = cfg.k / 1000, h = M.h, hc = (cfg.hconv || 0) / 1e6; // W/mm·K, W/mm²·K
    const n = M.nn, fixo = new Uint8Array(n), T = new Float64Array(n).fill(cfg.tAmb ?? 20), b = new Float64Array(n), conv = new Float64Array(n);
    for (const c of cfg.temps || []) for (const id of nosPerto(M, c.tris)) { fixo[id] = 1; T[id] = c.valor; }
    for (const c of cfg.calor || []) { const ns = nosPerto(M, c.tris); for (const id of ns) b[id] += c.valor / ns.length; }
    if (hc) { // convecção nas faces de voxel que dão para fora
      const { nx, ny, nz } = M, a4 = hc * h * h / 4;
      const viz = [[-1, 0, 0, [0, 2, 4, 6]], [1, 0, 0, [1, 3, 5, 7]], [0, -1, 0, [0, 1, 4, 5]], [0, 1, 0, [2, 3, 6, 7]], [0, 0, -1, [0, 1, 2, 3]], [0, 0, 1, [4, 5, 6, 7]]];
      M.els.forEach((e, ei) => { for (const [di, dj, dk, ls] of viz) {
        const i = e.i + di, j = e.j + dj, kk = e.k + dk;
        const vazio = i < 0 || j < 0 || kk < 0 || i >= nx || j >= ny || kk >= nz || !M.solido[i + nx * (j + ny * kk)];
        if (vazio) for (const l of ls) { const id = M.conec[ei * 8 + l]; conv[id] += a4; b[id] += a4 * (cfg.tAmb ?? 20); }
      } });
    }
    if (!fixo.some(Boolean) && !hc) throw new Error('falta uma face com temperatura fixa ou a troca de calor com o ar');
    const loc = new Float64Array(8);
    const A = (x, y) => { y.fill(0); for (let e = 0; e < M.ne; e++) { for (let a = 0; a < 8; a++) loc[a] = x[M.conec[e * 8 + a]]; for (let r = 0; r < 8; r++) { let s = 0; for (let q = 0; q < 8; q++) s += el.Kt[r * 8 + q] * loc[q]; y[M.conec[e * 8 + r]] += s * k * h * M.cheio[e]; } } for (let i = 0; i < n; i++) y[i] += conv[i] * x[i]; };
    const dg = new Float64Array(n); for (let e = 0; e < M.ne; e++) for (let a = 0; a < 8; a++) dg[M.conec[e * 8 + a]] += el.Kt[a * 9] * k * h * M.cheio[e]; for (let i = 0; i < n; i++) dg[i] += conv[i];
    const r = cg(A, b, T, dg, fixo, 1e-8, 8000, (it, res) => prog?.({ fase: 'Resolvendo calor', it, res }));
    let tmin = Infinity, tmax = -Infinity; for (const v of T) { tmin = Math.min(tmin, v); tmax = Math.max(tmax, v); }
    // Transiente (aquecendo com o tempo): Euler implícito, passos que crescem até chegar no regime permanente.
    const quadros = [];
    if (cfg.cp && cfg.rhoKg) {
      const C = new Float64Array(n), ce = cfg.rhoKg * 1e-9 * cfg.cp * h ** 3 / 8; // J/K por nó
      for (let e = 0; e < M.ne; e++) for (let a = 0; a < 8; a++) C[M.conec[e * 8 + a]] += ce * M.cheio[e];
      const L = Math.max(M.nx, M.ny, M.nz) * h, alfa = k / (cfg.rhoKg * 1e-9 * cfg.cp); // mm²/s
      const tau = L * L / alfa;
      const Tt = new Float64Array(n).fill(cfg.tAmb ?? 20); for (let i = 0; i < n; i++) if (fixo[i]) Tt[i] = T[i];
      quadros.push({ t: 0, T: Tt.slice() });
      let t = 0; const N = 30, t0 = tau / 400, t1 = tau * 2;
      const rhs = new Float64Array(n), dgt = new Float64Array(n);
      for (let q = 1; q <= N; q++) {
        const tn = t0 * Math.pow(t1 / t0, (q - 1) / (N - 1)), dt = tn - t;
        const At = (x, y) => { A(x, y); for (let i = 0; i < n; i++) y[i] += C[i] / dt * x[i]; };
        for (let i = 0; i < n; i++) { rhs[i] = b[i] + C[i] / dt * Tt[i]; dgt[i] = dg[i] + C[i] / dt; }
        cg(At, rhs, Tt, dgt, fixo, 1e-7, 4000);
        t = tn; quadros.push({ t, T: Tt.slice() });
        prog?.({ fase: `Aquecendo no tempo — ${q} de ${N}`, it: q, res: 0 });
        let dif = 0; for (let i = 0; i < n; i++) dif = Math.max(dif, Math.abs(Tt[i] - T[i])); if (dif < (tmax - tmin) * .01 + 1e-3) break;
      }
    }
    return { tipo: 'termico', malha: resumo(M), T, tmin, tmax, it: r.it, M, quadros };
  }

  // Otimização de forma (topologia SIMP): tira material onde quase não trabalha, mantendo a rigidez.
  function otimizar(tris, cfg, prog) {
    const M = modelo(tris, cfg.alvo || 8000); if (!M.ne) throw new Error('não deu para montar a malha');
    const el = elemento(cfg.nu);
    const { fixo, F, nfix } = condicoes(M, cfg); if (!nfix) throw new Error('falta fixar uma face');
    const pen = 3, xmin = 1e-3, vf = cfg.manter;
    const x = new Float64Array(M.ne).fill(vf), fat = new Float64Array(M.ne), dc = new Float64Array(M.ne), protegido = new Uint8Array(M.ne);
    const marcados = new Uint8Array(M.nn); for (let i = 0; i < M.nn; i++) if (fixo[3 * i] || F[3 * i] || F[3 * i + 1] || F[3 * i + 2]) marcados[i] = 1;
    for (let e = 0; e < M.ne; e++) for (let a = 0; a < 8; a++) if (marcados[M.conec[e * 8 + a]]) protegido[e] = 1;
    // vizinhos do filtro (raio 1,5 voxel)
    const viz = []; for (const e of M.els) { const l = [];
      for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = e.i + di, j = e.j + dj, k = e.k + dk; if (i < 0 || j < 0 || k < 0 || i >= M.nx || j >= M.ny || k >= M.nz) continue;
        const o = M.elIdx[i + M.nx * (j + M.ny * k)]; if (o >= 0) l.push(o, 1.5 - Math.hypot(di, dj, dk)); }
      viz.push(l); }
    const u = new Float64Array(M.nn * 3), loc = new Float64Array(24); let c = 0, hist = [], fotos = [new Float64Array(M.ne).fill(1)];
    for (let it = 0; it < (cfg.iter || 30); it++) {
      for (let e = 0; e < M.ne; e++) fat[e] = xmin + (1 - xmin) * x[e] ** pen;
      const A = opElastico(M, el.K, fat), dg = diagElastico(M, el.K, fat);
      const dO = direto(M, el.K, fat, fixo); if (dO) dO(F, u); else cg(A, F, u, dg, fixo, 2e-3, 1200);
      c = 0;
      for (let e = 0; e < M.ne; e++) {
        for (let a = 0; a < 8; a++) { const n = M.conec[e * 8 + a] * 3; loc[3 * a] = u[n]; loc[3 * a + 1] = u[n + 1]; loc[3 * a + 2] = u[n + 2]; }
        let ue = 0; for (let r = 0; r < 24; r++) { let s = 0; for (let q = 0; q < 24; q++) s += el.K[r * 24 + q] * loc[q]; ue += loc[r] * s; } ue *= M.h;
        c += fat[e] * ue; dc[e] = -pen * (1 - xmin) * x[e] ** (pen - 1) * ue;
      }
      const dcf = new Float64Array(M.ne);
      for (let e = 0; e < M.ne; e++) { let s = 0, w = 0; const l = viz[e]; for (let m = 0; m < l.length; m += 2) { s += l[m + 1] * x[l[m]] * dc[l[m]]; w += l[m + 1]; } dcf[e] = s / (Math.max(x[e], 1e-3) * w); }
      let l1 = 0, l2 = 1e9, xn = new Float64Array(M.ne); const mv = .2;
      while ((l2 - l1) / (l1 + l2) > 1e-4) {
        const lm = (l1 + l2) / 2; let vol = 0;
        for (let e = 0; e < M.ne; e++) { xn[e] = protegido[e] ? 1 : Math.max(.001, Math.max(x[e] - mv, Math.min(1, Math.min(x[e] + mv, x[e] * Math.sqrt(Math.max(-dcf[e], 0) / lm))))); vol += xn[e]; }
        if (vol > vf * M.ne) l1 = lm; else l2 = lm;
      }
      let mud = 0; for (let e = 0; e < M.ne; e++) { mud = Math.max(mud, Math.abs(xn[e] - x[e])); x[e] = xn[e]; }
      hist.push(c); fotos.push(x.slice()); prog?.({ fase: `Otimizando — passo ${it + 1}`, it, res: mud });
      if (it > 6 && mud < .01) break;
    }
    return { tipo: 'otimizacao', malha: resumo(M), x, M, flex: c, fotos };
  }

  function resumo(M) { return { ne: M.ne, nn: M.nn, h: M.h }; }

  // valor nos pontos (interpolação trilinear dentro do voxel mais perto, por dentro da superfície)
  function amostrar(M, campo, comp, p, nrm) {
    const h = M.h;
    for (const rec of [.35, .7, 1.2, 0]) {
      const q = [p[0] - nrm[0] * rec * h, p[1] - nrm[1] * rec * h, p[2] - nrm[2] * rec * h];
      const f = [(q[0] - M.o[0]) / h, (q[1] - M.o[1]) / h, (q[2] - M.o[2]) / h];
      const i = Math.min(M.nx - 1, Math.max(0, Math.floor(f[0]))), j = Math.min(M.ny - 1, Math.max(0, Math.floor(f[1]))), k = Math.min(M.nz - 1, Math.max(0, Math.floor(f[2])));
      const e = M.elIdx[i + M.nx * (j + M.ny * k)]; if (e < 0) continue;
      const a = Math.min(1, Math.max(0, f[0] - i)), b = Math.min(1, Math.max(0, f[1] - j)), c = Math.min(1, Math.max(0, f[2] - k));
      const out = new Float64Array(comp);
      for (let n = 0; n < 8; n++) { const w = (n & 1 ? a : 1 - a) * (n & 2 ? b : 1 - b) * (n & 4 ? c : 1 - c), id = M.conec[e * 8 + n]; for (let q2 = 0; q2 < comp; q2++) out[q2] += w * campo[id * comp + q2]; }
      return out;
    }
    return null;
  }
  // superfície dos voxels que ficaram (resultado da otimização)
  function casca(M, manter) {
    const out = [], h = M.h, { nx, ny, nz } = M;
    const ok = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && M.elIdx[i + nx * (j + ny * k)] >= 0 && manter[M.elIdx[i + nx * (j + ny * k)]];
    const F = [[[-1, 0, 0], [0, 4, 6, 2]], [[1, 0, 0], [1, 3, 7, 5]], [[0, -1, 0], [0, 1, 5, 4]], [[0, 1, 0], [2, 6, 7, 3]], [[0, 0, -1], [0, 2, 3, 1]], [[0, 0, 1], [4, 5, 7, 6]]];
    M.els.forEach((e, ei) => { if (!manter[ei]) return;
      const v = (a) => [M.o[0] + (e.i + (a & 1)) * h, M.o[1] + (e.j + ((a >> 1) & 1)) * h, M.o[2] + (e.k + (a >> 2)) * h];
      for (const [d, q] of F) if (!ok(e.i + d[0], e.j + d[1], e.k + d[2])) { const p = q.map(v); out.push([p[0], p[1], p[2], d, ei], [p[0], p[2], p[3], d, ei]); }
    });
    return out;
  }
  return { elemento, voxelizar, modelo, estatico, modal, termico, otimizar, amostrar, casca, nosPerto };
}
if (typeof module !== 'undefined') module.exports = tracoNucleoFEA;
