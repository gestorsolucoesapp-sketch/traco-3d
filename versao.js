// Versão do app. Mude aqui a cada publicação.
window.TRACO_VERSAO = { numero: '7.9', data: '23/11/2026' };
(() => {
  const v = window.TRACO_VERSAO, txt = `v${v.numero}`;
  const poe = () => {
    const alvo = document.querySelector('.topbar-right');
    if (alvo && !document.querySelector('.traco-versao')) {
      const s = document.createElement('span'); s.className = 'traco-versao'; s.textContent = txt; s.title = `Traço versão ${v.numero} · ${v.data}`;
      alvo.appendChild(s);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poe); else poe();
})();
