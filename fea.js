// 🧪 Simulação no estilo Fusion 360: tensão estática, coeficiente de segurança, frequências naturais,
// térmico e otimização de forma. Você escolhe material, faces fixas e cargas tocando na peça; o cálculo
// roda num trabalhador (fea-worker.js) e o resultado aparece em cores no próprio 3D.
(() => {
  const $ = (id) => document.getElementById(id);
  const API = () => window.tracoPeca;
  const SRC = (document.currentScript?.src || '').split('?')[1] || '';
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const fmt = (v, d = 2) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Valores típicos de tabela (troque pelos do fornecedor se tiver o datasheet).
  const MATS = {
    PLA: { E: 3.5, nu: .36, esc: 50, rho: 1240, k: .13, cp: 1800 },
    PETG: { E: 2.1, nu: .38, esc: 50, rho: 1270, k: .2, cp: 1200 },
    ABS: { E: 2.2, nu: .35, esc: 40, rho: 1050, k: .17, cp: 1400 },
    'Nylon PA12': { E: 1.7, nu: .4, esc: 48, rho: 1010, k: .25, cp: 1700 },
    'Polipropileno (PP)': { E: 1.5, nu: .42, esc: 30, rho: 905, k: .22, cp: 1900 },
    'Poliestireno (PS)': { E: 3.2, nu: .34, esc: 40, rho: 1050, k: .15, cp: 1300 },
    'Aço 1020': { E: 205, nu: .29, esc: 350, rho: 7870, k: 51.9, cp: 486 },
    'Aço inox 304': { E: 193, nu: .29, esc: 215, rho: 8000, k: 16.2, cp: 500 },
    'Alumínio 6061-T6': { E: 68.9, nu: .33, esc: 276, rho: 2700, k: 167, cp: 896 },
    'Latão': { E: 97, nu: .31, esc: 310, rho: 8500, k: 115, cp: 380 },
  };
  const ESTUDOS = { estatico: '🧱 Tensão estática', modal: '〰️ Frequências naturais (modal)', termico: '🌡️ Térmico', otimizar: '✂️ Otimização de forma' };
  const MALHAS = { grossa: { estatico: 4000, modal: 1000, termico: 5000, otimizar: 2500 }, media: { estatico: 12000, modal: 2000, termico: 15000, otimizar: 4000 }, fina: { estatico: 30000, modal: 4500, termico: 40000, otimizar: 10000 } };
  const CORSEL = { fixo: '#1565C0', carga: '#EF6C00', temp: '#C62828', calor: '#F9A825' };
  const NOMESEL = { fixo: '📌 Faces fixas', carga: '➡️ Faces com carga', temp: '🌡️ Faces com temperatura fixa', calor: '🔥 Faces que recebem calor' };

  let guard = {}; try { guard = JSON.parse(localStorage.getItem('traco-fea') || '{}'); } catch { /* */ }
  const S = {
    aberto: false, estudo: guard.estudo || 'estatico', mat: guard.mat || 'PLA', props: guard.props || { ...MATS.PLA }, malha: guard.malha || 'media',
    sel: { fixo: new Set(), carga: new Set(), temp: new Set(), calor: new Set() }, key: '', escolhendo: null, modoSel: 'plana',
    carga: { tipo: 'forca', valor: '', dir: 'normal' }, gravidade: false, tempValor: '', calorValor: '', hconv: '', tAmb: '', manter: '', modos: 3,
    res: null, vista: 'vm', exagero: true, modo: 0, anima: false, fase: 0, rodando: false, versao: 0,
  };
  if (S.props && S.props.cp == null && MATS[S.mat]) S.props.cp = MATS[S.mat].cp;
  const salva = () => { try { localStorage.setItem('traco-fea', JSON.stringify({ estudo: S.estudo, mat: S.mat, props: S.props, malha: S.malha })); } catch { /* */ } };
  window.tracoFEA = { S, malha, abrir: () => abrir(), desenhar: (c, p) => desenhar(c, p) };

  // ---------- cores ----------
  function arco(v) { // azul → ciano → verde → amarelo → vermelho
    v = Math.max(0, Math.min(1, v));
    const st = [[0, [30, 60, 200]], [.25, [0, 170, 230]], [.5, [40, 190, 70]], [.75, [245, 210, 30]], [1, [220, 40, 30]]];
    let i = 0; while (i < st.length - 2 && v > st[i + 1][0]) i++;
    const [a, ca] = st[i], [b, cb] = st[i + 1], t = (v - a) / (b - a);
    return '#' + ca.map((x, k) => Math.round(x + (cb[k] - x) * t).toString(16).padStart(2, '0')).join('');
  }

  // ---------- malha mostrada no 3D ----------
  let cache = { v: -1, t: -1, tris: null };
  function base() { const api = API(); return api.meshBase(); }
  function confereChave() {
    const k = API().geomKey();
    if (S.key !== k) { S.key = k; for (const s of Object.values(S.sel)) s.clear(); for (const q in amCache) delete amCache[q]; S.res = null; S.versao++; }
  }
  function malha() {
    if (!S.aberto) return null;
    const api = API(); if (!api) return null;
    confereChave();
    const fase = S.anima ? Math.round(S.fase * 60) : 0;
    if (cache.v === S.versao && cache.t === fase && cache.tris) return cache.tris;
    const tris = base(); if (!tris.length) return null;
    let out;
    const r = S.res;
    if (r?.estudo === 'otimizar') {
      const ev = r.evolucao || [], fr = S.anima && ev.length ? ev[Math.min(ev.length - 1, Math.floor(S.fase * (ev.length + 2)))] : r.casca;
      out = fr.map(([a, b, c, n]) => ({ points: [a, b, c], normal: n, cor: '#7FA88E' }));
    } else if (r) {
      const sz = tamanho(tris), lista = r.tris ? r.tris.map((pts, i) => ({ points: pts, normal: tris[r.pai[i]]?.normal || [0, 0, 1] })) : tris;
      let campo = null, u = null, vmax = 1, vmin = 0, inv = false;
      let rampa = 1, quadro = null;
      if (r.estudo === 'estatico') {
        u = r.u; rampa = S.anima ? Math.min(1, S.fase / .7) : (S.livre ?? 1); // a carga sobe de 0 a 100% (linear: tudo escala junto)
        if (S.vista === 'vm') { campo = r.vm.map((x) => x * rampa); vmax = S.livre != null ? S.props.esc : r.maxVM; }
        else if (S.vista === 'u') { campo = mag(r.u).map((x) => x * rampa); vmax = r.maxU * Math.max(1, rampa); }
        else { campo = r.vm.map((x) => S.props.esc / Math.max(x * rampa, 1e-9)); vmin = 0; vmax = 3; inv = true; }
      } else if (r.estudo === 'modal') { const m = r.modos[S.modo] || r.modos[0]; u = m.u; campo = mag(m.u); vmax = 1; }
      else if (r.estudo === 'termico') { campo = r.T; vmin = r.tmin; vmax = r.tmax;
        const kP = r.T0 && S.potencia != null ? S.potencia / r.P0 : 1;
        const qi = S.anima && r.quadros?.length ? Math.min(r.quadros.length - 1, Math.floor(S.fase * (r.quadros.length + 4))) : S.tempo != null && r.quadros?.length ? S.tempo : null;
        if (qi != null) { const q0 = r.quadros0 || [], f1 = r.quadros[qi].f, f0 = q0.length ? q0[Math.min(qi, q0.length - 1)].f : null; quadro = f0 && kP !== 1 ? f1.map((v, i) => f0[i] + (v - f0[i]) * kP) : f1; }
        else if (kP !== 1) campo = r.T.map((v, i) => r.T0[i] + (v - r.T0[i]) * kP);
        if (kP !== 1 || qi != null) { let a = Infinity, b = -Infinity; for (const v of (quadro || campo)) { a = Math.min(a, v); b = Math.max(b, v); } S.agoraT = [a, b]; vmin = Math.min(vmin, a); vmax = Math.max(vmax, b); S.faixaT = [vmin, vmax]; } else { S.faixaT = null; S.agoraT = null; } }
      let esc = 0;
      if (u) {
        const umax = r.estudo === 'estatico' ? r.maxU : 1;
        esc = r.estudo === 'modal' ? sz * .08 / umax : S.exagero ? (umax > 0 ? sz * .05 / umax : 0) : 1;
        if (S.anima || r.estudo === 'estatico') esc *= r.estudo === 'modal' ? Math.sin(S.fase * 2 * Math.PI) : rampa;
      }
      out = lista.map((t, i) => {
        let v = quadro ? quadro[i] : (campo[i * 3] + campo[i * 3 + 1] + campo[i * 3 + 2]) / 3;
        if (inv) v = 1 - Math.min(v, vmax) / vmax; else v = (v - vmin) / ((vmax - vmin) || 1);
        const pts = u && esc ? t.points.map((p, k) => [p[0] + u[(i * 3 + k) * 3] * esc, p[1] + u[(i * 3 + k) * 3 + 1] * esc, p[2] + u[(i * 3 + k) * 3 + 2] * esc]) : t.points;
        return { ...t, points: pts, cor: arco(v), real: true };
      });
    } else {
      const cor = {}; for (const [k, s] of Object.entries(S.sel)) for (const i of s) cor[i] = CORSEL[k];
      if (!Object.keys(cor).length && !S.escolhendo) return null;
      out = tris.map((t, i) => cor[i] ? { ...t, cor: cor[i] } : { ...t, cor: '#C9CFCC' });
    }
    cache = { v: S.versao, t: fase, tris: out };
    return out;
  }
  function mag(u) { const o = new Float32Array(u.length / 3); for (let i = 0; i < o.length; i++) o[i] = Math.hypot(u[3 * i], u[3 * i + 1], u[3 * i + 2]); return o; }
  function tamanho(tris) { const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (const t of tris) for (const q of t.points) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], q[k]); b[k + 3] = Math.max(b[k + 3], q[k]); } return Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]); }


  // ---------- setas e símbolos: de onde vem a força, o calor, o ar; onde está preso ----------
  const amCache = {};
  function amostras(set, tris, k) {
    const chave = S.key + '|' + [...set].slice(0, 50).join(',') + '|' + set.size + '|' + k;
    if (amCache[chave]) return amCache[chave];
    const it = [...set].map((i) => { const p = tris[i].points; return { c: [0, 1, 2].map((q) => (p[0][q] + p[1][q] + p[2][q]) / 3), n: tris[i].normal }; });
    if (!it.length) return [];
    const out = [it[0]], dmin = it.map((a) => Math.hypot(a.c[0] - it[0].c[0], a.c[1] - it[0].c[1], a.c[2] - it[0].c[2]));
    while (out.length < Math.min(k, it.length)) { let b = 0; for (let i = 1; i < it.length; i++) if (dmin[i] > dmin[b]) b = i; if (dmin[b] < 1e-6) break; out.push(it[b]);
      for (let i = 0; i < it.length; i++) dmin[i] = Math.min(dmin[i], Math.hypot(it[i].c[0] - it[b].c[0], it[i].c[1] - it[b].c[1], it[i].c[2] - it[b].c[2])); }
    amCache[chave] = out; return out;
  }
  function seta(ctx, proj, c, d, L, cor, off) {
    const fim = [c[0] - d[0] * L * off, c[1] - d[1] * L * off, c[2] - d[2] * L * off], ini = [fim[0] - d[0] * L, fim[1] - d[1] * L, fim[2] - d[2] * L];
    const a = proj(ini), b = proj(fim), ang = Math.atan2(b.y - a.y, b.x - a.x), cab = 9;
    ctx.strokeStyle = cor; ctx.fillStyle = cor; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x - Math.cos(ang) * cab * .7, b.y - Math.sin(ang) * cab * .7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - Math.cos(ang - .42) * cab, b.y - Math.sin(ang - .42) * cab); ctx.lineTo(b.x - Math.cos(ang + .42) * cab, b.y - Math.sin(ang + .42) * cab); ctx.closePath(); ctx.fill();
    return { x: a.x, y: a.y, hx: b.x, hy: b.y };
  }
  function etiqueta(ctx, x, y, txt, cor) {
    ctx.font = '700 11px DM Sans, Arial, sans-serif'; const w = ctx.measureText(txt).width + 10;
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.strokeStyle = cor; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - 18, w, 16, 5) : ctx.rect(x - w / 2, y - 18, w, 16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = cor; ctx.textAlign = 'center'; ctx.fillText(txt, x, y - 6);
    return { x: x - w / 2, y: y - 18, w, h: 16 };
  }
  function desenhar(ctx, proj) {
    if (!S.aberto || !proj || S.res?.estudo === 'otimizar' && S.anima) return;
    const tris = base(); if (!tris.length) return;
    const sz = tamanho(tris), L = sz * .16, e = S.estudo;
    const off = S.anima ? .05 + .35 * (1 - ((performance.now() / 900) % 1)) : .05; // setas chegando na face
    ctx.save(); ctx.setLineDash([]);
    const DIR = { z: [0, 0, 1], '-z': [0, 0, -1], x: [1, 0, 0], '-x': [-1, 0, 0], y: [0, 1, 0], '-y': [0, -1, 0] };
    // apoios (faces fixas): triângulo azul com hachura, como no desenho técnico
    if (e !== 'termico') for (const { c, n } of amostras(S.sel.fixo, tris, 8)) {
      const p = proj(c), q = proj([c[0] + n[0] * L * .3, c[1] + n[1] * L * .3, c[2] + n[2] * L * .3]);
      let dx = q.x - p.x, dy = q.y - p.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; const px = -dy, py = dx, h = 11;
      ctx.fillStyle = 'rgba(21,101,192,.9)'; ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + dx * h + px * h * .7, p.y + dy * h + py * h * .7); ctx.lineTo(p.x + dx * h - px * h * .7, p.y + dy * h - py * h * .7); ctx.closePath(); ctx.fill();
      for (let k = -1; k <= 1; k++) { const bx = p.x + dx * (h + 2) + px * k * 6, by = p.y + dy * (h + 2) + py * k * 6; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + dx * 5 - px * 4, by + dy * 5 - py * 4); ctx.stroke(); }
    }
    // cargas (arrastáveis: puxe a etiqueta para aumentar/diminuir; arraste a ponta para outra face)
    S.ui = null;
    if ((e === 'estatico' || e === 'otimizar') && S.sel.carga.size) {
      const pr = S.carga.tipo === 'pressao', r = S.res?.estudo === 'estatico' ? S.res : null;
      const v = r?.aplicado?.v || num(S.carga.valor);
      const f = S.anima && r ? Math.min(1, S.fase / .7) : r ? (S.livre ?? 1) : 1;
      const Lc = L * Math.min(2.6, Math.max(.35, f));
      let pos = null; const cabecas = []; let dir2 = null;
      for (const { c, n } of amostras(S.sel.carga, tris, pr ? 9 : 6)) {
        const d = pr || S.carga.dir === 'normal' ? n.map((x) => -x) : DIR[S.carga.dir];
        const a = seta(ctx, proj, c, d, Lc, '#EF6C00', off); cabecas.push([a.hx, a.hy]);
        if (!dir2) { const l = Math.hypot(a.hx - a.x, a.hy - a.y) || 1; dir2 = [(a.hx - a.x) / l, (a.hy - a.y) / l]; }
        if (!pos || a.y < pos.y) pos = a;
      }
      if (pos) {
        const txt = v ? `⇕ ${fmt(v * f, 1)} ${pr ? 'MPa' : S.carga.tipo === 'massa' ? 'kg' : 'N'}` : '⇕ arraste';
        const rot = etiqueta(ctx, pos.x, pos.y - 4, txt, '#EF6C00');
        S.ui = { rot, cabecas, dir2: dir2 || [0, 1] };
      }
      if (arrasto?.tipo === 'mover' && arrasto.x != null) { // fantasma da seta indo para a nova face
        ctx.strokeStyle = '#EF6C00'; ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(arrasto.x - (dir2?.[0] || 0) * 40, arrasto.y - (dir2?.[1] || 1) * 40); ctx.lineTo(arrasto.x, arrasto.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#EF6C00'; ctx.beginPath(); ctx.arc(arrasto.x, arrasto.y, 6, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (S.gravidade && e !== 'termico') { const c = centro(tris); const a = seta(ctx, proj, c, [0, 0, -1], L * .8, '#6D4C41', off); etiqueta(ctx, a.x, a.y - 4, 'peso', '#6D4C41'); }
    // térmico: faces quentes/frias, calor entrando e o ar em volta
    if (e === 'termico') {
      for (const { c, n } of amostras(S.sel.calor, tris, 5)) seta(ctx, proj, c, n.map((x) => -x), L * .8, '#E65100', off);
      { const am = amostras(S.sel.calor, tris, 1)[0]; if (am && num(S.calorValor) != null) { const p = proj(am.c); etiqueta(ctx, p.x, p.y - 26, `🔥 ${fmt(num(S.calorValor), 1)} W`, '#E65100'); } }
      for (const { c } of amostras(S.sel.temp, tris, 6)) { const p = proj(c); ctx.fillStyle = '#C62828'; ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fill(); }
      { const am = amostras(S.sel.temp, tris, 1)[0]; if (am && num(S.tempValor) != null) { const p = proj(am.c); etiqueta(ctx, p.x, p.y - 8, `🌡️ ${fmt(num(S.tempValor), 1)} °C`, '#C62828'); } }
      if (num(S.hconv)) { // ar soprando dos lados
        const b = caixa(tris), cz = (b[2] + b[5]) / 2, m = sz * .35, cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2;
        const lados = [[[b[0] - m * .2, cy, cz], [1, 0, 0]], [[b[3] + m * .2, cy, cz], [-1, 0, 0]], [[cx, b[1] - m * .2, cz], [0, 1, 0]], [[cx, b[4] + m * .2, cz], [0, -1, 0]]];
        ctx.setLineDash([5, 4]); let pos = null;
        for (const [c, d] of lados) { const a = seta(ctx, proj, c, d, L * .9, '#4FA3E0', off); if (!pos || a.y < pos.y) pos = a; }
        ctx.setLineDash([]);
        if (pos) etiqueta(ctx, pos.x, pos.y - 4, `ar ${fmt(num(S.tAmb) ?? 20, 0)} °C`, '#2C7BB6');
      }
    }
    // relógio da animação
    const r = S.res; let txt = '';
    if (S.anima && r?.estudo === 'estatico') txt = `Carga ${Math.round(Math.min(1, S.fase / .7) * 100)}%`;
    if (S.anima && r?.estudo === 'termico' && r.quadros?.length) { const q = r.quadros, i = Math.min(q.length - 1, Math.floor(S.fase * (q.length + 4))); txt = `t = ${fmtT(q[i].t)}`; }
    if (txt) { const W = ctx.canvas.width / (window.devicePixelRatio || 1); etiqueta(ctx, W / 2, ctx.canvas.height / (window.devicePixelRatio || 1) - 12, txt, '#111'); }
    ctx.restore();
  }
  function caixa(tris) { const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (const t of tris) for (const q of t.points) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], q[k]); b[k + 3] = Math.max(b[k + 3], q[k]); } return b; }
  function centro(tris) { const b = caixa(tris); return [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]; }

  // ---------- escolher faces tocando no 3D ----------
  let viz = { key: '', mapa: null };
  function vizinhos(tris) {
    const key = API().geomKey(); if (viz.key === key) return viz.mapa;
    const k = (q) => q.map((v) => v.toFixed(3)).join(','), ar = new Map(), mapa = tris.map(() => []);
    tris.forEach((t, i) => { for (let a = 0; a < 3; a++) { const e = [k(t.points[a]), k(t.points[(a + 1) % 3])].sort().join('|'); const j = ar.get(e); if (j === undefined) ar.set(e, i); else { mapa[i].push(j); mapa[j].push(i); } } });
    viz = { key, mapa }; return mapa;
  }
  const dentro = (px, py, c) => { const s = (a, b) => (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y); const d1 = s(c[0], c[1]), d2 = s(c[1], c[2]), d3 = s(c[2], c[0]); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
  function escolher(ev) {
    const api = API(), part = api.part, r = api.model.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    const faces = part.lastFaces || []; let alvo = null;
    for (let i = faces.length - 1; i >= 0; i--) if (dentro(x, y, faces[i].corners)) { alvo = faces[i].idx; break; }
    if (alvo == null) return;
    const tris = base(), mapa = vizinhos(tris), n0 = tris[alvo].normal, vistos = new Set([alvo]), fila = [alvo];
    const lim = Math.cos((S.modoSel === 'plana' ? 6 : 28) * Math.PI / 180);
    while (fila.length) { const i = fila.pop(); for (const j of mapa[i]) { if (vistos.has(j)) continue; const a = S.modoSel === 'plana' ? n0 : tris[i].normal, b = tris[j].normal; if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] >= lim) { vistos.add(j); fila.push(j); } } }
    const s = S.sel[S.escolhendo];
    if (s.has(alvo)) for (const i of vistos) s.delete(i);
    else { for (const k of Object.keys(S.sel)) if (k !== S.escolhendo) for (const i of vistos) S.sel[k].delete(i); for (const i of vistos) s.add(i); }
    S.res = null; S.versao++; api.render(); pinta();
  }
  // ---------- arrastar a força no 3D ----------
  let arrasto = null;
  function pontoCanvas(e) { const r = API().model.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function pegaForca(e) {
    if (!S.aberto || !S.ui || S.escolhendo || S.rodando) return null;
    const [x, y] = pontoCanvas(e), t = e.pointerType === 'touch' ? 16 : 8, R = S.ui.rot;
    if (x >= R.x - t && x <= R.x + R.w + t && y >= R.y - t && y <= R.y + R.h + t) return 'valor';
    if (S.ui.cabecas.some(([hx, hy]) => Math.hypot(hx - x, hy - y) < t + 10)) return 'mover';
    return null;
  }
  function valorBase() { const r = S.res?.estudo === 'estatico' ? S.res : null; return r?.aplicado?.v ? r.aplicado.v * (S.livre ?? 1) : num(S.carga.valor) || 0; }
  function aplicaValor(v) {
    v = Math.max(0, Math.round(v * 100) / 100);
    const r = S.res?.estudo === 'estatico' ? S.res : null;
    if (r?.aplicado?.v) { // já calculado: muda ao vivo (linear), sem recalcular
      S.livre = v / r.aplicado.v; S.anima = false;
      const rg = painel?.querySelector('[data-livre=carga]'); if (rg) { if (v > +rg.max) rg.max = String(v * 1.5); rg.value = String(v); }
      const tx = painel?.querySelector('#feaLivreTxt'); if (tx) tx.textContent = `${fmt(v, 1)} ${r.aplicado.un}`;
      const q = painel?.querySelector('#feaLivreRes'); if (q) q.innerHTML = livreEstTxt(r);
      legendaPinta();
    } else {
      S.carga.valor = String(v); const inp = painel?.querySelector('[data-v="carga.valor"]'); if (inp) inp.value = S.carga.valor;
    }
    S.versao++; API().render();
  }
  function moverCarga(e) {
    const api = API(), [x, y] = pontoCanvas(e), faces = api.part.lastFaces || []; let alvo = null;
    for (let i = faces.length - 1; i >= 0; i--) if (dentro(x, y, faces[i].corners)) { alvo = faces[i].idx; break; }
    if (alvo == null) return avisa('Solte a seta em cima da peça.');
    if (S.res?.pai && S.res.estudo !== 'otimizar') alvo = S.res.pai[alvo]; // malha mostrada é a subdividida do resultado
    if (S.res?.estudo === 'otimizar') return avisa('Volte à peça (tire o resultado da otimização) para mover a força.');
    const tris = base(), mapa = vizinhos(tris), n0 = tris[alvo].normal, vistos = new Set([alvo]), fila = [alvo];
    const lim = Math.cos((S.modoSel === 'plana' ? 6 : 28) * Math.PI / 180);
    while (fila.length) { const i = fila.pop(); for (const j of mapa[i]) { if (vistos.has(j)) continue; const a = S.modoSel === 'plana' ? n0 : tris[i].normal, b = tris[j].normal; if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] >= lim) { vistos.add(j); fila.push(j); } } }
    S.sel.carga.clear(); for (const i of vistos) { S.sel.fixo.delete(i); S.sel.carga.add(i); }
    S.res = null; S.anima = false; S.versao++; pinta(); api.render();
    avisa('Força movida. Toque em ▶ Rodar simulação para ver o resultado.');
  }
  function ligarToque() {
    const m = API()?.model; if (!m || m.dataset.fea) return; m.dataset.fea = '1';
    m.addEventListener('pointerdown', (e) => {
      const tipo = pegaForca(e); if (!tipo) return;
      e.stopImmediatePropagation(); e.preventDefault(); try { m.setPointerCapture(e.pointerId); } catch { /* */ }
      const [x, y] = pontoCanvas(e); arrasto = { tipo, x0: x, y0: y, v0: valorBase(), dir2: S.ui.dir2 };
    }, true);
    m.addEventListener('pointermove', (e) => {
      if (!arrasto) return; e.stopImmediatePropagation(); e.preventDefault();
      const [x, y] = pontoCanvas(e);
      if (arrasto.tipo === 'valor') { // puxar para trás (contra a seta) aumenta; empurrar para a peça diminui
        const d = -((x - arrasto.x0) * arrasto.dir2[0] + (y - arrasto.y0) * arrasto.dir2[1]);
        const base = arrasto.v0 || 10; aplicaValor(base * Math.pow(2, d / 90));
      } else { arrasto.x = x; arrasto.y = y; API().render(); }
    }, true);
    const solta = (e) => { if (!arrasto) return; e.stopImmediatePropagation(); const a = arrasto; arrasto = null; if (a.tipo === 'mover' && a.x != null && Math.hypot(a.x - a.x0, a.y - a.y0) > 12) moverCarga(e); else API().render(); };
    m.addEventListener('pointerup', solta, true); m.addEventListener('pointercancel', (e) => { if (arrasto) { arrasto = null; API().render(); } }, true);
    let ini = null;
    m.addEventListener('pointerdown', (e) => { ini = S.aberto && S.escolhendo ? [e.clientX, e.clientY] : null; }, true);
    m.addEventListener('pointerup', (e) => { if (ini && Math.hypot(e.clientX - ini[0], e.clientY - ini[1]) < 7) escolher(e); ini = null; }, true);
  }

  // ---------- painel ----------
  let painel = null, legenda = null, botao3d = null;
  function abrir() {
    const api = API(); if (!api) return;
    if (!api.meshBase().length) return avisa('Feche o desenho (ou narre uma peça) para ter um 3D para simular.');
    ligarToque(); confereChave();
    S.aberto = !S.aberto || !painel || painel.hidden;
    if (!painel) {
      painel = document.createElement('section'); painel.className = 'fea-painel'; painel.id = 'feaPainel';
      document.querySelector('.part-model-wrap')?.insertAdjacentElement('afterend', painel);
      legenda = document.createElement('div'); legenda.className = 'fea-legenda'; legenda.hidden = true;
      document.querySelector('.part-model-wrap')?.appendChild(legenda);
      // botão de rodar em cima do 3D: configura embaixo e roda daqui
      botao3d = document.createElement('button'); botao3d.type = 'button'; botao3d.className = 'fea-rodar-3d primary-button'; botao3d.hidden = true;
      botao3d.addEventListener('pointerdown', (e) => e.stopPropagation()); botao3d.onclick = () => rodar();
      document.querySelector('.part-model-wrap')?.appendChild(botao3d);
      painel.addEventListener('click', clique); painel.addEventListener('change', muda); painel.addEventListener('input', (e) => { if (e.target.matches('[data-livre]')) return livre(e.target); if (e.target.matches('[data-v]')) muda(e); });
    }
    painel.hidden = !S.aberto;
    if (!S.aberto) { S.escolhendo = null; S.anima = false; legenda.hidden = true; }
    botaoPinta();
    S.versao++; pinta(); api.render();
    if (S.aberto) painel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function selBloco(k) {
    const n = S.sel[k].size, on = S.escolhendo === k;
    return `<div class="fea-sel" data-k="${k}"><span class="fea-bola" style="background:${CORSEL[k]}"></span><b>${NOMESEL[k]}</b><span class="fea-n">${n ? `${n} triângulos` : 'nenhuma'}</span>
      <button type="button" class="${on ? 'primary-button' : 'secondary-button'}" data-x="esc-${k}">${on ? '✓ Pronto' : 'Escolher no 3D'}</button>${n ? `<button type="button" class="secondary-button" data-x="limpa-${k}">Limpar</button>` : ''}</div>`;
  }
  function pinta() {
    if (!painel) return;
    const p = S.props, e = S.estudo;
    const campo = (v, rot, uni, ph = '') => `<label>${rot}<span><input data-v="${v}" inputmode="decimal" value="${esc(v.split('.').reduce((o, k) => o?.[k], S) ?? '')}" placeholder="${ph}" />${uni}</span></label>`;
    let h = `<div class="fea-topo"><b>🧪 Simulação</b><span style="flex:1"></span><button type="button" class="secondary-button" data-x="fechar">Fechar</button></div>
      <div class="an-linha"><label>Estudo<select data-v="estudo">${Object.entries(ESTUDOS).map(([k, t]) => `<option value="${k}"${k === e ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Malha<select data-v="malha">${['grossa', 'media', 'fina'].map((k) => `<option value="${k}"${k === S.malha ? ' selected' : ''}>${{ grossa: 'Grossa (rápida)', media: 'Média', fina: 'Fina (mais precisa)' }[k]}</option>`).join('')}</select></label></div>
      <h4>Material</h4>
      <div class="an-linha"><label>Material<select data-v="mat">${[...Object.keys(MATS), 'Personalizado'].map((k) => `<option${k === S.mat ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
      ${campo('props.E', 'Módulo de elasticidade', 'GPa')}${campo('props.nu', 'Poisson', '')}${e !== 'termico' ? campo('props.esc', 'Limite de escoamento', 'MPa') : ''}${campo('props.rho', 'Densidade', 'kg/m³')}${e === 'termico' ? campo('props.k', 'Condutividade', 'W/m·K') + campo('props.cp', 'Calor específico', 'J/kg·K') : ''}</div>
      <p class="an-sub">Valores típicos de tabela — se tiver o datasheet do fornecedor, troque. Peça impressa: o cálculo considera 100% de preenchimento.</p>
      <h4>Seleção no 3D</h4><div class="an-linha"><label>Ao tocar, pega<select data-v="modoSel"><option value="plana"${S.modoSel === 'plana' ? ' selected' : ''}>a face plana</option><option value="continua"${S.modoSel === 'continua' ? ' selected' : ''}>a superfície contínua (furo, cilindro)</option></select></label></div>`;
    if (e === 'termico') {
      h += selBloco('temp') + `<div class="an-linha">${campo('tempValor', 'Temperatura dessas faces', '°C')}</div>` + selBloco('calor') + `<div class="an-linha">${campo('calorValor', 'Potência de calor nessas faces', 'W')}</div>
        <h4>Troca de calor com o ar (resto da peça)</h4><div class="an-linha">${campo('hconv', 'Coeficiente h', 'W/m²·K', 'ar parado ≈ 5 a 25')}${campo('tAmb', 'Temperatura do ar', '°C')}</div>`;
    } else {
      h += selBloco('fixo');
      if (e !== 'modal') h += selBloco('carga') + `<div class="an-linha"><label>Tipo<select data-v="carga.tipo"><option value="forca"${S.carga.tipo === 'forca' ? ' selected' : ''}>Força total</option><option value="pressao"${S.carga.tipo === 'pressao' ? ' selected' : ''}>Pressão</option><option value="massa"${S.carga.tipo === 'massa' ? ' selected' : ''}>Peso em cima (kg)</option></select></label>
        ${campo('carga.valor', S.carga.tipo === 'pressao' ? 'Pressão' : S.carga.tipo === 'massa' ? 'Peso' : 'Força', S.carga.tipo === 'pressao' ? 'MPa' : S.carga.tipo === 'massa' ? 'kg' : 'N')}
        ${S.carga.tipo !== 'pressao' ? `<label>Direção<select data-v="carga.dir">${[['normal', 'empurrando a face'], ['-z', '↓ para baixo (−Z)'], ['z', '↑ para cima (+Z)'], ['x', '→ +X'], ['-x', '← −X'], ['y', '+Y'], ['-y', '−Y']].map(([k, t]) => `<option value="${k}"${S.carga.dir === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
        <label class="fea-chk"><span><input type="checkbox" data-v="gravidade"${S.gravidade ? ' checked' : ''}/> somar o peso da peça</span></label></div><p class="an-sub">✋ No 3D: puxe a etiqueta <b>⇕</b> da força para aumentar ou diminuir, e arraste a ponta da seta para outra face.</p>`;
      if (e === 'modal') h += `<div class="an-linha"><label>Quantos modos<select data-v="modos">${[1, 2, 3, 4, 5, 6].map((n) => `<option${n === +S.modos ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>`;
      if (e === 'otimizar') h += `<div class="an-linha">${campo('manter', 'Manter do material', '%', 'ex.: 40')}</div><p class="an-sub">As faces fixas e as da carga ficam inteiras. O resto é retirado onde quase não trabalha.</p>`;
    }
    h += `<div class="foto-acoes"><span id="feaProg" class="an-sub" style="flex:1"></span><button type="button" class="primary-button" data-x="rodar"${S.rodando ? ' disabled' : ''}>${S.rodando ? 'Calculando…' : '▶ Rodar simulação'}</button></div><div id="feaRes">${resultadoHtml()}</div>
      <p class="an-sub">Cálculo linear (material elástico, deformação pequena) numa malha de cubinhos: cantos vivos e roscas finas ficam aproximados. Ainda não faz: não linear, impacto/queda, flambagem, injeção e resfriamento de eletrônicos.</p>`;
    painel.innerHTML = h;
    legendaPinta(); marcaFalta(); botaoPinta();
  }
  function resultadoHtml() {
    const r = S.res; if (!r) return '';
    const m = `<span class="an-sub">Malha: ${fmt(r.malha.ne, 0)} cubinhos de ${fmt(r.malha.h, 2)} mm · ${fmt(r.ms / 1000, 1)} s</span>`;
    const anim = `<button type="button" class="secondary-button" data-x="anima">${S.anima ? '⏸ Parar' : '▶ Animar'}</button>`;
    if (r.estudo === 'estatico') {
      const fs = S.props.esc / r.maxVM, cl = fs >= 2 ? 'bom' : fs >= 1 ? 'atencao' : 'ruim';
      return `<h4>Resultado</h4><div class="fea-abas">${[['vm', 'Tensão (von Mises)'], ['u', 'Deslocamento'], ['fs', 'Coef. de segurança']].map(([k, t]) => `<button type="button" class="${S.vista === k ? 'primary-button' : 'secondary-button'}" data-x="vista-${k}">${t}</button>`).join('')}</div>
        ${r.pico ? `<p class="an-sub atencao">⚠️ Pico pontual de ${fmt(r.pico, 0)} MPa bem onde a força ou o apoio estão em poucos pontos. Isso é efeito de força concentrada no cálculo, não da peça: ignorei esse pico. Para um valor mais real, espalhe a força numa face maior (use "superfície contínua").</p>` : ''}<p class="an-sub">Tensão máxima: <b>${fmt(r.maxVM, 2)} MPa</b> · deslocamento máximo: <b>${fmt(r.maxU, 4)} mm</b><br>Coeficiente de segurança mínimo: <b class="${cl}">${fmt(fs, 2)}</b> ${fs < 1 ? '— passa do limite do material: deforma de vez ou quebra.' : fs < 2 ? '— aguenta, mas no limite.' : '— folgado.'}${r.convergiu ? '' : '<br><span class="atencao">O cálculo não convergiu totalmente: use malha mais grossa ou confira se a peça está bem presa.</span>'}</p>
        ${livreEst(r)}<div class="foto-acoes"><label class="fea-chk"><span><input type="checkbox" data-v="exagero"${S.exagero ? ' checked' : ''}/> deformação exagerada para ver</span></label><span style="flex:1"></span>${anim}<button type="button" class="secondary-button" data-x="limparRes">Limpar resultado</button></div>${m}`;
    }
    if (r.estudo === 'modal') return `<h4>Frequências naturais</h4><div class="fea-abas">${r.modos.map((q, i) => `<button type="button" class="${S.modo === i ? 'primary-button' : 'secondary-button'}" data-x="modo-${i}">Modo ${i + 1}: ${fmt(q.f, 1)} Hz</button>`).join('')}</div>
      <p class="an-sub">Se a peça trabalhar perto dessas frequências (motor, vibração), ela entra em ressonância. As cores mostram onde ela mais se mexe nesse modo.</p><div class="foto-acoes"><span style="flex:1"></span>${anim}<button type="button" class="secondary-button" data-x="limparRes">Limpar resultado</button></div>${m}`;
    if (r.estudo === 'termico') return `<h4>Resultado térmico</h4><p class="an-sub">Temperatura mínima <b>${fmt(r.tmin, 1)} °C</b> · máxima <b>${fmt(r.tmax, 1)} °C</b> (regime permanente).${r.quadros?.length ? ` A animação mostra a peça aquecendo do início até estabilizar (~${fmtT(r.quadros.at(-1).t)}).` : ' Para ver aquecendo no tempo, preencha o calor específico.'}</p>${livreTerm(r)}<div class="foto-acoes"><span style="flex:1"></span>${r.quadros?.length ? anim : ''}<button type="button" class="secondary-button" data-x="limparRes">Limpar resultado</button></div>${m}`;
    if (r.estudo === 'otimizar') { const rho = S.props.rho * 1e-6; // g/mm³
      return `<h4>Forma otimizada</h4><p class="an-sub">Ficou <b>${fmt(r.volFica / r.volTotal * 100, 0)}%</b> do material: de <b>${fmt(r.volTotal * rho, 1)} g</b> para <b>${fmt(r.volFica * rho, 1)} g</b>. Use como guia para redesenhar (a forma sai em cubinhos).</p>
      <div class="foto-acoes"><span style="flex:1"></span>${anim}<button type="button" class="secondary-button" data-x="stlOtim">⬇️ STL da forma otimizada</button><button type="button" class="secondary-button" data-x="limparRes">Voltar à peça</button></div>${m}`; }
    return '';
  }
  function fmtT(t) { return t < 60 ? `${fmt(t, t < 10 ? 1 : 0)} s` : t < 3600 ? `${fmt(t / 60, 1)} min` : `${fmt(t / 3600, 1)} h`; }
  // ---------- simulação livre: mexe na carga / potência / tempo e vê na hora (sem recalcular) ----------
  function livreEst(r) {
    const a = r.aplicado || { v: 0, un: 'N' }; if (!a.v) return '';
    const atual = a.v * (S.livre ?? 1);
    return `<h4>🎚️ Simulação livre</h4><div class="fea-livre"><label>${a.un === 'kg' ? 'Peso em cima' : a.un === 'MPa' ? 'Pressão' : 'Força'}: <b id="feaLivreTxt">${fmt(atual, 1)} ${a.un}</b>
      <input type="range" data-livre="carga" min="0" max="${a.v * 4}" step="${a.v / 100}" value="${atual}" /></label><p class="an-sub" id="feaLivreRes">${livreEstTxt(r)}</p></div>`;
  }
  function livreEstTxt(r) {
    const a = r.aplicado, f = S.livre ?? 1, sg = r.maxVM * f, fs = sg > 0 ? S.props.esc / sg : Infinity, lim = a.v * S.props.esc / r.maxVM;
    return `Tensão máx. <b>${fmt(sg, 1)} MPa</b> · deslocamento <b>${fmt(r.maxU * f, 4)} mm</b> · segurança <b class="${fs >= 2 ? 'bom' : fs >= 1 ? 'atencao' : 'ruim'}">${fs === Infinity ? '—' : fmt(fs, 2)}</b><br>`
      + (fs < 1 ? `<span class="ruim">❌ Passou do limite: com isso a peça escoa (deforma de vez) ou quebra.</span> ` : '')
      + `Aguenta até cerca de <b>${fmt(lim, 1)} ${a.un}</b> (coeficiente 1). <small>Cálculo linear: perto e acima do limite o real é pior.</small>`;
  }
  function livreTerm(r) {
    let h = '';
    if (r.T0) h += `<label>Potência de calor: <b id="feaPotTxt">${fmt(S.potencia ?? r.P0, 1)} W</b><input type="range" data-livre="pot" min="0" max="${r.P0 * 4}" step="${r.P0 / 100}" value="${S.potencia ?? r.P0}" /></label>`;
    if (r.quadros?.length) { const i = S.tempo ?? r.quadros.length - 1; h += `<label>Tempo: <b id="feaTempoTxt">${fmtT(r.quadros[i].t)}</b><input type="range" data-livre="tempo" min="0" max="${r.quadros.length - 1}" step="1" value="${i}" /></label>`; }
    return h ? `<h4>🎚️ Simulação livre</h4><div class="fea-livre">${h}<p class="an-sub" id="feaLivreRes">${livreTermTxt(r)}</p></div>` : '';
  }
  function livreTermTxt(r) {
    const [a, b] = S.agoraT || [r.tmin, r.tmax];
    return `Agora: mínima <b>${fmt(a, 1)} °C</b> · máxima <b>${fmt(b, 1)} °C</b>`;
  }
  function livre(el) {
    const r = S.res; if (!r) return; S.anima = false; const v = +el.value;
    if (el.dataset.livre === 'carga') { S.livre = v / r.aplicado.v; painel.querySelector('#feaLivreTxt').textContent = `${fmt(v, 1)} ${r.aplicado.un}`; }
    if (el.dataset.livre === 'pot') { S.potencia = v; painel.querySelector('#feaPotTxt').textContent = `${fmt(v, 1)} W`; }
    if (el.dataset.livre === 'tempo') { S.tempo = v; painel.querySelector('#feaTempoTxt').textContent = v === r.quadros.length - 1 ? `${fmtT(r.quadros[v].t)} (estável)` : fmtT(r.quadros[v].t); }
    S.versao++; API().render();
    if (r.estudo !== 'estatico') malha(); // calcula a faixa de temperatura agora
    { const q = painel.querySelector('#feaLivreRes'); if (q) q.innerHTML = r.estudo === 'estatico' ? livreEstTxt(r) : livreTermTxt(r); legendaPinta(); }
    const an = painel.querySelector('[data-x=anima]'); if (an) an.textContent = '▶ Animar';
  }
  function botaoPinta() {
    if (!botao3d) return;
    botao3d.hidden = !S.aberto;
    botao3d.disabled = S.rodando;
    botao3d.textContent = S.rodando ? '⏳ Calculando…' : S.res ? '▶ Rodar de novo' : '▶ Rodar simulação';
  }
  function marcaFalta() {
    if (!painel) return;
    painel.querySelectorAll('.fea-falta').forEach((el) => el.classList.remove('fea-falta'));
    for (const q of S.falta || []) { const el = painel.querySelector(q); (el?.closest('label') || el)?.classList.add('fea-falta'); }
  }
  function legendaPinta() {
    if (!legenda) return;
    const r = S.res; if (!S.aberto || !r || r.estudo === 'otimizar') { legenda.hidden = true; return; }
    let tit = '', a = '', b = '';
    if (r.estudo === 'estatico') { if (S.vista === 'vm') { tit = 'Tensão MPa'; a = S.livre != null ? `${fmt(S.props.esc, 0)} limite` : fmt(r.maxVM, 1); b = '0'; } else if (S.vista === 'u') { tit = 'Desloc. mm'; a = fmt(r.maxU * Math.max(1, S.livre ?? 1), 3); b = '0'; } else { tit = 'Segurança'; a = '0'; b = '≥ 3'; } }
    else if (r.estudo === 'modal') { tit = `${fmt(r.modos[S.modo].f, 1)} Hz`; a = 'mexe mais'; b = 'parado'; }
    else { const [lo, hi] = S.faixaT || [r.tmin, r.tmax]; tit = '°C'; a = fmt(hi, 1); b = fmt(lo, 1); }
    const grad = S.vista === 'fs' && r.estudo === 'estatico' ? 'linear-gradient(to bottom,#dc281e,#f5d21e,#28be46,#00aae6,#1e3cc8)' : 'linear-gradient(to bottom,#dc281e,#f5d21e,#28be46,#00aae6,#1e3cc8)';
    legenda.innerHTML = `<b>${tit}</b><div class="fea-barra" style="background:${grad}"></div><span>${a}</span><span>${b}</span>`;
    legenda.hidden = false;
  }

  function muda(ev) {
    if (ev.target.dataset.livre) return;
    const el = ev.target, v = el.dataset.v; if (!v) return;
    if (S.falta?.length) { S.falta = S.falta.filter((q) => q !== `[data-v="${v}"]`); el.closest('label')?.classList.remove('fea-falta'); }
    const val = el.type === 'checkbox' ? el.checked : el.value;
    if (v === 'mat') { S.mat = val; if (MATS[val]) S.props = { ...MATS[val] }; salva(); pinta(); return; }
    if (v.startsWith('props.')) { const k = v.slice(6); S.props[k] = num(val); S.mat = Object.entries(MATS).find(([, m]) => Object.keys(m).every((q) => m[q] === S.props[q]))?.[0] || 'Personalizado'; salva(); if (ev.type === 'change') pinta(); if (S.res) { S.versao++; API().render(); } return; }
    const pth = v.split('.'); let o = S; for (const k of pth.slice(0, -1)) o = o[k]; o[pth.at(-1)] = val;
    if (v === 'estudo' || v === 'malha') { S.res = null; S.anima = false; S.escolhendo = null; salva(); }
    if (v === 'carga.tipo' && val === 'massa') S.carga.dir = '-z';
    if (['estudo', 'malha', 'carga.tipo', 'exagero', 'modoSel', 'modos'].includes(v)) { S.versao++; pinta(); API().render(); }
  }
  function clique(ev) {
    const x = ev.target.closest('[data-x]')?.dataset.x; if (!x) return;
    const api = API();
    if (x === 'fechar') return abrir();
    if (x.startsWith('esc-')) { const k = x.slice(4); if (S.falta) S.falta = S.falta.filter((q) => !q.includes(`"${k}"`)); S.escolhendo = S.escolhendo === k ? null : k; S.res = null; S.anima = false; S.versao++; pinta(); api.render(); if (S.escolhendo) avisa('Toque nas faces da peça no 3D. Arraste para girar.'); return; }
    if (x.startsWith('limpa-')) { S.sel[x.slice(6)].clear(); S.res = null; S.versao++; pinta(); api.render(); return; }
    if (x.startsWith('vista-')) { S.vista = x.slice(6); S.versao++; pinta(); api.render(); return; }
    if (x.startsWith('modo-')) { S.modo = +x.slice(5); S.versao++; pinta(); api.render(); return; }
    if (x === 'anima') { S.anima = !S.anima; if (S.anima) laco(); pinta(); S.versao++; api.render(); return; }
    if (x === 'limparRes') { S.res = null; S.anima = false; S.versao++; pinta(); api.render(); return; }
    if (x === 'stlOtim') return stlOtim();
    if (x === 'rodar') return rodar();
  }
  let t0a = 0;
  const PERIODO = { estatico: 2600, modal: 1600, termico: 7000, otimizar: 5000 };
  function laco() { t0a = performance.now(); const passo = () => { if (!S.anima || !S.aberto) return; S.fase = ((performance.now() - t0a) / (PERIODO[S.res?.estudo] || 2000)) % 1; S.versao++; API().render(); requestAnimationFrame(passo); }; requestAnimationFrame(passo); }

  // ---------- rodar ----------
  let worker = null;
  function rodar() {
    const api = API(), tris = base(), e = S.estudo, p = S.props;
    const falta = [], alvo = [];
    const F = (txt, sel) => { falta.push(txt); alvo.push(sel); };
    const lista = (k) => [...S.sel[k]];
    if (e !== 'termico') {
      if (!p.E) F('o módulo de elasticidade', '[data-v="props.E"]'); if (p.nu == null || p.nu <= 0 || p.nu >= .5) F('o coeficiente de Poisson (entre 0 e 0,5)', '[data-v="props.nu"]');
      if (!S.sel.fixo.size) F('as faces fixas (📌)', '.fea-sel[data-k="fixo"]');
      if (e === 'estatico' && !p.esc) F('o limite de escoamento', '[data-v="props.esc"]');
      if (e !== 'modal' && !S.sel.carga.size && !S.gravidade) F('as faces da carga (➡️)', '.fea-sel[data-k="carga"]');
      if (e !== 'modal' && S.sel.carga.size && !num(S.carga.valor)) F(S.carga.tipo === 'pressao' ? 'o valor da pressão' : S.carga.tipo === 'massa' ? 'o peso (kg)' : 'o valor da força', '[data-v="carga.valor"]');
      if ((e === 'modal' || S.gravidade) && !p.rho) F('a densidade', '[data-v="props.rho"]');
      if (e === 'otimizar' && !(num(S.manter) > 0 && num(S.manter) < 100)) F('quanto % do material manter', '[data-v="manter"]');
    } else {
      if (!p.k) F('a condutividade do material', '[data-v="props.k"]');
      if (S.sel.temp.size && num(S.tempValor) == null) F('a temperatura das faces 🌡️', '[data-v="tempValor"]');
      if (S.sel.calor.size && num(S.calorValor) == null) F('a potência de calor (W)', '[data-v="calorValor"]');
      if (!S.sel.temp.size && !num(S.hconv)) F('uma face com temperatura fixa ou o coeficiente h de troca com o ar', '[data-v="hconv"]');
      if (num(S.hconv) && num(S.tAmb) == null) F('a temperatura do ar', '[data-v="tAmb"]');
      if (!S.sel.temp.size && !S.sel.calor.size) F('de onde vem o calor (faces 🌡️ ou 🔥)', '.fea-sel[data-k="calor"]');
    }
    const prog = painel.querySelector('#feaProg');
    S.falta = alvo; marcaFalta();
    if (falta.length) { prog.innerHTML = `<span class="atencao">Falta: ${falta.join(', ')}. (marquei com um círculo vermelho)</span>`; painel.querySelector('.fea-falta')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); avisa('Falta preencher o que está com círculo vermelho.'); return; }
    const d = { normal: 'normal', z: [0, 0, 1], '-z': [0, 0, -1], x: [1, 0, 0], '-x': [-1, 0, 0], y: [0, 1, 0], '-y': [0, -1, 0] }[S.carga.dir];
    const cfg = { alvo: MALHAS[S.malha][e], E: (p.E || 1) * 1000, nu: p.nu, rho: (p.rho || 0) * 1e-12, rhoKg: p.rho || 0, cp: p.cp || 0, k: p.k, modos: +S.modos,
      fixo: lista('fixo'), cargas: S.sel.carga.size ? [{ tris: lista('carga'), tipo: S.carga.tipo === 'pressao' ? 'pressao' : 'forca', valor: num(S.carga.valor) * (S.carga.tipo === 'massa' ? 9.81 : 1), dir: S.carga.tipo === 'pressao' ? 'normal' : d }] : [], gravidade: S.gravidade,
      temps: S.sel.temp.size ? [{ tris: lista('temp'), valor: num(S.tempValor) }] : [], calor: S.sel.calor.size ? [{ tris: lista('calor'), valor: num(S.calorValor) }] : [],
      hconv: num(S.hconv) || 0, tAmb: num(S.tAmb) ?? 20, manter: (num(S.manter) || 0) / 100, iter: 22 };
    try { worker?.terminate(); worker = new Worker('fea-worker.js' + (SRC ? `?${SRC}` : '')); } catch (er) { prog.textContent = 'Este navegador não deixou rodar a simulação: ' + er.message; return; }
    S.rodando = true; S.escolhendo = null; S.res = null; S.anima = false; S.versao++; pinta(); api.render();
    const pg = () => painel.querySelector('#feaProg');
    worker.onmessage = (m) => {
      const d2 = m.data;
      if (d2.prog) { const q = pg(); if (q) q.textContent = `${d2.prog.fase}${d2.prog.it ? ` · ${d2.prog.it}` : ''}…`; return; }
      S.rodando = false; worker.terminate(); worker = null;
      if (d2.erro) { pinta(); pg().innerHTML = `<span class="ruim">Não deu: ${esc(d2.erro)}.</span>`; return; }
      S.res = d2.fim; S.vista = 'vm'; S.modo = 0; S.livre = null; S.potencia = null; S.tempo = null; S.res.aplicado = { v: num(S.carga.valor) || 0, un: S.carga.tipo === 'pressao' ? 'MPa' : S.carga.tipo === 'massa' ? 'kg' : 'N' }; if (S.res.estudo !== 'termico' || S.res.quadros?.length) { S.anima = true; laco(); }
      S.versao++; pinta(); api.render();
    };
    worker.onerror = (er) => { S.rodando = false; pinta(); pg().innerHTML = `<span class="ruim">Erro na simulação: ${esc(er.message || 'falhou')}.</span>`; };
    worker.postMessage({ estudo: e, tris: tris.map((t) => t.points), cfg });
  }
  function stlOtim() {
    const r = S.res; if (!r?.casca) return;
    const buf = new ArrayBuffer(84 + r.casca.length * 50), dv = new DataView(buf); dv.setUint32(80, r.casca.length, true);
    r.casca.forEach(([a, b, c, n], i) => { let o = 84 + i * 50; for (const v of [n, a, b, c]) for (const x of v) { dv.setFloat32(o, x, true); o += 4; } });
    const url = URL.createObjectURL(new Blob([buf], { type: 'model/stl' })), l = document.createElement('a'); l.href = url; l.download = 'peca-otimizada.stl'; l.click(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function avisa(t) { const el = $('toast'); if (!el) return; el.textContent = t; el.classList.add('show'); clearTimeout(avisa.t); avisa.t = setTimeout(() => el.classList.remove('show'), 2600); }

  // ---------- botões ----------
  function montar() {
    if (!API() || !$('analisePeca')) return setTimeout(montar, 300);
    const bt = document.createElement('button'); bt.id = 'simulacaoFEA'; bt.type = 'button'; bt.className = 'secondary-button'; bt.textContent = '🧪 Simulação';
    bt.title = 'Simulação: tensão, coeficiente de segurança, frequências, térmico e otimização de forma'; bt.onclick = abrir;
    $('analisePeca').insertAdjacentElement('afterend', bt);
    const canto = document.querySelector('.canto-3d');
    if (canto) { const b = document.createElement('button'); b.type = 'button'; b.dataset.a = 'fea'; b.title = 'Simulação (tensão, frequência, calor, otimização)'; b.textContent = '🧪'; b.onclick = abrir; canto.appendChild(b);
      setInterval(() => b.classList.toggle('on', S.aberto), 400); }
  }
  montar();
})();
