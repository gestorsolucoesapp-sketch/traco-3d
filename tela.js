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
      <button type="button" data-z="full" class="zoom-full" title="Tela cheia com o 3D no canto">⛶ Tela cheia</button>`;
    d.addEventListener('pointerdown', (e) => e.stopPropagation());
    d.addEventListener('click', (e) => {
      const z = e.target.closest('button')?.dataset.z;
      if (!z) return;
      if (z === 'full') return alternar(modo);
      if (modo === 'arq') {
        if (z === 'fit') { sketchView.k = 1; sketchView.ox = 0; sketchView.oy = 0; zoomSketch(1); }
        else zoomSketch(z === 'in' ? 1.4 : 1 / 1.4);
      } else if (z === 'fit') $('fitProfileView').click();
      else window.tracoZoomPeca(z === 'in' ? 1.4 : 1 / 1.4);
    });
    wrap.appendChild(d);
  }
  barra(document.querySelector('#architectureMode .sketch-wrap'), 'arq');
  barra($('partSketchCanvas')?.parentElement, 'peca');

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
