// 💰 Custos do projeto: análise de custos editável (com premissas), resumo por categoria, contingência,
// Curva S (VP, VA, CR) e valor agregado (IDC, IDP, ENT). Funciona sem cronograma (por mês) e ligado a ele.
(() => {
  const $ = (id) => document.getElementById(id);
  const painel = $('projetosMode'), abas = painel?.querySelector('.prj-abas'); if (!abas) return;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = () => window.tracoProjetos?.atual?.();
  const salvar = () => window.tracoProjetos?.salvar?.();
  const brl = (v) => (Number.isFinite(v) ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—');
  const num = (t) => { if (typeof t === 'number') return t; const s = String(t ?? '').replace(/[R$\s]/g, ''); const v = parseFloat(/,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')); return Number.isFinite(v) ? v : 0; };
  const nfmt = (v) => (v !== '' && v != null && Number.isFinite(+v) ? String(+v).replace('.', ',') : '');
  const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '—');
  const ISO = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const novoId = () => Math.random().toString(36).slice(2, 9);
  const CATS = ['Mão de obra', 'Materiais', 'Equipamentos', 'Serviços', 'Software/TI', 'Treinamento', 'Outros'];
  const COR = { 'Mão de obra': '#2e6fd8', Materiais: '#d76845', Equipamentos: '#8a4fd1', Serviços: '#2e9b5b', 'Software/TI': '#3aa6a6', Treinamento: '#e0a800', Outros: '#888' };
  const ORIG = { estimado: 'estimado', cotado: 'cotado', informado: 'informado' };

  const bt = document.createElement('button'); bt.type = 'button'; bt.dataset.a = 'custos'; bt.textContent = '💰 Custos';
  const cro = abas.querySelector('[data-a=crono]'); (cro?.nextSibling ? abas.insertBefore(bt, cro.nextSibling) : abas.appendChild(bt));
  const area = document.createElement('div'); area.className = 'cus'; area.hidden = true;
  area.innerHTML = `
    <div class="cro-barra">
      <button type="button" class="cro-ia" data-c="ia">✨ Montar análise com IA</button>
      <button type="button" data-c="add">＋ Item de custo</button>
      <button type="button" data-c="compras" title="Itens com os preços pesquisados dos componentes">🛒 Trazer compras</button>
      <label class="cro-chk">Contingência <input type="text" inputmode="decimal" id="cusCont" class="cus-cont" /> %</label>
      <button type="button" data-c="csv">⬇ Excel</button>
    </div>
    <p class="cro-msg" id="cusMsg"></p>
    <div class="cus-kpis" id="cusKpis"></div>
    <div class="cus-dois"><div class="cus-cat" id="cusCat"></div><div class="cus-graf" id="cusGraf"></div></div>
    <h4 class="cus-tit">Análise de custos <small>toque em qualquer campo para editar · vermelho = estimado (confira)</small></h4>
    <div class="cus-tab" id="cusItens"></div>
    <div id="cusObs"></div>`;
  (painel.querySelector('.pdm') || painel.querySelector('.cro')).after(area);
  document.addEventListener('traco-prj-aba', (e) => { area.hidden = e.detail !== 'custos'; if (!area.hidden) { monta(); autoMontar(); } });
  document.addEventListener('traco-projeto', () => { if (!area.hidden) monta(); });

  const A = (p = P()) => { p.custos ||= { itens: [], cont: 10, obs: [] }; return p.custos; };

  // ---------- cálculo ----------
  function calcula(p) {
    const a = A(p), K = window.tracoCrono?.calc(p), T = K?.c.tarefas || [], hoje = K?.hoje || (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
    const ini0 = K ? K.diaDe(0) : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
    const porNome = new Map(T.map((t, i) => [t.nome.trim().toLowerCase(), i]));
    const itens = a.itens.map((it) => {
      const tot = num(it.qtd === '' || it.qtd == null ? 1 : it.qtd) * num(it.vu), ti = it.tarefa ? porNome.get(String(it.tarefa).trim().toLowerCase()) : undefined;
      const temT = ti != null && K && !K.R.resumo[ti];
      const pct = temT ? Math.min(100, Math.max(0, +T[ti].pct || 0)) : Math.min(100, Math.max(0, num(it.pct)));
      return { it, tot, ti: temT ? ti : null, pct, real: num(it.real) };
    });
    // tarefas com custo lançado direto no cronograma (versão anterior) também contam
    const legado = K ? T.map((t, i) => ({ i, o: num(t.custo), r: num(t.real) })).filter((x) => (x.o || x.r) && !K.R.resumo[x.i]) : [];
    const BAC = itens.reduce((s, x) => s + x.tot, 0) + legado.reduce((s, x) => s + x.o, 0);
    const EV = itens.reduce((s, x) => s + x.tot * x.pct / 100, 0) + legado.reduce((s, x) => s + x.o * Math.min(100, +T[x.i].pct || 0) / 100, 0);
    const AC = itens.reduce((s, x) => s + x.real, 0) + legado.reduce((s, x) => s + x.r, 0);
    const reserva = BAC * num(a.cont) / 100;
    // VP no tempo: item de tarefa → dividido nos dias da tarefa; item de mês → no 1º dia daquele mês do projeto
    const ev = [];
    const somaTarefa = (i, v) => { const d = K.R.fim[i] - K.R.ini[i]; if (d <= 0) ev.push([K.diaDe(Math.max(0, K.R.ini[i] - 1)), v]); else for (let k = K.R.ini[i]; k < K.R.fim[i]; k++) ev.push([K.diaDe(k), v / d]); };
    for (const x of itens) { if (!x.tot) continue; if (x.ti != null) somaTarefa(x.ti, x.tot); else { const d = new Date(ini0); d.setMonth(d.getMonth() + Math.max(0, Math.round(num(x.it.mes) || 1) - 1)); ev.push([d, x.tot]); } }
    for (const x of legado) if (x.o) somaTarefa(x.i, x.o);
    ev.sort((u, v) => u[0] - v[0]);
    const pontos = []; let acc = 0; for (const [d, v] of ev) { acc += v; const ult = pontos[pontos.length - 1]; if (ult && ult.dt.getTime() === d.getTime()) ult.vp = acc; else pontos.push({ dt: new Date(d), vp: acc }); }
    let PV = 0; for (const pt of pontos) if (pt.dt <= hoje) PV = pt.vp;
    const CPI = AC ? EV / AC : NaN, SPI = PV ? EV / PV : NaN, EAC = Number.isFinite(CPI) && CPI > 0 ? BAC / CPI : NaN;
    const cat = {}; for (const x of itens) cat[x.it.cat || 'Outros'] = (cat[x.it.cat || 'Outros'] || 0) + x.tot;
    for (const x of legado) cat['Outros'] = (cat['Outros'] || 0) + x.o;
    const capex = itens.filter((x) => x.it.tipo === 'CAPEX').reduce((s, x) => s + x.tot, 0);
    return { a, K, T, itens, legado, BAC, EV, AC, PV, CPI, SPI, EAC, CV: EV - AC, reserva, total: BAC + reserva, pontos, hoje, ini0, cat, capex, opex: BAC - capex, estimados: itens.filter((x) => (x.it.origem || 'estimado') === 'estimado').length };
  }
  function grava(p, X) {
    p.custosHist ||= {}; const k = ISO(X.hoje), v = { va: Math.round(X.EV * 100) / 100, cr: Math.round(X.AC * 100) / 100 }, ant = p.custosHist[k];
    if ((v.va || v.cr) && (!ant || ant.va !== v.va || ant.cr !== v.cr)) { p.custosHist[k] = v; salvar(); }
  }

  // ---------- tela ----------
  function monta() {
    const p = P(); if (!p) return; const X = calcula(p); grava(p, X);
    $('cusCont').value = nfmt(X.a.cont);
    const kpi = (t, v, s, cls = '') => `<div class="cus-kpi ${cls}"><small>${t}</small><b>${v}</b>${s ? `<em>${s}</em>` : ''}</div>`;
    const bom = (x) => (!Number.isFinite(x) ? '' : x >= 1 ? 'ok' : x >= .9 ? 'at' : 'ruim');
    $('cusKpis').innerHTML = X.BAC ? [
      kpi('Orçamento (ONT)', brl(X.BAC), `${X.itens.length} itens · ${X.estimados} estimado${X.estimados === 1 ? '' : 's'}`),
      kpi(`Contingência (${nfmt(num(X.a.cont))}%)`, brl(X.reserva), 'reserva para riscos'),
      kpi('Total com reserva', brl(X.total), `CAPEX ${brl(X.capex)} · OPEX ${brl(X.opex)}`),
      kpi('Planejado até hoje (VP)', brl(X.PV), `${X.BAC ? Math.round(X.PV / X.BAC * 100) : 0}% do orçamento`),
      kpi('Agregado (VA)', brl(X.EV), 'orçado × % feito'),
      kpi('Real gasto (CR)', brl(X.AC), ''),
      kpi('IDC (custo)', f2(X.CPI), !Number.isFinite(X.CPI) ? 'lance o Real' : X.CPI >= 1 ? 'dentro do orçamento' : 'gastando mais que o previsto', bom(X.CPI)),
      kpi('IDP (prazo)', f2(X.SPI), !Number.isFinite(X.SPI) ? 'ainda não começou' : X.SPI >= 1 ? 'em dia ou adiantado' : 'atrasado', bom(X.SPI)),
    ].join('') : '';
    categorias(X); grafico(p, X); tabela(X);
    $('cusObs').innerHTML = (X.a.obs || []).length ? `<div class="prj-aviso"><b>Confirmar nas premissas</b><ul>${X.a.obs.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>` : '';
  }
  function categorias(X) {
    const ent = Object.entries(X.cat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (!ent.length) { $('cusCat').innerHTML = ''; return; }
    const max = ent[0][1];
    $('cusCat').innerHTML = `<b class="cus-sub">Por categoria</b>${ent.map(([c, v]) => `<div class="cus-barra"><span>${esc(c)}</span><div><i style="width:${(v / max * 100).toFixed(1)}%;background:${COR[c] || '#888'}"></i></div><em>${brl(v)} · ${Math.round(v / X.BAC * 100)}%</em></div>`).join('')}`;
  }
  function tabela(X) {
    const tarefas = X.T.filter((t, i) => !X.K?.R.resumo[i]).map((t) => t.nome);
    const sel = (k, val, ops) => `<select data-k="${k}">${ops.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    $('cusItens').innerHTML = X.itens.length ? `<table><thead><tr><th>Categoria</th><th>Descrição</th><th>Qtd</th><th>Un</th><th>Valor unit.</th><th>Total</th><th>Tipo</th><th>Quando</th><th>% feito</th><th>Real gasto</th><th>Premissa (base do valor)</th><th>Origem</th><th></th></tr></thead><tbody>${
      X.itens.map((x, i) => { const it = x.it, orig = it.origem || 'estimado';
        const quando = sel('quando', it.tarefa ? `t:${it.tarefa}` : `m:${Math.max(1, Math.round(num(it.mes) || 1))}`, [...tarefas.map((n) => [`t:${n}`, `📅 ${n}`]), ...Array.from({ length: 24 }, (_, k) => [`m:${k + 1}`, `Mês ${k + 1}`])]);
        return `<tr data-i="${i}" class="${orig === 'estimado' ? 'est' : ''}">
          <td>${sel('cat', it.cat || 'Outros', CATS.map((c) => [c, c]))}</td>
          <td><input data-k="desc" value="${esc(it.desc)}" class="desc" /></td>
          <td><input data-k="qtd" inputmode="decimal" value="${esc(nfmt(it.qtd ?? 1))}" class="n" /></td>
          <td><input data-k="un" value="${esc(it.un || 'un')}" class="un" /></td>
          <td><input data-k="vu" inputmode="decimal" value="${esc(nfmt(it.vu))}" class="m" /></td>
          <td class="v">${brl(x.tot)}</td>
          <td>${sel('tipo', it.tipo || 'OPEX', [['CAPEX', 'CAPEX'], ['OPEX', 'OPEX']])}</td>
          <td>${quando}</td>
          <td>${x.ti != null ? `<span title="vem do Cronograma">${x.pct}%</span>` : `<input data-k="pct" inputmode="numeric" value="${esc(nfmt(it.pct || 0))}" class="n" />%`}</td>
          <td><input data-k="real" inputmode="decimal" value="${esc(nfmt(it.real))}" class="m" placeholder="0" /></td>
          <td><input data-k="premissa" value="${esc(it.premissa || '')}" class="prem" /></td>
          <td>${sel('origem', orig, Object.entries(ORIG))}</td>
          <td><button type="button" data-del="${i}" title="Apagar item">×</button></td></tr>`; }).join('')}
        <tr class="tot"><td></td><td>Total dos itens</td><td></td><td></td><td></td><td class="v">${brl(X.itens.reduce((s, x) => s + x.tot, 0))}</td><td colspan="3"></td><td class="v">${brl(X.itens.reduce((s, x) => s + x.real, 0))}</td><td colspan="3"></td></tr></tbody></table>`
      : `<p class="cro-vazio">Sem itens. Use <b>✨ Montar análise com IA</b> (usa o Canvas, o cronograma e as compras) ou <b>＋ Item de custo</b>.</p>`;
  }
  function grafico(p, X) {
    const pts = X.pontos; if (!pts.length || !X.BAC) { $('cusGraf').innerHTML = ''; return; }
    const W = 760, H = 300, ml = 76, mr = 16, mt = 16, mb = 40;
    const hist = Object.entries(p.custosHist || {}).sort().map(([k, v]) => ({ dt: new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)), ...v }));
    const t0 = Math.min(pts[0].dt.getTime(), X.ini0.getTime(), ...hist.map((h) => h.dt.getTime())), t1 = Math.max(pts[pts.length - 1].dt.getTime(), X.hoje.getTime()) + 864e5 * 2;
    const top = Math.max(X.total, X.AC, X.EAC || 0, ...hist.map((h) => Math.max(h.va, h.cr))) * 1.06;
    const x = (dt) => ml + (dt.getTime() - t0) / (t1 - t0) * (W - ml - mr), y = (v) => mt + (1 - v / top) * (H - mt - mb);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" font-family="DM Sans, Arial, sans-serif"><rect width="${W}" height="${H}" fill="#fff"/>`;
    for (let k = 0; k <= 4; k++) { const v = top * k / 4; s += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}" stroke="#eee"/><text x="${ml - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#666">${brl(v).replace(/,\d\d$/, '')}</text>`; }
    const dias = (t1 - t0) / 864e5, passo = dias > 120 ? 30 : dias > 40 ? 7 : Math.max(1, Math.ceil(dias / 10));
    for (let t = t0; t <= t1; t += 864e5 * passo) { const d = new Date(t); s += `<text x="${x(d)}" y="${H - mb + 16}" text-anchor="middle" font-size="10.5" fill="#666">${passo === 30 ? d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : `${d.getDate()}/${d.getMonth() + 1}`}</text>`; }
    const linhaH = (v, cor, rot) => (s += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}" stroke="${cor}" stroke-dasharray="5 4"/><text x="${W - mr}" y="${y(v) - 5}" text-anchor="end" font-size="11" fill="${cor}">${rot}</text>`);
    linhaH(X.BAC, '#888', `ONT ${brl(X.BAC)}`); if (X.reserva) linhaH(X.total, '#b38a00', `com reserva ${brl(X.total)}`);
    const linha = (arr, cor, w, dash) => `<polyline points="${arr.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')}" fill="none" stroke="${cor}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ''} stroke-linejoin="round"/>`;
    const vp = [[x(new Date(t0)), y(0)]]; pts.forEach((pt) => { vp.push([x(pt.dt), vp[vp.length - 1][1]]); vp.push([x(pt.dt), y(pt.vp)]); }); vp.push([W - mr, y(pts[pts.length - 1].vp)]);
    s += linha(vp, '#2e6fd8', 3);
    const serie = (key) => { const arr = hist.map((h) => [x(h.dt), y(h[key])]); if (!hist.length || ISO(hist[hist.length - 1].dt) !== ISO(X.hoje)) arr.push([x(X.hoje), y(key === 'va' ? X.EV : X.AC)]); return arr; };
    if (X.EV || hist.length) { const a = serie('va'); s += linha([[x(new Date(t0)), y(0)], ...a], '#2e9b5b', 3); a.forEach(([cx, cy]) => (s += `<circle cx="${cx}" cy="${cy}" r="4" fill="#2e9b5b"/>`)); }
    if (X.AC || hist.length) { const a = serie('cr'); s += linha([[x(new Date(t0)), y(0)], ...a], '#d1495b', 3); a.forEach(([cx, cy]) => (s += `<circle cx="${cx}" cy="${cy}" r="4" fill="#d1495b"/>`)); }
    if (Number.isFinite(X.EAC) && X.AC) s += linha([[x(X.hoje), y(X.AC)], [W - mr - 30, y(X.EAC)]], '#d1495b', 1.5, '4 4') + `<text x="${W - mr - 26}" y="${y(X.EAC) + 4}" font-size="11" fill="#b8283d">ENT</text>`;
    if (X.hoje.getTime() >= t0 && X.hoje.getTime() <= t1) s += `<line x1="${x(X.hoje)}" x2="${x(X.hoje)}" y1="${mt}" y2="${H - mb}" stroke="#d76845" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${x(X.hoje) + 4}" y="${mt + 10}" font-size="11" fill="#d76845">hoje</text>`;
    s += `<line x1="${ml}" x2="${ml}" y1="${mt}" y2="${H - mb}" stroke="#bbb"/><line x1="${ml}" x2="${W - mr}" y1="${H - mb}" y2="${H - mb}" stroke="#bbb"/></svg>`;
    $('cusGraf').innerHTML = `<div class="cus-leg"><b>Curva S</b><span><i style="background:#2e6fd8"></i>Planejado (VP)</span><span><i style="background:#2e9b5b"></i>Agregado (VA)</span><span><i style="background:#d1495b"></i>Real (CR)</span></div>${s}<small>${X.K ? 'Itens ligados a tarefas seguem o Cronograma; os demais caem no mês escolhido.' : 'Sem cronograma: cada item cai no mês escolhido, a partir de hoje.'} VA e CR ganham um ponto por dia em que você atualiza o % ou o Real.</small>`;
  }

  // ---------- edição ----------
  function redesenhaMantendoFoco(caixa) {
    setTimeout(() => {
      const a = document.activeElement, tr = a?.closest?.('tr[data-i]'), k = a?.dataset?.k, i = tr?.dataset.i, dentro = caixa.contains(a);
      monta();
      if (dentro && k != null && i != null) { const el = caixa.querySelector(`tr[data-i="${i}"] [data-k="${k}"]`); if (el) { el.focus(); try { el.select?.(); } catch { /* */ } } }
    }, 0);
  }
  $('cusItens').addEventListener('change', (e) => {
    const el = e.target, tr = el.closest('tr[data-i]'); if (!tr || !el.dataset.k) return;
    const it = A().itens[+tr.dataset.i], k = el.dataset.k;
    if (k === 'quando') { const tipo = el.value.slice(0, 1), v = el.value.slice(2); if (tipo === 't') it.tarefa = v; else { it.tarefa = ''; it.mes = +v; } }
    else if (['qtd', 'vu', 'real', 'pct'].includes(k)) { it[k] = el.value.trim() === '' ? '' : num(el.value); if ((k === 'vu' || k === 'qtd') && it.origem !== 'cotado') it.origem = 'informado'; }
    else it[k] = el.value;
    salvar(); redesenhaMantendoFoco($('cusItens'));
  });
  $('cusItens').addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (!b) return; const it = A().itens[+b.dataset.del]; if (!confirm(`Apagar "${it.desc || 'item'}"?`)) return; A().itens.splice(+b.dataset.del, 1); salvar(); monta(); });
  $('cusCont').addEventListener('change', (e) => { A().cont = num(e.target.value); salvar(); monta(); });
  area.querySelector('[data-c=add]').onclick = () => { A().itens.push({ id: novoId(), cat: 'Outros', desc: '', qtd: 1, un: 'un', vu: '', tipo: 'OPEX', mes: 1, tarefa: '', pct: 0, real: '', premissa: '', origem: 'informado' }); salvar(); monta(); const l = $('cusItens').querySelectorAll('tr[data-i]'); l[l.length - 1]?.querySelector('[data-k=desc]')?.focus(); };
  area.querySelector('[data-c=compras]').onclick = () => {
    const p = P(), a = A(); let n = 0; const sem = [];
    for (const c of p.spec?.componentes || []) {
      const r = window.tracoPesquisas?.porItem(c.nome), pr = (r?.precos || []).find((x) => /R\$/.test(x.preco || ''));
      if (!pr) { sem.push(c.nome); continue; }
      if (a.itens.some((x) => x.desc.toLowerCase() === c.nome.toLowerCase())) continue;
      const tarefa = (p.crono?.tarefas || []).find((t) => t.nome.toLowerCase() === `comprar ${c.nome}`.toLowerCase())?.nome || '';
      a.itens.push({ id: novoId(), cat: 'Materiais', desc: c.nome, qtd: Math.max(1, +c.qtd || 1), un: 'un', vu: num(pr.preco), tipo: 'CAPEX', mes: 1, tarefa, pct: 0, real: '', premissa: `${pr.loja || 'loja'} · pesquisado em ${r._quando || ''}`, origem: 'cotado' }); n++;
    }
    salvar(); monta(); $('cusMsg').textContent = n ? `🛒 ${n} item(ns) com preço pesquisado.${sem.length ? ` Sem preço: ${sem.join(', ')} (use 🔎 nos componentes).` : ''}` : (sem.length ? `Sem preço pesquisado para: ${sem.join(', ')}.` : 'Nada novo para trazer.');
  };

  // ---------- IA ----------
  async function montarIA(auto) {
    const p = P(), a = A(), b = area.querySelector('[data-c=ia]');
    if (!auto && a.itens.length && !confirm('Substituir a análise atual pela que a IA montar? (Itens que você mudou serão perdidos.)')) return;
    const notas = (k) => (window.tracoCanvas?.notas(p, k) || []).map((n) => n.t);
    const canvas = JSON.stringify(Object.fromEntries((window.tracoCanvas?.BLOCOS || []).map(([k]) => [k, notas(k)]).filter(([, v]) => v.length)));
    const crono = (p.crono?.tarefas || []).map((t) => `${'  '.repeat(t.nivel - 1)}${t.nome}${+t.dur ? ` (${t.dur} d)` : ''}`).join('\n');
    const cotados = (p.spec?.componentes || []).map((c) => { const r = window.tracoPesquisas?.porItem(c.nome), pr = (r?.precos || []).find((x) => /R\$/.test(x.preco || '')); return pr ? `${c.qtd || 1}× ${c.nome}: ${pr.preco} (${pr.loja})` : ''; }).filter(Boolean).join('\n');
    const pecas = p.spec ? [p.spec.resumo, ...(p.spec.pecas || []).map((x) => `- peça impressa: ${x.nome}`)].filter(Boolean).join('\n') : '';
    b.disabled = true; $('cusMsg').textContent = '✨ Montando a análise de custos com as premissas… (20 a 60 s)';
    try {
      const r = await window.tracoChamarIA({ canvas: { fase: 'custos', nome: p.nome, ideia: [p.ideia, p.pedido].filter(Boolean).join(' — '), canvas, crono, cotados, pecas } });
      const tnomes = new Set((p.crono?.tarefas || []).map((t) => t.nome.trim().toLowerCase()));
      const itens = (r.itens || []).slice(0, 60).map((x) => ({ id: novoId(), cat: CATS.includes(x.cat) ? x.cat : 'Outros', desc: String(x.desc || '').slice(0, 140), qtd: num(x.qtd) || 1, un: String(x.un || 'un').slice(0, 12), vu: num(x.vu),
        tipo: x.tipo === 'CAPEX' ? 'CAPEX' : 'OPEX', mes: Math.max(1, Math.round(num(x.mes) || 1)), tarefa: x.tarefa && tnomes.has(String(x.tarefa).trim().toLowerCase()) ? x.tarefa : '', pct: 0, real: '', premissa: String(x.premissa || '').slice(0, 240), origem: x.origem === 'cotado' ? 'cotado' : 'estimado' }));
      if (!itens.length) throw new Error('A IA não devolveu itens de custo.');
      a.itens = itens; a.cont = Number.isFinite(+r.contingencia_pct) ? +r.contingencia_pct : a.cont; a.obs = (r.observacoes || []).slice(0, 10).map(String); p.custosAuto = true;
      salvar(); monta(); $('cusMsg').textContent = `✨ ${itens.length} itens de custo com premissas — todos marcados como estimados até você confirmar.`;
    } catch (err) { $('cusMsg').textContent = String(err.message || err); }
    b.disabled = false;
  }
  area.querySelector('[data-c=ia]').onclick = () => montarIA(false);
  function autoMontar() { // primeira vez que abre a aba num projeto com conteúdo: a IA já faz a primeira versão
    const p = P(); if (!p || p.custosAuto || A(p).itens.length) return;
    const temConteudo = (window.tracoCanvas?.BLOCOS || []).some(([k]) => window.tracoCanvas.notas(p, k).length) || (p.ideia || '').trim().length > 10 || p.crono?.tarefas?.length;
    if (!temConteudo) return; p.custosAuto = true; salvar(); montarIA(true);
  }

  // ---------- exportar ----------
  area.querySelector('[data-c=csv]').onclick = () => {
    const p = P(), X = calcula(p);
    const lin = [['Categoria', 'Descrição', 'Qtd', 'Un', 'Valor unitário', 'Total', 'Tipo', 'Quando', '% feito', 'Real gasto', 'Premissa', 'Origem']];
    X.itens.forEach((x) => lin.push([x.it.cat, x.it.desc, nfmt(x.it.qtd), x.it.un, f2(num(x.it.vu)), f2(x.tot), x.it.tipo, x.it.tarefa || `Mês ${x.it.mes || 1}`, x.pct, f2(x.real), x.it.premissa || '', x.it.origem || 'estimado']));
    lin.push([], ['Orçamento (ONT)', f2(X.BAC)], [`Contingência ${nfmt(num(X.a.cont))}%`, f2(X.reserva)], ['Total com reserva', f2(X.total)], ['CAPEX', f2(X.capex)], ['OPEX', f2(X.opex)], ['VP hoje', f2(X.PV)], ['VA', f2(X.EV)], ['CR', f2(X.AC)], ['IDC', f2(X.CPI)], ['IDP', f2(X.SPI)], ['ENT', f2(X.EAC)]);
    lin.push([], ['Categoria', 'Total']); Object.entries(X.cat).forEach(([c, v]) => lin.push([c, f2(v)]));
    const csv = '﻿' + lin.map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const u = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), a = document.createElement('a');
    a.href = u; a.download = `custos-${p.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').toLowerCase()}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000);
  };
  function tabelaRel(X) { return X.itens.length ? `<table><tr><th>Categoria</th><th>Descrição</th><th>Qtd</th><th>Valor unit.</th><th>Total</th><th>Tipo</th><th>Premissa</th><th>Origem</th></tr>${X.itens.map((x) => `<tr><td>${esc(x.it.cat)}</td><td>${esc(x.it.desc)}</td><td>${esc(nfmt(x.it.qtd))} ${esc(x.it.un || '')}</td><td>${brl(num(x.it.vu))}</td><td>${brl(x.tot)}</td><td>${esc(x.it.tipo)}</td><td>${esc(x.it.premissa || '')}</td><td class="${(x.it.origem || 'estimado') === 'estimado' ? 'est' : ''}">${esc(x.it.origem || 'estimado')}</td></tr>`).join('')}<tr><th colspan="4">Orçamento + contingência ${nfmt(num(X.a.cont))}%</th><th>${brl(X.total)}</th><th colspan="3"></th></tr></table>` : ''; }
  window.tracoCustos = {
    resumo(p) { const X = calcula(p); return X.BAC ? { BAC: X.BAC, AC: X.AC, CPI: X.CPI, SPI: X.SPI, total: X.total } : null; },
    html(p) { if (P() !== p) return ''; monta(); return `<div>${$('cusKpis').innerHTML}</div><div class="cus-dois">${$('cusCat').innerHTML}</div>${$('cusGraf').innerHTML}<div class="rel-itens">${tabelaRel(calcula(p))}</div>`; },
  };
})();
