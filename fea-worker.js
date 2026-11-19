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
    const lim = Math.max(1.5 * M.h, Math.sqrt(areaT / 12000) * 1.6), teto = 40000;
    const meio = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const divide = (t, i, n) => { // corta pela aresta mais comprida (não explode em triângulos finos e compridos)
      const [a, b, c] = t, l0 = d(a, b), l1 = d(b, c), l2 = d(c, a), mx = Math.max(l0, l1, l2);
      if (n > 24 || fino.length > teto || mx <= lim) { fino.push(t); pai.push(i); return; }
      if (mx === l0) { const m = meio(a, b); divide([a, m, c], i, n + 1); divide([m, b, c], i, n + 1); }
      else if (mx === l1) { const m = meio(b, c); divide([a, b, m], i, n + 1); divide([a, m, c], i, n + 1); }
      else { const m = meio(c, a); divide([a, b, m], i, n + 1); divide([m, b, c], i, n + 1); }
    };
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
      // quadros do aquecimento: média por triângulo
      res.quadros = (r.quadros || []).map((q) => { const v = amostra(q.T, 1), f = new Float32Array(nt); for (let t = 0; t < nt; t++) f[t] = (v[t * 3] + v[t * 3 + 1] + v[t * 3 + 2]) / 3; tr.push(f.buffer); return { t: q.t, f }; });
      for (const q of r.quadros || []) for (const v of q.T) { res.tmin = Math.min(res.tmin, v); res.tmax = Math.max(res.tmax, v); }
      // sem calor (0 W): permite mudar a potência ao vivo, sem recalcular (o calor é linear)
      if ((c.calor || []).length) {
        const r0 = N.termico(tris, { ...c, calor: c.calor.map((k) => ({ ...k, valor: 0 })) }, (p) => prog({ ...p, fase: 'Base sem calor: ' + p.fase }));
        const am0 = (campo) => { const out = new Float32Array(nt * 3); for (let t = 0; t < nt; t++) for (let v = 0; v < 3; v++) { const s2 = N.amostrar(r0.M, campo, 1, trisS[t][v], nrm[t]); if (s2) out[t * 3 + v] = s2[0]; } return out; };
        res.T0 = am0(r0.T); res.P0 = c.calor.reduce((a, k) => a + k.valor, 0); tr.push(res.T0.buffer);
        res.quadros0 = (r0.quadros || []).map((q) => { const v = am0(q.T), f = new Float32Array(nt); for (let t = 0; t < nt; t++) f[t] = (v[t * 3] + v[t * 3 + 1] + v[t * 3 + 2]) / 3; tr.push(f.buffer); return { t: q.t, f }; });
      }
    } else if (estudo === 'otimizar') {
      // evolução: algumas fotos do material sendo retirado
      const idx = r.fotos.length <= 8 ? r.fotos.map((_, i) => i) : Array.from({ length: 8 }, (_, i) => Math.round(i * (r.fotos.length - 1) / 7));
      res.evolucao = idx.map((i) => N.casca(M, Array.from(r.fotos[i], (x) => x > .5)).map(([a, b, d, n]) => [a, b, d, n]));
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
