// 🧊 Modelagem 3D: monta peças com vários corpos (chapas extrudadas com furos e rasgos em qualquer posição),
// agrupa em peças de impressão, gira/posiciona, mede peso e baixa STL. Funciona sem internet.
(() => {
  const G = window.tracoGeo3D;
  const $ = (id) => document.getElementById(id);
  const sw = document.querySelector('.discipline-switch');
  if (!G || !sw || !$('partsMode')) return;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const fmt = (v, c = 1) => (Number.isFinite(+v) ? (+v).toFixed(c).replace(/\.?0+$/, '').replace('.', ',') : '—');
  const novoId = () => 'c' + Math.random().toString(36).slice(2, 9);
  const DENS = { PETG: 1.27, PLA: 1.24, ASA: 1.07, ABS: 1.04, TPU: 1.21, 'PLA-CF': 1.29, 'PETG-CF': 1.30 };
  const CORES = { PETG: '#ef7d2c', PLA: '#4f8cd6', ASA: '#5b6470', ABS: '#8e6bbf', TPU: '#2f7de0', 'PLA-CF': '#30343a', 'PETG-CF': '#30343a', ref: '#aab4bd' };
  const CHAVE = 'traco-modelagem';

  // ---------- estado ----------
  let base = { modelos: [], atual: null };
  try { base = JSON.parse(localStorage.getItem(CHAVE)) || base; } catch { /* */ }
  const M = () => base.modelos.find((m) => m.id === base.atual);
  let sel = null, furoSel = null, malhas = new Map(), historico = [], futuro = [];
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(base)); } catch { aviso('Memória do navegador cheia: baixe o modelo (💾) para não perder.'); } };
  const snapshot = () => { const m = M(); if (!m) return; historico.push(JSON.stringify(m)); if (historico.length > 60) historico.shift(); futuro = []; };
  const corpoSel = () => M()?.corpos.find((c) => c.id === sel) || null;

  // ---------- aba ----------
  const tab = document.createElement('button');
  tab.id = 'modelagemTab'; tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', 'false');
  tab.textContent = '🧊 Modelagem 3D'; sw.appendChild(tab);
  const painel = document.createElement('div'); painel.id = 'modelagemMode'; painel.setAttribute('role', 'tabpanel'); painel.hidden = true;
  painel.innerHTML = `
  <section class="mdl">
    <div class="ras-topo mdl-topo">
      <select id="mdlSel" aria-label="Modelo"></select>
      <button type="button" data-a="novo">＋ Novo</button>
      <button type="button" data-a="nome" title="Renomear">✎</button>
      <button type="button" data-a="apagar" title="Apagar modelo">🗑</button>
      <button type="button" data-a="exemplo" title="Abrir exemplo pronto">⭐ Exemplo</button>
      <button type="button" data-a="desfazer" title="Desfazer (Ctrl+Z)">↶</button>
      <button type="button" data-a="refazer" title="Refazer">↷</button>
      <button type="button" data-a="baixarJson" title="Salvar o modelo em arquivo">💾</button>
      <button type="button" data-a="abrirJson" title="Abrir modelo salvo">📂</button>
    </div>
    <div class="mdl-corpo">
      <div class="mdl-vistas">
        <div class="mdl-3d"><canvas id="mdl3d"></canvas>
          <div class="mdl-vbar"><button type="button" data-v="iso" class="on">Perspectiva</button><button type="button" data-v="cima">Cima</button><button type="button" data-v="frente">Frente</button><button type="button" data-v="lado">Lado</button><button type="button" data-v="explodir">Explodir</button><button type="button" data-v="ref" class="on">Referências</button></div>
          <p class="mdl-info" id="mdlInfo"></p>
        </div>
        <div class="mdl-2d"><canvas id="mdl2d"></canvas><p class="mdl-dica" id="mdlDica">Escolha um corpo na lista para editar o contorno e os furos aqui (arraste um furo para mover).</p></div>
      </div>
      <div class="mdl-lado">
        <div class="mdl-add">
          <b>Adicionar corpo</b>
          <button type="button" data-n="chapa">▭ Chapa</button>
          <button type="button" data-n="cilindro">◯ Cilindro / bucha</button>
          <button type="button" data-n="casca">⊔ Caixa oca</button>
          <button type="button" data-n="perfil" title="Usa o contorno desenhado na aba Mecânica · peças">✏️ Do desenho (Peças)</button>
          <button type="button" data-n="stl">📥 STL</button>
        </div>
        <div id="mdlLista" class="mdl-lista"></div>
        <div id="mdlProp" class="mdl-prop"></div>
        <div id="mdlPecas" class="mdl-pecas"></div>
      </div>
    </div>
  </section>`;
  ($('projetosMode') || $('rascunhosMode') || $('partsMode')).insertAdjacentElement('afterend', painel);
  const arqJson = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json', hidden: true });
  const arqStl = Object.assign(document.createElement('input'), { type: 'file', accept: '.stl', hidden: true });
  painel.append(arqJson, arqStl);
  const cv3 = $('mdl3d'), cv2 = $('mdl2d');

  const OUTRAS = ['architectureMode', 'partsMode', 'rascunhosMode', 'projetosMode'];
  const TABS = ['architectureTab', 'partsTab', 'rascunhosTab', 'projetosTab'];
  function mostrar(sim) {
    painel.hidden = !sim; tab.setAttribute('aria-selected', String(sim));
    if (!sim) { document.body.classList.remove('em-modelagem'); return; }
    for (const id of OUTRAS) { const el = $(id); if (el) el.hidden = true; }
    for (const id of TABS) $(id)?.setAttribute('aria-selected', 'false');
    document.body.classList.remove('em-rascunhos'); document.body.classList.add('aba-livre', 'em-modelagem');
    try { localStorage.setItem('traco-active-mode', 'modelagem'); } catch { /* */ }
    if (!M()) carregarExemplo();
    requestAnimationFrame(() => { tamanho(); tudo(); });
  }
  tab.addEventListener('click', () => mostrar(true));
  for (const id of TABS) $(id)?.addEventListener('click', () => { mostrar(false); document.body.classList.toggle('aba-livre', !($('rascunhosMode')?.hidden ?? true) || !($('projetosMode')?.hidden ?? true)); });

  function aviso(t) { const el = $('mdlInfo'); el.textContent = t; el.classList.add('alerta'); clearTimeout(aviso.t); aviso.t = setTimeout(() => { el.classList.remove('alerta'); info(); }, 4500); }

  // ---------- modelos ----------
  function novoModelo(nome = 'Modelo novo', dados = null) {
    const m = { id: 'm' + Date.now().toString(36), nome, grupos: {}, corpos: [], ...(dados || {}) };
    m.id = 'm' + Date.now().toString(36);
    base.modelos.unshift(m); base.atual = m.id; sel = null; furoSel = null; historico = []; futuro = []; malhas.clear(); salvar();
    return m;
  }
  function carregarExemplo() {
    const d = JSON.parse(JSON.stringify(window.tracoModelagemExemplo || { nome: 'Exemplo', grupos: {}, corpos: [] }));
    novoModelo(d.nome, d); cam = { ...camPadrao }; tudo();
  }
  function listaModelos() {
    $('mdlSel').innerHTML = base.modelos.map((m) => `<option value="${m.id}" ${m.id === base.atual ? 'selected' : ''}>${esc(m.nome)}</option>`).join('');
  }
  $('mdlSel').addEventListener('change', (e) => { base.atual = e.target.value; sel = null; furoSel = null; historico = []; futuro = []; malhas.clear(); salvar(); tudo(); });
  painel.querySelector('.mdl-topo').addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    const m = M();
    if (a === 'novo') { const n = prompt('Nome do novo modelo:', 'Modelo novo'); if (n) { novoModelo(n.trim()); tudo(); } }
    else if (a === 'nome' && m) { const n = prompt('Novo nome:', m.nome); if (n) { m.nome = n.trim(); salvar(); listaModelos(); } }
    else if (a === 'apagar' && m) { if (confirm(`Apagar o modelo "${m.nome}"? Não dá para desfazer.`)) { base.modelos = base.modelos.filter((x) => x !== m); base.atual = base.modelos[0]?.id || null; malhas.clear(); salvar(); if (!M()) novoModelo(); tudo(); } }
    else if (a === 'exemplo') carregarExemplo();
    else if (a === 'desfazer' || a === 'refazer') desfazer(a === 'refazer');
    else if (a === 'baixarJson' && m) baixar(new Blob([JSON.stringify(m)], { type: 'application/json' }), nomeArq(m.nome) + '.modelo3d.json');
    else if (a === 'abrirJson') arqJson.click();
  });
  function desfazer(re) {
    const m = M(); if (!m) return;
    const de = re ? futuro : historico, para = re ? historico : futuro;
    if (!de.length) return; para.push(JSON.stringify(m));
    const d = JSON.parse(de.pop()); Object.assign(m, d); malhas.clear();
    if (!m.corpos.some((c) => c.id === sel)) sel = null; furoSel = null; salvar(); tudo();
  }
  arqJson.addEventListener('change', async () => {
    const f = arqJson.files?.[0]; arqJson.value = ''; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.corpos)) throw 0; novoModelo(d.nome || f.name, { grupos: d.grupos || {}, corpos: d.corpos }); tudo(); }
    catch { aviso('Esse arquivo não é um modelo da Modelagem 3D.'); }
  });

  // ---------- malhas ----------
  function malha(c) {
    const g = M().grupos[c.grupo] || null;
    const chave = JSON.stringify([c, g]);
    const ant = malhas.get(c.id); if (ant && ant.chave === chave) return ant;
    let r;
    if (c.contorno?.t === 'malha') {
      let tris = c.contorno.tris || [];
      tris = G.aplicar(tris, G.matriz(c)); if (g) tris = G.aplicar(tris, G.matriz(g));
      r = { tris, ruins: [] };
    } else r = G.corpo(c, M().grupos);
    r.chave = chave; r.vol = G.volume(r.tris); malhas.set(c.id, r); return r;
  }
  const imprime = (c) => c.mat !== 'ref' && c.visivel !== false;
  function pecas() { // grupos de impressão → {nome, corpos, tris, g}
    const m = M(), mapa = new Map();
    for (const c of m.corpos) {
      if (!imprime(c)) continue;
      const k = c.grupo || c.nome; if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(c);
    }
    return [...mapa].map(([nome, cs]) => {
      const tris = cs.flatMap((c) => malha(c).tris);
      const g = cs.reduce((s, c) => s + malha(c).vol / 1000 * (DENS[c.mat] || 1.24), 0);
      return { nome, cs, tris, g, mats: [...new Set(cs.map((c) => c.mat))].join('+') };
    });
  }

  // ---------- 3D ----------
  const camPadrao = { yaw: -0.85, pitch: 0.55, zoom: 1, vista: 'iso', ref: true, explodir: 0 };
  let cam = { ...camPadrao }, arr = null;
  function tamanho() {
    for (const c of [cv3, cv2]) { const r = c.getBoundingClientRect(), d = devicePixelRatio || 1; if (r.width) { c.width = r.width * d; c.height = r.height * d; } }
  }
  new ResizeObserver(() => { if (!painel.hidden) { tamanho(); desenhar3d(); desenhar2d(); } }).observe(cv3);
  function desenhar3d() {
    const ctx = cv3.getContext('2d'), W = cv3.width, H = cv3.height, m = M(); if (!m || !W) return;
    ctx.clearRect(0, 0, W, H);
    const itens = [];
    // vista explodida: cada peça se afasta do centro na altura (o que está em cima sobe, o de baixo desce)
    const zc = new Map(); let zg = 0, ng = 0;
    if (cam.explodir) {
      for (const c of m.corpos) { if (c.mat === 'ref' || c.visivel === false) continue; const k = G.caixa(malha(c).tris); if (!Number.isFinite(k[2])) continue;
        const g = c.grupo || c.nome, a = zc.get(g) || [Infinity, -Infinity]; zc.set(g, [Math.min(a[0], k[2]), Math.max(a[1], k[5])]); }
      for (const [, [a, b]] of zc) { zg += (a + b) / 2; ng++; } zg = ng ? zg / ng : 0;
    }
    for (const c of m.corpos) {
      if (c.visivel === false || (c.mat === 'ref' && !cam.ref)) continue;
      const mm = malha(c); if (!mm.tris.length) continue;
      let dz = 0;
      if (cam.explodir) { const z = zc.get(c.grupo || c.nome); if (z) { const meio = (z[0] + z[1]) / 2 - zg; dz = meio * 1.3 + Math.sign(meio || 1) * 12; } else if (c.mat === 'ref') dz = 0; }
      itens.push({ c, tris: mm.tris, dz });
    }
    if (!itens.length) { ctx.fillStyle = '#555'; ctx.font = `${14 * devicePixelRatio}px DM Sans, Arial`; ctx.textAlign = 'center'; ctx.fillText('Adicione um corpo (▭ Chapa) para começar', W / 2, H / 2); return; }
    let b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const it of itens) { const k = G.caixa(it.tris); for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], k[i] + (i === 2 ? it.dz : 0)); b[i + 3] = Math.max(b[i + 3], k[i + 3] + (i === 2 ? it.dz : 0)); } }
    const cen = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], raio = Math.max(1, Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2);
    let yaw = cam.yaw, pitch = cam.pitch;
    if (cam.vista === 'cima') { yaw = 0; pitch = Math.PI / 2 - 1e-3; } else if (cam.vista === 'frente') { yaw = 0; pitch = 0; } else if (cam.vista === 'lado') { yaw = -Math.PI / 2; pitch = 0; }
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const esc3 = Math.min(W, H) / (2.25 * raio) * cam.zoom;
    const proj = ([x, y, z]) => { x -= cen[0]; y -= cen[1]; z -= cen[2];
      const xr = x * cy - y * sy, yr = x * sy + y * cy; // gira em Z
      const yv = yr * cp - z * sp, zv = yr * sp + z * cp; // inclina
      return [W / 2 + xr * esc3, H / 2 - zv * esc3, yv]; };
    const luz = [0.35, -0.55, 0.76];
    const faces = [];
    for (const it of itens) {
      const cor = CORES[it.c.mat] || it.c.cor || '#999', rgb = [1, 3, 5].map((i) => parseInt(cor.slice(i, i + 2), 16));
      const selc = it.c.id === sel, a = it.c.mat === 'ref' ? 0.28 : 1;
      for (const t of it.tris) {
        const tt = it.dz ? t.map(([x, y, z]) => [x, y, z + it.dz]) : t;
        const p = tt.map(proj), n = G.normal(tt);
        const s = 0.5 + 0.5 * Math.max(0, n[0] * luz[0] + n[1] * luz[1] + n[2] * luz[2]);
        const k = selc ? 1.18 : 1;
        faces.push({ p, d: (p[0][2] + p[1][2] + p[2][2]) / 3, f: `rgba(${rgb.map((v) => Math.min(255, Math.round(v * s * k))).join(',')},${a})`, sel: selc, ref: a < 1 });
      }
    }
    faces.sort((u, v) => u.d - v.d);
    for (const fc of faces) {
      ctx.beginPath(); ctx.moveTo(fc.p[0][0], fc.p[0][1]); ctx.lineTo(fc.p[1][0], fc.p[1][1]); ctx.lineTo(fc.p[2][0], fc.p[2][1]); ctx.closePath();
      ctx.fillStyle = fc.f; ctx.fill(); if (!fc.ref) { ctx.strokeStyle = fc.f; ctx.lineWidth = 0.6; ctx.stroke(); }
    }
    // eixos
    const o = proj([b[0], b[1], b[2]]), d = devicePixelRatio;
    [['X', [b[0] + raio * .35, b[1], b[2]], '#d33'], ['Y', [b[0], b[1] + raio * .35, b[2]], '#2a2'], ['Z', [b[0], b[1], b[2] + raio * .35], '#24d']].forEach(([t, q, cor]) => {
      const p = proj(q); ctx.strokeStyle = cor; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
      ctx.fillStyle = cor; ctx.font = `700 ${11 * d}px DM Sans, Arial`; ctx.fillText(t, p[0] + 3 * d, p[1]);
    });
  }
  cv3.addEventListener('pointerdown', (e) => { arr = [e.clientX, e.clientY]; cv3.setPointerCapture(e.pointerId); });
  cv3.addEventListener('pointermove', (e) => {
    if (!arr) return;
    if (cam.vista !== 'iso') { cam.vista = 'iso'; marcaVista(); }
    cam.yaw -= (e.clientX - arr[0]) * 0.008; cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch + (e.clientY - arr[1]) * 0.006));
    arr = [e.clientX, e.clientY]; desenhar3d();
  });
  cv3.addEventListener('pointerup', () => { arr = null; });
  cv3.addEventListener('wheel', (e) => { e.preventDefault(); cam.zoom = Math.max(0.3, Math.min(10, cam.zoom * Math.exp(-e.deltaY * 0.0015))); desenhar3d(); }, { passive: false });
  painel.querySelector('.mdl-vbar').addEventListener('click', (e) => {
    const v = e.target.closest('[data-v]')?.dataset.v; if (!v) return;
    if (v === 'ref') cam.ref = !cam.ref; else if (v === 'explodir') cam.explodir = cam.explodir ? 0 : 1; else { cam.vista = v; cam.zoom = 1; }
    marcaVista(); desenhar3d();
  });
  function marcaVista() {
    painel.querySelectorAll('.mdl-vbar [data-v]').forEach((b) => {
      const v = b.dataset.v; b.classList.toggle('on', v === 'ref' ? cam.ref : v === 'explodir' ? !!cam.explodir : cam.vista === v);
    });
  }

  // ---------- 2D (contorno e furos do corpo escolhido, no plano dele) ----------
  let vista2 = null, arrFuro = null;
  function desenhar2d() {
    const ctx = cv2.getContext('2d'), W = cv2.width, H = cv2.height, c = corpoSel(), d = devicePixelRatio || 1;
    ctx.clearRect(0, 0, W, H); vista2 = null;
    $('mdlDica').hidden = !!(c && c.contorno?.t !== 'malha');
    if (!c || c.contorno?.t === 'malha' || !W) return;
    const cont = G.pontos(c.contorno); if (cont.length < 3) return;
    const furos = (c.furos || []).map((f) => G.pontos(f)), ruins = new Set(malha(c).ruins);
    const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, y] of cont) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
    const s = Math.min((W - 60 * d) / (b[2] - b[0] || 1), (H - 60 * d) / (b[3] - b[1] || 1));
    const ox = W / 2 - (b[0] + b[2]) / 2 * s, oy = H / 2 + (b[1] + b[3]) / 2 * s;
    const T = ([x, y]) => [ox + x * s, oy - y * s];
    vista2 = { s, ox, oy };
    // grade de 5 mm
    ctx.strokeStyle = '#eceee8'; ctx.lineWidth = 1;
    const passo = s * 5 < 8 * d ? 10 : 5;
    for (let x = Math.floor(b[0] / passo) * passo; x <= b[2]; x += passo) { const [px] = T([x, 0]); ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke(); }
    for (let y = Math.floor(b[1] / passo) * passo; y <= b[3]; y += passo) { const [, py] = T([0, y]); ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke(); }
    const poly = (p) => { ctx.beginPath(); p.forEach((q, i) => { const [x, y] = T(q); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
    ctx.fillStyle = (CORES[c.mat] || '#999') + '55'; ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5 * d;
    poly(cont); furos.forEach((f, i) => { if (!ruins.has(i)) { const r = G.area(f) > 0 ? f.slice().reverse() : f; r.forEach((q, j) => { const [x, y] = T(q); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); } });
    ctx.fill('evenodd'); poly(cont); ctx.stroke();
    furos.forEach((f, i) => {
      poly(f); ctx.strokeStyle = ruins.has(i) ? '#d11' : i === furoSel ? '#0a6' : '#333'; ctx.lineWidth = (i === furoSel || ruins.has(i) ? 2.4 : 1.2) * d;
      if (ruins.has(i)) { ctx.setLineDash([5 * d, 4 * d]); } ctx.stroke(); ctx.setLineDash([]);
    });
    // cotas gerais
    ctx.fillStyle = '#111'; ctx.font = `700 ${11 * d}px DM Sans, Arial`; ctx.textAlign = 'center';
    ctx.fillText(`${fmt(b[2] - b[0])} mm`, W / 2, H - 10 * d);
    ctx.save(); ctx.translate(14 * d, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(`${fmt(b[3] - b[1])} mm`, 0, 0); ctx.restore();
    ctx.textAlign = 'left'; ctx.fillText(`${esc(c.nome)} · plano do contorno (mm)`, 10 * d, 18 * d);
    if (ruins.size) { ctx.fillStyle = '#d11'; ctx.fillText(`${ruins.size} furo(s) em vermelho: fora do contorno ou encostando em outro — ajuste as medidas`, 10 * d, 34 * d); }
  }
  const mundo2 = (e) => { const r = cv2.getBoundingClientRect(), d = devicePixelRatio || 1; return [((e.clientX - r.left) * d - vista2.ox) / vista2.s, (vista2.oy - (e.clientY - r.top) * d) / vista2.s]; };
  cv2.addEventListener('pointerdown', (e) => {
    const c = corpoSel(); if (!c || !vista2) return;
    const p = mundo2(e); let achou = null;
    (c.furos || []).forEach((f, i) => { if (G.dentro(p, G.pontos(f))) achou = i; });
    furoSel = achou; if (achou != null) { snapshot(); arrFuro = { p, f: JSON.parse(JSON.stringify(c.furos[achou])) }; cv2.setPointerCapture(e.pointerId); }
    propriedades(); desenhar2d();
  });
  cv2.addEventListener('pointermove', (e) => {
    if (!arrFuro) return; const c = corpoSel(); const p = mundo2(e);
    const passo = e.altKey ? 0.1 : 0.5, dx = Math.round((p[0] - arrFuro.p[0]) / passo) * passo, dy = Math.round((p[1] - arrFuro.p[1]) / passo) * passo;
    c.furos[furoSel] = moverForma(arrFuro.f, dx, dy); desenhar2d(); desenhar3d();
  });
  cv2.addEventListener('pointerup', () => { if (arrFuro) { arrFuro = null; salvar(); propriedades(); } });
  function moverForma(f, dx, dy) {
    const g = JSON.parse(JSON.stringify(f)), r = (v) => Math.round(v * 100) / 100;
    if (g.t === 'rasgo') { g.x1 = r(g.x1 + dx); g.x2 = r(g.x2 + dx); g.y1 = r(g.y1 + dy); g.y2 = r(g.y2 + dy); }
    else if (g.t === 'poli') g.pts = g.pts.map(([x, y]) => [r(x + dx), r(y + dy)]);
    else { g.x = r((+g.x || 0) + dx); g.y = r((+g.y || 0) + dy); }
    return g;
  }

  // ---------- lista de corpos ----------
  function lista() {
    const m = M(); const grupos = new Map();
    for (const c of m.corpos) { const k = c.grupo || '(sem peça)'; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(c); }
    $('mdlLista').innerHTML = [...grupos].map(([g, cs]) => `<details ${cs.some((c) => c.id === sel) || grupos.size < 5 ? 'open' : ''}><summary>${esc(g)} <small>${cs.length}</small></summary>
      ${cs.map((c) => `<button type="button" data-c="${c.id}" class="${c.id === sel ? 'on' : ''} ${c.visivel === false ? 'oculto' : ''}"><i style="background:${CORES[c.mat] || '#999'}"></i>${esc(c.nome)}${malha(c).ruins.length ? ' <b class="mdl-erro">!</b>' : ''}</button>`).join('')}</details>`).join('') || '<p class="mdl-vazio">Nenhum corpo ainda.</p>';
  }
  $('mdlLista').addEventListener('click', (e) => {
    const id = e.target.closest('[data-c]')?.dataset.c; if (!id) return;
    sel = sel === id ? null : id; furoSel = null; lista(); propriedades(); desenhar3d(); desenhar2d();
  });

  // ---------- propriedades ----------
  const campo = (k, rot, v, un = 'mm') => `<label>${rot}<span><input data-k="${k}" value="${esc(String(v ?? '').replace('.', ','))}" inputmode="decimal">${un}</span></label>`;
  function formaCampos(f, pref) {
    if (!f) return '';
    if (f.t === 'circ') return campo(pref + 'd', 'Diâmetro', f.d) + campo(pref + 'x', 'Centro X', f.x) + campo(pref + 'y', 'Centro Y', f.y);
    if (f.t === 'ret') return campo(pref + 'w', 'Largura', f.w) + campo(pref + 'h', 'Comprimento', f.h) + campo(pref + 'r', 'Raio do canto', f.r) + campo(pref + 'x', 'Centro X', f.x) + campo(pref + 'y', 'Centro Y', f.y) + campo(pref + 'a', 'Giro', f.a || 0, '°');
    if (f.t === 'rasgo') return campo(pref + 'd', 'Largura', f.d) + campo(pref + 'x1', 'Início X', f.x1) + campo(pref + 'y1', 'Início Y', f.y1) + campo(pref + 'x2', 'Fim X', f.x2) + campo(pref + 'y2', 'Fim Y', f.y2);
    if (f.t === 'poli') return `<p class="mdl-obs">Contorno livre com ${f.pts.length} pontos. Mova com os campos de posição do corpo.</p>`;
    return '';
  }
  const NOME_F = { circ: 'Furo redondo', ret: 'Recorte retangular', rasgo: 'Rasgo (oblongo)', poli: 'Recorte livre' };
  function propriedades() {
    const c = corpoSel(), el = $('mdlProp');
    if (!c) { el.innerHTML = ''; pecasLista(); return; }
    const m = M(), g = m.grupos[c.grupo] || null, mm = malha(c);
    const mats = [...Object.keys(DENS), 'ref'].map((k) => `<option value="${k}" ${c.mat === k ? 'selected' : ''}>${k === 'ref' ? 'Referência (não imprime)' : k}</option>`).join('');
    const ehMalha = c.contorno?.t === 'malha';
    el.innerHTML = `
      <div class="mdl-cab"><input data-k="nome" value="${esc(c.nome)}" aria-label="Nome do corpo">
        <button type="button" data-o="vis" title="Mostrar/ocultar">${c.visivel === false ? '🙈' : '👁'}</button>
        <button type="button" data-o="dup" title="Duplicar">⧉</button>
        <button type="button" data-o="esp" title="Copiar espelhado (direita ↔ esquerda)">⇋</button>
        <button type="button" data-o="del" title="Apagar corpo">🗑</button></div>
      <div class="mdl-grade">
        <label>Peça (grupo)<span><input data-k="grupo" value="${esc(c.grupo || '')}" list="mdlGrupos"></span></label>
        <label>Material<span><select data-k="mat">${mats}</select></span></label>
        ${ehMalha ? '' : campo('h', 'Espessura / altura', c.h)}
        ${campo('x', 'Posição X', c.x)}${campo('y', 'Posição Y', c.y)}${campo('z', 'Posição Z (altura)', c.z)}
        ${campo('rx', 'Girar em X', c.rx || 0, '°')}${campo('ry', 'Girar em Y', c.ry || 0, '°')}${campo('rz', 'Girar em Z', c.rz || 0, '°')}
      </div>
      <datalist id="mdlGrupos">${Object.keys(Object.fromEntries(m.corpos.map((x) => [x.grupo, 1]))).filter(Boolean).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      ${ehMalha ? `<p class="mdl-obs">Malha importada (${c.contorno.tris.length} triângulos): pode mover, girar e exportar; furos não se aplicam.</p>` : `
      <h4>Contorno <small>${NOME_F[c.contorno.t]?.replace('Furo redondo', 'Círculo').replace('Recorte retangular', 'Retângulo').replace('Recorte livre', 'Livre') || ''}</small></h4>
      <div class="mdl-grade">${formaCampos(c.contorno, 'k.')}</div>
      <h4>Furos e recortes <small>${(c.furos || []).length}</small></h4>
      <div class="mdl-add mdl-add-furo">
        <button type="button" data-f="circ">◯ Furo</button><button type="button" data-f="rasgo">⊂⊃ Rasgo</button><button type="button" data-f="ret">▭ Recorte</button>
        ${furoSel != null ? '<button type="button" data-f="circular" title="Repete o furo escolhido em volta de um centro">✳ Padrão circular</button><button type="button" data-f="matriz" title="Repete em linhas e colunas">⋮⋯ Matriz</button><button type="button" data-f="espX" title="Copia espelhado em X">⇋ Espelhar</button>' : ''}
      </div>
      <div class="mdl-furos">${(c.furos || []).map((f, i) => `<button type="button" data-fs="${i}" class="${i === furoSel ? 'on' : ''} ${mm.ruins.includes(i) ? 'ruim' : ''}">${i + 1}. ${NOME_F[f.t] || f.t}${f.t === 'circ' ? ' Ø' + fmt(f.d) : f.t === 'rasgo' ? ' ' + fmt(f.d) : f.t === 'ret' ? ` ${fmt(f.w)}×${fmt(f.h)}` : ''}</button>`).join('')}</div>
      ${furoSel != null && c.furos[furoSel] ? `<div class="mdl-furo-ed"><b>Furo ${furoSel + 1}</b> <button type="button" data-o="delFuro">🗑 Apagar furo</button><div class="mdl-grade">${formaCampos(c.furos[furoSel], 'f.')}</div></div>` : ''}`}
      ${g ? `<h4>Posição da peça "${esc(c.grupo)}" inteira</h4><div class="mdl-grade">${campo('g.x', 'X', g.x)}${campo('g.y', 'Y', g.y)}${campo('g.z', 'Z', g.z)}${campo('g.rx', 'Girar X', g.rx || 0, '°')}${campo('g.ry', 'Girar Y', g.ry || 0, '°')}${campo('g.rz', 'Girar Z', g.rz || 0, '°')}</div>` : (c.grupo ? '<button type="button" class="mdl-link" data-o="grupoMover">＋ Mover/girar a peça inteira</button>' : '')}
      <p class="mdl-obs">${c.mat === 'ref' ? 'Referência: aparece no 3D, não entra no peso nem no STL.' : `Volume ${fmt(mm.vol / 1000, 2)} cm³ · ${fmt(mm.vol / 1000 * (DENS[c.mat] || 1.24))} g em ${c.mat} maciço`}</p>`;
    pecasLista();
  }
  $('mdlProp').addEventListener('change', (e) => {
    const k = e.target.dataset.k; if (!k) return;
    const c = corpoSel(), m = M(); snapshot();
    const v = e.target.value;
    const n = num(v);
    if (k === 'nome') c.nome = v.trim() || c.nome;
    else if (k === 'grupo') c.grupo = v.trim();
    else if (k === 'mat') c.mat = v;
    else if (k.startsWith('g.')) { const g = m.grupos[c.grupo]; if (g && n != null) g[k.slice(2)] = n; }
    else if (k.startsWith('k.') || k.startsWith('f.')) {
      const f = k.startsWith('k.') ? c.contorno : c.furos[furoSel], p = k.slice(2);
      if (n == null || (['d', 'w', 'h'].includes(p) && n <= 0)) { aviso('Medida inválida.'); propriedades(); return; }
      f[p] = n;
    } else if (n != null) { if (k === 'h' && n <= 0) { aviso('A espessura tem que ser maior que zero.'); propriedades(); return; } c[k] = n; }
    malhas.clear(); salvar(); tudo();
  });
  $('mdlProp').addEventListener('click', (e) => {
    const c = corpoSel(), m = M(); if (!c) return;
    const o = e.target.closest('[data-o]')?.dataset.o, f = e.target.closest('[data-f]')?.dataset.f, fs = e.target.closest('[data-fs]')?.dataset.fs;
    if (fs != null) { furoSel = furoSel === +fs ? null : +fs; propriedades(); desenhar2d(); return; }
    if (o === 'vis') { c.visivel = c.visivel === false; salvar(); tudo(); }
    else if (o === 'dup' || o === 'esp') {
      snapshot(); const d = JSON.parse(JSON.stringify(c)); d.id = novoId(); d.nome = c.nome + (o === 'esp' ? ' (espelho)' : ' (cópia)');
      if (o === 'esp') espelharCorpo(d); else d.x = (+d.x || 0) + 10;
      m.corpos.push(d); sel = d.id; salvar(); tudo();
    } else if (o === 'del') { if (confirm(`Apagar o corpo "${c.nome}"?`)) { snapshot(); m.corpos = m.corpos.filter((x) => x !== c); sel = null; furoSel = null; salvar(); tudo(); } }
    else if (o === 'delFuro') { snapshot(); c.furos.splice(furoSel, 1); furoSel = null; malhas.clear(); salvar(); tudo(); }
    else if (o === 'grupoMover') { m.grupos[c.grupo] = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }; salvar(); propriedades(); }
    else if (f) addFuro(c, f);
  });
  function espelharCorpo(d) { // espelha no eixo X do mundo (lado direito ↔ esquerdo) quando o corpo não está girado
    const k = d.contorno;
    const mx = (g) => { if (g.t === 'rasgo') { g.x1 = -g.x1; g.x2 = -g.x2; } else if (g.t === 'poli') g.pts = g.pts.map(([x, y]) => [-x, y]).reverse(); else { g.x = -(+g.x || 0); if (g.a) g.a = -g.a; } };
    if (k.t !== 'malha') { mx(k); (d.furos || []).forEach(mx); } d.x = -(+d.x || 0); if (d.rz) d.rz = -d.rz; if (d.ry) d.ry = -d.ry;
  }
  function addFuro(c, tipo) {
    const cont = G.pontos(c.contorno); let cx = 0, cy = 0; cont.forEach(([x, y]) => { cx += x; cy += y; }); cx /= cont.length; cy /= cont.length;
    const r = (v) => Math.round(v * 100) / 100; snapshot();
    // procura o lugar livre mais perto do centro (dentro do contorno, sem encostar em outro furo)
    const livre = (fazer) => {
      const outros = (c.furos || []).map((f) => G.pontos(f));
      const bx = cont.map((q) => q[0]), by = cont.map((q) => q[1]), cand = [];
      for (let x = Math.min(...bx); x <= Math.max(...bx); x += 1) for (let y = Math.min(...by); y <= Math.max(...by); y += 1) cand.push([x, y]);
      cand.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
      for (const [x, y] of cand.slice(0, 6000)) {
        const f = fazer(r(x), r(y)), p = G.pontos(f), folga = G.pontos({ ...f, d: (f.d || 0) + 1.2, w: (f.w || 0) + 1.2, h: (f.h || 0) + 1.2 });
        if (!p.length) continue;
        const bx0 = Math.min(...folga.map((q) => q[0])), bx1 = Math.max(...folga.map((q) => q[0])), by0 = Math.min(...folga.map((q) => q[1])), by1 = Math.max(...folga.map((q) => q[1]));
        const perto = outros.filter((o) => o.some(([ox, oy]) => ox >= bx0 - 30 && ox <= bx1 + 30 && oy >= by0 - 30 && oy <= by1 + 30));
        if (!G.validarFuros(cont, [...perto, folga]).ruins.includes(perto.length)) return f;
      }
      return fazer(r(cx), r(cy));
    };
    if (tipo === 'circ') c.furos.push(livre((x, y) => ({ t: 'circ', d: 3.2, x, y })));
    else if (tipo === 'rasgo') c.furos.push(livre((x, y) => ({ t: 'rasgo', d: 3, x1: r(x - 4), y1: y, x2: r(x + 4), y2: y })));
    else if (tipo === 'ret') c.furos.push(livre((x, y) => ({ t: 'ret', w: 8, h: 5, r: 1, x, y, a: 0 })));
    else if (tipo === 'espX' && furoSel != null) { const g = JSON.parse(JSON.stringify(c.furos[furoSel])); const m2 = (q) => { if (q.t === 'rasgo') { q.x1 = -q.x1; q.x2 = -q.x2; } else if (q.t === 'poli') q.pts = q.pts.map(([x, y]) => [-x, y]); else q.x = -q.x; }; m2(g); c.furos.push(g); }
    else if (tipo === 'circular' && furoSel != null) {
      const n = parseInt(prompt('Quantas cópias no total (contando este)?', '4'), 10); if (!(n > 1 && n <= 72)) { historico.pop(); return; }
      const cc = (prompt('Centro do padrão X;Y (mm):', `${r(cx)};${r(cy)}`) || '').split(/[;\s]+/).map(num); if (cc.length < 2 || cc.some((v) => v == null)) { historico.pop(); return; }
      const f0 = c.furos[furoSel];
      for (let i = 1; i < n; i++) c.furos.push(girarForma(f0, 360 * i / n, cc[0], cc[1]));
    } else if (tipo === 'matriz' && furoSel != null) {
      const t = (prompt('Colunas × linhas e passo X;Y em mm (ex.: 3x2 10;8):', '2x2 10;10') || '').match(/(\d+)\s*[x×]\s*(\d+)\s+([-\d.,]+)\s*;\s*([-\d.,]+)/i);
      if (!t) { historico.pop(); return; }
      const [nc, nl, px, py] = [+t[1], +t[2], num(t[3]), num(t[4])], f0 = c.furos[furoSel];
      for (let i = 0; i < nc; i++) for (let j = 0; j < nl; j++) if (i || j) c.furos.push(moverForma(f0, i * px, j * py));
    }
    furoSel = c.furos.length - 1; malhas.clear(); salvar(); tudo();
  }
  function girarForma(f, ang, cx, cy) {
    const g = JSON.parse(JSON.stringify(f)), a = ang * Math.PI / 180, R = ([x, y]) => [Math.round((cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a)) * 100) / 100, Math.round((cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)) * 100) / 100];
    if (g.t === 'rasgo') { [g.x1, g.y1] = R([g.x1, g.y1]); [g.x2, g.y2] = R([g.x2, g.y2]); }
    else if (g.t === 'poli') g.pts = g.pts.map(R);
    else { [g.x, g.y] = R([+g.x || 0, +g.y || 0]); if (g.t === 'ret') g.a = ((+g.a || 0) + ang) % 360; }
    return g;
  }

  // ---------- novos corpos ----------
  painel.querySelector('.mdl-lado > .mdl-add').addEventListener('click', async (e) => {
    const n = e.target.closest('[data-n]')?.dataset.n; if (!n) return;
    const m = M(); if (!m) return;
    const grupo = corpoSel()?.grupo || 'Peça 1';
    const add = (c) => { snapshot(); c.id = novoId(); c.furos = c.furos || []; m.corpos.push(c); sel = c.id; furoSel = null; salvar(); tudo(); };
    if (n === 'chapa') add({ nome: 'Chapa', grupo, mat: 'PETG', contorno: { t: 'ret', w: 40, h: 30, r: 3, x: 0, y: 0, a: 0 }, h: 3, x: 0, y: 0, z: 0 });
    else if (n === 'cilindro') add({ nome: 'Cilindro', grupo, mat: 'PETG', contorno: { t: 'circ', d: 10, x: 0, y: 0 }, furos: [{ t: 'circ', d: 3.2, x: 0, y: 0 }], h: 10, x: 0, y: 0, z: 0 });
    else if (n === 'casca') {
      const t = (prompt('Caixa oca: largura × comprimento × altura e parede (mm). Ex.: 50x80x20 1,6', '50x80x20 1,6') || '').match(/([\d.,]+)\s*[x×]\s*([\d.,]+)\s*[x×]\s*([\d.,]+)\s+([\d.,]+)/i);
      if (!t) return; const [w, l, h, p] = t.slice(1).map(num); if (!(w > 2 * p && l > 2 * p && h > p && p > 0)) { aviso('Medidas da caixa inválidas.'); return; }
      snapshot(); const gr = prompt('Nome da peça:', 'Caixa') || 'Caixa', rr = Math.min(4, w / 4);
      const fundo = { id: novoId(), nome: 'Fundo', grupo: gr, mat: 'PETG', contorno: { t: 'ret', w, h: l, r: rr, x: 0, y: 0, a: 0 }, furos: [], h: p, x: 0, y: 0, z: 0 };
      const par = { id: novoId(), nome: 'Paredes', grupo: gr, mat: 'PETG', contorno: { t: 'ret', w, h: l, r: rr, x: 0, y: 0, a: 0 }, furos: [{ t: 'ret', w: w - 2 * p, h: l - 2 * p, r: Math.max(0, rr - p), x: 0, y: 0, a: 0 }], h: h - p, x: 0, y: 0, z: p };
      m.corpos.push(fundo, par); sel = par.id; furoSel = null; salvar(); tudo();
    } else if (n === 'perfil') {
      const pf = window.tracoPeca?.part; const pts = pf?.closed ? pf.profile : null;
      if (!pts || pts.length < 3) { aviso('Feche um contorno na aba Mecânica · peças primeiro (Linha mm, Retângulo, Círculo).'); return; }
      let cx = 0, cy = 0; pts.forEach(([x, y]) => { cx += x; cy += y; }); cx /= pts.length; cy /= pts.length;
      add({ nome: 'Contorno do desenho', grupo, mat: 'PETG', contorno: { t: 'poli', pts: pts.map(([x, y]) => [Math.round((x - cx) * 100) / 100, Math.round((y - cy) * 100) / 100]) }, h: +pf.extrudeDepth || 4, x: 0, y: 0, z: 0 });
    } else if (n === 'stl') arqStl.click();
  });
  arqStl.addEventListener('change', async () => {
    const f = arqStl.files?.[0]; arqStl.value = ''; if (!f) return;
    if (f.size > 20_000_000) { aviso('STL grande demais (máx. 20 MB).'); return; }
    try {
      let tris = G.lerSTL(await f.arrayBuffer()); if (!tris.length) throw 0;
      if (tris.length > 30000) { aviso(`STL com ${tris.length} triângulos: grande demais para guardar aqui (máx. 30.000).`); return; }
      const k = G.caixa(tris), c0 = [(k[0] + k[3]) / 2, (k[1] + k[4]) / 2, k[2]];
      tris = tris.map((t) => t.map(([x, y, z]) => [x - c0[0], y - c0[1], z - c0[2]].map((v) => Math.round(v * 1000) / 1000)));
      const m = M(); snapshot();
      const c = { id: novoId(), nome: f.name.replace(/\.stl$/i, ''), grupo: f.name.replace(/\.stl$/i, ''), mat: 'PETG', contorno: { t: 'malha', tris }, furos: [], h: 1, x: 0, y: 0, z: 0 };
      m.corpos.push(c); sel = c.id; salvar(); tudo();
    } catch { aviso('Não consegui ler esse STL.'); }
  });

  // ---------- peças para imprimir ----------
  function pecasLista() {
    const ps = pecas(), tot = ps.reduce((s, p) => s + p.g, 0);
    $('mdlPecas').innerHTML = `<h4>Peças para imprimir <small>${ps.length}</small></h4>
      ${ps.map((p, i) => `<div class="mdl-peca"><span><b>${esc(p.nome)}</b><small>${p.cs.length} corpo(s) · ${p.mats} · ${fmt(p.g)} g</small></span><button type="button" data-p="${i}">⬇ STL</button></div>`).join('')}
      <div class="mdl-peca mdl-tot"><span><b>Total impresso</b><small>${fmt(tot)} g (100% preenchimento)</small></span>${ps.length ? '<button type="button" data-p="todas">⬇ Todas</button>' : ''}</div>`;
  }
  $('mdlPecas').addEventListener('click', (e) => {
    const p = e.target.closest('[data-p]')?.dataset.p; if (p == null) return;
    const ps = pecas(), m = M();
    const uma = (pc) => baixar(new Blob([G.stl(pc.tris)], { type: 'model/stl' }), `${nomeArq(m.nome)}_${nomeArq(pc.nome)}_${pc.mats}.stl`);
    if (p === 'todas') ps.forEach((pc, i) => setTimeout(() => uma(pc), i * 400)); else uma(ps[+p]);
  });
  const nomeArq = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'modelo';
  function baixar(blob, nome) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }

  // ---------- geral ----------
  function info() {
    const m = M(); if (!m) return;
    const ps = pecas(), g = ps.reduce((s, p) => s + p.g, 0), nc = m.corpos.length;
    $('mdlInfo').textContent = `${nc} corpos · ${ps.length} peças · ${fmt(g)} g impressos · arraste para girar, roda para zoom`;
  }
  function tudo() { if (!M()) return; listaModelos(); lista(); propriedades(); marcaVista(); desenhar3d(); desenhar2d(); info(); }
  document.addEventListener('keydown', (e) => {
    if (painel.hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); desfazer(e.shiftKey); }
    else if (e.key === 'Delete' && furoSel != null) { const c = corpoSel(); if (c) { snapshot(); c.furos.splice(furoSel, 1); furoSel = null; malhas.clear(); salvar(); tudo(); } }
  });
  window.tracoModelagem = { abrir: () => mostrar(true), modelo: () => M(), exemplo: () => carregarExemplo() };
  try { if (localStorage.getItem('traco-active-mode') === 'modelagem') mostrar(true); } catch { /* */ }
})();
