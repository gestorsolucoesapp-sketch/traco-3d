// 🧾 Exportar o projeto inteiro em HTML EDITÁVEL (abre em qualquer navegador) + importar de volta no Traço.
(() => {
  const $ = (id) => document.getElementById(id);
  const painel = $('projetosMode'); if (!painel || !window.tracoProjetos) return;
  const P = () => window.tracoProjetos.atual();
  const slug = (t) => String(t || 'projeto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').toLowerCase();
  const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

  // ---------- a página exportada (roda sozinha, sem o Traço) ----------
  function pagina() {
    const D = JSON.parse(document.getElementById('traco-dados').textContent);
    const M = JSON.parse(document.getElementById('traco-meta').textContent);
    const app = document.getElementById('app');
    let sujo = false;
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const num = (t) => { if (typeof t === 'number') return t; const s = String(t ?? '').replace(/[R$\s]/g, ''); const v = parseFloat(/,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')); return Number.isFinite(v) ? v : 0; };
    const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const id = () => Math.random().toString(36).slice(2, 9);
    const pega = (p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), D);
    const poe = (p, v) => { const ks = p.split('.'), u = ks.pop(); const o = ks.reduce((o, k) => (o[k] ??= /^\d+$/.test(k) ? [] : {}), D); o[u] = v; };
    const ta = (p, ph = '', cls = '') => `<textarea data-p="${p}" class="${cls}" rows="1" placeholder="${esc(ph)}">${esc(pega(p))}</textarea>`;
    const inp = (p, cls = '', tipo = 'text') => `<input data-p="${p}" class="${cls}" ${tipo === 'num' ? 'inputmode="decimal"' : tipo === 'date' ? 'type="date"' : ''} value="${esc(pega(p))}">`;
    const marca = () => { sujo = true; document.getElementById('estado').textContent = '● alterações não salvas'; document.getElementById('estado').className = 'sujo'; };

    function render() {
      const S = D.spec || {}, cv = D.canvas || {}, C = D.crono, L = D.pdm?.linhas, A = D.custos;
      app.innerHTML = `
      <header class="topo"><input data-p="nome" class="titulo" value="${esc(D.nome)}"><p class="sub">Projeto exportado do Traço em ${esc(M.data)} · tudo que está em caixa é editável</p></header>
      <h2>Ideia</h2>${ta('ideia', 'Descreva a ideia do projeto')}
      ${D.pedido || S.pecas ? `<label>O que imprimir</label>${ta('pedido')}` : ''}${D.medidas ? `<label>Medidas informadas</label>${ta('medidas')}` : ''}
      <h2>Project Model Canvas <small>✓ = feito</small></h2>
      <div class="canvas">${M.blocos.map(([k, t, ic, q, c, l, a]) => { const n = cv[k] || [], f = n.filter((x) => x.ok).length;
        return `<section class="bl" style="grid-column:${c};grid-row:${l} / span ${a}"><header><span>${ic}</span><div><b>${esc(t)}</b><small>${esc(q)}${f ? ` · <em>✓ ${f}/${n.length}</em>` : ''}</small></div><button class="mais" data-add="canvas.${k}" title="Novo post-it">＋</button></header>
        ${n.map((x, i) => `<div class="nota${x.ok ? ' ok' : ''}" style="background:${x.ia ? M.cor.ia : M.cor.usuario}"><button class="chk" data-ok="canvas.${k}.${i}">${x.ok ? '✓' : ''}</button>${ta(`canvas.${k}.${i}.t`)}<button class="x" data-del="canvas.${k}.${i}">×</button></div>`).join('')}</section>`; }).join('')}</div>
      ${(S.parametros || []).length ? `<h2>Medidas do projeto</h2><table><tr><th>Medida</th><th>Valor</th><th>Un.</th><th>Origem</th></tr>${S.parametros.map((x) => { D.valores ||= {}; if (D.valores[x.id] == null) D.valores[x.id] = x.valor;
        return `<tr><td>${esc(x.nome || x.id)}</td><td>${inp(`valores.${x.id}`, 'n', 'num')}</td><td>${esc(x.unidade || 'mm')}</td><td class="${x.origem === 'estimado' ? 'est' : ''}">${x.origem === 'estimado' ? 'estimado — conferir' : esc(x.origem || '')}</td></tr>`; }).join('')}</table>` : ''}
      ${(S.pecas || []).length ? `<h2>Peças 3D</h2>${M.img3d ? `<img class="img3d" src="${M.img3d}" alt="3D">` : ''}<table><tr><th>Peça</th><th>Como imprimir</th></tr>${S.pecas.map((pc, i) => `<tr><td>${esc(pc.nome)}</td><td>${ta(`spec.pecas.${i}.impressao`)}</td></tr>`).join('')}</table>` : ''}
      ${M.compras ? `<h2>Lista de compras</h2>${M.compras}` : ''}
      ${C ? `<h2>Cronograma</h2><p class="obs">Início ${inp('crono.inicio', 'curto')} · predecessoras pelo nº da linha (ex.: 2;3); “Início fixo” = não começa antes dessa data (deixe vazio para automático). As datas e o Gantt recalculam quando você importar de volta no Traço.</p>
        <table class="crono"><tr><th>#</th><th>Tarefa</th><th>Nível</th><th>Dias</th><th>Pred.</th><th>Início fixo</th><th>%</th><th>Resp.</th><th></th></tr>${C.tarefas.map((t, i) => `<tr><td>${i + 1}</td><td style="padding-left:${(t.nivel - 1) * 16 + 6}px">${inp(`crono.tarefas.${i}.nome`, 'larga')}</td><td>${inp(`crono.tarefas.${i}.nivel`, 'cur', 'num')}</td><td>${inp(`crono.tarefas.${i}.dur`, 'cur', 'num')}</td><td>${inp(`crono.tarefas.${i}.pred`, 'cur')}</td><td>${inp(`crono.tarefas.${i}.ini`, 'dt', 'date')}</td><td>${inp(`crono.tarefas.${i}.pct`, 'cur', 'num')}</td><td>${inp(`crono.tarefas.${i}.resp`)}</td><td><button class="x" data-deltar="${i}">×</button></td></tr>`).join('')}</table>
        <button class="mais lin" data-addtar>＋ Tarefa</button>${M.gantt ? `<details><summary>Gantt (como estava ao exportar)</summary>${M.gantt}</details>` : ''}` : ''}
      ${L ? `<h2>Diagrama de precedência</h2><table><tr><th>ID</th><th>Atividade</th><th>Duração</th><th>Predecessoras</th><th></th></tr>${L.map((l, i) => `<tr><td>${inp(`pdm.linhas.${i}.id`, 'cur')}</td><td>${inp(`pdm.linhas.${i}.desc`, 'larga')}</td><td>${inp(`pdm.linhas.${i}.dur`, 'cur', 'num')}</td><td>${inp(`pdm.linhas.${i}.pred`, 'cur')}</td><td><button class="x" data-del="pdm.linhas.${i}">×</button></td></tr>`).join('')}</table>
        <button class="mais lin" data-addpdm>＋ Atividade</button>${M.pdm ? `<details><summary>Rede (como estava ao exportar)</summary>${M.pdm}</details>` : ''}` : ''}
      ${A ? `<h2>Custos</h2><p class="obs">Contingência ${inp('custos.cont', 'cur', 'num')} % · a Curva S recalcula quando você importar de volta no Traço.</p>
        <div class="rola"><table class="cus"><tr><th>Categoria</th><th>Descrição</th><th>Qtd</th><th>Un.</th><th>V. unit.</th><th>Total</th><th>Tipo</th><th>Mês</th><th>Gasto real</th><th>Premissa</th><th></th></tr>${A.itens.map((it, i) => `<tr><td>${inp(`custos.itens.${i}.cat`)}</td><td>${inp(`custos.itens.${i}.desc`, 'larga')}</td><td>${inp(`custos.itens.${i}.qtd`, 'cur', 'num')}</td><td>${inp(`custos.itens.${i}.un`, 'cur')}</td><td>${inp(`custos.itens.${i}.vu`, 'med', 'num')}</td><td class="v" data-tot="${i}"></td><td><select data-p="custos.itens.${i}.tipo">${['CAPEX', 'OPEX'].map((o) => `<option ${it.tipo === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td><td>${inp(`custos.itens.${i}.mes`, 'cur', 'num')}</td><td>${inp(`custos.itens.${i}.real`, 'med', 'num')}</td><td>${ta(`custos.itens.${i}.premissa`)}</td><td><button class="x" data-del="custos.itens.${i}">×</button></td></tr>`).join('')}</table></div>
        <button class="mais lin" data-addcus>＋ Item</button><div class="tots" id="tots"></div>${M.curva ? `<details><summary>Curva S e indicadores (como estavam ao exportar)</summary>${M.curva}</details>` : ''}` : ''}
      ${(S.montagem || []).length ? `<h2>Montagem</h2><ol>${S.montagem.map((_, i) => `<li>${ta(`spec.montagem.${i}`)}</li>`).join('')}</ol>` : ''}
      ${(S.conferir || []).length ? `<h2>Conferir antes de imprimir</h2><ul>${S.conferir.map((_, i) => `<li>${ta(`spec.conferir.${i}`)}</li>`).join('')}</ul>` : ''}`;
      app.querySelectorAll('textarea').forEach(cresce); totais();
    }
    function cresce(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; }
    function totais() {
      const A = D.custos; if (!A) return; let sub = 0, real = 0, cap = 0;
      A.itens.forEach((it, i) => { const t = num(it.qtd) * num(it.vu); sub += t; real += num(it.real); if (it.tipo === 'CAPEX') cap += t; const c = app.querySelector(`[data-tot="${i}"]`); if (c) c.textContent = brl(t); });
      const cont = sub * num(A.cont) / 100, el = document.getElementById('tots');
      if (el) el.innerHTML = `<div><small>Itens</small><b>${brl(sub)}</b></div><div><small>Contingência</small><b>${brl(cont)}</b></div><div><small>Orçamento total</small><b>${brl(sub + cont)}</b></div><div><small>Gasto real</small><b>${brl(real)}</b></div><div><small>CAPEX / OPEX</small><b>${brl(cap)} / ${brl(sub - cap)}</b></div>`;
    }
    app.addEventListener('input', (e) => {
      const el = e.target, p = el.dataset.p; if (!p) return;
      let v = el.value; if (/\.(nivel|dur|pct|qtd|mes)$/.test(p) && v.trim() !== '' && Number.isFinite(num(v))) v = num(v);
      if (/^custos\.itens\.\d+\.(vu|qtd|real)$/.test(p)) pega(p.replace(/\.\w+$/, '')).origem = 'informado';
      if (/\.t$/.test(p) && p.startsWith('canvas.')) { pega(p.replace(/\.t$/, '')).ia = false; el.parentElement.style.background = M.cor.usuario; }
      poe(p, v); marca(); if (el.tagName === 'TEXTAREA') cresce(el); if (p.startsWith('custos')) totais(); if (p === 'nome') document.title = v;
    });
    app.addEventListener('change', (e) => { if (/\.nivel$/.test(e.target.dataset.p || '')) render(); });
    app.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
      if (d.ok) { const n = pega(d.ok); n.ok = !n.ok; }
      else if (d.add) { const l = d.add.split('.')[1]; D.canvas ||= {}; (D.canvas[l] ||= []).push({ id: id(), t: '', ia: false }); }
      else if (d.del) { if (!confirm('Apagar esta linha?')) return; const ks = d.del.split('.'), i = +ks.pop(); pega(ks.join('.')).splice(i, 1); }
      else if (d.deltar) { if (!confirm('Apagar esta tarefa?')) return; const T = D.crono.tarefas, n = +d.deltar + 1; T.splice(n - 1, 1);
        T.forEach((t) => { t.pred = String(t.pred || '').split(/[;,\s]+/).filter(Boolean).map(Number).filter((x) => x !== n).map((x) => (x > n ? x - 1 : x)).join(';'); }); }
      else if ('addtar' in d) { const T = D.crono.tarefas; T.push({ id: id(), nome: 'Nova tarefa', nivel: T[T.length - 1]?.nivel || 1, dur: 1, pred: T.length ? String(T.length) : '', pct: 0, resp: '' }); }
      else if ('addpdm' in d) { const L = D.pdm.linhas; let k = 0, nid; do { nid = k < 26 ? String.fromCharCode(65 + k) : 'A' + String.fromCharCode(65 + (k % 26)); k++; } while (L.some((l) => String(l.id).toUpperCase() === nid)); L.push({ id: nid, desc: '', dur: '', pred: L[L.length - 1]?.id || '' }); }
      else if ('addcus' in d) D.custos.itens.push({ id: id(), cat: 'Outros', desc: '', qtd: 1, un: 'un', vu: '', tipo: 'OPEX', mes: 1, tarefa: '', pct: 0, real: '', premissa: '', origem: 'informado' });
      else return;
      marca(); const y = scrollY; render(); scrollTo(0, y);
      if (d.add || 'addtar' in d || 'addpdm' in d || 'addcus' in d) { const sel = d.add ? `[data-p^="canvas.${d.add.split('.')[1]}."]` : 'addtar' in d ? '[data-p^="crono.tarefas."][data-p$=".nome"]' : 'addpdm' in d ? '[data-p^="pdm.linhas."][data-p$=".desc"]' : '[data-p^="custos.itens."][data-p$=".desc"]'; const c = [...app.querySelectorAll(sel)].pop(); c?.focus(); c?.select?.(); }
    });
    document.getElementById('salvar').onclick = () => {
      D.quando = Date.now(); document.getElementById('traco-dados').textContent = JSON.stringify(D).replace(/</g, '\\u003c');
      const c = document.documentElement.cloneNode(true); c.querySelector('#app').innerHTML = ''; c.querySelector('#estado').textContent = ''; c.querySelector('#estado').className = '';
      const u = URL.createObjectURL(new Blob(['<!DOCTYPE html>\n' + c.outerHTML], { type: 'text/html' })), a = document.createElement('a');
      a.href = u; a.download = `${M.arquivo}.html`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000);
      sujo = false; document.getElementById('estado').textContent = '✓ salvo — leve este arquivo de volta no Traço: Projetos → 📥 Importar'; document.getElementById('estado').className = 'ok';
    };
    document.getElementById('imprimir').onclick = () => { document.querySelectorAll('details').forEach((x) => (x.open = true)); print(); };
    addEventListener('beforeunload', (e) => { if (sujo) { e.preventDefault(); e.returnValue = ''; } });
    render();
  }

  // ---------- montar e baixar ----------
  function exportar() {
    const p = P(); if (!p) return;
    const D = JSON.parse(JSON.stringify(p));
    let img3d = ''; try { const cv = $('prjCanvas'); if (cv?.width > 10 && p.spec?.pecas) img3d = cv.toDataURL('image/jpeg', 0.85); } catch { /* */ }
    const tira = (h) => (h || '').replace(/<button[\s\S]*?<\/button>/g, '').replace(/<input([^>]*)value="([^"]*)"[^>]*>/g, '$2');
    const crono = window.tracoCrono?.calc(p) ? window.tracoCrono.html(p) : '', gantt = (/<div class="rel-gantt"[\s\S]*$/.exec(crono) || [''])[0];
    let compras = '';
    try { const tb = [...document.querySelectorAll('#projetosMode table')].find((t) => /Subtotal|Total \(sem frete\)/i.test(t.textContent)); if (tb) compras = tira(tb.outerHTML); } catch { /* */ }
    const M = {
      data: new Date().toLocaleString('pt-BR'), arquivo: `projeto-${slug(p.nome)}`,
      blocos: window.tracoCanvas?.BLOCOS || [], cor: { usuario: '#ffe57a', ia: '#bfe0ff' }, img3d, compras,
      gantt: tira(gantt), pdm: tira(window.tracoPdm?.html(p) || ''), curva: window.tracoCustos?.resumo(p) ? tira(window.tracoCustos.html(p)) : '',
    };
    if (!D.canvas && M.blocos.length) D.canvas = {};
    const css = `*{box-sizing:border-box}body{font:14px/1.45 -apple-system,Segoe UI,Arial,sans-serif;color:#111;margin:0 auto;padding:0 18px 40px;max-width:1200px;background:#fafaf7}
.barra{position:sticky;top:0;z-index:5;background:#fafaf7ee;backdrop-filter:blur(6px);padding:10px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #e3e3dc}
.barra button{font:700 14px Arial;padding:9px 14px;border-radius:9px;border:1px solid #ccc;background:#fff;cursor:pointer}.barra #salvar{background:#d76845;border-color:#d76845;color:#fff}
#estado{font-size:12.5px;color:#666}#estado.sujo{color:#b4521f;font-weight:700}#estado.ok{color:#1f9d55;font-weight:700}
.titulo{font:800 28px Manrope,Arial,sans-serif;border:0;background:none;width:100%;padding:14px 0 0}.sub{color:#777;margin:2px 0 0;font-size:12.5px}
h2{font-size:18px;margin:28px 0 8px;border-bottom:2px solid #d76845;padding-bottom:4px}h2 small{font-weight:400;color:#888;font-size:12px}label{display:block;font-weight:700;margin:10px 0 3px;font-size:12.5px;color:#555}
textarea,input,select{font:inherit;border:1px solid #d8d8d0;border-radius:7px;padding:5px 7px;background:#fff;width:100%;resize:none}textarea:focus,input:focus,select:focus{outline:2px solid #d7684566;border-color:#d76845}
input.cur{width:64px}input.dt{width:140px}input.med{width:92px}input.curto{width:130px;display:inline-block}input.n{width:110px}.obs{color:#666;font-size:12.5px}
.canvas{display:grid;grid-template-columns:repeat(5,minmax(170px,1fr));grid-auto-rows:minmax(110px,auto);gap:8px;overflow:auto}
.bl{border:1.5px solid #d6d6cf;border-radius:12px;padding:8px;background:#fff;display:flex;flex-direction:column;gap:6px}.bl header{display:flex;gap:6px;align-items:flex-start}.bl header div{flex:1}.bl header b{display:block;font-size:13px}.bl header small{color:#888;font-size:11px;text-transform:uppercase}.bl header em{color:#1f9d55;font-style:normal;font-weight:800}
.nota{position:relative;border-radius:4px;box-shadow:0 2px 5px #0002;padding:5px 20px 3px 28px}.nota textarea{border:0;background:transparent;padding:0;font-weight:600;font-size:12.5px;line-height:1.3}
.nota.ok textarea{text-decoration:line-through;color:#0008}.chk{position:absolute;left:5px;top:5px;width:18px;height:18px;padding:0;border:2px solid #0006;border-radius:5px;background:#fff9;color:#fff;font:900 12px/14px Arial;cursor:pointer}.nota.ok .chk{background:#1f9d55;border-color:#1f9d55}
.x{border:0;background:transparent;color:#0007;font-size:16px;cursor:pointer;padding:0 4px}.nota .x{position:absolute;top:1px;right:2px}
.mais{border:0;background:#111;color:#fff;border-radius:7px;width:26px;height:26px;font-size:16px;cursor:pointer}.mais.lin{width:auto;height:auto;padding:7px 12px;margin-top:6px;font:700 13px Arial}
table{border-collapse:collapse;width:100%;font-size:12.5px;background:#fff}td,th{border:1px solid #e0e0d8;padding:4px 5px;text-align:left;vertical-align:middle}th{background:#f1f1ea;font-size:12px}td select{min-width:82px}td input,td textarea,td select{border-color:transparent;background:transparent}td input:hover,td textarea:hover{border-color:#ddd}
td.v{white-space:nowrap;font-weight:700;text-align:right}.est{color:#a33b1e;font-weight:700}input.larga{min-width:200px}.rola{overflow:auto}.cus td:nth-child(10){min-width:200px}
.tots{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:10px}.tots div{border:1px solid #ddd;border-radius:10px;padding:8px 10px;background:#fff}.tots small{display:block;color:#666;font-size:11.5px}.tots b{font-size:15px}
details{margin-top:10px;border:1px solid #e0e0d8;border-radius:10px;padding:6px 10px;background:#fff}summary{cursor:pointer;font-weight:700;color:#555}details>div{overflow:auto}.img3d{max-width:100%;border:1px solid #ddd;border-radius:10px}
ol li,ul li{margin:4px 0}.cus-kpi{border:1px solid #ddd;border-radius:8px;padding:6px 8px;display:inline-block;margin:3px}.cus-kpi small,.cus-kpi em{display:block;font-size:11px;color:#666;font-style:normal}
@media(max-width:760px){.canvas{grid-template-columns:repeat(5,230px)}.tots{grid-template-columns:repeat(2,1fr)}}
@media print{.barra,.x,.mais,.chk:empty{display:none}body{background:#fff;padding:0}textarea,input,select{border:0!important;padding:0}h2{break-after:avoid}.bl{break-inside:avoid}}`;
    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${p.nome.replace(/[<&]/g, '')}</title><style>${css}</style></head><body>
<div class="barra"><button id="salvar">💾 Salvar HTML</button><button id="imprimir">🖨️ Imprimir / PDF</button><span id="estado"></span></div>
<main id="app"></main>
<script type="application/json" id="traco-dados">${json(D)}</script>
<script type="application/json" id="traco-meta">${json(M)}</script>
<script>(${pagina.toString()})();</script>
</body></html>`;
    const u = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a'); a.href = u; a.download = `${M.arquivo}.html`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
    aviso(`📤 Baixei <b>${M.arquivo}.html</b>. Abra no navegador, edite e toque em 💾 Salvar HTML. Depois traga de volta com 📥 Importar.`);
  }

  // ---------- importar de volta ----------
  const arq = document.createElement('input'); arq.type = 'file'; arq.accept = '.html,.htm,text/html'; arq.hidden = true; document.body.appendChild(arq);
  arq.onchange = async () => {
    const f = arq.files[0]; arq.value = ''; if (!f) return;
    try {
      const t = await f.text(), m = /<script type="application\/json" id="traco-dados">([\s\S]*?)<\/script>/.exec(t);
      if (!m) throw new Error('Esse arquivo não é um projeto exportado pelo Traço.');
      const d = JSON.parse(m[1]); if (!d?.id || !d.nome) throw new Error('Arquivo incompleto.');
      const r = window.tracoProjetos.importar(d);
      aviso(r === 'atualizado' ? `✓ Projeto <b>${d.nome}</b> atualizado com o que você editou no HTML.` : `✓ Projeto <b>${d.nome}</b> importado.`);
    } catch (e) { aviso('⚠️ ' + (e.message || 'Não consegui ler o arquivo.')); }
  };
  function aviso(h) { const m = $('prjMsg'); if (m) { m.innerHTML = h; m.scrollIntoView({ block: 'nearest' }); } }

  // botões na barra do projeto (ao lado de ＋ Novo)
  const novo = painel.querySelector('[data-q=novo]');
  if (novo) {
    const bi = document.createElement('button'); bi.type = 'button'; bi.textContent = '📥 Importar'; bi.title = 'Trazer de volta um projeto exportado em HTML'; bi.onclick = () => arq.click();
    const be = document.createElement('button'); be.type = 'button'; be.textContent = '📤 HTML'; be.title = 'Exportar o projeto inteiro em HTML editável'; be.onclick = exportar;
    novo.parentElement.appendChild(be); novo.parentElement.appendChild(bi);
  }
  window.tracoExportar = { exportar, importar: () => arq.click() };
})();
