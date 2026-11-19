// Escolha de como desenhar a peça:
//  • SolidWorks: escolhe o plano do esboço (Frontal, Superior, Direito); também dá para tocar no plano no 3D.
//  • SketchUp: desenha direto no chão (plano Superior) e puxa para cima.
// Também desenha a origem e os eixos X/Y/Z no 3D da Arquitetura.
(() => {
  const P = window.tracoPlano; if (!P) return;
  const NOME = { frontal: 'Frontal', superior: 'Superior', direito: 'Direito' };
  const DICA = { frontal: 'plano XZ, de frente', superior: 'plano XY, o chão', direito: 'plano YZ, de lado' };
  let estilo = 'solidworks';
  try { estilo = localStorage.getItem('traco-estilo-desenho') || 'solidworks'; } catch { /* */ }

  const row = document.createElement('div');
  row.className = 'plano-row';
  row.innerHTML = `<div class="plano-seg" role="group" aria-label="Estilo de desenho">
      <button type="button" data-e="solidworks" title="Escolha o plano do esboço, como no SolidWorks">📐 Escolher plano <small>SolidWorks</small></button>
      <button type="button" data-e="sketchup" title="Desenhe no chão e puxe para cima, como no SketchUp">✏️ Direto no chão <small>SketchUp</small></button>
    </div>
    <div class="plano-seg plano-planos" role="group" aria-label="Plano do esboço">
      <button type="button" id="planoFrontal" data-p="frontal">Frontal</button>
      <button type="button" id="planoSuperior" data-p="superior">Superior</button>
      <button type="button" id="planoDireito" data-p="direito">Direito</button>
    </div>`;
  const layout = document.querySelector('#partsMode .part-editor-layout');
  // cabeçalho compacto: a escolha do plano fica na mesma linha do título
  const cab = layout?.closest('.panel')?.querySelector('.panel-head');
  if (cab) cab.appendChild(row); else layout?.parentElement.insertBefore(row, layout);
  // área de trabalho em cima; medidas do copo e "como transformar" vão para baixo
  const ws = document.querySelector('#partsMode .parts-workspace');
  if (ws) {
    let ref = ws;
    for (const el of [document.querySelector('#partsMode .part-menus'), document.getElementById('shapeMethod'), document.getElementById('holeControls'), document.getElementById('helixControls')]) {
      if (el) { ref.after(el); ref = el; }
    }
  }
  const rotulo = document.getElementById('partSketchCanvas')?.parentElement.querySelector('.canvas-corner-label');

  function pinta() {
    const p = P.get();
    row.querySelectorAll('[data-e]').forEach((b) => b.classList.toggle('on', b.dataset.e === estilo));
    row.querySelectorAll('[data-p]').forEach((b) => { b.classList.toggle('on', b.dataset.p === p); b.setAttribute('aria-pressed', String(b.dataset.p === p)); });
    row.querySelector('.plano-planos').hidden = estilo === 'sketchup';
    if (rotulo) rotulo.textContent = estilo === 'sketchup' ? 'CHÃO (XY) · mm · desenhe e puxe' : `PLANO ${NOME[p].toUpperCase()} (${DICA[p].split(',')[0].replace('plano ', '')}) · mm`;
  }
  function msg(t) { const el = document.getElementById('toast'); if (!el) return; el.textContent = t; el.classList.add('show'); clearTimeout(msg.t); msg.t = setTimeout(() => el.classList.remove('show'), 2600); }

  row.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.e) {
      estilo = b.dataset.e; P.estilo = estilo;
      { const v = window.tracoPeca?.part?.view; if (v && estilo !== 'sketchup') { v.r0 = Math.max(0, v.r0 || 0); v.z0 = Math.max(0, v.z0 || 0); } window.tracoPeca?.render(); }
      try { localStorage.setItem('traco-estilo-desenho', estilo); } catch { /* */ }
      if (estilo === 'sketchup') { P.set('superior'); msg('Estilo SketchUp: desenhe no chão e use Extrusão / Empurrar-puxar para subir.'); }
      else msg('Estilo SolidWorks: escolha o plano aqui ou toque no nome do plano no 3D.');
    }
    if (b.dataset.p) { P.set(b.dataset.p); msg(`Esboço no plano ${NOME[b.dataset.p]} (${DICA[b.dataset.p]}).`); }
    pinta();
  });
  addEventListener('traco-plano', pinta);
  P.estilo = estilo;
  if (estilo === 'sketchup' && P.get() !== 'superior') P.set('superior');
  pinta();

  // 👁 mostrar/esconder as medidas de todas as linhas do perfil (por padrão só a linha em edição)
  const part = window.tracoPeca?.part;
  if (part) {
    try { part.olho = localStorage.getItem('traco-olho-cotas') === '1'; } catch { part.olho = false; }
    const pondo = () => {
      const barra = document.getElementById('partSketchCanvas')?.parentElement.querySelector('.zoom-bar');
      if (!barra) return setTimeout(pondo, 300);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'olho-cotas';
      const pinta2 = () => { b.textContent = part.olho ? '👁' : '👁‍🗨'; b.title = part.olho ? 'Esconder as medidas das linhas' : 'Mostrar as medidas de todas as linhas'; b.classList.toggle('on', part.olho); };
      b.onclick = () => { part.olho = !part.olho; try { localStorage.setItem('traco-olho-cotas', part.olho ? '1' : '0'); } catch { /* */ } pinta2(); window.tracoPeca.render(); };
      pinta2(); barra.insertBefore(b, barra.children[3] || null);
    };
    pondo();
  }

  // Origem e eixos no 3D da Arquitetura (1 m de comprimento).
  window.tracoEixos = (ctx, toScreen, unit) => {
    const L = Math.max(.6, 60 / unit), o = toScreen([0, 0, 0]);
    ctx.save(); ctx.lineWidth = 1.2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 11px DM Sans, Arial, sans-serif';
    for (const [v, cor, n] of [[[L, 0, 0], '#d33d2f', 'X'], [[0, -L, 0], '#2f9b4c', 'Y'], [[0, 0, L], '#2f63d3', 'Z']]) {
      const e = toScreen(v); ctx.strokeStyle = cor; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(e.x, e.y); ctx.stroke();
      const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy) || 1; ctx.fillStyle = cor; ctx.fillText(n, e.x + dx / d * 9, e.y + dy / d * 9);
    }
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(o.x, o.y, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(o.x, o.y, 1.6, 0, Math.PI * 2); ctx.fill();
    
    ctx.restore();
  };
  try { window.requestRender?.(); } catch { /* */ }
})();

// Caixinha de ângulo: aparece junto do mouse quando aperta/segura A (Peças e Arquitetura).
// Dá para digitar o ângulo (Enter trava) ou só soltar o A e usar o ângulo do mouse.
(() => {
  const caixa = document.createElement('div');
  caixa.className = 'caixa-angulo'; caixa.hidden = true;
  caixa.innerHTML = '<span>Ângulo</span><b></b><i>°</i><small>digite e Enter · ou solte o A</small>';
  document.body.appendChild(caixa);
  let mx = 0, my = 0;
  addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, true);
  const graus = (dx, dy) => { let g = Math.atan2(dy, dx) * 180 / Math.PI; return Math.round(g * 10) / 10; };
  setInterval(() => {
    let ativo = false, txt = '', vivo = null;
    const P = window.tracoPeca?.part;
    if (!document.getElementById('partsMode')?.hidden && P?.angleTyping) {
      ativo = true; txt = document.getElementById('profileAngle')?.value || '';
      const a = P.profile?.at(-1), b = P.selected; if (a && b) vivo = graus(b[0] - a[0], b[1] - a[1]);
    } else if (!document.getElementById('architectureMode')?.hidden && typeof state !== 'undefined' && state.angleTyping != null) {
      ativo = true; txt = state.angleTyping;
      const a = state.lineStart, b = state.linePreview; if (a && b) vivo = graus(b[0] - a[0], a[1] - b[1]);
    }
    caixa.hidden = !ativo; if (!ativo) return;
    const b = caixa.querySelector('b');
    b.textContent = txt || (vivo != null ? String(vivo).replace('.', ',') : '—');
    b.classList.toggle('vivo', !txt);
    caixa.style.left = `${Math.min(innerWidth - 190, mx + 18)}px`; caixa.style.top = `${Math.min(innerHeight - 70, my + 18)}px`;
  }, 60);
})();

// Peça narrada: tocar numa peça no 3D abre a edição dela (sem arrastar, fora do Pintar/Medir).
(() => {
  const api = window.tracoPeca; if (!api?.model) return;
  const m = api.model; let ini = null;
  const dentro = (x, y, c) => { const s = (a, b) => (x - b.x) * (a.y - b.y) - (a.x - b.x) * (y - b.y);
    const d1 = s(c[0], c[1]), d2 = s(c[1], c[2]), d3 = s(c[2], c[0]); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
  m.addEventListener('pointerdown', (e) => { ini = [e.clientX, e.clientY]; }, true);
  m.addEventListener('pointerup', (e) => {
    const p = api.part; if (!ini || p.operation !== 'narrado' || p.sim) return;
    const moveu = Math.hypot(e.clientX - ini[0], e.clientY - ini[1]); ini = null;
    if (moveu > 6 || window.tracoPintura?.ativa || window.tracoCotas?.medindo) return;
    const r = m.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, faces = p.lastFaces || [];
    let alvo = null; for (let i = faces.length - 1; i >= 0; i--) if (dentro(x, y, faces[i].corners)) { alvo = faces[i].idx; break; }
    if (alvo == null) return;
    const i = api.pecas().findIndex((q) => alvo >= q.ini && alvo < q.ini + q.tris.length);
    if (i >= 0) window.tracoNarrarEditar?.(i);
  });
})();
