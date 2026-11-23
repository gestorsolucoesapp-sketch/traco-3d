// Ferramentas estilo SketchUp para a Arquitetura: Círculo/Polígono, Arco, Mover/Copiar (com
// matriz "3x"), Girar, Espelhar, Fita métrica (guias), Cota e Texto. Todas usam a mesma
// inferência da Linha e aceitam medida digitada (aparece na caixa de medida, Enter confirma).
(() => {
  const $ = (id) => document.getElementById(id);
  const ex = { tool: null, passo: 0, pts: [], alvo: null, typed: '', hover: null, lados: 24 };
  window.tracoFerramentas = ex;
  state.extras = state.extras || { guias: [], cotas: [], textos: [] };

  // ---------- persistência (guias, cotas, textos) ----------
  const _payload = window.projectPayload, _parse = window.parseProject;
  window.projectPayload = () => ({ ..._payload(), extras: state.extras });
  window.parseProject = (raw) => {
    const r = _parse(raw);
    let e = null; try { e = JSON.parse(raw).extras; } catch { /* */ }
    const ok = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
    r.extras = {
      guias: (e?.guias || []).filter((g) => ok(g.a) && ok(g.b)).slice(0, 200),
      cotas: (e?.cotas || []).filter((c) => ok(c.a) && ok(c.b) && Number.isFinite(c.off)).slice(0, 200),
      textos: (e?.textos || []).filter((t) => ok(t.p) && typeof t.t === 'string').map((t) => ({ p: t.p, t: t.t.slice(0, 80) })).slice(0, 200),
    };
    return r;
  };
  try { const raw = localStorage.getItem('traco-project-v1'); if (raw) state.extras = parseProject(raw).extras; } catch { /* */ }
  const salvar = () => { saveProject(); requestRender(); };

  // ---------- inferência também nas guias ----------
  const _infer = window.inferPoint;
  window.inferPoint = (point, origin, tol) => {
    const r = _infer(point, origin, tol);
    if (r || !state.extras.guias.length) return r;
    const b = sketchCanvas.getBoundingClientRect(), s = b.width / DESIGN_WIDTH * vk();
    let best = null, bd = tol * .7;
    const G = state.extras.guias;
    for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) { // cruzamento de guias
      const x = inter(G[i].a, G[i].b, G[j].a, G[j].b); if (!x) continue;
      const d = Math.hypot(x[0] - point[0], x[1] - point[1]) * s; if (d < bd * 1.4) { bd = d; best = { point: x, kind: 'point' }; }
    }
    if (best) return best;
    for (const g of G) { const q = proj(point, g.a, g.b); const d = Math.hypot(q[0] - point[0], q[1] - point[1]) * s; if (d < bd) { bd = d; best = { point: q, kind: 'edge' }; } }
    return best;
  };
  function inter(a, b, c, d) {
    const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]], den = r[0] * q[1] - r[1] * q[0];
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den;
    return [a[0] + r[0] * t, a[1] + r[1] * t];
  }
  function proj(p, a, b) {
    const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy || 1;
    const t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L;
    return [a[0] + vx * t, a[1] + vy * t];
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const m = (px) => (px / state.pixelsPerMeter).toFixed(2).replace('.', ',') + ' m';
  const clamp = (p) => [Math.max(0, Math.min(DESIGN_WIDTH, p[0])), Math.max(0, Math.min(DESIGN_HEIGHT, p[1]))];

  // ---------- botões ----------
  const TOOLS = [
    ['circulo', '◯ Círculo', 'Círculo ou polígono: clique o centro e o raio. Digite o raio (ex.: 1,5) ou "6l" para 6 lados'],
    ['arco', '⌒ Arco', 'Arco: clique o início, o fim e depois o bojo (ou digite o bojo em m)'],
    ['mover', '✥ Mover/Copiar', 'Mover: clique a parede, o ponto base e o destino. Ctrl (ou o botão Cópia) copia; depois digite "3x" para repetir'],
    ['girar', '⟲ Girar', 'Girar: clique a parede, o centro, uma direção e gire. Digite o ângulo (ex.: 90)'],
    ['espelhar', '⇋ Espelhar', 'Espelhar: clique a parede e dois pontos do eixo. Ctrl mantém o original'],
    ['fita', '📏 Fita', 'Fita métrica: clique numa parede e puxe para criar uma guia paralela (digite a distância). Clique em dois pontos para só medir'],
    ['cota', '↔ Cota', 'Cota: clique dois pontos e depois afaste para posicionar a medida'],
    ['texto', 'A Texto', 'Texto: clique onde quer a anotação'],
  ];
  const linha = document.querySelector('#architectureMode .tools-row');
  const div = linha.querySelector('.tool-divider');
  const btns = {};
  for (const [id, rot, dica] of TOOLS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tool'; b.textContent = rot; b.title = dica; b.dataset.ext = id;
    b.addEventListener('click', () => ativar(id));
    linha.insertBefore(b, div); btns[id] = b;
  }
  const copiaBtn = document.createElement('button');
  copiaBtn.type = 'button'; copiaBtn.className = 'tool ext-copia'; copiaBtn.textContent = '＋ Cópia'; copiaBtn.hidden = true;
  copiaBtn.title = 'Ligado: Mover e Espelhar mantêm o original (igual segurar Ctrl)';
  copiaBtn.onclick = () => { ex.copia = !ex.copia; copiaBtn.classList.toggle('active', ex.copia); };
  linha.insertBefore(copiaBtn, div);
  const limparBtn = document.createElement('button');
  limparBtn.type = 'button'; limparBtn.className = 'tool'; limparBtn.textContent = 'Apagar guias'; limparBtn.hidden = true;
  limparBtn.onclick = () => { state.extras.guias = []; salvar(); notify('Guias apagadas.'); };
  linha.insertBefore(limparBtn, div);

  const _setTool = window.setTool;
  window.setTool = (t) => { if (t !== 'ext') { ex.tool = null; marcar(); } _setTool(t); };
  function marcar() {
    for (const [id, b] of Object.entries(btns)) { b.classList.toggle('active', ex.tool === id); b.setAttribute('aria-pressed', String(ex.tool === id)); }
    copiaBtn.hidden = !['mover', 'espelhar'].includes(ex.tool);
    limparBtn.hidden = ex.tool !== 'fita' || !state.extras.guias.length;
  }
  function ativar(id) {
    _setTool('ext'); ex.tool = id; reset(); marcar();
    $('measureBox').hidden = false; $('measureInput').disabled = true; $('applyMeasure').disabled = true;
    $('toolHint').textContent = TOOLS.find((t) => t[0] === id)[2];
    sketchCanvas.focus({ preventScroll: true });
    vcb(); requestRender();
  }
  function reset() { ex.passo = 0; ex.pts = []; ex.alvo = null; ex.typed = ''; ex.ultimaCopia = null; vcb(); }
  function vcb(txt) {
    if (!ex.tool) return;
    $('liveMeasure').textContent = txt || (ex.typed ? `Digitado: ${ex.typed} · Enter aplica` : passoTxt());
  }
  function passoTxt() {
    const t = ex.tool, p = ex.passo;
    if (t === 'circulo') return p ? `Raio: ${ex.hover ? m(dist(ex.pts[0], ex.hover)) : '—'} · ${ex.lados} lados` : `Clique o centro · ${ex.lados} lados`;
    if (t === 'arco') return ['Clique o início do arco', 'Clique o fim do arco', 'Puxe o bojo e clique'][p];
    if (t === 'mover') return ['Clique a parede', 'Clique o ponto base', 'Clique o destino'][p] + (ex.copia ? ' · cópia' : '');
    if (t === 'girar') return ['Clique a parede', 'Clique o centro do giro', 'Clique a direção de referência', 'Gire e clique (ou digite o ângulo)'][p];
    if (t === 'espelhar') return ['Clique a parede', 'Clique o 1º ponto do eixo', 'Clique o 2º ponto do eixo'][p];
    if (t === 'fita') return p ? 'Puxe e clique (ou digite a distância)' : 'Clique numa parede (guia) ou num ponto (medir)';
    if (t === 'cota') return ['Clique o 1º ponto', 'Clique o 2º ponto', 'Afaste e clique para posicionar'][p];
    return 'Clique onde vai o texto';
  }

  // ---------- utilidades ----------
  function ponto(ev, origem = null) { return snapPoint(sketchPoint(ev), origem, ev.altKey, ev.pointerType); }
  function strokeEm(p, tol = 14) {
    let best = -1, bd = tol / vk();
    state.strokes.forEach((s, i) => { for (let k = 1; k < s.length; k++) { const d = pointSegmentDistance(p, s[k - 1], s[k]); if (d < bd) { bd = d; best = i; } } });
    return best;
  }
  function segEm(p, tol = 14) {
    let best = null, bd = tol / vk();
    for (const s of state.strokes) for (let k = 1; k < s.length; k++) { const d = pointSegmentDistance(p, s[k - 1], s[k]); if (d < bd) { bd = d; best = [s[k - 1], s[k]]; } }
    return best;
  }
  const dentro = (pts) => pts.every((p) => p[0] >= 0 && p[0] <= DESIGN_WIDTH && p[1] >= 0 && p[1] <= DESIGN_HEIGHT);
  const r2 = (p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
  function poligono(c, raio, ang0, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = ang0 + i * 2 * Math.PI / n; pts.push(r2([c[0] + raio * Math.cos(a), c[1] + raio * Math.sin(a)])); }
    pts[n] = [...pts[0]]; return pts;
  }
  function arco(a, b, bojo) { // bojo com sinal (px), perpendicular ao meio da corda
    const L = dist(a, b); if (L < 1 || Math.abs(bojo) < .5) return [a, b];
    const h = Math.abs(bojo), R = (L * L / 4 + h * h) / (2 * h);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, nx = -(b[1] - a[1]) / L * Math.sign(bojo), ny = (b[0] - a[0]) / L * Math.sign(bojo);
    const c = [mx - nx * (R - h), my - ny * (R - h)];
    let a0 = Math.atan2(a[1] - c[1], a[0] - c[0]), a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
    const topo = [mx + nx * h, my + ny * h], am = Math.atan2(topo[1] - c[1], topo[0] - c[0]);
    const norm = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    let sweep = norm(a1 - a0); if (norm(am - a0) > sweep) sweep -= 2 * Math.PI;
    const n = Math.max(4, Math.min(48, Math.round(Math.abs(sweep) / (Math.PI / 24))));
    const pts = []; for (let i = 0; i <= n; i++) { const t = a0 + sweep * i / n; pts.push(r2([c[0] + R * Math.cos(t), c[1] + R * Math.sin(t)])); }
    pts[0] = [...a]; pts[n] = [...b]; return pts;
  }
  const girarP = (p, c, ang) => { const s = Math.sin(ang), co = Math.cos(ang); return r2([c[0] + (p[0] - c[0]) * co - (p[1] - c[1]) * s, c[1] + (p[0] - c[0]) * s + (p[1] - c[1]) * co]); };
  function espelharP(p, a, b) { const q = proj(p, a, b); return r2([2 * q[0] - p[0], 2 * q[1] - p[1]]); }
  function anguloEntre(c, a, b) { return Math.atan2(b[1] - c[1], b[0] - c[0]) - Math.atan2(a[1] - c[1], a[0] - c[0]); }
  const snapAng = (ang) => { const g = ang * 180 / Math.PI, s = Math.round(g / 15) * 15; return Math.abs(g - s) < 3 ? s * Math.PI / 180 : ang; };

  // ---------- ações finais ----------
  function aplicar(final, ev) {
    const t = ex.tool, P = ex.pts, copia = ex.copia || ev?.ctrlKey;
    if (t === 'circulo') {
      const raio = dist(P[0], final); if (raio < 3) return;
      const pts = poligono(P[0], raio, Math.atan2(final[1] - P[0][1], final[0] - P[0][0]), ex.lados);
      if (!dentro(pts)) return notify('O círculo sai do quadro. Diminua o raio ou a escala.');
      commit([...state.strokes, pts]); notify(`${ex.lados >= 12 ? 'Círculo' : 'Polígono de ' + ex.lados + ' lados'} · raio ${m(raio)}`); reset(); return;
    }
    if (t === 'arco') {
      const [a, b] = P, c = proj(final, a, b), sinal = Math.sign((b[0] - a[0]) * (final[1] - a[1]) - (b[1] - a[1]) * (final[0] - a[0])) || 1;
      const pts = arco(a, b, -sinal * dist(c, final)); if (!dentro(pts)) return notify('O arco sai do quadro.');
      commit([...state.strokes, pts]); reset(); return;
    }
    if (t === 'mover') {
      const dx = final[0] - P[0][0], dy = final[1] - P[0][1], s = state.strokes[ex.alvo];
      const novo = s.map((p) => r2([p[0] + dx, p[1] + dy])); if (!dentro(novo)) return notify('Sai do quadro.');
      const lista = [...state.strokes];
      if (copia) { lista.push(novo); ex.ultimaCopia = { base: ex.alvo, dx, dy, n: 1 }; } else lista[ex.alvo] = novo;
      commit(lista); notify(copia ? `Copiado a ${m(Math.hypot(dx, dy))}. Digite "3x" para repetir.` : `Movido ${m(Math.hypot(dx, dy))}`);
      const ult = ex.ultimaCopia; reset(); ex.ultimaCopia = copia ? ult : null; return;
    }
    if (t === 'girar') {
      const ang = typeof final === 'number' ? final : snapAng(anguloEntre(P[0], P[1], final));
      const s = state.strokes[ex.alvo], novo = s.map((p) => girarP(p, P[0], ang));
      if (!dentro(novo)) return notify('Sai do quadro.');
      const lista = [...state.strokes]; if (copia) lista.push(novo); else lista[ex.alvo] = novo;
      commit(lista); notify(`Girado ${(-ang * 180 / Math.PI).toFixed(1).replace('.', ',')}°`); reset(); return;
    }
    if (t === 'espelhar') {
      const s = state.strokes[ex.alvo], novo = s.map((p) => espelharP(p, P[0], final));
      if (!dentro(novo)) return notify('Sai do quadro.');
      const lista = [...state.strokes]; if (copia) lista.push(novo); else lista[ex.alvo] = novo;
      commit(lista); reset(); return;
    }
    if (t === 'fita') {
      if (ex.seg) {
        const [a, b] = ex.seg, q = proj(final, a, b), d = dist(q, final); if (d < 1) return;
        const vx = (final[0] - q[0]) / d, vy = (final[1] - q[1]) / d, L = Math.max(DESIGN_WIDTH, DESIGN_HEIGHT) * 2, ux = (b[0] - a[0]) / dist(a, b), uy = (b[1] - a[1]) / dist(a, b);
        const c = [a[0] + vx * d, a[1] + vy * d];
        state.extras.guias.push({ a: r2([c[0] - ux * L, c[1] - uy * L]), b: r2([c[0] + ux * L, c[1] + uy * L]) });
        salvar(); notify(`Guia a ${m(d)} da parede`); marcar();
      } else notify(`Distância: ${m(dist(P[0], final))}`);
      reset(); return;
    }
    if (t === 'cota') {
      const [a, b] = P, q = proj(final, a, b), off = Math.sign((b[0] - a[0]) * (final[1] - a[1]) - (b[1] - a[1]) * (final[0] - a[0])) * dist(q, final);
      state.extras.cotas.push({ a, b, off }); salvar(); reset(); return;
    }
  }
  function clique(ev) {
    const t = ex.tool; if (!t) return;
    const prev = ex.pts.at(-1) || null;
    const sp = ponto(ev, prev), p = sp.point;
    if (t === 'texto') {
      const txt = prompt('Texto da anotação:'); if (txt && txt.trim()) { state.extras.textos.push({ p, t: txt.trim().slice(0, 80) }); salvar(); }
      return;
    }
    if (['mover', 'girar', 'espelhar'].includes(t) && ex.passo === 0) {
      const i = strokeEm(sketchPoint(ev), ev.pointerType === 'touch' ? 22 : 14);
      if (i < 0) return notify('Toque em cima de uma parede.');
      ex.alvo = i; ex.passo = 1; vcb(); requestRender(); return;
    }
    if (t === 'fita' && ex.passo === 0) {
      ex.seg = sp.kind === 'point' ? null : segEm(sketchPoint(ev), ev.pointerType === 'touch' ? 22 : 14);
      ex.pts = [p]; ex.passo = 1; vcb(); requestRender(); return;
    }
    const finais = { circulo: 1, arco: 2, mover: 2, girar: 3, espelhar: 2, fita: 1, cota: 2 };
    if (ex.passo >= finais[t]) { aplicar(p, ev); return; }
    ex.pts.push(p); ex.passo++; vcb(); requestRender();
  }
  sketchCanvas.addEventListener('pointerdown', (ev) => {
    if (!ex.tool || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    clique(ev);
  }, { capture: true });
  sketchCanvas.addEventListener('pointermove', (ev) => {
    if (!ex.tool) return;
    ev.stopImmediatePropagation();
    const sp = ponto(ev, ex.pts.at(-1) || null); ex.hover = sp.point; ex.hoverKind = sp.kind; ex.hoverGuides = sp.guides || [];
    vcb(); requestRender();
  }, { capture: true });
  for (const tp of ['pointerup', 'pointercancel']) sketchCanvas.addEventListener(tp, (ev) => { if (ex.tool) ev.stopImmediatePropagation(); }, { capture: true });

  // ---------- teclado (caixa de medida) ----------
  window.addEventListener('keydown', (ev) => {
    if (!ex.tool || $('architectureMode').hidden || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    if (ev.key === 'Escape') { ev.preventDefault(); reset(); requestRender(); return; }
    if (ev.key === 'Backspace') { ev.preventDefault(); ex.typed = ex.typed.slice(0, -1); vcb(); return; }
    if (ev.key === 'Enter') { ev.preventDefault(); digitado(); return; }
    if (/^[0-9,.\-xlsXLS]$/.test(ev.key) || (ev.key === 'm' || ev.key === 'c')) { ev.preventDefault(); ex.typed += ev.key.toLowerCase(); vcb(); }
  }, { capture: true });
  function digitado() {
    const txt = ex.typed.trim(); ex.typed = ''; if (!txt) { vcb(); return; }
    const t = ex.tool, P = ex.pts;
    const lados = /^(\d+)\s*[ls]$/.exec(txt);
    if (t === 'circulo' && lados) { ex.lados = Math.max(3, Math.min(64, +lados[1])); vcb(); requestRender(); return; }
    const rep = /^(\d+)\s*x$/.exec(txt);
    if (t === 'mover' && rep && ex.ultimaCopia) { // matriz: repete a última cópia N vezes
      const { base, dx, dy } = ex.ultimaCopia, n = Math.min(50, +rep[1]), s = state.strokes[base], lista = [...state.strokes];
      lista.length -= 1;
      for (let k = 1; k <= n; k++) { const novo = s.map((p) => r2([p[0] + dx * k, p[1] + dy * k])); if (dentro(novo)) lista.push(novo); }
      commit(lista); notify(`${n} cópias`); ex.ultimaCopia = null; vcb(); return;
    }
    if (t === 'girar' && ex.passo === 3) { const g = window.tracoConta?.(txt) ?? Number(txt.replace(',', '.')); if (Number.isFinite(g)) aplicar(-g * Math.PI / 180); return; }
    const metros = parseLength(txt.replace(/m$/, ' m')) ?? ((window.tracoConta?.(txt) ?? 0) > 0 ? window.tracoConta(txt) : null);
    if (metros == null) { notify('Medida inválida.'); vcb(); return; }
    const px = metros * state.pixelsPerMeter;
    const dir = (o) => { const h = ex.hover || [o[0] + 1, o[1]], d = dist(o, h) || 1; return [o[0] + (h[0] - o[0]) / d * px, o[1] + (h[1] - o[1]) / d * px]; };
    if (t === 'circulo' && ex.passo === 1) return aplicar(dir(P[0]));
    if (t === 'mover' && ex.passo === 2) return aplicar(dir(P[0]));
    if (t === 'fita' && ex.passo === 1) {
      if (ex.seg) { const q = proj(ex.hover || P[0], ...ex.seg), h = ex.hover || [q[0] + 1, q[1]], d = dist(q, h) || 1; return aplicar([q[0] + (h[0] - q[0]) / d * px, q[1] + (h[1] - q[1]) / d * px]); }
    }
    if (t === 'arco' && ex.passo === 2) { const [a, b] = P, mm = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], q = proj(ex.hover || mm, a, b), h = ex.hover || mm; const d = dist(q, h) || 1;
      return aplicar([mm[0] + (h[0] - q[0]) / d * px, mm[1] + (h[1] - q[1]) / d * px]); }
    if (t === 'arco' && ex.passo === 1) { ex.pts.push(dir(P[0])); ex.passo++; vcb(); requestRender(); return; }
    if (t === 'cota' && ex.passo === 1) { ex.pts.push(dir(P[0])); ex.passo++; vcb(); requestRender(); return; }
    notify('Aqui a medida não se aplica; clique no quadro.'); vcb();
  }

  // ---------- desenho ----------
  const q = () => 1 / vk();
  function setaCota(ctx, a, b, off, cor = '#1a237e') {
    const L = dist(a, b); if (L < 1) return;
    const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, A = [a[0] + nx * off, a[1] + ny * off], B = [b[0] + nx * off, b[1] + ny * off];
    ctx.save(); ctx.strokeStyle = cor; ctx.fillStyle = cor; ctx.lineWidth = 1.2 * q();
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(A[0] + nx * 4 * q() * Math.sign(off || 1), A[1] + ny * 4 * q() * Math.sign(off || 1));
    ctx.moveTo(...b); ctx.lineTo(B[0] + nx * 4 * q() * Math.sign(off || 1), B[1] + ny * 4 * q() * Math.sign(off || 1)); ctx.setLineDash([2 * q(), 2 * q()]); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.stroke();
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, s = 7 * q();
    for (const [P, d] of [[A, 1], [B, -1]]) { ctx.beginPath(); ctx.moveTo(...P); ctx.lineTo(P[0] + d * ux * s + nx * s * .35, P[1] + d * uy * s + ny * s * .35); ctx.lineTo(P[0] + d * ux * s - nx * s * .35, P[1] + d * uy * s - ny * s * .35); ctx.closePath(); ctx.fill(); }
    etiqueta(ctx, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], m(L), cor);
    ctx.restore();
  }
  function etiqueta(ctx, p, txt, cor = '#111') {
    ctx.save(); ctx.font = `700 ${12 * q()}px DM Sans, Arial, sans-serif`;
    const w = ctx.measureText(txt).width + 10 * q(), h = 18 * q();
    ctx.fillStyle = '#fffffff2'; ctx.strokeStyle = cor; ctx.lineWidth = q();
    ctx.beginPath(); ctx.roundRect(p[0] - w / 2, p[1] - h / 2, w, h, 4 * q()); ctx.fill(); ctx.stroke();
    ctx.fillStyle = cor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, p[0], p[1] + .5 * q()); ctx.restore();
  }
  function tracejado(ctx, pts, cor = '#2e4b3f') {
    if (pts.length < 2) return;
    ctx.save(); ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p);
    ctx.setLineDash([6 * q(), 4 * q()]); ctx.strokeStyle = cor; ctx.lineWidth = 2 * q(); ctx.stroke(); ctx.restore();
  }
  ex.desenhar = (ctx) => {
    const E = state.extras;
    ctx.save(); ctx.setLineDash([5 * q(), 5 * q()]); ctx.strokeStyle = '#7B1FA2aa'; ctx.lineWidth = q();
    for (const g of E.guias) { ctx.beginPath(); ctx.moveTo(...g.a); ctx.lineTo(...g.b); ctx.stroke(); }
    ctx.restore();
    for (const c of E.cotas) setaCota(ctx, c.a, c.b, c.off);
    for (const t of E.textos) etiqueta(ctx, t.p, t.t, '#111');
    if (!ex.tool) return;
    const P = ex.pts, h = ex.hover, t = ex.tool;
    if (ex.alvo != null && state.strokes[ex.alvo]) { ctx.save(); const s = state.strokes[ex.alvo]; ctx.beginPath(); ctx.moveTo(...s[0]); for (const p of s.slice(1)) ctx.lineTo(...p); ctx.strokeStyle = '#1976D2'; ctx.lineWidth = 4 * q(); ctx.stroke(); ctx.restore(); }
    if (h) {
      if (t === 'circulo' && P[0]) { tracejado(ctx, poligono(P[0], dist(P[0], h), Math.atan2(h[1] - P[0][1], h[0] - P[0][0]), ex.lados)); tracejado(ctx, [P[0], h], '#999'); etiqueta(ctx, h, 'r ' + m(dist(P[0], h))); }
      if (t === 'arco') { if (P.length === 1) tracejado(ctx, [P[0], h]); if (P.length === 2) { const [a, b] = P, c = proj(h, a, b), si = Math.sign((b[0] - a[0]) * (h[1] - a[1]) - (b[1] - a[1]) * (h[0] - a[0])) || 1; tracejado(ctx, arco(a, b, -si * dist(c, h))); etiqueta(ctx, h, 'bojo ' + m(dist(c, h))); } }
      if (t === 'mover' && P.length === 1) { const dx = h[0] - P[0][0], dy = h[1] - P[0][1]; tracejado(ctx, state.strokes[ex.alvo].map((p) => [p[0] + dx, p[1] + dy])); tracejado(ctx, [P[0], h], '#999'); etiqueta(ctx, h, m(dist(P[0], h))); }
      if (t === 'girar') {
        if (P.length >= 1) { ctx.save(); ctx.beginPath(); ctx.arc(P[0][0], P[0][1], 30 * q(), 0, 7); ctx.strokeStyle = '#1976D2'; ctx.lineWidth = 1.5 * q(); ctx.stroke(); ctx.restore(); }
        if (P.length === 1) tracejado(ctx, [P[0], h], '#999');
        if (P.length === 2) { const ang = snapAng(anguloEntre(P[0], P[1], h)); tracejado(ctx, [P[0], P[1]], '#999'); tracejado(ctx, state.strokes[ex.alvo].map((p) => girarP(p, P[0], ang))); etiqueta(ctx, h, `${(-ang * 180 / Math.PI).toFixed(1).replace('.', ',')}°`); }
      }
      if (t === 'espelhar' && P.length === 1 && dist(P[0], h) > 2) { tracejado(ctx, [P[0], h], '#7B1FA2'); tracejado(ctx, state.strokes[ex.alvo].map((p) => espelharP(p, P[0], h))); }
      if (t === 'fita' && P[0]) { if (ex.seg) { const c = proj(h, ...ex.seg); tracejado(ctx, [c, h], '#7B1FA2'); etiqueta(ctx, h, m(dist(c, h))); } else { tracejado(ctx, [P[0], h], '#7B1FA2'); etiqueta(ctx, h, m(dist(P[0], h))); } }
      if (t === 'cota') { if (P.length === 1) tracejado(ctx, [P[0], h], '#1a237e'); if (P.length === 2) { const q2 = proj(h, P[0], P[1]); setaCota(ctx, P[0], P[1], Math.sign((P[1][0] - P[0][0]) * (h[1] - P[0][1]) - (P[1][1] - P[0][1]) * (h[0] - P[0][0])) * dist(q2, h)); } }
      try { drawInference(ctx, h, ex.hoverKind, ex.hoverGuides, false); } catch { /* */ }
    }
  };
  // Toque na medida de uma parede (com Linha sem traço em andamento): edita comprimento e ângulo.
  const edBox = document.createElement('div'); edBox.className = 'cota-edit'; edBox.hidden = true;
  document.querySelector('#architectureMode .sketch-wrap').appendChild(edBox);
  edBox.addEventListener('pointerdown', (e) => e.stopPropagation());
  function rotuloEm(p) {
    const q2 = 1 / vk();
    for (let si = 0; si < state.strokes.length; si++) { const s = state.strokes[si]; if (s.length !== 2) continue;
      const mx = (s[0][0] + s[1][0]) / 2, my = (s[0][1] + s[1][1]) / 2 - 12 * q2;
      if (Math.abs(p[0] - mx) < 30 * q2 && Math.abs(p[1] - my) < 13 * q2) return si; }
    return -1;
  }
  function editarParede(si) {
    const [a, b] = state.strokes[si], L = dist(a, b) / state.pixelsPerMeter, ang = -Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    const fm = (v) => String(+v.toFixed(2)).replace('.', ',');
    edBox.innerHTML = `<b>Parede</b>
      <label>Comprimento <input id="edL" inputmode="decimal" value="${fm(L)}" /> m</label>
      <label>Ângulo <input id="edA" inputmode="decimal" value="${fm(ang)}" /> °</label>
      <div><button type="button" class="primary-button" data-c="ok">Aplicar</button> <button type="button" class="secondary-button" data-c="x">Fechar</button></div>
      <small>A ponta final anda e as paredes ligadas a ela acompanham.</small>`;
    edBox.hidden = false; const inp = edBox.querySelector('#edL'); setTimeout(() => { inp.focus(); inp.select(); }, 30);
    const ok = () => {
      const nL = window.tracoConta?.(edBox.querySelector('#edL').value) ?? NaN, nA = window.tracoConta?.(edBox.querySelector('#edA').value) ?? NaN;
      if (!(nL > .01) || !Number.isFinite(nA)) return notify('Digite comprimento e ângulo válidos.');
      const r = -nA * Math.PI / 180, nb = r2([a[0] + Math.cos(r) * nL * state.pixelsPerMeter, a[1] + Math.sin(r) * nL * state.pixelsPerMeter]);
      if (!dentro([nb])) return notify('Sai do quadro.');
      const igual = (p) => Math.abs(p[0] - b[0]) < .5 && Math.abs(p[1] - b[1]) < .5;
      commit(state.strokes.map((s) => s.map((p) => (igual(p) ? [...nb] : p))));
      edBox.hidden = true; notify(`Parede: ${fm(nL)} m a ${fm(nA)}°`);
    };
    edBox.querySelector('[data-c=ok]').onclick = ok; edBox.querySelector('[data-c=x]').onclick = () => { edBox.hidden = true; };
    edBox.querySelectorAll('input').forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } if (e.key === 'Escape') edBox.hidden = true; }));
  }
  sketchCanvas.addEventListener('pointerdown', (ev) => {
    if (ex.tool || window.tracoObjetos?.ativo || state.tool !== 'line' || state.lineStart || window.tracoEstilo?.cotas === false) return;
    const si = rotuloEm(sketchPoint(ev)); if (si < 0) return;
    ev.preventDefault(); ev.stopImmediatePropagation(); editarParede(si);
  }, { capture: true });

  // Apagar: também remove cota/texto tocado.
  sketchCanvas.addEventListener('pointerdown', (ev) => {
    if (state.tool !== 'erase') return;
    const p = sketchPoint(ev), tol = 14 / vk(), E = state.extras;
    const ti = E.textos.findIndex((t) => dist(t.p, p) < tol * 1.5);
    if (ti >= 0) { E.textos.splice(ti, 1); salvar(); ev.stopImmediatePropagation(); return; }
    const ci = E.cotas.findIndex((c) => { const L = dist(c.a, c.b) || 1, nx = -(c.b[1] - c.a[1]) / L, ny = (c.b[0] - c.a[0]) / L; return pointSegmentDistance(p, [c.a[0] + nx * c.off, c.a[1] + ny * c.off], [c.b[0] + nx * c.off, c.b[1] + ny * c.off]) < tol; });
    if (ci >= 0) { E.cotas.splice(ci, 1); salvar(); ev.stopImmediatePropagation(); }
  }, { capture: true });
})();
