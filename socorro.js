// Relógio da sincronização: anota quando cada dado "traco-…" do aparelho mudou (para saber o que é mais novo).
(() => {
  const LOCAL = /^traco-(sessao|sync-|apagados|email|convite-sync|copia|versao|active-mode|prj-aba|projeto-atual|rascunho-atual|pmc-zoom|cro-escala|tema|modo-pc|tambor|roda)/;
  const set = Storage.prototype.setItem, del = Storage.prototype.removeItem;
  let mapa = null; const ler = () => { if (!mapa) { try { mapa = JSON.parse(localStorage.getItem('traco-sync-lsq') || '{}'); } catch { mapa = {}; } } return mapa; };
  let t = 0; const grava = () => { clearTimeout(t); t = setTimeout(() => { try { set.call(localStorage, 'traco-sync-lsq', JSON.stringify(mapa)); } catch { /* */ } window.tracoSync?.mudou(); }, 400); };
  const marca = (k) => { if (typeof k === 'string' && k.startsWith('traco-') && !LOCAL.test(k)) { ler()[k] = Date.now(); grava(); } };
  Storage.prototype.setItem = function (k, v) { const r = set.call(this, k, v); if (this === localStorage && !window.__tracoSyncAplicando) marca(k); return r; };
  Storage.prototype.removeItem = function (k) { const r = del.call(this, k); if (this === localStorage && !window.__tracoSyncAplicando) marca(k); return r; };
  window.tracoLS = { LOCAL, mapa: ler, setCru: (k, v) => set.call(localStorage, k, v), delCru: (k) => del.call(localStorage, k), salvaMapa: () => set.call(localStorage, 'traco-sync-lsq', JSON.stringify(ler())) };
})();
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
