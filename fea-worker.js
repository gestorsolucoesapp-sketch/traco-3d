// Trabalhador da simulação: monta a malha, resolve e devolve os valores já nos vértices da peça.
importScripts('fea-nucleo.js' + self.location.search);
const N = tracoNucleoFEA();
self.onmessage = (ev) => {
  const { estudo, tris, cfg } = ev.data;
  const pega = (ids) => (ids || []).map((i) => tris[i]);
  const prog = (p) => self.postMessage({ prog: p });
  try {
    const c = { ...cfg, fixo: pega(cfg.fixo), cargas: (cfg.cargas || []).map((k) => ({ ...k, tris: pega(k.tris) })), temps: (cfg.temps || []).map((k) => ({ ...k, tris: pega(k.tris) })), calor: (cfg.calor || []).map((k) => ({ ...k, tris: pega(k.tris) })) };
    const t0 = Date.now();
    const r = N[estudo](tris, c, prog);
    const M = r.M;
    // subdivide a superfície para as cores saírem suaves (arestas até ~1,5 cubinho)
    const fino = [], pai = []; let areaT = 0; for (const [a, b, c] of tris) { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; areaT += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2; }
    const lim = Math.max(1.5 * M.h, Math.sqrt(areaT / 9000) * 1.6), teto = 30000;
    const meio = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const divide = (t, i, n) => { const [a, b, c] = t; if (n > 6 || fino.length > teto || Math.max(d(a, b), d(b, c), d(c, a)) <= lim) { fino.push(t); pai.push(i); return; }
      const ab = meio(a, b), bc = meio(b, c), ca = meio(c, a); divide([a, ab, ca], i, n + 1); divide([ab, b, bc], i, n + 1); divide([ca, bc, c], i, n + 1); divide([ab, bc, ca], i, n + 1); };
    if (estudo !== 'otimizar') tris.forEach((t, i) => divide(t, i, 0));
    const T0 = tris; const trisS = estudo !== 'otimizar' ? fino : tris, nt = trisS.length;
    let vol = 0; for (const [a, b, d] of T0) vol += a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0]);
    const sg = vol < 0 ? -1 : 1;
    const nrm = trisS.map(([a, b, d]) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]; const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = (Math.hypot(...n) || 1) * sg; return n.map((x) => x / l); });
    const amostra = (campo, comp) => { const out = new Float32Array(nt * 3 * comp); let falta = 0;
      for (let t = 0; t < nt; t++) for (let v = 0; v < 3; v++) { const s = N.amostrar(M, campo, comp, trisS[t][v], nrm[t]); if (!s) { falta++; continue; } for (let q = 0; q < comp; q++) out[(t * 3 + v) * comp + q] = s[q]; }
      return out; };
    const res = { estudo, malha: r.malha, ms: 0 };
    if (estudo !== 'otimizar') { res.tris = trisS; res.pai = Int32Array.from(pai); }
    const tr = [];
    if (estudo === 'estatico') {
      res.u = amostra(r.u, 3); res.vm = amostra(r.vmNo, 1); res.maxVM = r.maxVM; res.it = r.it; res.convergiu = r.res < 1e-4;
      let mu = 0; for (let i = 0; i < M.nn; i++) mu = Math.max(mu, Math.hypot(r.u[3 * i], r.u[3 * i + 1], r.u[3 * i + 2])); res.maxU = mu;
      tr.push(res.u.buffer, res.vm.buffer);
    } else if (estudo === 'modal') {
      res.modos = r.modos.map((m) => { const u = amostra(m.u, 3); tr.push(u.buffer); return { f: m.f, u }; });
    } else if (estudo === 'termico') {
      res.T = amostra(r.T, 1); res.tmin = r.tmin; res.tmax = r.tmax; tr.push(res.T.buffer);
    } else if (estudo === 'otimizar') {
      const manter = Array.from(r.x, (x) => x > .5);
      const casca = N.casca(M, manter);
      res.casca = casca.map(([a, b, d, n]) => [a, b, d, n]);
      res.manter = manter.filter(Boolean).length; res.total = M.ne;
      let vc = 0; for (let e = 0; e < M.ne; e++) vc += M.cheio[e]; res.volTotal = vc * M.h ** 3;
      let vk = 0; for (let e = 0; e < M.ne; e++) if (manter[e]) vk += M.cheio[e]; res.volFica = vk * M.h ** 3;
    }
    res.ms = Date.now() - t0;
    self.postMessage({ fim: res }, tr);
  } catch (e) { self.postMessage({ erro: String(e.message || e) }); }
};
