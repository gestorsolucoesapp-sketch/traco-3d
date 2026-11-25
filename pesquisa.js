// 🔎 Pesquisa na internet de um componente (preço, links, ficha, medidas) — usada no quadro e nos projetos.
(() => {
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } };
  const link = (u, t) => (/^https?:\/\//.test(u || '') ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t || host(u))}</a>` : esc(t || ''));
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem('traco-pesquisas') || '{}'); } catch { /* */ }
  const chaveDe = (t) => t.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);

  const dlg = document.createElement('dialog');
  dlg.className = 'ras-dlg pesq-dlg';
  dlg.innerHTML = `<form method="dialog"><div class="pesq-topo"><h3 id="pqTit">🔎 Pesquisar</h3><button type="button" class="pesq-x" data-p="x" aria-label="Fechar">✕</button></div>
    <label class="pesq-item">O que pesquisar <input id="pqItem" /></label>
    <div id="pqCorpo"></div>
    <div class="ras-acoes" id="pqAcoes"></div></form>`;
  document.body.appendChild(dlg);
  dlg.querySelector('[data-p=x]').onclick = () => dlg.close();
  const $ = (id) => dlg.querySelector('#' + id);

  let atual = null; // { item, contexto, parametros, aoColar, aoAplicar, r }
  function botoes() {
    const a = $('pqAcoes'); a.innerHTML = '';
    const bt = (txt, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = txt; b.onclick = fn; a.appendChild(b); return b; };
    bt(atual?.r ? '↻ Pesquisar de novo' : '🔎 Pesquisar', atual?.r ? 'secondary-button' : 'primary-button', () => buscar(true));
    if (atual?.r && atual.aoColar) bt('📌 Colar no quadro', 'secondary-button', () => { atual.aoColar(atual.r); dlg.close(); });
    const pp = (atual?.r?.para_parametros || []).filter((p) => atual.parametrosIds?.has(p.id));
    if (pp.length && atual.aoAplicar) bt(`✓ Usar ${pp.length} medida${pp.length > 1 ? 's' : ''} no projeto`, 'primary-button', () => { atual.aoAplicar(pp); dlg.close(); });
  }
  function mostra(r) {
    const c = $('pqCorpo');
    if (!r) { c.innerHTML = ''; return; }
    const lista = (arr, fn) => (arr || []).map(fn).join('');
    const pp = (r.para_parametros || []).filter((p) => atual.parametrosIds?.has(p.id));
    c.innerHTML = `
      ${r.o_que_e ? `<p class="pesq-oq"><b>${esc(r.nome || '')}</b> — ${esc(r.o_que_e)}</p>` : ''}
      ${(r.precos || []).length ? `<h4>💰 Preços</h4><ul class="pesq-lista">${lista(r.precos, (p) => `<li><b>${esc(p.preco || '')}</b> · ${link(p.link, p.loja || host(p.link))}${p.obs ? `<small>${esc(p.obs)}</small>` : ''}</li>`)}</ul>` : '<p class="pesq-vazio">Nenhum preço encontrado com link.</p>'}
      ${(r.specs || []).length ? `<h4>📋 Ficha</h4><table class="pesq-tab">${lista(r.specs, (s) => `<tr><td>${esc(s.nome)}</td><td>${esc(s.valor)}</td></tr>`)}</table>` : ''}
      ${(r.medidas || []).length ? `<h4>📏 Medidas</h4><ul class="pesq-lista">${lista(r.medidas, (m) => `<li>${esc(m.nome)}: <b>${esc(m.valor)}</b>${m.fonte ? ` · ${link(m.fonte, 'fonte')}` : ' <small>sem fonte — confira</small>'}</li>`)}</ul>` : ''}
      ${pp.length ? `<div class="pesq-aplica"><b>Medidas que servem no projeto</b><ul>${lista(pp, (p) => `<li>${esc(atual.nomeParam?.(p.id) || p.id)}: <b>${esc(String(p.valor).replace('.', ','))} mm</b> · ${link(p.fonte, 'fonte')}</li>`)}</ul></div>` : ''}
      ${(r.links || []).length ? `<h4>🔗 Links</h4><ul class="pesq-lista">${lista(r.links, (l) => `<li>${link(l.link, l.titulo || host(l.link))}</li>`)}</ul>` : ''}
      ${(r.alternativas || []).length ? `<h4>🔁 Alternativas</h4><ul class="pesq-lista">${lista(r.alternativas, (a) => `<li><b>${esc(a.nome)}</b>${a.por_que ? ` — ${esc(a.por_que)}` : ''}</li>`)}</ul>` : ''}
      <p class="pesq-rod">Pesquisado em ${esc(r._quando || '')}${r.buscas ? ` · ${r.buscas} busca(s)` : ''}. Preços mudam: confira na loja.${(r.avisos || []).length ? ' ' + esc(r.avisos.join(' ')) : ''}</p>`;
  }
  async function buscar(forcar) {
    const item = $('pqItem').value.trim(); if (item.length < 2) { $('pqItem').focus(); return; }
    atual.item = item;
    const k = chaveDe(item + '|' + (atual.parametros || ''));
    if (!forcar && cache[k]) { atual.r = cache[k]; mostra(atual.r); botoes(); return; }
    $('pqCorpo').innerHTML = '<p class="pesq-esp">🔎 Pesquisando na internet… (20 a 60 s)</p>'; $('pqAcoes').innerHTML = '';
    try {
      const r = await window.tracoChamarIA({ pesquisa: { item, contexto: atual.contexto || '', parametros: atual.parametros || '' } });
      r._quando = new Date().toLocaleDateString('pt-BR');
      atual.r = r; cache[k] = r; cache['n|' + chaveDe(item)] = r; atual.aoResultado?.(r);
      const ks = Object.keys(cache); if (ks.length > 60) delete cache[ks[0]];
      try { localStorage.setItem('traco-pesquisas', JSON.stringify(cache)); } catch { /* */ }
      mostra(r);
    } catch (e) { $('pqCorpo').innerHTML = `<p class="pesq-vazio">${esc(e.message || e)}</p>`; }
    botoes();
  }
  $('pqItem').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(true); } e.stopPropagation(); });

  window.tracoPesquisas = { porItem: (nome) => cache['n|' + chaveDe(nome)] || null };
  // abre a janela; se já pesquisou isso antes, mostra na hora
  window.tracoPesquisar = (opc) => {
    atual = { ...opc, parametrosIds: new Set(opc.parametrosIds || []) };
    $('pqItem').value = (opc.item || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    $('pqTit').textContent = '🔎 Pesquisar na internet';
    const k = chaveDe($('pqItem').value + '|' + (opc.parametros || ''));
    atual.r = cache[k] || null; mostra(atual.r); botoes();
    dlg.showModal();
    if (!atual.r && opc.auto !== false) buscar(false);
  };
})();
