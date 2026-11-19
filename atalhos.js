// Ctrl+Z desfaz, Ctrl+Y (ou Ctrl+Shift+Z) refaz — Arquitetura e Peças. No Mac vale com Cmd.
(() => {
  const $ = (id) => document.getElementById(id);
  const pecas = () => $('architectureMode')?.hidden;
  // Peças: histórico por "fotografia" do projeto (pega qualquer mudança: linha, cota, espessura, narração…)
  const P = () => window.tracoPeca;
  const desfazer = [], refazer = []; let atual = null, aplicando = false;
  setInterval(() => {
    if (!P() || aplicando) return;
    const agora = P().projeto();
    if (atual === null) { atual = agora; return; }
    if (agora !== atual) { desfazer.push(atual); if (desfazer.length > 100) desfazer.shift(); refazer.length = 0; atual = agora; }
  }, 350);
  function trocaPara(json) {
    aplicando = true;
    try { P().abrir(json); atual = P().projeto(); } finally { aplicando = false; }
  }
  function avisa(t) { const el = $('toast'); if (!el) return; el.textContent = t; el.classList.add('show'); clearTimeout(avisa.t); avisa.t = setTimeout(() => el.classList.remove('show'), 1200); }
  function undo() {
    if (!pecas()) { $('undoButton')?.click(); avisa('↶ Desfeito'); return; }
    const agora = P().projeto(); if (agora !== atual) { desfazer.push(atual); atual = agora; } // pega mudança recente
    if (!desfazer.length) { avisa('Nada para desfazer'); return; }
    refazer.push(atual); trocaPara(desfazer.pop()); avisa('↶ Desfeito');
  }
  function redo() {
    if (!pecas()) { $('redoButton')?.click(); avisa('↷ Refeito'); return; }
    if (!refazer.length) { avisa('Nada para refazer'); return; }
    desfazer.push(atual); trocaPara(refazer.pop()); avisa('↷ Refeito');
  }
  addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const t = e.target; if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return; // nos campos vale o desfazer do próprio campo
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  });
  window.tracoDesfazer = { undo, redo };
})();
