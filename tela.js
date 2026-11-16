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
  // Trocar de aba sai da tela cheia.
  for (const id of ['architectureTab', 'partsTab']) $(id)?.addEventListener('click', () => {
    if (document.body.classList.contains('tela-cheia')) alternar(document.body.dataset.telaCheia);
  });
})();
