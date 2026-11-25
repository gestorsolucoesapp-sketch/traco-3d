// 💰 Custos do projeto com Curva S e valor agregado (VP, VA, CR, IDC, IDP, ENT), ligado ao Cronograma.
(() => {
  const $ = (id) => document.getElementById(id);
  const painel = $('projetosMode'), abas = painel?.querySelector('.prj-abas'); if (!abas) return;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = () => window.tracoProjetos?.atual?.();
  const salvar = () => window.tracoProjetos?.salvar?.();
  const brl = (v) => (Number.isFinite(v) ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—');
  const num = (t) => { const v = parseFloat(String(t ?? '').replace(/[R$\s.]/g, '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
  const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '—');
  const ISO = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  const bt = document.createElement('button'); bt.type = 'button'; bt.dataset.a = 'custos'; bt.textContent = '💰 Custos';
  const cro = abas.querySelector('[data-a=crono]'); (cro?.nextSibling ? abas.insertBefore(bt, cro.nextSibling) : abas.appendChild(bt));
  const area = document.createElement('div'); area.className = 'cus'; area.hidden = true;
  area.innerHTML = `
    <div class="cro-barra">
      <button type="button" data-c="compras" title="Usa os preços pesquisados nas tarefas 'Comprar …'">🛒 Trazer preços das compras</button>
      <button type="button" data-c="csv">⬇ Excel</button>
      <span class="cus-dica">Preencha o <b>Orçado</b> de cada tarefa e, conforme gastar, o <b>Real</b>. O % concluído vem do Cronograma.</span>
    </div>
    <div class="cus-kpis" id="cusKpis"></div>
    <div class="cus-graf" id="cusGraf"></div>
    <div class="cus-tab" id="cusTab"></div>`;
  (painel.querySelector('.pdm') || painel.querySelector('.cro')).after(area);
  document.addEventListener('traco-prj-aba', (e) => { area.hidden = e.detail !== 'custos'; if (!area.hidden) monta(); });
  document.addEventListener('traco-projeto', () => { if (!area.hidden) monta(); });

  // ---------- cálculo ----------
  function calcula(p) {
    const K = window.tracoCrono?.calc(p); if (!K) return null;
    const { c, R } = K, T = c.tarefas, n = T.length;
    const folhas = T.map((_, i) => i).filter((i) => !R.resumo[i]);
    const orc = (i) => num(T[i].custo), real = (i) => num(T[i].real), pct = (i) => Math.min(100, Math.max(0, +T[i].pct || 0)) / 100;
    const BAC = folhas.reduce((s, i) => s + orc(i), 0), AC = folhas.reduce((s, i) => s + real(i), 0), EV = folhas.reduce((s, i) => s + orc(i) * pct(i), 0);
    // VP por dia de trabalho: custo dividido igualmente pelos dias da tarefa (marco: no dia)
    const diasTot = Math.max(1, R.fimProj), vpDia = new Array(diasTot + 1).fill(0);
    for (const i of folhas) { const d = R.fim[i] - R.ini[i], v = orc(i); if (!v) continue; if (d <= 0) vpDia[Math.min(R.ini[i], diasTot - 1)] += v; else for (let k = R.ini[i]; k < R.fim[i]; k++) vpDia[k] += v / d; }
    const pontos = []; let acc = 0;
    for (let k = 0; k < diasTot; k++) { acc += vpDia[k]; pontos.push({ dt: K.diaDe(k), vp: acc }); }
    const hoje = K.hoje; let PV = 0; for (const pt of pontos) if (pt.dt <= hoje) PV = pt.vp;
    const CPI = AC ? EV / AC : NaN, SPI = PV ? EV / PV : NaN, EAC = Number.isFinite(CPI) && CPI > 0 ? BAC / CPI : NaN;
    return { K, T, R, folhas, orc, real, pct, BAC, AC, EV, PV, CPI, SPI, EAC, CV: EV - AC, SV: EV - PV, pontos, hoje };
  }

  // histórico de VA e CR (uma foto por dia, quando você atualiza) para desenhar essas curvas no tempo
  function grava(p, X) {
    p.custosHist ||= {}; const k = ISO(X.hoje);
    const v = { va: Math.round(X.EV * 100) / 100, cr: Math.round(X.AC * 100) / 100 };
    const ant = p.custosHist[k]; if (!ant || ant.va !== v.va || ant.cr !== v.cr) { p.custosHist[k] = v; salvar(); }
  }

  // ---------- tela ----------
  function monta() {
    const p = P(); if (!p) return;
    const X = calcula(p);
    if (!X) { $('cusKpis').innerHTML = ''; $('cusGraf').innerHTML = ''; $('cusTab').innerHTML = `<p class="cro-vazio">Monte primeiro o <b>📅 Cronograma</b>: os custos são lançados nas tarefas dele.</p>`; return; }
    if (X.EV || X.AC) grava(p, X);
    const kpi = (t, v, s, cls = '') => `<div class="cus-kpi ${cls}"><small>${t}</small><b>${v}</b>${s ? `<em>${s}</em>` : ''}</div>`;
    const bom = (x) => (!Number.isFinite(x) ? '' : x >= 1 ? 'ok' : x >= .9 ? 'at' : 'ruim');
    $('cusKpis').innerHTML = [
      kpi('Orçamento (ONT)', brl(X.BAC), 'soma do orçado'),
      kpi('Planejado até hoje (VP)', brl(X.PV), `${X.BAC ? Math.round(X.PV / X.BAC * 100) : 0}% do orçamento`),
      kpi('Agregado (VA)', brl(X.EV), 'orçado × % concluído'),
      kpi('Real gasto (CR)', brl(X.AC), ''),
      kpi('IDC (custo)', f2(X.CPI), !Number.isFinite(X.CPI) ? 'lance o Real' : X.CPI >= 1 ? 'dentro do orçamento' : 'gastando mais que o previsto', bom(X.CPI)),
      kpi('IDP (prazo)', f2(X.SPI), !Number.isFinite(X.SPI) ? 'ainda não começou' : X.SPI >= 1 ? 'em dia ou adiantado' : 'atrasado', bom(X.SPI)),
      kpi('VC = VA − CR', brl(X.CV), X.CV >= 0 ? 'economia' : 'estouro', X.AC ? (X.CV >= 0 ? 'ok' : 'ruim') : ''),
      kpi('Estimativa no término (ENT)', brl(X.EAC), Number.isFinite(X.EAC) ? `ONT ÷ IDC · variação ${brl(X.BAC - X.EAC)}` : 'precisa do Real', Number.isFinite(X.EAC) ? (X.EAC <= X.BAC ? 'ok' : 'ruim') : ''),
    ].join('');
    grafico(p, X);
    $('cusTab').innerHTML = `<table><thead><tr><th>#</th><th>Tarefa</th><th>Início</th><th>Término</th><th>% concl.</th><th>Orçado (R$)</th><th>Real (R$)</th><th>VA</th></tr></thead><tbody>${
      X.T.map((t, i) => {
        const res = X.R.resumo[i], marco = !res && !(+t.dur), ini = X.K.diaDe(marco ? Math.max(0, X.R.ini[i] - 1) : X.R.ini[i]), fim = marco ? ini : X.K.diaDe(Math.max(X.R.ini[i], X.R.fim[i] - 1));
        if (res) { let o = 0, r = 0, v = 0; for (let j = i + 1; j < X.T.length && X.T[j].nivel > t.nivel; j++) if (!X.R.resumo[j]) { o += X.orc(j); r += X.real(j); v += X.orc(j) * X.pct(j); }
          return `<tr class="res"><td>${i + 1}</td><td style="padding-left:${6 + (t.nivel - 1) * 14}px">▾ ${esc(t.nome)}</td><td>${X.K.br(ini)}</td><td>${X.K.br(fim)}</td><td></td><td class="v">${brl(o)}</td><td class="v">${brl(r)}</td><td class="v">${brl(v)}</td></tr>`; }
        return `<tr data-i="${i}"><td>${i + 1}</td><td style="padding-left:${6 + (t.nivel - 1) * 14}px">${esc(t.nome)}</td><td>${X.K.br(ini)}</td><td>${X.K.br(fim)}</td>
          <td><input data-k="pct" inputmode="numeric" value="${esc(t.pct || 0)}" class="p" />%</td>
          <td><input data-k="custo" inputmode="decimal" value="${t.custo ? esc(String(t.custo).replace('.', ',')) : ''}" placeholder="0,00" /></td>
          <td><input data-k="real" inputmode="decimal" value="${t.real ? esc(String(t.real).replace('.', ',')) : ''}" placeholder="0,00" /></td>
          <td class="v">${brl(X.orc(i) * X.pct(i))}</td></tr>`;
      }).join('')}<tr class="tot"><td></td><td>Total</td><td></td><td></td><td></td><td class="v">${brl(X.BAC)}</td><td class="v">${brl(X.AC)}</td><td class="v">${brl(X.EV)}</td></tr></tbody></table>`;
  }
  function grafico(p, X) {
    const pts = X.pontos; if (!pts.length || !X.BAC) { $('cusGraf').innerHTML = `<p class="cro-vazio">Lance o <b>Orçado</b> nas tarefas para ver a Curva S.</p>`; return; }
    const W = 900, H = 330, ml = 78, mr = 20, mt = 18, mb = 42, t0 = pts[0].dt.getTime(), t1 = Math.max(pts[pts.length - 1].dt.getTime(), X.hoje.getTime()) + 864e5;
    const hist = Object.entries(p.custosHist || {}).sort().map(([k, v]) => ({ dt: new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)), ...v })).filter((h) => h.dt.getTime() >= t0 - 864e5 * 30);
    const top = Math.max(X.BAC, X.AC, X.EAC || 0, ...hist.map((h) => Math.max(h.va, h.cr))) * 1.08;
    const x = (dt) => ml + (dt.getTime() - t0) / (t1 - t0) * (W - ml - mr), y = (v) => mt + (1 - v / top) * (H - mt - mb);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" font-family="DM Sans, Arial, sans-serif"><rect width="${W}" height="${H}" fill="#fff"/>`;
    for (let k = 0; k <= 4; k++) { const v = top * k / 4; s += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}" stroke="#eee"/><text x="${ml - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#666">${brl(v).replace(/,\d\d$/, '')}</text>`; }
    const passo = Math.max(1, Math.ceil(pts.length / 8));
    pts.forEach((pt, k) => { if (k % passo === 0 || k === pts.length - 1) s += `<text x="${x(pt.dt)}" y="${H - mb + 16}" text-anchor="middle" font-size="10.5" fill="#666">${X.K.br(pt.dt).slice(0, 5)}</text>`; });
    s += `<line x1="${ml}" x2="${W - mr}" y1="${y(X.BAC)}" y2="${y(X.BAC)}" stroke="#999" stroke-dasharray="5 4"/><text x="${W - mr}" y="${y(X.BAC) - 5}" text-anchor="end" font-size="11" fill="#555">ONT ${brl(X.BAC)}</text>`;
    // VP: degrau por dia (curva S)
    const linha = (arr, cor, w, dash) => `<polyline points="${arr.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')}" fill="none" stroke="${cor}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ''} stroke-linejoin="round"/>`;
    s += linha([[x(pts[0].dt), y(0)], ...pts.map((pt) => { const d = new Date(pt.dt); d.setDate(d.getDate() + 1); return [x(d), y(pt.vp)]; })], '#2e6fd8', 3);
    const serie = (key) => { const arr = hist.map((h) => [x(h.dt), y(h[key])]); if (!hist.length || ISO(hist[hist.length - 1].dt) !== ISO(X.hoje)) arr.push([x(X.hoje), y(key === 'va' ? X.EV : X.AC)]); return arr; };
    if (X.EV || hist.length) { const a = serie('va'); s += linha([[x(pts[0].dt), y(0)], ...a], '#2e9b5b', 3); a.forEach(([cx, cy]) => (s += `<circle cx="${cx}" cy="${cy}" r="4" fill="#2e9b5b"/>`)); }
    if (X.AC || hist.length) { const a = serie('cr'); s += linha([[x(pts[0].dt), y(0)], ...a], '#d1495b', 3); a.forEach(([cx, cy]) => (s += `<circle cx="${cx}" cy="${cy}" r="4" fill="#d1495b"/>`)); }
    if (Number.isFinite(X.EAC) && X.AC) s += linha([[x(X.hoje), y(X.AC)], [x(pts[pts.length - 1].dt) + 20, y(X.EAC)]], '#d1495b', 1.5, '4 4') + `<text x="${x(pts[pts.length - 1].dt) + 24}" y="${y(X.EAC) + 4}" font-size="11" fill="#b8283d">ENT</text>`;
    if (X.hoje.getTime() >= t0 && X.hoje.getTime() <= t1) s += `<line x1="${x(X.hoje)}" x2="${x(X.hoje)}" y1="${mt}" y2="${H - mb}" stroke="#d76845" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${x(X.hoje) + 4}" y="${mt + 10}" font-size="11" fill="#d76845">hoje</text>`;
    s += `<line x1="${ml}" x2="${ml}" y1="${mt}" y2="${H - mb}" stroke="#bbb"/><line x1="${ml}" x2="${W - mr}" y1="${H - mb}" y2="${H - mb}" stroke="#bbb"/></svg>`;
    $('cusGraf').innerHTML = `<div class="cus-leg"><b>Curva S</b><span><i style="background:#2e6fd8"></i>Planejado (VP)</span><span><i style="background:#2e9b5b"></i>Agregado (VA)</span><span><i style="background:#d1495b"></i>Real (CR)</span></div>${s}<small>VA e CR ganham um ponto por dia em que você atualiza o % ou o Real — assim a curva de execução se forma ao longo do projeto.</small>`;
  }


  // redesenha a tabela depois do clique/toque ir para o próximo campo, e devolve o foco a ele
  function redesenhaMantendoFoco(caixa, monta) {
    setTimeout(() => {
      const a = document.activeElement, tr = a?.closest?.('tr[data-i]'), k = a?.dataset?.k, i = tr?.dataset.i, dentro = caixa.contains(a);
      monta();
      if (dentro && k != null && i != null) { const el = caixa.querySelector(`tr[data-i="${i}"] [data-k="${k}"]`); if (el) { el.focus(); try { el.select(); } catch { /* */ } } }
    }, 0);
  }
  // ---------- edição ----------
  $('cusTab').addEventListener('change', (e) => {
    const el = e.target, tr = el.closest('tr[data-i]'); if (!tr || !el.dataset.k) return;
    const t = P().crono.tarefas[+tr.dataset.i];
    if (el.dataset.k === 'pct') t.pct = Math.max(0, Math.min(100, Math.round(+el.value || 0))); else t[el.dataset.k] = num(el.value) || '';
    salvar(); redesenhaMantendoFoco($('cusTab'), monta);
  });
  area.querySelector('[data-c=compras]').onclick = () => {
    const p = P(), T = p.crono?.tarefas || []; let n = 0, sem = [];
    for (const c of p.spec?.componentes || []) {
      const t = T.find((x) => x.nome.toLowerCase() === `comprar ${c.nome}`.toLowerCase()); if (!t) continue;
      const r = window.tracoPesquisas?.porItem(c.nome), pr = (r?.precos || []).map((x) => /R\$\s*([\d.]+,\d{2}|[\d.]+)/.exec(x.preco || '')).find(Boolean);
      if (!pr) { sem.push(c.nome); continue; }
      t.custo = parseFloat(pr[1].replace(/\./g, '').replace(',', '.')) * Math.max(1, +c.qtd || 1); n++;
    }
    salvar(); monta();
    alert(n ? `${n} tarefa(s) de compra receberam o preço pesquisado.${sem.length ? `\nSem preço pesquisado: ${sem.join(', ')}.` : ''}` : 'Nenhuma tarefa "Comprar …" com preço pesquisado. Use 🔗 Puxar do projeto no Cronograma e 🔎 nos componentes.');
  };
  area.querySelector('[data-c=csv]').onclick = () => {
    const p = P(), X = calcula(p); if (!X) return;
    const lin = [['Id', 'Tarefa', 'Início', 'Término', '% concluído', 'Orçado', 'Real', 'Valor agregado']];
    X.folhas.forEach((i) => lin.push([i + 1, X.T[i].nome, X.K.br(X.K.diaDe(X.R.ini[i])), X.K.br(X.K.diaDe(Math.max(X.R.ini[i], X.R.fim[i] - 1))), Math.round(X.pct(i) * 100), f2(X.orc(i)), f2(X.real(i)), f2(X.orc(i) * X.pct(i))]));
    lin.push([], ['ONT', f2(X.BAC)], ['VP hoje', f2(X.PV)], ['VA', f2(X.EV)], ['CR', f2(X.AC)], ['IDC', f2(X.CPI)], ['IDP', f2(X.SPI)], ['ENT', f2(X.EAC)]);
    lin.push([], ['Data', 'VP acumulado']); X.pontos.forEach((pt) => lin.push([X.K.br(pt.dt), f2(pt.vp)]));
    const csv = '﻿' + lin.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const u = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), a = document.createElement('a');
    a.href = u; a.download = `custos-${p.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').toLowerCase()}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000);
  };
  window.tracoCustos = { resumo(p) { const X = calcula(p); return X && X.BAC ? { BAC: X.BAC, AC: X.AC, CPI: X.CPI, SPI: X.SPI } : null; }, html(p) { if (P() !== p) return ''; monta(); return `<div>${$('cusKpis').innerHTML}</div>${$('cusGraf').innerHTML}`; } };
})();
