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
  layout?.parentElement.insertBefore(row, layout);
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
    ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.font = '700 10px DM Sans, Arial, sans-serif'; ctx.fillText('0,0,0', o.x + 7, o.y + 10);
    ctx.restore();
  };
  try { window.requestRender?.(); } catch { /* */ }
})();
