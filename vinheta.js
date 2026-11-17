// Vinheta de abertura: toca uma vez por sessão; um toque pula.
(() => {
  const v = document.getElementById('vinheta'); if (!v) return;
  let visto = false; try { visto = sessionStorage.getItem('traco-vinheta') === '1'; sessionStorage.setItem('traco-vinheta', '1'); } catch { /* */ }
  if (visto) { v.remove(); return; }
  const fim = () => { v.classList.add('sai'); setTimeout(() => v.remove(), 400); };
  v.addEventListener('pointerdown', fim, { once: true });
  setTimeout(() => v.remove(), 6200);
})();
