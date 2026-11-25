// Projetos: assistente de início, resumo no topo, quadro ligado, lista de compras, "puxar do projeto" e relatório completo.
(() => {
  const $ = (id) => document.getElementById(id);
  const painel = $('projetosMode'); if (!painel || !window.tracoProjetos) return;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = () => window.tracoProjetos.atual();
  const salvar = () => window.tracoProjetos.salvar();
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const vaiAba = (a) => painel.querySelector(`.prj-abas [data-a="${a}"]`)?.click();

  // ---------- 1) resumo no topo ----------
  const resumo = document.createElement('div'); resumo.className = 'prj-resumo';
  painel.querySelector('.prj-abas').before(resumo);
  function preco(txt) { const m = /R\$\s*([\d.]+,\d{2}|[\d.]+)/.exec(String(txt || '')); if (!m) return null; const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; }
  function compras(p) {
    return (p.spec?.componentes || []).map((c) => {
      const r = window.tracoPesquisas?.porItem(c.nome), pr = (r?.precos || []).find((x) => preco(x.preco) != null);
      const qtd = Math.max(1, +c.qtd || 1), un = pr ? preco(pr.preco) : null;
      return { ...c, qtd, un, loja: pr?.loja || '', link: pr?.link || '', sub: un != null ? un * qtd : null, pesquisado: Boolean(r) };
    });
  }
  function atualizaResumo() {
    const p = P(); if (!p) return;
    const S = p.spec, m = window.tracoProjetos.malhas?.() || [], g = m.reduce((s, x) => s + (x.vol || 0), 0) / 1000 * 1.24;
    const est = (S?.parametros || []).filter((x) => x.origem === 'estimado').length;
    const cp = compras(p), tot = cp.reduce((s, c) => s + (c.sub || 0), 0), semPreco = cp.filter((c) => c.sub == null).length;
    const cr = window.tracoCrono?.resumo(p);
    const blocos = window.tracoCanvas?.BLOCOS || [], cheios = blocos.filter(([k]) => window.tracoCanvas.notas(p, k).length).length;
    const falta = [];
    if (!(p.ideia || '').trim() && !p.quadro) falta.push(['Escrever a ideia', 'pecas']);
    if (!S) falta.push(['Gerar as peças 3D', 'pecas']);
    if (est) falta.push([`Conferir ${est} medida${est > 1 ? 's' : ''} estimada${est > 1 ? 's' : ''}`, 'pecas']);
    if (semPreco) falta.push([`Pesquisar preço de ${semPreco} componente${semPreco > 1 ? 's' : ''}`, 'pecas']);
    if (blocos.length && cheios < blocos.length) falta.push([`Canvas: ${blocos.length - cheios} bloco${blocos.length - cheios > 1 ? 's' : ''} vazio${blocos.length - cheios > 1 ? 's' : ''}`, 'canvas']);
    if (!cr) falta.push(['Montar o cronograma', 'crono']); else if (cr.atrasadas) falta.push([`${cr.atrasadas} tarefa${cr.atrasadas > 1 ? 's' : ''} atrasada${cr.atrasadas > 1 ? 's' : ''}`, 'crono']);
    const card = (ic, tit, val, sub, aba) => `<button type="button" class="prj-kpi" data-ir="${aba}"><span>${ic}</span><div><small>${tit}</small><b>${val}</b>${sub ? `<em>${sub}</em>` : ''}</div></button>`;
    resumo.innerHTML = `<div class="prj-kpis">
        ${card('🧩', 'Peças 3D', S ? `${(S.pecas || []).length} peça${(S.pecas || []).length > 1 ? 's' : ''}` : '—', g ? `≈ ${Math.round(g)} g de filamento (maciço)` : '', 'pecas')}
        ${(() => { const cu = window.tracoCustos?.resumo(p); return cu ? card('💰', 'Custos', brl(cu.BAC), `gasto ${brl(cu.AC)}${Number.isFinite(cu.CPI) ? ` · IDC ${cu.CPI.toFixed(2).replace('.', ',')}` : ''}`, 'custos')
          : card('🛒', 'Compras', cp.length ? (tot ? brl(tot) : '—') : '—', cp.length ? `${cp.length} ite${cp.length > 1 ? 'ns' : 'm'}${semPreco ? ` · ${semPreco} sem preço` : ''}` : '', 'pecas'); })()}
        ${card('📅', 'Prazo', cr ? `${cr.ini} → ${cr.fim}` : '—', cr ? `${cr.dias} dias · ${cr.pct}% concluído` : '', 'crono')}
        ${card('🗂️', 'Canvas', blocos.length ? `${cheios}/${blocos.length} blocos` : '—', '', 'canvas')}
        <button type="button" class="prj-kpi prj-rel" data-rel><span>📄</span><div><small>Relatório</small><b>Projeto inteiro</b><em>PDF / imprimir</em></div></button></div>
      ${falta.length ? `<div class="prj-falta"><b>Falta:</b> ${falta.map(([t, a]) => `<button type="button" data-ir="${a}">${esc(t)}</button>`).join('')}</div>` : `<div class="prj-falta ok">✓ Nada pendente no projeto.</div>`}`;
    resumo.querySelectorAll('[data-ir]').forEach((b) => (b.onclick = () => vaiAba(b.dataset.ir)));
    resumo.querySelector('[data-rel]').onclick = () => (window.tracoExportar ? window.tracoExportar.escolher('📄 Relatório do projeto', relatorio) : relatorio());
    desenhaCompras(p, cp, tot, semPreco);
    cartaoQuadro(p);
  }
  let tR = 0; const pede = () => { clearTimeout(tR); tR = setTimeout(atualizaResumo, 120); };
  for (const ev of ['traco-projeto', 'traco-prj-aba', 'traco-compras']) document.addEventListener(ev, pede);
  new MutationObserver(pede).observe($('prjCalc'), { childList: true, characterData: true, subtree: true });
  painel.addEventListener('input', pede); painel.addEventListener('change', pede); painel.addEventListener('click', () => setTimeout(pede, 300));

  // ---------- 3a) lista de compras ----------
  const caixaCompras = document.createElement('div'); caixaCompras.id = 'prjCompras';
  $('prjComp').after(caixaCompras);
  function desenhaCompras(p, cp, tot, semPreco) {
    if (!cp.length) { caixaCompras.innerHTML = ''; return; }
    caixaCompras.innerHTML = `<div class="prj-compras"><b>🛒 Lista de compras</b>
      <table>${cp.map((c) => `<tr><td>${c.qtd}×</td><td>${esc(c.nome)}${c.loja ? `<small>${c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener">${esc(c.loja)}</a>` : esc(c.loja)}</small>` : ''}</td>
        <td class="v">${c.sub != null ? brl(c.sub) : `<button type="button" data-pq="${esc(c.nome)}">🔎 preço</button>`}</td></tr>`).join('')}
      <tr class="tot"><td></td><td>Total${semPreco ? ` (${semPreco} sem preço)` : ''}</td><td class="v">${brl(tot)}</td></tr></table>
      <small>Preço da 1ª loja da pesquisa, sem frete. Toque no nome da loja para abrir.</small>
      <button type="button" class="secondary-button" data-puxar>📅 Pôr compras, impressão e montagem no cronograma</button></div>`;
    caixaCompras.querySelectorAll('[data-pq]').forEach((b) => (b.onclick = () => window.tracoProjetos.pesquisar(b.dataset.pq)));
    caixaCompras.querySelector('[data-puxar]').onclick = () => { puxar(); vaiAba('crono'); };
  }

  // ---------- 3b) puxar do projeto para o cronograma ----------
  function puxar() {
    const p = P(), S = p.spec || {}, grupos = [];
    const ent = window.tracoCanvas?.notas(p, 'entregas') || [];
    if (ent.length) grupos.push({ grupo: 'Entregas (Canvas)', itens: ent.map((n) => ({ nome: n.t.slice(0, 100) })) });
    if ((S.componentes || []).length) grupos.push({ grupo: 'Compras', itens: S.componentes.map((c) => ({ nome: `Comprar ${c.nome}`.slice(0, 100), pred: '' })) });
    if ((S.pecas || []).length) grupos.push({ grupo: 'Impressão 3D', itens: S.pecas.map((pc) => ({ nome: `Imprimir ${pc.nome}`.slice(0, 100) })) });
    if ((S.montagem || []).length) grupos.push({ grupo: 'Montagem', itens: S.montagem.map((x) => ({ nome: String(x).slice(0, 100) })) });
    if (!grupos.length) { alert('Ainda não há entregas no Canvas nem peças/compras geradas para puxar.'); return 0; }
    const n = window.tracoCrono?.puxar(grupos) || 0;
    // a montagem começa quando terminam as compras e a impressão
    const T = p.crono?.tarefas || [], ultimo = (g) => { const i = T.findIndex((t) => t.nivel === 1 && t.nome === g); if (i < 0) return null; let j = i; while (T[j + 1]?.nivel > 1) j++; return j > i ? j + 1 : null; };
    const im = T.findIndex((t) => t.nivel === 1 && t.nome === 'Montagem');
    if (im >= 0 && T[im + 1]?.nivel > 1 && !String(T[im + 1].pred || '').trim()) { T[im + 1].pred = ['Compras', 'Impressão 3D'].map(ultimo).filter(Boolean).join(';'); salvar(); }
    setTimeout(() => { const m = $('croMsg'); if (m) m.textContent = n ? `🔗 ${n} tarefa(s) puxadas do projeto com 1 dia cada — ajuste as durações e as predecessoras.` : 'Nada novo para puxar: essas tarefas já estão no cronograma.'; }, 50);
    return n;
  }
  const barraCro = painel.querySelector('.cro .cro-barra');
  if (barraCro) { const b = document.createElement('button'); b.type = 'button'; b.textContent = '🔗 Puxar do projeto'; b.title = 'Entregas do Canvas, compras, impressão das peças e montagem'; b.onclick = puxar; barraCro.querySelector('[data-c=ia]').before(b); }

  // ---------- 4) quadro ligado ----------
  const abrirQ = document.createElement('button'); abrirQ.type = 'button'; abrirQ.className = 'secondary-button prj-abreq'; abrirQ.textContent = 'Abrir quadro ↗';
  $('prjQuadro').after(abrirQ);
  abrirQ.onclick = () => { const id = $('prjQuadro').value; if (id) window.tracoRascunhos?.abrirQuadro(id); };
  function cartaoQuadro() { abrirQ.hidden = !$('prjQuadro').value; }

  // ---------- 2) assistente para começar ----------
  const ass = document.createElement('div'); ass.className = 'prj-ass'; ass.hidden = true;
  const ideiaBox = painel.querySelector('.prj-ideia'); ideiaBox.before(ass);
  const PASSOS = [
    ['prjIdeia', 'Qual é o projeto?', 'Conte com suas palavras o que você quer criar e para que serve.', true],
    ['prjPedido', 'O que precisa ser impresso em 3D?', 'Se ainda não sabe, pode pular: a IA sugere as peças.', false],
    ['prjMedidas', 'Já tem alguma medida real?', 'Medidas das peças compradas (placas, motores, parafusos). Pode pular: a IA marca o que estimar em vermelho.', false],
  ];
  let passo = 0, ativoId = null;
  function mostraAssistente() {
    const p = P(), vazio = p && !p.semAssistente && (ativoId === p.id || (!p.spec && !(p.ideia || '').trim() && !(p.pedido || '').trim()));
    if (vazio) ativoId = p.id;
    ass.hidden = !vazio; ideiaBox.classList.toggle('com-ass', vazio);
    if (!vazio) return;
    if (passo >= PASSOS.length) passo = 0;
    const [id, tit, sub, obrig] = PASSOS[passo];
    ass.innerHTML = `<div class="prj-ass-topo"><span>Passo ${passo + 1} de ${PASSOS.length}</span><button type="button" data-x>Preencher tudo de uma vez</button></div>
      <h3>${tit}</h3><p>${sub}</p><textarea rows="4" id="assTxt">${esc($(id).value)}</textarea>
      <div class="ras-acoes">${passo ? '<button type="button" class="secondary-button" data-v>← Voltar</button>' : ''}${obrig ? '' : '<button type="button" class="secondary-button" data-pula>Pular</button>'}
        <button type="button" class="primary-button" data-ok>${passo === PASSOS.length - 1 ? '🧩 Gerar peças 3D' : 'Próximo →'}</button></div>`;
    const ta = ass.querySelector('#assTxt'); setTimeout(() => ta.focus(), 30);
    const grava = () => { $(id).value = ta.value; $(id).dispatchEvent(new Event('input', { bubbles: true })); };
    ass.querySelector('[data-x]').onclick = () => { grava(); p.semAssistente = true; salvar(); mostraAssistente(); };
    ass.querySelector('[data-v]')?.addEventListener('click', () => { grava(); passo--; mostraAssistente(); });
    ass.querySelector('[data-pula]')?.addEventListener('click', () => { passo++; if (passo >= PASSOS.length) fim(); else mostraAssistente(); });
    ass.querySelector('[data-ok]').onclick = () => {
      if (obrig && ta.value.trim().length < 3) { ta.focus(); ta.classList.add('falta'); return; }
      grava(); passo++; if (passo >= PASSOS.length) fim(); else mostraAssistente();
    };
    function fim() { p.semAssistente = true; salvar(); passo = 0; mostraAssistente(); window.tracoProjetos.gerar(); }
  }
  document.addEventListener('traco-projeto', () => { passo = 0; mostraAssistente(); });

  // ---------- 5) relatório do projeto ----------
  function relatorio(sec) {
    const tem = (k) => !sec || sec.includes(k);
    const p = P(), S = (tem('pecas') && p.spec) || {}, m = window.tracoProjetos.malhas?.() || [];
    let img3d = ''; try { const cv = $('prjCanvas'); if (cv.width > 10 && S.pecas) img3d = cv.toDataURL('image/png'); } catch { /* */ }
    const cp = tem('compras') ? compras(p) : [], tot = cp.reduce((s, c) => s + (c.sub || 0), 0), cr = window.tracoCrono?.resumo(p);
    const blocos = window.tracoCanvas?.BLOCOS || [];
    const crono = tem('crono') ? window.tracoCrono?.html(p) || '' : '', pdm = tem('pdm') ? window.tracoPdm?.html(p) || '' : '', custos = tem('custos') ? window.tracoCustos?.html(p) || '' : '';
    const lista = (arr) => (arr || []).length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.nome)} — relatório do projeto</title>
<style>body{font:14px/1.45 -apple-system,Segoe UI,Arial,sans-serif;color:#111;margin:24px;max-width:1100px}h1{font-size:26px;margin:0}h2{font-size:18px;margin:26px 0 8px;border-bottom:2px solid #d76845;padding-bottom:4px}
.sub{color:#666}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.kpis div{border:1px solid #ddd;border-radius:10px;padding:8px 10px}.kpis b{display:block;font-size:16px}.kpis small{color:#666}
table{border-collapse:collapse;width:100%;font-size:12.5px}td,th{border:1px solid #ddd;padding:5px 6px;text-align:left;vertical-align:top}th{background:#f4f5f1}
.canvas{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.bl{border:1.5px solid #ccc;border-radius:8px;padding:6px;font-size:12px}.bl b{display:block;font-size:12.5px;margin-bottom:4px}.bl i{display:block;background:#ffe57a;margin:3px 0;padding:3px 5px;font-style:normal;border-radius:3px}
.est{color:#a33b1e;font-weight:700}.img3d{max-width:100%;border:1px solid #ddd;border-radius:10px}.rel-crono input{border:0;background:none;font:inherit;width:auto}.rel-crono table{font-size:11.5px}.rel-gantt,.rel-pdm{overflow:auto;border:1px solid #ddd;border-radius:8px;margin-top:8px}
.rel-crono button,.rel-pdmres button{display:none}.cus-rel>div:first-child{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.cus-kpi{border:1px solid #ddd;border-radius:8px;padding:6px 8px}.cus-kpi small,.cus-kpi em{display:block;font-size:11px;color:#666;font-style:normal}.cus-kpi b{font-size:14px}.cus-leg span{margin-left:10px;font-size:12px}.cus-leg i{display:inline-block;width:12px;height:4px;margin-right:4px;vertical-align:middle}.bar{position:sticky;top:0;background:#fff;padding:8px 0;margin-bottom:8px}.bar button{font:700 14px Arial;padding:9px 14px;border-radius:9px;border:1px solid #ccc;background:#111;color:#fff}
@media print{.bar{display:none}body{margin:10mm}h2{break-after:avoid}.kpis{grid-template-columns:repeat(4,1fr)}}</style></head><body>
<div class="bar"><button onclick="print()">🖨️ Imprimir / salvar PDF</button></div>
<h1>${esc(p.nome)}</h1><p class="sub">Relatório do projeto · ${new Date().toLocaleDateString('pt-BR')} · Traço</p>
<div class="kpis"><div><small>Peças 3D</small><b>${(S.pecas || []).length || '—'}</b></div><div><small>Compras</small><b>${tot ? brl(tot) : '—'}</b></div><div><small>Prazo</small><b>${cr ? `${cr.ini} → ${cr.fim}` : '—'}</b></div><div><small>Concluído</small><b>${cr ? cr.pct + '%' : '—'}</b></div></div>
<h2>Ideia</h2><p>${esc(p.ideia || '—').replace(/\n/g, '<br>')}</p>${p.pedido ? `<p><b>O que imprimir:</b> ${esc(p.pedido)}</p>` : ''}${S.resumo ? `<p>${esc(S.resumo)}</p>` : ''}
${tem('canvas') && blocos.some(([k]) => window.tracoCanvas.notas(p, k).length) ? `<h2>Project Model Canvas</h2><div class="canvas">${blocos.map(([k, t, ic]) => `<div class="bl"><b>${ic} ${esc(t)}</b>${window.tracoCanvas.notas(p, k).map((n) => `<i>${esc(n.t)}</i>`).join('')}</div>`).join('')}</div>` : ''}
${S.pecas ? `<h2>Peças 3D</h2>${img3d ? `<img class="img3d" src="${img3d}" alt="3D">` : ''}<table><tr><th>Peça</th><th>Tamanho (mm)</th><th>Volume</th><th>Como imprimir</th></tr>${S.pecas.map((pc, i) => { const x = m.find((q) => q.i === i); return `<tr><td>${esc(pc.nome)}</td><td>${x?.bb ? `${Math.round(x.bb[3] - x.bb[0])} × ${Math.round(x.bb[4] - x.bb[1])} × ${Math.round(x.bb[5] - x.bb[2])}` : '—'}</td><td>${x?.vol ? `${(x.vol / 1000).toFixed(1).replace('.', ',')} cm³ · ≈ ${Math.round(x.vol / 1000 * 1.24)} g` : '—'}</td><td>${esc(pc.impressao || '')}</td></tr>`; }).join('')}</table>
<h2>Medidas do projeto</h2><table><tr><th>Medida</th><th>Valor</th><th>Origem</th></tr>${(S.parametros || []).map((x) => `<tr><td>${esc(x.nome || x.id)}</td><td>${esc(p.valores?.[x.id] ?? x.valor)} ${esc(x.unidade || 'mm')}</td><td class="${x.origem === 'estimado' ? 'est' : ''}">${x.origem === 'estimado' ? 'estimado — conferir' : esc(x.origem || '')}</td></tr>`).join('')}</table>` : ''}
${cp.length ? `<h2>Lista de compras</h2><table><tr><th>Qtd</th><th>Item</th><th>Loja</th><th>Subtotal</th></tr>${cp.map((c) => `<tr><td>${c.qtd}</td><td>${esc(c.nome)}</td><td>${c.link ? `<a href="${esc(c.link)}">${esc(c.loja)}</a>` : esc(c.loja || '—')}</td><td>${c.sub != null ? brl(c.sub) : 'sem preço'}</td></tr>`).join('')}<tr><th colspan="3">Total (sem frete)</th><th>${brl(tot)}</th></tr></table>` : ''}
${crono ? `<h2>Cronograma</h2>${crono}` : ''}
${pdm ? `<h2>Diagrama de precedência</h2>${pdm}` : ''}
${custos && window.tracoCustos.resumo(p) ? `<h2>Custos e Curva S</h2><div class="cus-rel">${custos}</div>` : ''}
${tem('agil') && window.tracoAgil?.html(p) ? `<h2>Ágil — backlog e sprints</h2>${window.tracoAgil.html(p)}` : ''}
${(S.montagem || []).length ? `<h2>Montagem</h2><ol>${S.montagem.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
${(S.conferir || []).length ? `<h2>Conferir antes de imprimir</h2>${lista(S.conferir)}` : ''}
</body></html>`;
    const u = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const w = window.open(u, '_blank');
    if (!w) { const a = document.createElement('a'); a.href = u; a.download = `relatorio-${p.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').toLowerCase()}.html`; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  }

  // primeira carga
  setTimeout(() => { mostraAssistente(); atualizaResumo(); }, 400);
})();
