// 📅 Cronograma do projeto, no estilo MS Project: tarefas, resumo (recuo), marcos, predecessoras, Gantt, caminho crítico.
(() => {
  const $ = (id) => document.getElementById(id);
  const painel = $('projetosMode'), abas = painel?.querySelector('.prj-abas'); if (!abas) return;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = () => window.tracoProjetos?.atual?.();
  const salvar = () => window.tracoProjetos?.salvar?.();
  const novoId = () => Math.random().toString(36).slice(2, 9);
  const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

  const bt = document.createElement('button'); bt.type = 'button'; bt.dataset.a = 'crono'; bt.textContent = '📅 Cronograma';
  abas.appendChild(bt);
  const area = document.createElement('div'); area.className = 'cro'; area.hidden = true;
  area.innerHTML = `
    <div class="cro-barra">
      <label>Início <input type="date" id="croIni" /></label>
      <label class="cro-chk"><input type="checkbox" id="croUteis" /> só dias úteis</label>
      <span class="cro-sep"></span>
      <button type="button" data-c="add">＋ Tarefa</button>
      <button type="button" data-c="marco">◆ Marco</button>
      <button type="button" data-c="rec" title="Recuar (vira subtarefa)">→ Recuar</button>
      <button type="button" data-c="ava" title="Avançar (sai do resumo)">← Avançar</button>
      <button type="button" data-c="sobe" title="Subir">↑</button>
      <button type="button" data-c="desce" title="Descer">↓</button>
      <button type="button" data-c="del" title="Apagar tarefa">🗑</button>
      <span class="cro-sep"></span>
      <button type="button" class="cro-ia" data-c="ia">✨ Montar com IA</button>
      <button type="button" data-c="csv">⬇ Excel / MS Project</button>
      <span class="cro-escala"><button type="button" data-e="dia">Dia</button><button type="button" data-e="semana" class="on">Semana</button><button type="button" data-e="mes">Mês</button></span>
    </div>
    <p class="cro-msg" id="croMsg"></p>
    <div class="cro-corpo"><div class="cro-tab" id="croTab"></div><div class="cro-gantt" id="croGantt"></div></div>
    <p class="cro-leg"><i class="l1"></i> tarefa <i class="l2"></i> caminho crítico <i class="l3"></i> resumo <i class="l4"></i> marco <i class="l5"></i> hoje · Predecessoras: número da linha (ex. 2;3).</p>`;
  abas.parentElement.querySelector('.pmc').after(area);
  bt.addEventListener('click', () => {}); // a troca é feita pelo clique das abas
  document.addEventListener('traco-prj-aba', (e) => { area.hidden = e.detail !== 'crono'; if (!area.hidden) monta(); });
  document.addEventListener('traco-projeto', () => { if (!area.hidden) monta(); });

  let sel = 0, escala = 'semana';
  try { escala = localStorage.getItem('traco-cro-escala') || 'semana'; } catch { /* */ }
  const C = () => { const p = P(); p.crono ||= { inicio: hojeISO(), uteis: true, tarefas: [] }; return p.crono; };

  // ---------- calendário ----------
  const D = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); };
  const ISO = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const fds = (dt) => dt.getDay() === 0 || dt.getDay() === 6;
  function diaDe(c, k) { // k-ésimo dia de trabalho a partir do início → data
    const dt = D(c.inicio); if (c.uteis) while (fds(dt)) dt.setDate(dt.getDate() + 1);
    let n = k; while (n > 0) { dt.setDate(dt.getDate() + 1); if (!c.uteis || !fds(dt)) n--; }
    return dt;
  }
  const br = (dt) => `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getFullYear()).slice(2)}`;

  // ---------- cálculo (como o MS Project: término-início, resumo = filhas) ----------
  function calcula(c) {
    const T = c.tarefas, n = T.length;
    const filhos = T.map((t, i) => { const r = []; for (let j = i + 1; j < n && T[j].nivel > t.nivel; j++) r.push(j); return r; });
    const resumo = filhos.map((f) => f.length > 0);
    const pred = T.map((t) => String(t.pred || '').split(/[;,\s]+/).map((x) => parseInt(x, 10) - 1).filter((x) => Number.isInteger(x) && x >= 0 && x < n));
    const ini = new Array(n).fill(0), fim = new Array(n).fill(0);
    for (let volta = 0; volta < n + 2; volta++) {
      let mudou = false;
      for (let i = 0; i < n; i++) {
        if (resumo[i]) continue;
        let s = 0; for (const p of pred[i]) if (p !== i && !filhos[p]?.includes(i)) s = Math.max(s, fim[p]);
        // tarefa dentro de resumo que tem predecessora: herda o início do resumo
        for (let k = i - 1; k >= 0; k--) if (resumo[k] && filhos[k].includes(i)) for (const p of pred[k]) s = Math.max(s, fim[p]);
        const d = Math.max(0, +T[i].dur || 0), f = s + d;
        if (s !== ini[i] || f !== fim[i]) { ini[i] = s; fim[i] = f; mudou = true; }
      }
      for (let i = n - 1; i >= 0; i--) if (resumo[i]) {
        const s = Math.min(...filhos[i].map((j) => ini[j])), f = Math.max(...filhos[i].map((j) => fim[j]));
        if (s !== ini[i] || f !== fim[i]) { ini[i] = s; fim[i] = f; mudou = true; }
      }
      if (!mudou) break;
    }
    // caminho crítico: folga total zero (passada para trás nas tarefas)
    const fimProj = Math.max(0, ...fim), lf = new Array(n).fill(fimProj);
    const suc = T.map(() => []); pred.forEach((ps, i) => ps.forEach((p) => suc[p].push(i)));
    for (let volta = 0; volta < n + 2; volta++) {
      let mudou = false;
      for (let i = n - 1; i >= 0; i--) {
        if (resumo[i]) continue;
        let l = fimProj; const ss = [...suc[i]]; for (let k = 0; k < i; k++) if (resumo[k] && filhos[k].includes(i)) ss.push(...suc[k]);
        for (const s of ss) { const ls = resumo[s] ? Math.min(...filhos[s].map((j) => lf[j] - (fim[j] - ini[j]))) : lf[s] - (fim[s] - ini[s]); l = Math.min(l, ls); }
        if (l !== lf[i]) { lf[i] = l; mudou = true; }
      }
      if (!mudou) break;
    }
    const critico = T.map((t, i) => !resumo[i] && lf[i] - fim[i] === 0);
    return { ini, fim, resumo, critico, fimProj, pred };
  }

  // ---------- tela ----------
  const RH = 34, PX = { dia: 30, semana: 12, mes: 3.2 };
  function monta() {
    const p = P(); if (!p) return; const c = C();
    $('croIni').value = c.inicio; $('croUteis').checked = c.uteis;
    area.querySelectorAll('[data-e]').forEach((b) => b.classList.toggle('on', b.dataset.e === escala));
    const T = c.tarefas, R = calcula(c);
    if (sel >= T.length) sel = Math.max(0, T.length - 1);
    $('croTab').innerHTML = `<table><thead><tr><th>#</th><th>Nome da tarefa</th><th>Duração</th><th>Início</th><th>Término</th><th>Predec.</th><th>%</th><th>Responsável</th></tr></thead><tbody>${
      T.map((t, i) => {
        const marco = !R.resumo[i] && !(+t.dur), ini = diaDe(c, marco ? Math.max(0, R.ini[i] - 1) : R.ini[i]), fim = diaDe(c, Math.max(R.ini[i], R.fim[i] - 1));
        return `<tr data-i="${i}" class="${i === sel ? 'sel' : ''} ${R.resumo[i] ? 'res' : ''} ${R.critico[i] ? 'crit' : ''}">
          <td class="n">${i + 1}</td>
          <td class="nome" style="padding-left:${6 + (t.nivel - 1) * 16}px">${R.resumo[i] ? '▾ ' : marco ? '◆ ' : ''}<input data-k="nome" value="${esc(t.nome)}" /></td>
          <td>${R.resumo[i] ? `<span>${R.fim[i] - R.ini[i]} d</span>` : `<input data-k="dur" inputmode="numeric" value="${esc(t.dur ?? 1)}" class="num" /> d`}</td>
          <td>${br(ini)}</td><td>${br(marco ? ini : fim)}</td>
          <td>${R.resumo[i] ? `<input data-k="pred" value="${esc(t.pred || '')}" class="num2" />` : `<input data-k="pred" value="${esc(t.pred || '')}" class="num2" />`}</td>
          <td>${R.resumo[i] ? `<span>${pctResumo(c, R, i)}%</span>` : `<input data-k="pct" inputmode="numeric" value="${esc(t.pct || 0)}" class="num" />`}</td>
          <td><input data-k="resp" value="${esc(t.resp || '')}" /></td></tr>`;
      }).join('')}</tbody></table>${T.length ? '' : '<p class="cro-vazio">Sem tarefas. Use ＋ Tarefa ou ✨ Montar com IA.</p>'}`;
    gantt(c, R);
    const fimDt = diaDe(c, Math.max(0, R.fimProj - 1));
    $('croMsg').textContent = T.length ? `Projeto: ${br(diaDe(c, 0))} → ${br(fimDt)} · ${R.fimProj} dias ${c.uteis ? 'úteis' : 'corridos'} · ${R.critico.filter(Boolean).length} tarefa(s) no caminho crítico` : '';
  }
  function pctResumo(c, R, i) {
    const T = c.tarefas; let tot = 0, feito = 0;
    for (let j = i + 1; j < T.length && T[j].nivel > T[i].nivel; j++) if (!R.resumo[j]) { const d = Math.max(R.fim[j] - R.ini[j], 0.5); tot += d; feito += d * (+T[j].pct || 0) / 100; }
    return tot ? Math.round(feito / tot * 100) : 0;
  }
  function gantt(c, R) {
    const T = c.tarefas, px = PX[escala], dias = Math.max(R.fimProj + 10, 30);
    // eixo em dias CORRIDOS (o desenho mostra fim de semana); converte índice de trabalho → dia corrido
    const d0 = diaDe(c, 0), corr = (k) => Math.round((diaDe(c, k) - d0) / 864e5);
    const totCorr = corr(dias) + 1, W = totCorr * px + 40, H = 46 + T.length * RH;
    let s = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="croSeta" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7z" fill="#555"/></marker></defs>`;
    // cabeçalho: meses e marcas
    let mesAnt = -1, ultMes = -1;
    for (let k = 0; k <= totCorr; k++) {
      const dt = new Date(d0); dt.setDate(dt.getDate() + k); const x = k * px;
      if (dt.getMonth() !== mesAnt) { mesAnt = dt.getMonth(); s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#d0d4cc"/>`; if (x - ultMes > 70 || ultMes < 0) { s += `<text x="${x + 4}" y="15" class="cro-mes">${dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}/${String(dt.getFullYear()).slice(2)}</text>`; ultMes = x; } }
      if (fds(dt) && px >= 8) s += `<rect x="${x}" y="40" width="${px}" height="${H - 40}" fill="#f1f2ee"/>`;
      if (escala === 'dia') s += `<text x="${x + px / 2}" y="34" class="cro-dia" text-anchor="middle">${dt.getDate()}</text>`;
      else if (escala === 'semana' && dt.getDay() === 1) s += `<line x1="${x}" y1="24" x2="${x}" y2="${H}" stroke="#eceee8"/><text x="${x + 3}" y="34" class="cro-dia">${dt.getDate()}/${dt.getMonth() + 1}</text>`;
    }
    s += `<line x1="0" y1="40" x2="${W}" y2="40" stroke="#ccc"/>`;
    const hoje = Math.round((D(hojeISO()) - d0) / 864e5);
    if (hoje >= 0 && hoje <= totCorr) s += `<line x1="${hoje * px}" y1="40" x2="${hoje * px}" y2="${H}" stroke="#d76845" stroke-width="2" stroke-dasharray="4 3"/>`;
    const X = (k) => corr(k) * px, Xf = (k) => (k > 0 ? (corr(k - 1) + 1) * px : 0);
    const pos = T.map((t, i) => ({ x1: X(R.ini[i]), x2: Xf(R.fim[i]), y: 46 + i * RH + RH / 2 }));
    // setas de dependência
    R.pred.forEach((ps, i) => ps.forEach((p) => {
      if (p === i) return; const a = pos[p], b = pos[i], xa = a.x2, xb = Math.max(b.x1, xa + 6);
      s += `<path d="M${xa},${a.y} H${xa + 6} V${b.y} H${xb - 1}" fill="none" stroke="#777" stroke-width="1.2" marker-end="url(#croSeta)"/>`;
    }));
    T.forEach((t, i) => {
      const { x1, x2, y } = pos[i], w = Math.max(2, x2 - x1);
      if (i === sel) s += `<rect x="0" y="${y - RH / 2}" width="${W}" height="${RH}" fill="#2e6fd814"/>`;
      if (R.resumo[i]) s += `<path d="M${x1},${y - 6} H${x1 + w} V${y + 5} L${x1 + w - 5},${y} H${x1 + 5} L${x1},${y + 5}z" fill="#222"/>`;
      else if (!(+t.dur)) { const x1m = R.ini[i] > 0 ? Xf(R.ini[i]) : x1; s += `<path d="M${x1m},${y - 8} L${x1m + 8},${y} L${x1m},${y + 8} L${x1m - 8},${y}z" fill="#222"/><text x="${x1m + 12}" y="${y + 4}" class="cro-rot">${br(diaDe(c, Math.max(0, R.ini[i] - 1)))}</text>`; }
      else {
        const cor = R.critico[i] ? '#d1495b' : '#3d7bd6', pc = Math.min(100, Math.max(0, +t.pct || 0));
        s += `<rect x="${x1}" y="${y - 8}" width="${w}" height="16" rx="3" fill="${cor}" opacity=".45"/><rect x="${x1}" y="${y - 8}" width="${w * pc / 100}" height="16" rx="3" fill="${cor}"/>`;
        if (t.resp) s += `<text x="${x2 + 6}" y="${y + 4}" class="cro-rot">${esc(t.resp)}</text>`;
      }
    });
    $('croGantt').innerHTML = s + '</svg>';
  }

  // rolagem vertical junta (tabela e Gantt andam juntos)
  let rolando = false;
  for (const [a, b] of [['croTab', 'croGantt'], ['croGantt', 'croTab']]) $(a).addEventListener('scroll', () => { if (rolando) { rolando = false; return; } if (matchMedia('(max-width:760px)').matches) return; rolando = true; $(b).scrollTop = $(a).scrollTop; });

  // ---------- edição ----------
  $('croTab').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (!tr) return; const i = +tr.dataset.i; if (i !== sel) { sel = i; $('croTab').querySelectorAll('tr[data-i]').forEach((r) => r.classList.toggle('sel', +r.dataset.i === sel)); gantt(C(), calcula(C())); } });
  $('croTab').addEventListener('change', (e) => {
    const el = e.target, tr = el.closest('tr[data-i]'); if (!tr || !el.dataset.k) return;
    const t = C().tarefas[+tr.dataset.i], k = el.dataset.k;
    if (k === 'dur') t.dur = Math.max(0, Math.round(parseFloat(el.value.replace(',', '.')) || 0));
    else if (k === 'pct') t.pct = Math.max(0, Math.min(100, Math.round(+el.value || 0)));
    else t[k] = el.value.trim();
    salvar(); monta();
  });
  $('croIni').addEventListener('change', (e) => { if (e.target.value) { C().inicio = e.target.value; salvar(); monta(); } });
  $('croUteis').addEventListener('change', (e) => { C().uteis = e.target.checked; salvar(); monta(); });
  area.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => { escala = b.dataset.e; try { localStorage.setItem('traco-cro-escala', escala); } catch { /* */ } monta(); }));
  const acoes = {
    add() { insere('Nova tarefa', 1); },
    marco() { insere('Marco', 0); },
    rec() { const T = C().tarefas; if (sel > 0 && T[sel] && T[sel].nivel <= T[sel - 1].nivel) T[sel].nivel++; },
    ava() { const T = C().tarefas; if (T[sel]?.nivel > 1) T[sel].nivel--; },
    sobe() { const T = C().tarefas; if (sel > 0) { troca(sel, sel - 1); sel--; } },
    desce() { const T = C().tarefas; if (sel < T.length - 1) { troca(sel, sel + 1); sel++; } },
    del() { const T = C().tarefas; if (!T[sel]) return; if (!confirm(`Apagar "${T[sel].nome}"?`)) return; T.splice(sel, 1); renumera(sel, -1, true); sel = Math.max(0, sel - 1); },
  };
  // ao inserir/apagar linhas, as predecessoras (por número) acompanham — como no MS Project
  function renumera(pos, delta, apagou) { // pos = índice da linha inserida/apagada
    for (const t of C().tarefas) {
      t.pred = String(t.pred || '').split(/[;,\s]+/).filter(Boolean).map((x) => parseInt(x, 10)).filter((x) => Number.isInteger(x) && !(apagou && x === pos + 1))
        .map((x) => (apagou ? (x > pos + 1 ? x - 1 : x) : (x >= pos + 1 ? x + 1 : x))).join(';');
    }
  }
  function insere(nome, dur) {
    const T = C().tarefas, antes = T.length ? sel : -1, pos = antes + 1, nv = T[sel]?.nivel || 1;
    renumera(pos, 1, false);
    T.splice(pos, 0, { id: novoId(), nome, dur, nivel: nv, pred: antes >= 0 ? String(antes + 1) : '', pct: 0, resp: '' }); sel = pos;
  }
  function troca(a, b) {
    const T = C().tarefas; [T[a], T[b]] = [T[b], T[a]];
    for (const t of T) t.pred = String(t.pred || '').split(/[;,\s]+/).filter(Boolean).map((x) => { const n = parseInt(x, 10); return n === a + 1 ? b + 1 : n === b + 1 ? a + 1 : n; }).join(';');
  }
  area.querySelectorAll('[data-c]').forEach((b) => {
    if (acoes[b.dataset.c]) b.onclick = () => { acoes[b.dataset.c](); salvar(); monta(); };
  });

  // ---------- IA ----------
  area.querySelector('[data-c=ia]').onclick = async (e) => {
    const p = P(), b = e.currentTarget, c = C();
    if (c.tarefas.length && !confirm('Substituir o cronograma atual pelo que a IA montar? (Desfazer não volta.)')) return;
    const notas = (k) => (p.canvas?.[k] || []).map((n) => n.t).filter(Boolean);
    const canvas = JSON.stringify({ entregas: notas('entregas'), linha_do_tempo: notas('linha_do_tempo'), equipe: notas('equipe'), restricoes: notas('restricoes'), produto: notas('produto') });
    const pecas = p.spec ? [p.spec.resumo, ...(p.spec.pecas || []).map((x) => `- ${x.nome}`), ...(p.spec.montagem || []).map((x) => `- montagem: ${x}`)].filter(Boolean).join('\n') : '';
    b.disabled = true; $('croMsg').textContent = '✨ Montando o cronograma… (20 a 40 s)';
    try {
      const r = await window.tracoChamarIA({ canvas: { fase: 'crono', nome: p.nome, ideia: [p.ideia, p.pedido].filter(Boolean).join(' — '), canvas, pecas } });
      const T = (r.tarefas || []).slice(0, 80).map((t) => ({ id: novoId(), nome: String(t.nome || 'Tarefa').slice(0, 120), nivel: Math.max(1, Math.min(4, +t.nivel || 1)), dur: Number.isFinite(+t.dur) && t.dur !== '' && t.dur != null ? Math.max(0, Math.round(+t.dur)) : null, pred: String(t.pred ?? '').replace(/[^\d;,\s]/g, ''), pct: 0, resp: String(t.resp || '').slice(0, 40) }));
      if (!T.length) throw new Error('A IA não devolveu tarefas.');
      T.forEach((t, i) => { if (t.dur == null) t.dur = T[i + 1]?.nivel > t.nivel ? 0 : 1; }); // tarefa sem duração = 1 dia; marco (0) fica marco
      c.tarefas = T; sel = 0; salvar(); monta();
    } catch (err) { $('croMsg').textContent = String(err.message || err); }
    b.disabled = false;
  };

  // ---------- exportar (abre no Excel; no MS Project: Arquivo › Abrir › CSV, assistente de importação) ----------
  area.querySelector('[data-c=csv]').onclick = () => {
    const p = P(), c = C(), R = calcula(c);
    const lin = [['Id', 'Nome', 'Duração', 'Início', 'Término', 'Predecessoras', '% Concluída', 'Nível da estrutura de tópicos', 'Nomes dos recursos']];
    c.tarefas.forEach((t, i) => {
      const marco = !R.resumo[i] && !(+t.dur), ini = diaDe(c, marco ? Math.max(0, R.ini[i] - 1) : R.ini[i]), fim = diaDe(c, Math.max(R.ini[i], R.fim[i] - 1));
      lin.push([i + 1, t.nome, `${R.resumo[i] ? R.fim[i] - R.ini[i] : +t.dur || 0} dias`, ini.toLocaleDateString('pt-BR'), (marco ? ini : fim).toLocaleDateString('pt-BR'), t.pred || '', `${R.resumo[i] ? pctResumo(c, R, i) : +t.pct || 0}%`, t.nivel, t.resp || '']);
    });
    const csv = '﻿' + lin.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const u = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), a = document.createElement('a');
    a.href = u; a.download = `cronograma-${p.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').toLowerCase()}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000);
  };
})();
