// Redemoinho de montagem: uma nuvem de partículas gira e se junta formando a peça pedida
// (inspirado na nuvem de pareamento do Apple Watch). Toque pula.
(() => {
  const TAU = Math.PI * 2;
  function amostrar(tris, n) { // pontos espalhados na superfície, proporcional à área
    const areas = [], cum = []; let tot = 0;
    for (const t of tris) {
      const [a, b, c] = t.points, u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const ar = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
      tot += ar; areas.push(ar); cum.push(tot);
    }
    const pts = [];
    for (let i = 0; i < n; i++) {
      const r = Math.random() * tot; let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
      const [a, b, c] = tris[lo].points; let s = Math.random(), t = Math.random(); if (s + t > 1) { s = 1 - s; t = 1 - t; }
      pts.push({ p: [a[0] + (b[0] - a[0]) * s + (c[0] - a[0]) * t, a[1] + (b[1] - a[1]) * s + (c[1] - a[1]) * t, a[2] + (b[2] - a[2]) * s + (c[2] - a[2]) * t], n: tris[lo].normal });
    }
    return pts;
  }
  window.tracoRedemoinho = (tris, titulo = 'Montando sua peça…', fim) => new Promise((resolve) => {
    if (!tris || !tris.length || matchMedia('(prefers-reduced-motion: reduce)').matches) { resolve(); return; }
    const ov = document.createElement('div'); ov.className = 'redemoinho';
    ov.innerHTML = `<canvas></canvas><div class="rd-txt"><b>${titulo}</b><small>toque para pular</small></div>`;
    document.body.appendChild(ov);
    const cv = ov.querySelector('canvas'), ctx = cv.getContext('2d'), txt = ov.querySelector('.rd-txt b');
    const dpr = Math.min(2, devicePixelRatio || 1);
    const tam = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; };
    tam(); addEventListener('resize', tam);
    // centraliza o modelo
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const t of tris) for (const q of t.points) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); }
    const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], R = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2 || 1;
    const N = Math.min(4200, Math.max(1600, tris.length * 2));
    const pts = amostrar(tris, N).map((o) => {
      const p = [(o.p[0] - c[0]) / R, (o.p[1] - c[1]) / R, (o.p[2] - c[2]) / R];
      const ang = Math.random() * TAU, rad = 1.6 + Math.random() * 1.6, h = (Math.random() - .5) * 3;
      return { p, n: o.n, s: [Math.cos(ang) * rad, Math.sin(ang) * rad, h], atraso: Math.random() * .35, giro: (2 + Math.random() * 2.5) * TAU, tam: .6 + Math.random() * 1.3 };
    });
    const DUR = 3.6, SEGURA = 1.1, t0 = performance.now();
    let acabou = false, raf = 0;
    const ease = (x) => 1 - Math.pow(1 - x, 3);
    function quadro(agora) {
      const T = (agora - t0) / 1000;
      const W = cv.width, H = cv.height, esc = Math.min(W, H) * .26;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(10,16,14,.38)'; ctx.fillRect(0, 0, W, H); // rastro
      ctx.globalCompositeOperation = 'lighter';
      const spin = T * .9, cs = Math.cos(spin), sn = Math.sin(spin), tilt = .52, ct = Math.cos(tilt), st = Math.sin(tilt);
      for (const q of pts) {
        const e = ease(Math.max(0, Math.min(1, (T / DUR - q.atraso) / (1 - q.atraso))));
        let x = q.s[0] * (1 - e) + q.p[0] * e, y = q.s[1] * (1 - e) + q.p[1] * e, z = q.s[2] * (1 - e) + q.p[2] * e;
        const g = q.giro * (1 - e), cg = Math.cos(g), sg = Math.sin(g); [x, y] = [x * cg - y * sg, x * sg + y * cg];
        const xr = x * cs - y * sn, yr = x * sn + y * cs;
        const sx = W / 2 + xr * esc, sy = H / 2 + (yr * st - z * ct) * esc + H * .03;
        const prof = (yr * ct + z * st + 2) / 4;
        const luz = e > .95 ? .55 + .45 * Math.abs(q.n[2] * .8 + q.n[0] * .35) : 1;
        const a = (.25 + .6 * e) * (.5 + prof * .5);
        ctx.fillStyle = e > .97 ? `rgba(${Math.round(232 * luz)},${Math.round(150 * luz)},${Math.round(110 * luz)},${a})` : `rgba(255,${Math.round(170 + 60 * (1 - e))},${Math.round(130 + 100 * (1 - e))},${a})`;
        const r = q.tam * dpr * (1.4 - .6 * e);
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      if (T > DUR && txt.textContent !== 'Pronto!') { txt.textContent = 'Pronto!'; ov.classList.add('pronto'); }
      if (T > DUR + SEGURA) return sair();
      raf = requestAnimationFrame(quadro);
    }
    function sair() {
      if (acabou) return; acabou = true; cancelAnimationFrame(raf);
      ov.classList.add('sai'); setTimeout(() => { removeEventListener('resize', tam); ov.remove(); }, 450);
      try { fim?.(); } catch { /* */ } resolve();
    }
    ov.addEventListener('pointerdown', sair);
    ctx.fillStyle = '#0a100e'; ctx.fillRect(0, 0, cv.width, cv.height);
    raf = requestAnimationFrame(quadro);
  });
})();
