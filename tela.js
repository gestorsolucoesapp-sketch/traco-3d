// Botões de zoom e "Tela cheia" nos quadros de desenho. Em tela cheia o desenho ocupa a janela
// e o 3D fica numa janelinha no canto, atualizando ao vivo.
(() => {
  const $ = (id) => document.getElementById(id);
  function barra(wrap, modo) {
    if (!wrap) return;
    const d = document.createElement('div');
    d.className = 'zoom-bar';
    d.innerHTML = `<button type="button" data-z="out" title="Afastar (roda do mouse)">−</button>
      <button type="button" data-z="fit" title="Ver tudo">${modo === 'arq' ? '<span id="archZoomLevel">100%</span>' : 'Ver tudo'}</button>
      <button type="button" data-z="in" title="Aproximar (roda do mouse)">+</button>
      <button type="button" data-z="estilo" class="zoom-estilo" title="Espessura, tracejado e mostrar/esconder cotas">〰</button>
      <button type="button" data-z="lapis" class="zoom-lapis" title="Lapiseira: no toque, a ponta fica 5 mm ao lado do dedo">✏️</button>
      <button type="button" data-z="full" class="zoom-full" title="Tela cheia com o 3D no canto">⛶ Tela cheia</button>`;
    d.addEventListener('pointerdown', (e) => e.stopPropagation());
    d.addEventListener('click', (e) => {
      const z = e.target.closest('button')?.dataset.z;
      if (!z) return;
      if (z === 'full') return alternar(modo);
      if (z === 'estilo') { const b = e.target.closest('button'); if (!pop.hidden) { pop.hidden = true; return; } abrirEstilo(b); return; }
      if (z === 'lapis') {
        // cada toque troca: desligada → 8 → 12 → 18 → 25 mm → desligada
        const atual = lapis.ativo ? lapis.mm : 0, prox = DISTS[(DISTS.indexOf(atual) + 1) % DISTS.length];
        lapis.ativo = prox > 0; if (prox) lapis.mm = prox;
        try { localStorage.setItem('traco-lapis-mm', String(prox)); } catch { /* */ }
        marcaLapis();
        const el = $('toast'); if (el) { el.textContent = lapis.ativo ? `Lapiseira: ponta ${lapis.mm} mm acima do dedo. Toque de novo no ✏️ para afastar mais.` : 'Lapiseira desligada.'; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3200); }
        return;
      }
      if (modo === 'arq') {
        if (z === 'fit') { sketchView.k = 1; sketchView.ox = 0; sketchView.oy = 0; zoomSketch(1); }
        else zoomSketch(z === 'in' ? 1.4 : 1 / 1.4);
      } else if (z === 'fit') $('fitProfileView').click();
      else window.tracoZoomPeca(z === 'in' ? 1.4 : 1 / 1.4);
    });
    wrap.appendChild(d);
  }
  // Lapiseira: no toque, a ponta fica 5 mm acima e à esquerda do dedo (o dedo não cobre a linha).
  const MM = 96 / 25.4, DISTS = [0, 8, 12, 18, 25];
  const lapis = { ativo: false, mm: 12 };
  try { const v = +localStorage.getItem('traco-lapis-mm'); if (DISTS.includes(v)) { lapis.mm = v || 12; lapis.ativo = v > 0; } else lapis.ativo = localStorage.getItem('traco-lapis') === '1'; } catch { /* */ }
  // ponta acima e à esquerda do dedo, na distância escolhida
  lapis.desvio = (ev) => lapis.ativo && ev && ev.pointerType === 'touch' ? [-lapis.mm * MM * .6, -lapis.mm * MM * .8] : [0, 0];
  window.tracoLapis = lapis;
  const ponta = document.createElement('div'); ponta.className = 'lapis-ponta'; ponta.hidden = true;
  ponta.innerHTML = '<span></span>'; document.body.appendChild(ponta);
  for (const id of ['sketchCanvas', 'partSketchCanvas']) {
    const c = $(id); if (!c) continue;
    const mostra = (e) => {
      if (!lapis.ativo || e.pointerType !== 'touch') return;
      const [dx, dy] = lapis.desvio(e);
      ponta.style.left = (e.clientX + dx) + 'px'; ponta.style.top = (e.clientY + dy) + 'px'; ponta.hidden = false;
    };
    c.addEventListener('pointerdown', mostra, { capture: true });
    c.addEventListener('pointermove', mostra, { capture: true });
    for (const tp of ['pointerup', 'pointercancel', 'pointerleave']) c.addEventListener(tp, () => { ponta.hidden = true; });
  }
  // Estilo do traço: espessura, tracejado e mostrar/esconder cotas (vale nos dois modos).
  const estilo = { esp: 3, tracejada: false, cotas: true };
  try { Object.assign(estilo, JSON.parse(localStorage.getItem('traco-estilo')) || {}); } catch { /* */ }
  window.tracoEstilo = estilo;
  const pop = document.createElement('div'); pop.className = 'estilo-pop'; pop.hidden = true; document.body.appendChild(pop);
  pop.addEventListener('pointerdown', (e) => e.stopPropagation());
  function redesenha() { try { localStorage.setItem('traco-estilo', JSON.stringify(estilo)); } catch { /* */ } try { requestRender(); } catch { /* */ } try { window.tracoPeca?.render(); } catch { /* */ } }
  function abrirEstilo(btn) {
    pop.innerHTML = `<b>Traço</b>
      <label>Espessura <input type="range" min="1" max="8" step=".5" value="${estilo.esp}" data-e="esp" /> <span>${estilo.esp}</span></label>
      <svg viewBox="0 0 160 16" width="160" height="16"><line x1="6" y1="8" x2="154" y2="8" stroke="#c57650" stroke-linecap="round" stroke-width="${estilo.esp}" ${estilo.tracejada ? 'stroke-dasharray="6 4"' : ''}/></svg>
      <label><input type="checkbox" data-e="tracejada" ${estilo.tracejada ? 'checked' : ''}/> Linha tracejada</label>
      <label><input type="checkbox" data-e="cotas" ${estilo.cotas ? 'checked' : ''}/> Mostrar cotas (medidas)</label>`;
    const r = btn.getBoundingClientRect();
    pop.style.top = (r.bottom + 6 + scrollY) + 'px'; pop.style.left = Math.max(8, r.right - 220 + scrollX) + 'px';
    pop.hidden = false;
    pop.querySelectorAll('[data-e]').forEach((el) => el.addEventListener('input', () => {
      const k = el.dataset.e; estilo[k] = el.type === 'checkbox' ? el.checked : +el.value;
      redesenha(); abrirEstilo(btn);
    }));
  }
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.zoom-estilo')) pop.hidden = true; });
  barra(document.querySelector('#architectureMode .sketch-wrap'), 'arq');
  barra($('partSketchCanvas')?.parentElement, 'peca');
  function marcaLapis() { document.querySelectorAll('.zoom-lapis').forEach((b) => { b.classList.toggle('on', lapis.ativo); b.textContent = lapis.ativo ? `✏️ ${lapis.mm}` : '✏️'; }); }
  marcaLapis();

  function alternar(modo) {
    const liga = !document.body.classList.contains('tela-cheia');
    document.body.classList.toggle('tela-cheia', liga);
    for (const p of [document.querySelector('#architectureMode .model-panel'), document.querySelector('.parts-workspace > .panel:last-child')])
      if (p) { p.style.left = p.style.top = p.style.right = p.style.bottom = ''; }
    document.body.dataset.telaCheia = liga ? modo : '';
    document.querySelectorAll('.zoom-full').forEach((b) => { b.textContent = liga ? '✕ Sair da tela cheia' : '⛶ Tela cheia'; });
    if (liga) (modo === 'arq' ? $('sketchCanvas') : $('partSketchCanvas'))?.focus({ preventScroll: true });
    window.dispatchEvent(new Event('resize'));
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F11' || !document.body.classList.contains('tela-cheia')) return;
    // Esc sai da tela cheia só quando não há linha em andamento (Esc da linha tem prioridade).
    if (e.key === 'Escape' && document.activeElement?.tagName !== 'INPUT' &&
        !(typeof state !== 'undefined' && state.lineStart) && !document.querySelector('dialog[open]')) {
      setTimeout(() => { if (document.body.classList.contains('tela-cheia')) alternar(document.body.dataset.telaCheia); });
    }
  });
  // Janelinha do 3D: dá para arrastar pela alça (fica onde você soltar).
  function mini() {
    return document.body.dataset.telaCheia === 'arq' ? document.querySelector('#architectureMode .model-panel') :
      document.querySelector('.parts-workspace > .panel:last-child');
  }
  for (const wrap of [document.querySelector('#architectureMode .model-wrap'), document.querySelector('.part-model-wrap')]) {
    if (!wrap) continue;
    const alca = document.createElement('div');
    alca.className = 'mini3d-alca'; alca.textContent = '⠿ arraste para mover';
    wrap.appendChild(alca);
    let drag = null;
    alca.addEventListener('pointerdown', (e) => {
      const p = mini(); if (!p) return;
      const r = p.getBoundingClientRect();
      drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, p };
      alca.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
    });
    alca.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const { p } = drag, w = p.offsetWidth, h = p.offsetHeight;
      const x = Math.max(0, Math.min(innerWidth - w, e.clientX - drag.dx));
      const y = Math.max(0, Math.min(innerHeight - h, e.clientY - drag.dy));
      p.style.left = x + 'px'; p.style.top = y + 'px'; p.style.right = 'auto'; p.style.bottom = 'auto';
    });
    alca.addEventListener('pointerup', () => { drag = null; });
  }
  // Trocar de aba sai da tela cheia.
  for (const id of ['architectureTab', 'partsTab']) $(id)?.addEventListener('click', () => {
    if (document.body.classList.contains('tela-cheia')) alternar(document.body.dataset.telaCheia);
  });
})();
