// Socorro: se o app não abrir (erro ao carregar), mostra o motivo na tela e um jeito de abrir sem os dados salvos.
(() => {
  const erros = [];
  addEventListener('error', (e) => { erros.push(`${e.message || e.error || 'erro'} (${(e.filename || '').split('/').pop().split('?')[0]}:${e.lineno || ''})`); });
  addEventListener('unhandledrejection', (e) => { erros.push(String(e.reason?.message || e.reason)); });
  const mostra = (motivo) => {
    if (document.getElementById('socorro')) return;
    const d = document.createElement('div'); d.id = 'socorro';
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;background:#fff;color:#111;border:2px solid #D76845;border-radius:14px;padding:14px;font:14px/1.45 Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3)';
    d.innerHTML = `<b>O app não abriu direito.</b><br><small>${motivo}</small><br><small style="color:#555">${erros.slice(0, 3).map((x) => x.replace(/</g, '&lt;')).join('<br>')}</small>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button id="socRec" style="padding:9px 12px;border-radius:9px;border:1px solid #ccc;background:#fff">Recarregar</button>
      <button id="socLimpa" style="padding:9px 12px;border-radius:9px;border:0;background:#2e4b3f;color:#fff">Abrir sem os dados salvos</button>
      <button id="socFecha" style="padding:9px 12px;border-radius:9px;border:1px solid #ccc;background:#fff">Fechar</button></div>
      <small style="color:#555">"Abrir sem os dados salvos" guarda uma cópia do que estava salvo (dá para voltar) e abre limpo.</small>`;
    document.body.appendChild(d);
    d.querySelector('#socRec').onclick = () => location.reload();
    d.querySelector('#socFecha').onclick = () => d.remove();
    d.querySelector('#socLimpa').onclick = () => {
      try { const copia = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('traco-') && !k.startsWith('traco-copia')) copia[k] = localStorage.getItem(k); }
        localStorage.setItem('traco-copia-' + Date.now(), JSON.stringify(copia));
        Object.keys(copia).forEach((k) => localStorage.removeItem(k)); } catch { /* */ }
      location.reload();
    };
  };
  addEventListener('load', () => setTimeout(() => {
    const ok = window.tracoPeca && document.getElementById('partsTab');
    if (!ok) mostra('Parte do app não carregou.'); else if (erros.length) mostra('Deu erro ao carregar.');
  }, 5000));
})();
