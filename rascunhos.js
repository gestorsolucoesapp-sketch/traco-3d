// ✏️ Rascunhos: quadro livre e infinito (estilo Freeform) — caneta, marca-texto, notas, texto, formas, fotos.
// Tudo fica salvo no aparelho (IndexedDB), funciona sem internet.
(() => {
  const $ = (id) => document.getElementById(id);
  const sw = document.querySelector('.discipline-switch');
  if (!sw || !$('architectureMode')) return;

  // ---------- aba ----------
  const tab = document.createElement('button');
  tab.id = 'rascunhosTab'; tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', 'false');
  tab.setAttribute('aria-controls', 'rascunhosMode'); tab.textContent = 'Rascunhos · quadro livre';
  sw.appendChild(tab);
  const painel = document.createElement('div');
  painel.id = 'rascunhosMode'; painel.setAttribute('role', 'tabpanel'); painel.hidden = true;
  const CORES = ['#111111', '#d76845', '#2e6fd8', '#2e9b5b', '#e0a800', '#8a4fd1', '#ffffff'];
  const NOTAS = ['#ffe57a', '#ffb3a7', '#a8e6b8', '#a8d4ff', '#e2c4ff'];
  painel.innerHTML = `
    <section class="ras-panel">
      <div class="ras-topo">
        <select id="rasQuadro" aria-label="Quadro"></select>
        <button type="button" data-q="novo" title="Novo quadro">＋ Novo</button>
        <button type="button" data-q="nome" title="Renomear">✎</button>
        <button type="button" data-q="apagar" title="Apagar quadro">🗑</button>
        <button type="button" data-a="ia" class="ras-ia" title="Gerar com IA">✨ IA</button>
        <button type="button" data-a="projeto" title="Transformar este quadro num projeto para imprimir em 3D">🧩 Projeto</button>
        <span class="ras-esp"></span>
        <button type="button" data-a="desfazer" title="Desfazer">↶</button>
        <button type="button" data-a="refazer" title="Refazer">↷</button>
        <button type="button" data-a="tudo" title="Ver tudo">⤢</button>
        <button type="button" data-a="png" title="Salvar imagem">⬇ PNG</button>
      </div>
      <div class="ras-ferr" role="toolbar" aria-label="Ferramentas">
        <button type="button" data-f="mao" title="Mover a tela">✋</button>
        <button type="button" data-f="sel" title="Selecionar e mover">➚</button>
        <button type="button" data-f="caneta" title="Caneta">✒️</button>
        <button type="button" data-f="marca" title="Marca-texto">🖍️</button>
        <button type="button" data-f="borr" title="Borracha">🧽</button>
        <button type="button" data-f="nota" title="Nota adesiva">🟨</button>
        <button type="button" data-f="texto" title="Texto">T</button>
        <button type="button" data-f="ret" title="Retângulo">▭</button>
        <button type="button" data-f="circ" title="Círculo">◯</button>
        <button type="button" data-f="seta" title="Seta">→</button>
        <button type="button" data-f="linha" title="Linha">╱</button>
        <button type="button" data-f="foto" title="Foto">🖼️</button>
        <span class="ras-sep"></span>
        ${CORES.map((c) => `<button type="button" class="ras-cor" data-c="${c}" style="background:${c}" title="Cor"></button>`).join('')}
        <span class="ras-sep"></span>
        <button type="button" data-l="2" class="ras-larg" title="Fino"><i style="width:4px;height:4px"></i></button>
        <button type="button" data-l="5" class="ras-larg" title="Médio"><i style="width:8px;height:8px"></i></button>
        <button type="button" data-l="12" class="ras-larg" title="Grosso"><i style="width:14px;height:14px"></i></button>

      </div>
      <div class="ras-wrap"><canvas id="rasCanvas"></canvas><div class="ras-sel" hidden>
          <button type="button" data-s="pesq" title="Pesquisar na internet (preço, links, medidas)">🔎 Pesquisar</button>
          <button type="button" data-s="edit" title="Escrever">✎</button>
          <button type="button" data-s="link" title="Abrir link">🔗</button>
          <button type="button" data-s="dup" title="Duplicar">⧉</button>
          <button type="button" data-s="frente" title="Trazer para frente">⬆</button>
          <button type="button" data-s="del" title="Apagar">🗑</button></div><textarea id="rasEdit" hidden></textarea>
        <div class="ras-zoom"><button type="button" data-z="-">−</button><span id="rasZ">100%</span><button type="button" data-z="+">＋</button></div>
        <p class="ras-dica" id="rasDica"></p></div>
      <input type="file" id="rasFoto" accept="image/*" hidden />
      <dialog class="ras-dlg" id="rasIA"><form method="dialog">
        <h3>✨ Gerar no quadro com IA</h3>
        <p class="ras-sub">Escreva o que você quer. A IA monta notas, textos, setas e desenhos e coloca no meio da tela.</p>
        <div class="ras-chips">
          <button type="button" data-p="Ideias para ">💡 Ideias</button>
          <button type="button" data-p="Desenhe ">✏️ Desenhar objeto</button>
          <button type="button" data-p="Mapa mental sobre ">🧠 Mapa mental</button>
          <button type="button" data-p="Fluxo do processo de ">🔀 Fluxo</button>
          <button type="button" data-p="Lista de tarefas para ">✅ Tarefas</button>
          <button type="button" data-p="Prós e contras de ">⚖️ Prós e contras</button>
        </div>
        <textarea id="rasPedido" rows="3" placeholder="Ex.: ideias para tampa de pote que não vaza · desenhe um suporte de celular para mesa"></textarea>
        <label class="ras-ctx"><input type="checkbox" id="rasCtx" /> <span id="rasCtxTxt">Usar o que já está no quadro</span></label>
        <p class="ras-msg" id="rasMsg"></p>
        <div class="ras-acoes"><button type="button" class="secondary-button" data-i="x">Cancelar</button><button type="button" class="primary-button" data-i="ok">Gerar</button></div>
      </form></dialog>
    </section>`;
  $('partsMode').insertAdjacentElement('afterend', painel);

  // ---------- estado ----------
  let quadros = [], Q = null, ferr = 'caneta', cor = '#111111', larg = 5, sel = null, edit = null;
  const pilhaD = [], pilhaR = [];
  const cv = $('rasCanvas'), wrap = painel.querySelector('.ras-wrap'), edt = $('rasEdit');
  let escuro = false, ctx = cv.getContext('2d'), W = 0, H = 0, dpr = 1, penVisto = false;
  const novoId = () => Math.random().toString(36).slice(2, 10);
  const vazio = (nome) => ({ id: novoId(), nome, objs: [], view: { x: 0, y: 0, z: 1 }, quando: Date.now() });

  // ---------- guardar (IndexedDB; se falhar, localStorage) ----------
  let db = null;
  const abrirDB = () => new Promise((ok) => {
    try { const r = indexedDB.open('traco-rascunhos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('quadros', { keyPath: 'id' });
      r.onsuccess = () => ok(r.result); r.onerror = () => ok(null);
    } catch { ok(null); }
  });
  async function carregar() {
    db = await abrirDB();
    if (db) quadros = await new Promise((ok) => { const r = db.transaction('quadros').objectStore('quadros').getAll(); r.onsuccess = () => ok(r.result || []); r.onerror = () => ok([]); });
    else try { quadros = JSON.parse(localStorage.getItem('traco-rascunhos') || '[]'); } catch { quadros = []; }
    quadros.sort((a, b) => b.quando - a.quando);
    if (!quadros.length) quadros.push(vazio('Meu primeiro quadro'));
    let ult = null; try { ult = localStorage.getItem('traco-rascunho-atual'); } catch { /* */ }
    Q = quadros.find((q) => q.id === ult) || quadros[0];
    listaQuadros(); desenhar();
  }
  let tSalva = 0;
  function salvar() {
    Q.quando = Date.now(); clearTimeout(tSalva);
    tSalva = setTimeout(() => {
      if (db) { try { db.transaction('quadros', 'readwrite').objectStore('quadros').put(Q); } catch { /* */ } }
      else try { localStorage.setItem('traco-rascunhos', JSON.stringify(quadros)); } catch { dica('Sem espaço para salvar neste aparelho.'); }
    }, 300);
  }
  function apagarQuadro(id) { if (db) try { db.transaction('quadros', 'readwrite').objectStore('quadros').delete(id); } catch { /* */ } }
  function listaQuadros() {
    const s = $('rasQuadro');
    s.innerHTML = quadros.map((q) => `<option value="${q.id}" ${q === Q ? 'selected' : ''}>${q.nome.replace(/</g, '&lt;')}</option>`).join('');
    try { localStorage.setItem('traco-rascunho-atual', Q.id); } catch { /* */ }
  }

  // ---------- histórico ----------
  const foto = () => JSON.stringify(Q.objs);
  function marca() { pilhaD.push(foto()); if (pilhaD.length > 80) pilhaD.shift(); pilhaR.length = 0; }
  function desfazer() { if (!pilhaD.length) return; pilhaR.push(foto()); Q.objs = JSON.parse(pilhaD.pop()); sel = null; atualizaSel(); salvar(); desenhar(); }
  function refazer() { if (!pilhaR.length) return; pilhaD.push(foto()); Q.objs = JSON.parse(pilhaR.pop()); sel = null; atualizaSel(); salvar(); desenhar(); }

  // ---------- coordenadas ----------
  const V = () => Q.view;
  const tela = (x, y) => [(x - V().x) * V().z, (y - V().y) * V().z];
  const mundo = (sx, sy) => [sx / V().z + V().x, sy / V().z + V().y];
  function zoomEm(sx, sy, f) {
    const [wx, wy] = mundo(sx, sy), z = Math.max(.1, Math.min(8, V().z * f));
    V().z = z; V().x = wx - sx / z; V().y = wy - sy / z; $('rasZ').textContent = Math.round(z * 100) + '%';
  }

  // ---------- desenho ----------
  const imgs = new Map();
  function img(src) {
    let i = imgs.get(src); if (i) return i;
    i = new Image(); i.onload = () => desenhar(); i.src = src; imgs.set(src, i); return i;
  }
  // desenho vetorial (SVG) vira imagem pronta no tamanho certo: o Safari não precisa refazer a cada quadro
  const prontas = new Map();
  function pronta(i, o) {
    if (!String(o.src).startsWith('data:image/svg')) return i;
    const px = Math.min(2048, Math.max(64, 2 ** Math.ceil(Math.log2(o.w * V().z * dpr))));
    const k = o.src.length + '|' + o.src.slice(-40) + '|' + px; let c = prontas.get(k);
    if (!c) { c = document.createElement('canvas'); c.width = px; c.height = Math.max(1, Math.round(px * o.h / o.w)); c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); prontas.set(k, c); if (prontas.size > 60) prontas.delete(prontas.keys().next().value); }
    return c;
  }
  function caixa(o) {
    if (o.t === 'traco') { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of o.pts) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } const m = o.larg / 2; return [a - m, b - m, c + m, d + m]; }
    if (o.t === 'texto') { const lin = (o.texto || ' ').split('\n'); ctx.font = `600 ${o.tam}px DM Sans, Arial, sans-serif`; const w = Math.max(...lin.map((l) => ctx.measureText(l).width), 20); return [o.x, o.y, o.x + w, o.y + lin.length * o.tam * 1.25]; }
    if ('x2' in o) return [Math.min(o.x, o.x2), Math.min(o.y, o.y2), Math.max(o.x, o.x2), Math.max(o.y, o.y2)];
    return [o.x, o.y, o.x + o.w, o.y + o.h];
  }
  function tracoPath(o) {
    const p = o.pts; if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0], p[0][1], o.larg / 2, 0, 7); ctx.fillStyle = o.cor; ctx.fill(); return; }
    ctx.strokeStyle = o.cor; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (o.marca) { ctx.lineWidth = o.larg; ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.stroke(); return; }
    const mid = (i) => [(p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2];
    for (let i = 0; i < p.length - 1; i++) { // espessura segue a pressão da caneta (Apple Pencil)
      const ini = i === 0 ? p[0] : mid(i - 1), fimP = i === p.length - 2 ? p[i + 1] : mid(i), ctl = i === 0 ? p[0] : p[i];
      ctx.lineWidth = o.larg * (.45 + .9 * (p[i][2] ?? .5));
      ctx.beginPath(); ctx.moveTo(ini[0], ini[1]); ctx.quadraticCurveTo(ctl[0], ctl[1], fimP[0], fimP[1]); ctx.stroke();
    }
  }
  function textoEm(t, x, y, tam, corT, larguraMax) {
    ctx.fillStyle = corT; ctx.font = `600 ${tam}px DM Sans, Arial, sans-serif`; ctx.textBaseline = 'top';
    const linhas = [];
    for (const par of (t || '').split('\n')) {
      if (!larguraMax) { linhas.push(par); continue; }
      let l = ''; for (const w of par.split(' ')) { const n = l ? l + ' ' + w : w; if (ctx.measureText(n).width > larguraMax && l) { linhas.push(l); l = w; } else l = n; } linhas.push(l);
    }
    linhas.forEach((l, i) => ctx.fillText(l, x, y + i * tam * 1.25));
  }
  const tinta = (c) => (escuro && /^#(111111|000000|1b1b1b)$/i.test(c) ? '#f1f1ee' : c); // no escuro, tinta preta vira branca (como no Freeform)
  function desenhaObj(o) {
    ctx.save();
    if (escuro && o.cor && o.t !== 'nota') o = { ...o, cor: tinta(o.cor) };
    if (o.t === 'traco') { ctx.globalAlpha = o.marca ? .35 : 1; tracoPath(o); }
    else if (o.t === 'nota') {
      ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4; ctx.fillStyle = o.cor; ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.shadowColor = 'transparent'; ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); ctx.clip();
      textoEm(o.texto || (o === edit ? '' : 'Toque duas vezes para escrever'), o.x + 12, o.y + 12, 16, o.texto ? '#1b1b1b' : 'rgba(0,0,0,.35)', o.w - 24);
      if (o.link) { ctx.font = '16px sans-serif'; ctx.textBaseline = 'bottom'; ctx.fillText('🔗', o.x + o.w - 26, o.y + o.h - 6); }
    } else if (o.t === 'texto') textoEm(o.texto || 'Texto', o.x, o.y, o.tam, o.texto ? o.cor : '#9aa0a0');
    else if (o.t === 'img') { const i = img(o.src);
      if (escuro && o.src.startsWith('data:image/svg')) { ctx.fillStyle = '#f4f2ec'; ctx.beginPath(); ctx.roundRect?.(o.x - 6, o.y - 6, o.w + 12, o.h + 12, 10); ctx.fill(); } /* desenho da IA num cartão claro */
      if (i.complete && i.naturalWidth) ctx.drawImage(pronta(i, o), o.x, o.y, o.w, o.h); else { ctx.fillStyle = '#ddd'; ctx.fillRect(o.x, o.y, o.w, o.h); } }
    else {
      ctx.strokeStyle = o.cor; ctx.lineWidth = o.larg; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
      if (o.t === 'ret') ctx.rect(Math.min(o.x, o.x2), Math.min(o.y, o.y2), Math.abs(o.x2 - o.x), Math.abs(o.y2 - o.y));
      else if (o.t === 'circ') ctx.ellipse((o.x + o.x2) / 2, (o.y + o.y2) / 2, Math.abs(o.x2 - o.x) / 2 || .1, Math.abs(o.y2 - o.y) / 2 || .1, 0, 0, 7);
      else { ctx.moveTo(o.x, o.y); ctx.lineTo(o.x2, o.y2);
        if (o.t === 'seta') { const a = Math.atan2(o.y2 - o.y, o.x2 - o.x), k = Math.max(12, o.larg * 3.5);
          ctx.moveTo(o.x2, o.y2); ctx.lineTo(o.x2 - k * Math.cos(a - .45), o.y2 - k * Math.sin(a - .45));
          ctx.moveTo(o.x2, o.y2); ctx.lineTo(o.x2 - k * Math.cos(a + .45), o.y2 - k * Math.sin(a + .45)); } }
      ctx.stroke();
    }
    ctx.restore();
  }
  // desenho no ritmo da tela: no máximo 1 por quadro; durante pinça/arraste da tela só estica a imagem já pronta
  let raf = 0, snap = null;
  function desenhar() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (snap) rapido(); else desenharJa(); }); }
  // durante pinça/arraste: a placa de vídeo só move/estica o canvas (CSS), sem redesenhar nada
  function fotoTela() { if (snap || !W) return; snap = { v: { ...V() } }; cv.style.transformOrigin = '0 0'; cv.style.willChange = 'transform'; painel.querySelector('.ras-sel').hidden = true; }
  function fimFoto() { if (!snap) return; snap = null; cv.style.transform = ''; cv.style.willChange = ''; desenharJa(); }
  function rapido() {
    const z = V().z, k = z / snap.v.z;
    cv.style.transform = `translate(${(snap.v.x - V().x) * z}px, ${(snap.v.y - V().y) * z}px) scale(${k})`;
  }
  function desenharJa() {
    if (!Q || painel.hidden) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    escuro = Boolean(window.tracoAreaEscura);
    ctx.fillStyle = escuro ? '#1c1e1d' : '#fbfaf6'; ctx.fillRect(0, 0, W, H); wrap.style.background = ctx.fillStyle;
    // pontinhos de fundo (quadriculado de papel)
    const z = V().z; let passo = 24; while (passo * z < 14) passo *= 2; while (passo * z > 60) passo /= 2;
    ctx.fillStyle = escuro ? '#3c403e' : '#c9ccc4';
    const x0 = Math.floor(V().x / passo) * passo, y0 = Math.floor(V().y / passo) * passo;
    for (let x = x0; x < V().x + W / z; x += passo) for (let y = y0; y < V().y + H / z; y += passo) { const [sx, sy] = tela(x, y); ctx.fillRect(sx - .8, sy - .8, 1.6, 1.6); }
    ctx.setTransform(dpr * z, 0, 0, dpr * z, -V().x * z * dpr, -V().y * z * dpr);
    for (const o of Q.objs) desenhaObj(o);
    if (atual) desenhaObj(atual);
    if (laco) { ctx.strokeStyle = '#2e6fd8'; ctx.lineWidth = 1 / z; ctx.setLineDash([5 / z, 4 / z]); ctx.strokeRect(laco[0], laco[1], laco[2] - laco[0], laco[3] - laco[1]); ctx.setLineDash([]); }
    if (sel?.length) {
      const b = caixaSel(); ctx.strokeStyle = '#2e6fd8'; ctx.lineWidth = 1.5 / z; ctx.setLineDash([6 / z, 4 / z]);
      ctx.strokeRect(b[0] - 6 / z, b[1] - 6 / z, b[2] - b[0] + 12 / z, b[3] - b[1] + 12 / z); ctx.setLineDash([]);
      if (sel.length === 1 && sel[0].t !== 'traco' && sel[0].t !== 'texto') { const r = 9 / z; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b[2] + 6 / z, b[3] + 6 / z, r, 0, 7); ctx.fill(); ctx.stroke(); }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    posBarra();
  }
  // barra flutuante em cima do que está selecionado (como no Freeform)
  function posBarra() {
    const bar = painel.querySelector('.ras-sel');
    if (!sel?.length || arraste?.tipo === 'mover' || arraste?.tipo === 'tam' || edit) { bar.hidden = true; return; }
    bar.hidden = false;
    const b = caixaSel(), [x1, y1] = tela(b[0], b[1]), [x2, y2] = tela(b[2], b[3]);
    const w = bar.offsetWidth || 260, h = bar.offsetHeight || 44;
    let x = (x1 + x2) / 2 - w / 2, y = y1 - h - 14;
    if (y < 6) y = y2 + 16; if (y + h > H - 6) y = Math.max(6, Math.min(H - h - 6, y1 + 6));
    bar.style.left = Math.max(6, Math.min(W - w - 6, x)) + 'px'; bar.style.top = y + 'px';
  }
  function caixaSel() { const bs = sel.map(caixa); return [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))]; }
  function tamanho() {
    const r = wrap.getBoundingClientRect(); if (!r.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5); W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); desenhar();
  }
  new ResizeObserver(tamanho).observe(wrap);

  // ---------- encontrar objeto ----------
  function distSeg(px, py, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((px - a[0]) * dx + (py - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy); }
  function acerta(o, x, y, tol) {
    if (o.t === 'traco') { const p = o.pts; if (p.length === 1) return Math.hypot(x - p[0][0], y - p[0][1]) < o.larg + tol; for (let i = 1; i < p.length; i++) if (distSeg(x, y, p[i - 1], p[i]) < o.larg / 2 + tol) return true; return false; }
    if (o.t === 'linha' || o.t === 'seta') return distSeg(x, y, [o.x, o.y], [o.x2, o.y2]) < o.larg / 2 + tol;
    const b = caixa(o); return x >= b[0] - tol && x <= b[2] + tol && y >= b[1] - tol && y <= b[3] + tol;
  }
  const quem = (x, y, tol) => { for (let i = Q.objs.length - 1; i >= 0; i--) if (acerta(Q.objs[i], x, y, tol)) return Q.objs[i]; return null; };

  // ---------- toques ----------
  const dedos = new Map(); let atual = null, gesto = null, laco = null, arraste = null, ultimoToque = 0, ultimoAlvo = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => {
    if (edit) fecharEdicao();
    try { cv.setPointerCapture(e.pointerId); } catch { /* */ }
    if (e.pointerType === 'pen') penVisto = true;
    dedos.set(e.pointerId, pos(e));
    if (dedos.size === 2) { // dois dedos: mover e dar zoom
      if (atual) { atual = null; } arraste = null; laco = null;
      const [a, b] = [...dedos.values()]; gesto = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; desenharJa(); fotoTela(); return;
    }
    if (dedos.size > 2) return;
    const [sx, sy] = pos(e), [x, y] = mundo(sx, sy), tol = 8 / V().z;
    const f = (e.button === 1 || (penVisto && e.pointerType === 'touch' && ['caneta', 'marca', 'borr'].includes(ferr))) ? 'mao' : ferr; // com Apple Pencil, o dedo só move a tela
    if (f === 'mao') { arraste = { tipo: 'mao', s: [sx, sy] }; fotoTela(); return; }
    if (f === 'caneta' || f === 'marca') { atual = { t: 'traco', cor, larg: f === 'marca' ? larg * 4 : larg, marca: f === 'marca', pts: [[x, y, e.pointerType === 'pen' ? e.pressure : .5]] }; desenhar(); return; }
    if (f === 'borr') { marca(); arraste = { tipo: 'borr' }; apagaEm(x, y); return; }
    if (f === 'sel') {
      const agora = Date.now(), alvo = quem(x, y, tol), duplo = agora - ultimoToque < 330 && alvo && alvo === ultimoAlvo; ultimoToque = agora; ultimoAlvo = alvo; // toque duplo só no mesmo objeto
      if (sel?.length === 1 && sel[0].t !== 'traco' && sel[0].t !== 'texto') { const b = caixa(sel[0]); if (Math.hypot(x - b[2] - 6 / V().z, y - b[3] - 6 / V().z) < 16 / V().z) { marca(); arraste = { tipo: 'tam', o: sel[0], b }; return; } }
      const o = quem(x, y, tol);
      if (o && duplo && (o.t === 'nota' || o.t === 'texto')) { abrirEdicao(o); return; }
      if (o) { if (!sel?.includes(o)) sel = [o]; marca(); arraste = { tipo: 'mover', ult: [x, y], mexeu: false }; }
      else { sel = null; laco = [x, y, x, y]; arraste = { tipo: 'laco' }; }
      atualizaSel(); desenhar(); return;
    }
    if (f === 'nota') { marca(); const o = { t: 'nota', id: novoId(), x: x - 75, y: y - 75, w: 150, h: 150, cor: NOTAS[Q.objs.filter((q) => q.t === 'nota').length % NOTAS.length], texto: '' }; Q.objs.push(o); salvar(); escolher('sel'); sel = [o]; atualizaSel(); abrirEdicao(o); return; }
    if (f === 'texto') { marca(); const o = { t: 'texto', id: novoId(), x, y: y - 12, tam: 24, cor: cor === '#ffffff' ? '#111111' : cor, texto: '' }; Q.objs.push(o); salvar(); escolher('sel'); sel = [o]; atualizaSel(); abrirEdicao(o); return; }
    if (['ret', 'circ', 'seta', 'linha'].includes(f)) { atual = { t: f, id: novoId(), x, y, x2: x, y2: y, cor, larg: Math.max(2, larg * .7) }; desenhar(); }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!dedos.has(e.pointerId)) return;
    dedos.set(e.pointerId, pos(e));
    if (gesto && dedos.size >= 2) {
      const [a, b] = [...dedos.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      V().x -= (c[0] - gesto.c[0]) / V().z; V().y -= (c[1] - gesto.c[1]) / V().z;
      if (gesto.d > 10) zoomEm(c[0], c[1], d / gesto.d);
      gesto = { d, c }; desenhar(); return;
    }
    const [sx, sy] = pos(e), [x, y] = mundo(sx, sy);
    if (atual?.t === 'traco') {
      const ev = e.getCoalescedEvents?.() || [e];
      for (const q of ev) { const [qx, qy] = mundo(...pos(q)), l = atual.pts.at(-1); if (Math.hypot(qx - l[0], qy - l[1]) * V().z > 1.2) atual.pts.push([qx, qy, e.pointerType === 'pen' ? q.pressure : .5]); }
      desenhar(); return;
    }
    if (atual) { atual.x2 = x; atual.y2 = y; if (e.shiftKey && atual.t !== 'linha' && atual.t !== 'seta') { const m = Math.max(Math.abs(x - atual.x), Math.abs(y - atual.y)); atual.x2 = atual.x + Math.sign(x - atual.x) * m; atual.y2 = atual.y + Math.sign(y - atual.y) * m; } desenhar(); return; }
    if (!arraste) return;
    if (arraste.tipo === 'mao') { V().x -= (sx - arraste.s[0]) / V().z; V().y -= (sy - arraste.s[1]) / V().z; arraste.s = [sx, sy]; desenhar(); }
    else if (arraste.tipo === 'borr') apagaEm(x, y);
    else if (arraste.tipo === 'laco') { laco[2] = x; laco[3] = y; desenhar(); }
    else if (arraste.tipo === 'mover') { const dx = x - arraste.ult[0], dy = y - arraste.ult[1]; arraste.ult = [x, y]; arraste.mexeu = true; for (const o of sel) mover(o, dx, dy); desenhar(); }
    else if (arraste.tipo === 'tam') { const o = arraste.o; if ('x2' in o) { o.x2 = x; o.y2 = y; } else { const r = o.t === 'img' ? o.h / o.w : 0; o.w = Math.max(40, x - o.x); o.h = r ? o.w * r : Math.max(40, y - o.y); } desenhar(); }
  });
  const fim = (e) => {
    dedos.delete(e.pointerId);
    if (gesto) { if (dedos.size < 2) { gesto = null; fimFoto(); salvar(); } return; }
    if (atual) { const ok = atual.t === 'traco' || Math.hypot(atual.x2 - atual.x, atual.y2 - atual.y) > 4 / V().z; if (ok) { marca(); if (atual.t === 'traco') atual.pts = atual.pts.map(([a, b, c]) => [Math.round(a * 10) / 10, Math.round(b * 10) / 10, Math.round(c * 100) / 100]); Q.objs.push(atual); salvar(); } atual = null; desenhar(); return; }
    if (arraste?.tipo === 'laco') { const [a, b, c, d] = [Math.min(laco[0], laco[2]), Math.min(laco[1], laco[3]), Math.max(laco[0], laco[2]), Math.max(laco[1], laco[3])]; sel = Q.objs.filter((o) => { const k = caixa(o); return k[0] >= a && k[1] >= b && k[2] <= c && k[3] <= d; }); if (!sel.length) sel = null; laco = null; atualizaSel(); }
    else if (arraste?.tipo === 'mover' && !arraste.mexeu) pilhaD.pop();
    if (arraste && arraste.tipo !== 'mao' && arraste.tipo !== 'laco') salvar(); else if (arraste?.tipo === 'mao') salvar();
    if (arraste?.tipo === 'mao') { arraste = null; fimFoto(); return; }
    arraste = null; desenhar();
  };
  cv.addEventListener('pointerup', fim); cv.addEventListener('pointercancel', fim);
  cv.addEventListener('dblclick', (e) => { const [x, y] = mundo(...pos(e)), o = quem(x, y, 6 / V().z); if (o && (o.t === 'nota' || o.t === 'texto')) { escolher('sel'); sel = [o]; atualizaSel(); abrirEdicao(o); } });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const [sx, sy] = pos(e);
    fotoTela(); clearTimeout(tRoda); tRoda = setTimeout(() => { fimFoto(); salvar(); }, 160);
    if (e.ctrlKey || e.metaKey) zoomEm(sx, sy, Math.exp(-e.deltaY * .01)); else { V().x += e.deltaX / V().z; V().y += e.deltaY / V().z; }
    desenhar(); }, { passive: false });
  let tRoda = 0;

  function mover(o, dx, dy) { if (o.t === 'traco') o.pts.forEach((p) => { p[0] += dx; p[1] += dy; }); else { o.x += dx; o.y += dy; if ('x2' in o) { o.x2 += dx; o.y2 += dy; } } }
  function apagaEm(x, y) { const tol = 10 / V().z, antes = Q.objs.length; Q.objs = Q.objs.filter((o) => !(o.t === 'traco' || ['ret', 'circ', 'seta', 'linha'].includes(o.t)) || !acerta(o, x, y, tol)); if (Q.objs.length !== antes) { salvar(); desenhar(); } }

  // ---------- escrever em nota / texto ----------
  function abrirEdicao(o) {
    edit = o; const [sx, sy] = tela(o.x, o.y), z = V().z;
    Object.assign(edt.style, o.t === 'nota'
      ? { left: sx + 'px', top: sy + 'px', width: o.w * z + 'px', height: o.h * z + 'px', fontSize: 16 * z + 'px', padding: 12 * z + 'px', background: o.cor, color: '#1b1b1b' }
      : { left: sx + 'px', top: sy + 'px', width: Math.max(220, (caixa(o)[2] - o.x) * z + 40) + 'px', height: Math.max(o.tam * 1.6, (caixa(o)[3] - o.y) * z + 10) + 'px', fontSize: o.tam * z + 'px', padding: '0', background: 'rgba(255,255,255,.85)', color: o.cor });
    edt.value = o.texto || ''; edt.hidden = false; desenhar(); setTimeout(() => edt.focus(), 20);
  }
  function fecharEdicao() {
    if (!edit) return; const o = edit; edit = null; edt.hidden = true;
    if (o.texto !== edt.value) { o.texto = edt.value; }
    if (o.t === 'texto' && !o.texto.trim()) { Q.objs = Q.objs.filter((q) => q !== o); sel = null; atualizaSel(); }
    salvar(); desenhar();
  }
  edt.addEventListener('blur', fecharEdicao);
  edt.addEventListener('keydown', (e) => { if (e.key === 'Escape') edt.blur(); e.stopPropagation(); });
  edt.addEventListener('input', () => { if (edit?.t === 'texto') { edit.texto = edt.value; const b = caixa(edit); edt.style.height = Math.max(edit.tam * 1.6, (b[3] - b[1]) * V().z + 10) + 'px'; } });

  // ---------- fotos ----------
  $('rasFoto').addEventListener('change', () => {
    const f = $('rasFoto').files?.[0]; $('rasFoto').value = ''; if (!f) return;
    const r = new FileReader(); r.onload = () => {
      const i = new Image(); i.onload = () => {
        const k = Math.min(1, 1400 / Math.max(i.width, i.height)), c = document.createElement('canvas'); c.width = Math.round(i.width * k); c.height = Math.round(i.height * k);
        c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); const src = c.toDataURL('image/jpeg', .82);
        const w = Math.min(360, W * .6 / V().z), h = w * c.height / c.width, [cx, cy] = mundo(W / 2, H / 2);
        marca(); const o = { t: 'img', id: novoId(), x: cx - w / 2, y: cy - h / 2, w, h, src }; Q.objs.push(o); salvar(); escolher('sel'); sel = [o]; atualizaSel(); desenhar();
      }; i.src = r.result;
    }; r.readAsDataURL(f);
  });

  // ---------- barra ----------
  const DICAS = { mao: 'Arraste para mover a tela. Dois dedos: mover e dar zoom.', sel: 'Toque para selecionar, arraste para mover. Arraste no vazio para pegar vários. Toque duas vezes numa nota para escrever.',
    caneta: 'Escreva ou desenhe à mão. Com Apple Pencil, o dedo só move a tela.', marca: 'Marca-texto transparente por cima.', borr: 'Passe por cima do traço ou forma para apagar.',
    nota: 'Toque onde quer a nota adesiva.', texto: 'Toque onde quer escrever.', ret: 'Arraste para desenhar o retângulo.', circ: 'Arraste para desenhar o círculo.', seta: 'Arraste do começo até a ponta da seta.', linha: 'Arraste para desenhar a linha.', foto: '' };
  function dica(t) { $('rasDica').textContent = t; }
  function escolher(f) {
    if (f === 'foto') { $('rasFoto').click(); return; }
    ferr = f; painel.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('on', b.dataset.f === f));
    if (f !== 'sel') { sel = null; atualizaSel(); }
    cv.style.cursor = f === 'mao' ? 'grab' : f === 'sel' ? 'default' : 'crosshair'; dica(DICAS[f] || ''); desenhar();
  }
  function atualizaSel() {
    const um = sel?.length === 1 ? sel[0] : null;
    painel.querySelector('[data-s=pesq]').hidden = !(um && (um.t === 'nota' || um.t === 'texto') && um.texto?.trim());
    painel.querySelector('[data-s=link]').hidden = !um?.link;
    painel.querySelector('[data-s=edit]').hidden = !(um && (um.t === 'nota' || um.t === 'texto'));
    posBarra();
  }
  painel.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => escolher(b.dataset.f)));
  painel.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => {
    cor = b.dataset.c; painel.querySelectorAll('[data-c]').forEach((q) => q.classList.toggle('on', q === b));
    if (sel?.length) { marca(); for (const o of sel) { if (o.t === 'nota') o.cor = NOTAS[CORES.indexOf(cor) % NOTAS.length]; else if (o.t !== 'img') o.cor = cor; } salvar(); desenhar(); }
    else if (!['caneta', 'marca', 'ret', 'circ', 'seta', 'linha', 'texto'].includes(ferr)) escolher('caneta');
  }));
  painel.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => {
    larg = +b.dataset.l; painel.querySelectorAll('[data-l]').forEach((q) => q.classList.toggle('on', q === b));
    if (sel?.length) { marca(); for (const o of sel) if ('larg' in o) o.larg = o.marca ? larg * 4 : o.t === 'traco' ? larg : Math.max(2, larg * .7); else if (o.t === 'texto') o.tam = { 2: 16, 5: 24, 12: 40 }[larg]; salvar(); desenhar(); }
  }));
  painel.querySelector('[data-s=edit]').onclick = (e) => { e.stopImmediatePropagation(); if (sel?.[0]) abrirEdicao(sel[0]); };
  painel.querySelector('[data-s=link]').onclick = (e) => { e.stopImmediatePropagation(); const u = sel?.[0]?.link; if (u) window.open(u, '_blank', 'noopener'); };
  painel.querySelector('[data-s=pesq]').onclick = (e) => {
    e.stopImmediatePropagation(); const o = sel?.[0]; if (!o?.texto) return;
    window.tracoPesquisar?.({ item: o.texto, contexto: `Quadro "${Q.nome}"`, aoColar: (r) => colarPesquisa(o, r) });
  };
  function colarPesquisa(perto, r) {
    const p = (r.precos || [])[0], b = caixa(perto);
    const texto = [r.nome, p ? `${p.preco} · ${p.loja || ''}` : '', (r.precos || []).length > 1 ? `+${r.precos.length - 1} loja(s)` : ''].filter(Boolean).join('\n');
    marca();
    const o = { t: 'nota', id: novoId(), x: b[2] + 24, y: b[1], w: 160, h: 160, cor: NOTAS[3], texto, link: p?.link || r.links?.[0]?.link || '', pesquisa: { nome: r.nome, precos: (r.precos || []).slice(0, 5), links: (r.links || []).slice(0, 5), quando: r._quando } };
    Q.objs.push(o); escolher('sel'); sel = [o]; atualizaSel(); salvar(); desenhar();
  }
  painel.querySelectorAll('[data-s]').forEach((b) => (b.onclick ??= () => {
    if (!sel?.length) return; marca();
    if (b.dataset.s === 'del') { Q.objs = Q.objs.filter((o) => !sel.includes(o)); sel = null; }
    else if (b.dataset.s === 'frente') { Q.objs = [...Q.objs.filter((o) => !sel.includes(o)), ...sel]; }
    else { const novos = sel.map((o) => { const c = JSON.parse(JSON.stringify(o)); c.id = novoId(); mover(c, 24, 24); return c; }); Q.objs.push(...novos); sel = novos; }
    atualizaSel(); salvar(); desenhar();
  }));
  function verTudo() {
    if (!Q.objs.length) { Q.view = { x: -W / 2, y: -H / 2, z: 1 }; }
    else { const bs = Q.objs.map(caixa), a = Math.min(...bs.map((b) => b[0])), b = Math.min(...bs.map((q) => q[1])), c = Math.max(...bs.map((q) => q[2])), d = Math.max(...bs.map((q) => q[3]));
      const z = Math.max(.1, Math.min(2, Math.min(W / (c - a + 80), H / (d - b + 80)))); Q.view = { z, x: (a + c) / 2 - W / 2 / z, y: (b + d) / 2 - H / 2 / z }; }
    $('rasZ').textContent = Math.round(V().z * 100) + '%'; salvar(); desenhar();
  }
  function png() {
    if (!Q.objs.length) { dica('O quadro está vazio.'); return; }
    const bs = Q.objs.map(caixa), a = Math.min(...bs.map((b) => b[0])) - 30, b = Math.min(...bs.map((q) => q[1])) - 30, c = Math.max(...bs.map((q) => q[2])) + 30, d = Math.max(...bs.map((q) => q[3])) + 30;
    const k = Math.min(3, 4000 / Math.max(c - a, d - b)), o = document.createElement('canvas'); escuro = false; o.width = Math.round((c - a) * k); o.height = Math.round((d - b) * k);
    const oc = o.getContext('2d'); oc.fillStyle = '#fbfaf6'; oc.fillRect(0, 0, o.width, o.height); oc.setTransform(k, 0, 0, k, -a * k, -b * k);
    ctxTroca(oc, () => Q.objs.forEach(desenhaObj)); // mesmo desenho, noutro canvas
    o.toBlob((bl) => { const u = URL.createObjectURL(bl), l = document.createElement('a'); l.href = u; l.download = `rascunho-${Q.nome.replace(/[^\w-]+/g, '-')}.png`; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); }, 'image/png');
  }
  let ctxReal = null;
  function ctxTroca(novo, fn) { ctxReal = ctx; ctx = novo; try { fn(); } finally { ctx = ctxReal; } }

  // ---------- ✨ gerar com IA ----------
  const dlgIA = $('rasIA'), CORNOTA = { amarelo: NOTAS[0], rosa: NOTAS[1], verde: NOTAS[2], azul: NOTAS[3], lilas: NOTAS[4] };
  function textosDoQuadro(lista) { return lista.filter((o) => (o.t === 'nota' || o.t === 'texto') && o.texto?.trim()).map((o) => '- ' + o.texto.trim().replace(/\s+/g, ' ')).join('\n'); }
  function abrirIA() {
    fecharEdicao();
    const daSel = sel?.length ? textosDoQuadro(sel) : '', doQuadro = textosDoQuadro(Q.objs);
    $('rasCtx').checked = Boolean(daSel); $('rasCtx').disabled = !daSel && !doQuadro;
    $('rasCtxTxt').textContent = daSel ? `Usar o que está selecionado (${sel.length} item${sel.length > 1 ? 's' : ''})` : doQuadro ? 'Usar as notas e textos que já estão no quadro' : 'Usar o que já está no quadro (vazio)';
    $('rasMsg').textContent = ''; dlgIA.querySelector('[data-i=ok]').disabled = false; dlgIA.showModal(); setTimeout(() => $('rasPedido').focus(), 50);
  }
  dlgIA.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { const t = $('rasPedido'); if (!t.value.trim() || dlgIA.querySelector(`[data-p="${t.value}"]`)) t.value = b.dataset.p; t.focus(); t.setSelectionRange(t.value.length, t.value.length); }));
  dlgIA.querySelector('[data-i=x]').onclick = () => dlgIA.close();
  dlgIA.querySelector('[data-i=ok]').onclick = async () => {
    const pedido = $('rasPedido').value.trim(), msg = $('rasMsg'), bt = dlgIA.querySelector('[data-i=ok]');
    if (pedido.length < 4) { msg.textContent = 'Escreva o que você quer gerar.'; return; }
    const contexto = $('rasCtx').checked ? (sel?.length ? textosDoQuadro(sel) : textosDoQuadro(Q.objs)) : '';
    bt.disabled = true; msg.textContent = '✨ Pensando… (pode levar até 1 minuto)';
    try {
      const j = await window.tracoChamarIA({ rascunho: pedido, contexto });
      const n = colocarIA(j);
      if (!n) { msg.textContent = 'A IA não devolveu nada para colocar. Tente explicar de outro jeito.'; bt.disabled = false; return; }
      dlgIA.close(); $('rasPedido').value = ''; dica(`✨ ${n} itens colocados. Arraste para mudar de lugar; ↶ desfaz.`);
    } catch (e) { msg.textContent = String(e.message || e); bt.disabled = false; }
  };
  function svgSeguro(txt) {
    try {
      const d = new DOMParser().parseFromString(String(txt), 'image/svg+xml'), r = d.documentElement;
      if (!r || r.nodeName.toLowerCase() !== 'svg' || d.querySelector('parsererror')) return null;
      d.querySelectorAll('script,foreignObject,iframe,image,use[href^="http"]').forEach((e) => e.remove());
      d.querySelectorAll('*').forEach((e) => [...e.attributes].forEach((a) => { if (/^on/i.test(a.name) || (/href$/i.test(a.name) && !/^#/.test(a.value))) e.removeAttribute(a.name); }));
      if (!r.getAttribute('xmlns')) r.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(r));
    } catch { return null; }
  }
  function colocarIA(j) {
    const itens = Array.isArray(j?.itens) ? j.itens.slice(0, 80) : [], num = (v, d) => (Number.isFinite(+v) ? +v : d);
    const novos = [], porId = new Map(), setas = [];
    for (const it of itens) {
      const x = num(it.x, 0), y = num(it.y, 0);
      let o = null;
      if (it.tipo === 'nota') o = { t: 'nota', x, y, w: 160, h: 160, cor: CORNOTA[it.cor] || NOTAS[0], texto: String(it.texto || '').slice(0, 300) };
      else if (it.tipo === 'texto') o = { t: 'texto', x, y, tam: Math.max(14, Math.min(48, num(it.tam, 24))), cor: '#111111', texto: String(it.texto || '').slice(0, 1000) };
      else if (it.tipo === 'desenho') { const src = svgSeguro(it.svg); if (src) o = { t: 'img', x, y, w: Math.max(60, num(it.w, 300)), h: Math.max(60, num(it.h, 300)), src }; }
      else if (['ret', 'circ', 'linha'].includes(it.tipo)) o = { t: it.tipo, x, y, x2: num(it.x2, x + 100), y2: num(it.y2, y + 100), cor: /^#[0-9a-f]{6}$/i.test(it.cor) ? it.cor : '#2e6fd8', larg: 3 };
      else if (it.tipo === 'seta') { if (it.de != null && it.para != null) setas.push(it); else o = { t: 'seta', x, y, x2: num(it.x2, x + 100), y2: num(it.y2, y), cor: '#555555', larg: 3 }; }
      if (o) { o.id = novoId(); novos.push(o); if (it.id != null) porId.set(String(it.id), o); }
    }
    const borda = (b, px, py) => { // ponto na borda da caixa b na direção de (px,py)
      const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, dx = px - cx, dy = py - cy, hw = (b[2] - b[0]) / 2 + 8, hh = (b[3] - b[1]) / 2 + 8;
      const k = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9)); return [cx + dx * k, cy + dy * k];
    };
    for (const s2 of setas) {
      const a = porId.get(String(s2.de)), b = porId.get(String(s2.para)); if (!a || !b) continue;
      const ba = caixa(a), bb = caixa(b), ca = [(ba[0] + ba[2]) / 2, (ba[1] + ba[3]) / 2], cb = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
      const p = borda(ba, ...cb), q = borda(bb, ...ca);
      novos.push({ t: 'seta', id: novoId(), x: p[0], y: p[1], x2: q[0], y2: q[1], cor: '#555555', larg: 3 });
    }
    if (!novos.length) return 0;
    // centraliza o conjunto no meio da tela
    const bs = novos.map(caixa), a = Math.min(...bs.map((b) => b[0])), b = Math.min(...bs.map((q) => q[1])), c = Math.max(...bs.map((q) => q[2])), d = Math.max(...bs.map((q) => q[3]));
    const [mx, my] = mundo(W / 2, H / 2); let dx = mx - (a + c) / 2, dy = my - (b + d) / 2;
    if (sel?.length) { const k = caixaSel(); dx = k[2] + 60 - a; dy = (k[1] + k[3]) / 2 - (b + d) / 2; } // ao lado do que estava selecionado
    marca(); novos.forEach((o) => mover(o, dx, dy)); Q.objs.push(...novos);
    escolher('sel'); sel = novos; atualizaSel(); salvar();
    const z = Math.max(.1, Math.min(V().z, W / (c - a + 80), H / (d - b + 80))); // garante que tudo apareça
    Q.view = { z, x: (a + c) / 2 + dx - W / 2 / z, y: (b + d) / 2 + dy - H / 2 / z }; $('rasZ').textContent = Math.round(z * 100) + '%';
    desenhar(); return novos.length;
  }
  painel.querySelector('[data-a=ia]').onclick = abrirIA;
  painel.querySelector('[data-a=projeto]').onclick = () => { fecharEdicao(); if (window.tracoProjetos) window.tracoProjetos.doQuadro(Q); };
  painel.querySelector('[data-a=desfazer]').onclick = desfazer;
  painel.querySelector('[data-a=refazer]').onclick = refazer;
  painel.querySelector('[data-a=tudo]').onclick = verTudo;
  painel.querySelector('[data-a=png]').onclick = png;
  painel.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => { zoomEm(W / 2, H / 2, b.dataset.z === '+' ? 1.25 : .8); desenhar(); salvar(); }));
  $('rasQuadro').addEventListener('change', (e) => { fecharEdicao(); Q = quadros.find((q) => q.id === e.target.value) || Q; sel = null; pilhaD.length = pilhaR.length = 0; atualizaSel(); listaQuadros(); $('rasZ').textContent = Math.round(V().z * 100) + '%'; desenhar(); });
  painel.querySelector('[data-q=novo]').onclick = () => { const n = prompt('Nome do novo quadro:', `Quadro ${quadros.length + 1}`); if (n == null) return; Q = vazio(n.trim() || `Quadro ${quadros.length + 1}`); quadros.unshift(Q); pilhaD.length = pilhaR.length = 0; listaQuadros(); salvar(); verTudo(); };
  painel.querySelector('[data-q=nome]').onclick = () => { const n = prompt('Novo nome do quadro:', Q.nome); if (!n?.trim()) return; Q.nome = n.trim(); listaQuadros(); salvar(); };
  painel.querySelector('[data-q=apagar]').onclick = () => {
    if (!confirm(`Apagar o quadro "${Q.nome}"? Isso não tem volta.`)) return;
    apagarQuadro(Q.id); quadros = quadros.filter((q) => q !== Q); if (!quadros.length) quadros.push(vazio('Meu primeiro quadro'));
    Q = quadros[0]; pilhaD.length = pilhaR.length = 0; listaQuadros(); salvar(); desenhar();
  };
  document.addEventListener('keydown', (e) => {
    if (painel.hidden || edit || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? refazer() : desfazer(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel?.length) { e.preventDefault(); painel.querySelector('[data-s=del]').click(); }
  });

  // ---------- trocar de aba ----------
  function mostrar(sim) {
    painel.hidden = !sim; tab.setAttribute('aria-selected', String(sim)); document.body.classList.toggle('aba-livre', sim || !(document.getElementById('projetosMode')?.hidden ?? true));
    if (sim) {
      $('architectureMode').hidden = true; $('partsMode').hidden = true;
      $('architectureTab').setAttribute('aria-selected', 'false'); $('partsTab').setAttribute('aria-selected', 'false');
      document.body.classList.add('em-rascunhos');
      try { localStorage.setItem('traco-active-mode', 'rascunhos'); } catch { /* */ }
      requestAnimationFrame(() => { tamanho(); if (Q && !Q.objs.length && V().x === 0 && V().y === 0) verTudo(); });
    } else document.body.classList.remove('em-rascunhos');
  }
  tab.addEventListener('click', () => mostrar(true));
  $('architectureTab').addEventListener('click', () => mostrar(false));
  $('partsTab').addEventListener('click', () => mostrar(false));
  window.tracoRascunhos = { abrir: () => mostrar(true), quadros: () => quadros, render: () => desenhar() };
  void desenharJa;

  escolher('caneta');
  painel.querySelector('[data-c="#111111"]').classList.add('on'); painel.querySelector('[data-l="5"]').classList.add('on');
  carregar().then(() => { try { if (localStorage.getItem('traco-active-mode') === 'rascunhos') mostrar(true); } catch { /* */ } });
})();
