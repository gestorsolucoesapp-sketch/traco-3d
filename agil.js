// 🏃 Ágil: quadro Scrum/Kanban do projeto — backlog de histórias, sprints, limite WIP, pontos, velocidade e burndown.
(() => {
  const $ = (id) => document.getElementById(id);
  const painel = $('projetosMode'), abas = painel?.querySelector('.prj-abas'); if (!abas) return;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = () => window.tracoProjetos?.atual?.();
  const salvar = () => { window.tracoProjetos?.salvar?.(); };
  const novoId = () => Math.random().toString(36).slice(2, 9);
  const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const D = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); };
  const ISO = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const br = (dt) => `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
  const COLS = [['backlog', 'Backlog do produto'], ['afazer', 'A fazer'], ['fazendo', 'Fazendo'], ['revisao', 'Em revisão'], ['feito', 'Feito']];
  const PTS = [1, 2, 3, 5, 8, 13, 21];
  const PRIO = { Alta: '#d64545', Média: '#d9902a', Baixa: '#5a8f5a' };

  const A = (p = P()) => {
    p.agil ||= { inicio: p.crono?.inicio || hojeISO(), dias: 14, wip: 3, sprints: [], itens: [], ver: 'atual' };
    const a = p.agil; if (!a.sprints.length) a.sprints.push({ id: novoId(), meta: '' });
    return a;
  };
  const datas = (a, i) => { const ini = D(a.inicio); ini.setDate(ini.getDate() + i * a.dias); const fim = new Date(ini); fim.setDate(fim.getDate() + a.dias - 1); return { ini, fim }; };
  function atual(a) { // sprint que contém hoje (ou a última)
    const h = D(hojeISO()); for (let i = 0; i < a.sprints.length; i++) { const { ini, fim } = datas(a, i); if (h >= ini && h <= fim) return a.sprints[i].id; }
    return h < D(a.inicio) ? a.sprints[0].id : a.sprints[a.sprints.length - 1].id;
  }
  const verId = (a) => (a.ver === 'atual' ? atual(a) : a.ver);

  // ---------- tela ----------
  const bt = document.createElement('button'); bt.type = 'button'; bt.dataset.a = 'agil'; bt.textContent = '🏃 Ágil';
  abas.appendChild(bt);
  const area = document.createElement('div'); area.className = 'agl'; area.hidden = true;
  area.innerHTML = `
    <div class="cro-barra">
      <button type="button" data-c="add">＋ História</button>
      <button type="button" class="agl-ia" data-c="ia">✨ Backlog com IA</button>
      <button type="button" data-c="puxar" title="Criar histórias com as entregas e requisitos do Canvas (ou tarefas do Cronograma)">🔗 Puxar do projeto</button>
      <span class="cro-sep"></span>
      <label>Ver <select id="aglVer"></select></label>
      <button type="button" data-c="sprint">＋ Sprint</button>
      <label>Sprint de <input id="aglDias" inputmode="numeric" class="agl-n" /> dias</label>
      <label>Início <input type="date" id="aglIni" /></label>
      <label title="Limite de trabalho em andamento (Kanban)">WIP <input id="aglWip" inputmode="numeric" class="agl-n" /></label>
    </div>
    <p class="agl-msg" id="aglMsg"></p>
    <div class="agl-meta" id="aglMeta"></div>
    <div class="agl-quadro" id="aglQuadro"></div>
    <div class="agl-baixo"><div class="agl-burn" id="aglBurn"></div><div class="agl-vel" id="aglVel"></div></div>
    <dialog class="ras-dlg agl-dlg" id="aglDlg"><form method="dialog" id="aglForm"></form></dialog>`;
  (painel.querySelector('.pdm') || painel.querySelector('.cro') || painel.querySelector('.pmc')).after(area);
  document.addEventListener('traco-prj-aba', (e) => { area.hidden = e.detail !== 'agil'; if (!area.hidden) monta(); });
  document.addEventListener('traco-projeto', () => { if (!area.hidden) monta(); });

  function pontos(l) { return l.reduce((s, x) => s + (+x.pts || 0), 0); }
  function monta() {
    const p = P(); if (!p) return; const a = A(p), sid = verId(a), todas = a.ver === 'todas';
    $('aglVer').innerHTML = `<option value="atual">Sprint atual</option>${a.sprints.map((s, i) => { const { ini, fim } = datas(a, i); return `<option value="${s.id}">Sprint ${i + 1} · ${br(ini)}–${br(fim)}</option>`; }).join('')}<option value="todas">Todas as sprints</option>`;
    $('aglVer').value = a.ver; $('aglDias').value = a.dias; $('aglIni').value = a.inicio; $('aglWip').value = a.wip || '';
    const si = a.sprints.findIndex((s) => s.id === sid), sp = a.sprints[si];
    $('aglMeta').innerHTML = todas ? '' : `<b>Sprint ${si + 1}</b> <span>${br(datas(a, si).ini)} → ${br(datas(a, si).fim)}</span><label>🎯 Meta da sprint <input data-meta value="${esc(sp.meta || '')}" placeholder="O que esta sprint entrega de valor" /></label>`;
    const nome = (id) => { const i = a.sprints.findIndex((s) => s.id === id); return i >= 0 ? `S${i + 1}` : ''; };
    $('aglQuadro').innerHTML = COLS.map(([c, t]) => {
      const l = a.itens.filter((x) => x.col === c && (c === 'backlog' || todas || x.sprint === sid));
      const estoura = c === 'fazendo' && a.wip && l.length > a.wip;
      return `<section class="agl-col${estoura ? ' estoura' : ''}" data-col="${c}"><header><b>${t}</b><span>${l.length}${c === 'fazendo' && a.wip ? `/${a.wip}` : ''} · ${pontos(l)} pts</span></header>
        <div class="agl-cards">${l.map((x) => `<article class="agl-card${x.ia ? ' ia' : ''}" data-id="${x.id}" style="border-left-color:${PRIO[x.prio] || '#bbb'}">
          <div class="agl-t">${esc(x.titulo || '(sem título)')}</div>
          ${x.historia ? `<div class="agl-h">${esc(x.historia)}</div>` : ''}
          <div class="agl-rod"><span class="agl-pts">${x.pts || '?'}</span>${x.prio ? `<span>${x.prio}</span>` : ''}${x.resp ? `<span>👤 ${esc(x.resp)}</span>` : ''}${todas && x.sprint ? `<span>${nome(x.sprint)}</span>` : ''}
            <i></i><button type="button" data-mv="-1" title="Voltar">◀</button><button type="button" data-mv="1" title="Avançar">▶</button></div></article>`).join('')}
        ${c === 'backlog' ? '<button type="button" class="agl-novo" data-c="add">＋ História</button>' : ''}</div></section>`;
    }).join('');
    burndown(a, todas ? null : si); velocidade(a);
  }

  function burndown(a, si) {
    const el = $('aglBurn'); if (si == null) { el.innerHTML = '<p class="agl-vazio">Escolha uma sprint para ver o burndown.</p>'; return; }
    const sid = a.sprints[si].id, l = a.itens.filter((x) => x.sprint === sid), tot = pontos(l), { ini } = datas(a, si), n = a.dias;
    if (!tot) { el.innerHTML = '<p class="agl-vazio">Burndown: coloque histórias com pontos nesta sprint.</p>'; return; }
    const W = 520, H = 220, m = 34, x = (d) => m + (d / n) * (W - m - 12), y = (v) => H - 26 - (v / tot) * (H - 46);
    const hoje = D(hojeISO()), dh = Math.round((hoje - ini) / 864e5), real = [];
    for (let d = 0; d <= Math.min(n, dh + 1); d++) { const lim = new Date(ini); lim.setDate(lim.getDate() + d); const feito = pontos(l.filter((q) => q.feitoEm && D(q.feitoEm) < lim)); real.push([d, tot - feito]); }
    const grade = [0, .25, .5, .75, 1].map((f) => `<line x1="${m}" x2="${W - 12}" y1="${y(tot * f)}" y2="${y(tot * f)}" stroke="#eee"/><text x="${m - 6}" y="${y(tot * f) + 4}" text-anchor="end">${Math.round(tot * f)}</text>`).join('');
    const marcas = [0, Math.round(n / 2), n].map((d) => { const dt = new Date(ini); dt.setDate(dt.getDate() + d); return `<text x="${x(d)}" y="${H - 8}" text-anchor="middle">${br(dt)}</text>`; }).join('');
    el.innerHTML = `<b>📉 Burndown da Sprint ${si + 1}</b><svg viewBox="0 0 ${W} ${H}" class="agl-svg">${grade}${marcas}
      <line x1="${x(0)}" y1="${y(tot)}" x2="${x(n)}" y2="${y(0)}" stroke="#9aa" stroke-dasharray="5 4" stroke-width="2"/>
      ${real.length > 1 ? `<polyline fill="none" stroke="#d76845" stroke-width="3" points="${real.map(([d, v]) => `${x(d)},${y(v)}`).join(' ')}"/>` : ''}
      ${real.map(([d, v]) => `<circle cx="${x(d)}" cy="${y(v)}" r="3" fill="#d76845"/>`).join('')}</svg>
      <small><i class="l1"></i> ideal <i class="l2"></i> real · faltam <b>${real.length ? real[real.length - 1][1] : tot}</b> de ${tot} pts</small>`;
  }
  function velocidade(a) {
    const v = a.sprints.map((s, i) => ({ i, pts: pontos(a.itens.filter((x) => x.sprint === s.id && x.col === 'feito')), plan: pontos(a.itens.filter((x) => x.sprint === s.id)) }));
    const fechadas = v.filter((s) => datas(a, s.i).fim < D(hojeISO())), media = fechadas.length ? Math.round(pontos(fechadas) / fechadas.length * 10) / 10 : null;
    const max = Math.max(1, ...v.map((s) => s.plan)), back = pontos(a.itens.filter((x) => x.col !== 'feito'));
    $('aglVel').innerHTML = `<b>🚀 Velocidade</b><div class="agl-barras">${v.map((s) => `<div title="planejado ${s.plan} · feito ${s.pts}"><span style="height:${s.plan / max * 100}%"><i style="height:${s.plan ? s.pts / s.plan * 100 : 0}%"></i></span><small>S${s.i + 1}</small></div>`).join('')}</div>
      <p>${media != null ? `Média: <b>${String(media).replace('.', ',')} pts/sprint</b> · faltam ${back} pts ≈ <b>${Math.ceil(back / Math.max(media, .1))} sprint(s)</b>` : `Faltam <b>${back} pts</b>. A média aparece quando a 1ª sprint terminar.`}</p>
      <small><i class="b1"></i> planejado <i class="b2"></i> feito</small>`;
  }

  // ---------- mover ----------
  function move(x, col) {
    const a = A(); if (x.col === col) return;
    if (col === 'backlog') x.sprint = '';
    else if (!x.sprint) x.sprint = a.ver === 'todas' ? atual(a) : verId(a);
    if (col === 'feito') x.feitoEm = hojeISO(); else delete x.feitoEm;
    x.col = col; x.ia = false; salvar(); monta();
    if (col === 'fazendo' && a.wip && a.itens.filter((q) => q.col === 'fazendo' && q.sprint === x.sprint).length > a.wip) aviso(`⚠️ "Fazendo" passou do limite WIP (${a.wip}). Termine algo antes de puxar mais.`);
  }
  function aviso(t) { $('aglMsg').textContent = t; clearTimeout(aviso.t); aviso.t = setTimeout(() => ($('aglMsg').textContent = ''), 6000); }
  // arrastar com o dedo/mouse (funciona no iPad)
  let arr = null;
  $('aglQuadro').addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.agl-card'); if (!c || e.target.closest('button')) return;
    arr = { c, id: c.dataset.id, x: e.clientX, y: e.clientY, on: false, pid: e.pointerId, toque: e.pointerType === 'touch', pronto: e.pointerType !== 'touch' };
    if (arr.toque) { const a0 = arr; a0.t = setTimeout(() => { if (arr === a0) { a0.pronto = true; c.classList.add('agl-pega'); navigator.vibrate?.(15); } }, 280); } // no dedo: segura um instante para arrastar (senão rola a tela)
  });
  addEventListener('pointermove', (e) => {
    if (!arr || e.pointerId !== arr.pid) return;
    const dist = Math.hypot(e.clientX - arr.x, e.clientY - arr.y);
    if (!arr.pronto) { if (dist > 10) { clearTimeout(arr.t); arr = null; } return; }
    if (!arr.on && dist > 6) { arr.on = true; arr.g = arr.c.cloneNode(true); arr.g.classList.add('agl-fantasma'); arr.g.style.width = arr.c.offsetWidth + 'px'; document.body.appendChild(arr.g); arr.c.classList.add('agl-sai'); }
    if (arr.on) { e.preventDefault(); arr.g.style.transform = `translate(${e.clientX - 20}px,${e.clientY - 20}px) rotate(2deg)`; const col = document.elementFromPoint(e.clientX, e.clientY)?.closest('.agl-col'); document.querySelectorAll('.agl-col.alvo').forEach((q) => q !== col && q.classList.remove('alvo')); col?.classList.add('alvo'); }
  }, { passive: false });
  addEventListener('pointerup', (e) => {
    if (!arr || e.pointerId !== arr.pid) return; const a0 = arr; arr = null; clearTimeout(a0.t); a0.c.classList.remove('agl-pega');
    if (!a0.on) { if (Math.hypot(e.clientX - a0.x, e.clientY - a0.y) < 10) edita(a0.id); return; }
    a0.g.remove(); a0.c.classList.remove('agl-sai'); document.querySelectorAll('.agl-col.alvo').forEach((q) => q.classList.remove('alvo'));
    const col = document.elementFromPoint(e.clientX, e.clientY)?.closest('.agl-col'); const x = A().itens.find((q) => q.id === a0.id);
    if (col && x) move(x, col.dataset.col);
  });
  addEventListener('pointercancel', () => { if (arr) { clearTimeout(arr.t); arr.c.classList.remove('agl-pega', 'agl-sai'); arr.g?.remove(); } arr = null; });
  $('aglQuadro').addEventListener('touchmove', (e) => { if (arr?.on) e.preventDefault(); }, { passive: false });
  $('aglQuadro').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mv]'); if (!b) return; e.stopPropagation();
    const x = A().itens.find((q) => q.id === b.closest('.agl-card').dataset.id), i = COLS.findIndex(([c]) => c === x.col) + +b.dataset.mv;
    if (COLS[i]) move(x, COLS[i][0]);
  });

  // ---------- editar uma história ----------
  function edita(id) {
    const a = A(), x = a.itens.find((q) => q.id === id); if (!x) return;
    $('aglForm').innerHTML = `<h3>${x.titulo ? 'História' : 'Nova história'}</h3>
      <label class="agl-f">Título<input name="titulo" value="${esc(x.titulo)}" placeholder="Curto, ex.: Mapear requisitos" /></label>
      <label class="agl-f">História de usuário<textarea name="historia" rows="2" placeholder="Como <quem>, quero <o quê> para <por quê>">${esc(x.historia)}</textarea></label>
      <label class="agl-f">Critérios de aceite<textarea name="criterios" rows="3" placeholder="- um critério por linha">${esc(x.criterios)}</textarea></label>
      <div class="agl-lin"><label class="agl-f">Pontos<select name="pts"><option value="">?</option>${PTS.map((n) => `<option ${+x.pts === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="agl-f">Prioridade<select name="prio">${['', 'Alta', 'Média', 'Baixa'].map((o) => `<option ${x.prio === o ? 'selected' : ''} value="${o}">${o || '—'}</option>`).join('')}</select></label>
        <label class="agl-f">Responsável<input name="resp" value="${esc(x.resp)}" /></label></div>
      <div class="agl-lin"><label class="agl-f">Sprint<select name="sprint"><option value="">— backlog —</option>${a.sprints.map((s, i) => `<option value="${s.id}" ${x.sprint === s.id ? 'selected' : ''}>Sprint ${i + 1}</option>`).join('')}</select></label>
        <label class="agl-f">Coluna<select name="col">${COLS.map(([c, t]) => `<option value="${c}" ${x.col === c ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <div class="ras-acoes"><button type="button" class="secondary-button agl-del" data-del>🗑 Apagar</button><span style="flex:1"></span><button value="x" class="secondary-button">Cancelar</button><button value="ok" class="primary-button">Salvar</button></div>`;
    const dlg = $('aglDlg');
    $('aglForm').querySelector('[data-del]').onclick = () => { if (!confirm('Apagar esta história?')) return; a.itens = a.itens.filter((q) => q !== x); salvar(); dlg.close(); monta(); };
    dlg.onclose = () => {
      if (dlg.returnValue !== 'ok') { if (!x.titulo && !x.historia) { a.itens = a.itens.filter((q) => q !== x); monta(); } return; }
      const f = new FormData($('aglForm'));
      for (const k of ['titulo', 'historia', 'criterios', 'prio', 'resp']) x[k] = String(f.get(k) || '').trim();
      x.pts = f.get('pts') ? +f.get('pts') : ''; x.ia = false;
      const col = f.get('col'), sp = f.get('sprint');
      x.sprint = col === 'backlog' ? '' : sp || x.sprint || verId(a);
      if (sp && col === 'backlog') { x.sprint = sp; x.col = 'afazer'; } else { if (col === 'feito' && x.col !== 'feito') x.feitoEm = hojeISO(); if (col !== 'feito') delete x.feitoEm; x.col = col; }
      if (!x.titulo && !x.historia) a.itens = a.itens.filter((q) => q !== x);
      salvar(); monta();
    };
    dlg.returnValue = ''; dlg.showModal(); setTimeout(() => $('aglForm').querySelector('[name=titulo]').focus(), 50);
  }

  // ---------- barra ----------
  area.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]'); if (!b || !area.contains(b) || b.closest('#aglDlg')) return; const a = A(), c = b.dataset.c;
    if (c === 'add') { const x = { id: novoId(), titulo: '', historia: '', criterios: '', pts: '', prio: '', resp: '', col: 'backlog', sprint: '' }; a.itens.push(x); edita(x.id); }
    if (c === 'sprint') { a.sprints.push({ id: novoId(), meta: '' }); a.ver = a.sprints[a.sprints.length - 1].id; salvar(); monta(); }
    if (c === 'puxar') puxar();
    if (c === 'ia') ia(b);
  });
  $('aglVer').onchange = (e) => { A().ver = e.target.value; salvar(); monta(); };
  $('aglDias').onchange = (e) => { const v = Math.round(+e.target.value); if (v >= 1 && v <= 60) { A().dias = v; salvar(); } monta(); };
  $('aglIni').onchange = (e) => { if (e.target.value) { A().inicio = e.target.value; salvar(); } monta(); };
  $('aglWip').onchange = (e) => { A().wip = Math.max(0, Math.round(+e.target.value) || 0); salvar(); monta(); };
  $('aglMeta').addEventListener('change', (e) => { if (!e.target.matches('[data-meta]')) return; const a = A(); a.sprints.find((s) => s.id === verId(a)).meta = e.target.value.trim(); salvar(); });

  function puxar() {
    const p = P(), a = A(p), tem = new Set(a.itens.map((x) => (x.titulo || '').trim().toLowerCase()));
    let fonte = [...(p.canvas?.entregas || []), ...(p.canvas?.requisitos || [])].map((n) => n.t?.trim()).filter(Boolean), de = 'do Canvas (entregas e requisitos)';
    if (!fonte.length && p.crono?.tarefas?.length) { const T = p.crono.tarefas; fonte = T.filter((t, i) => !(T[i + 1]?.nivel > t.nivel) && +t.dur).map((t) => t.nome); de = 'do Cronograma'; }
    if (!fonte.length) { aviso('Nada para puxar: preencha as entregas/requisitos no Canvas ou o Cronograma.'); return; }
    let n = 0; for (const t of fonte) { if (tem.has(t.toLowerCase())) continue; a.itens.push({ id: novoId(), titulo: t.slice(0, 120), historia: '', criterios: '', pts: '', prio: '', resp: '', col: 'backlog', sprint: '' }); tem.add(t.toLowerCase()); n++; }
    salvar(); monta(); aviso(n ? `🔗 ${n} item(ns) ${de} no backlog. Toque num cartão para pôr pontos e critérios.` : 'Tudo isso já está no backlog.');
  }

  async function ia(b) {
    const p = P(), a = A(p);
    const notas = (k) => (p.canvas?.[k] || []).map((n) => n.t).filter(Boolean);
    const canvas = JSON.stringify({ objetivo: notas('objetivo'), produto: notas('produto'), requisitos: notas('requisitos'), entregas: notas('entregas'), equipe: notas('equipe'), stakeholders: notas('stakeholders'), restricoes: notas('restricoes') });
    const crono = (p.crono?.tarefas || []).map((t, i) => `${i + 1}. ${'  '.repeat(t.nivel - 1)}${t.nome}`).join('\n');
    if (!p.ideia?.trim() && canvas.length < 140 && !crono) { aviso('Escreva a ideia do projeto ou preencha o Canvas antes — sem isso a IA teria que inventar.'); return; }
    b.disabled = true; aviso('✨ Montando o backlog… (20 a 40 s)'); clearTimeout(aviso.t);
    try {
      const r = await window.tracoChamarIA({ canvas: { fase: 'agil', nome: p.nome, ideia: [p.ideia, p.pedido].filter(Boolean).join(' — '), canvas, crono, atual: a.itens.map((x) => x.titulo).join('\n') } });
      const L = (r.itens || []).slice(0, 40); if (!L.length) throw new Error('A IA não devolveu histórias.');
      const maxS = Math.min(12, Math.max(1, ...L.map((x) => Math.round(+x.sprint) || 1)));
      while (a.sprints.length < maxS) a.sprints.push({ id: novoId(), meta: '' });
      for (const x of L) {
        const s = Math.round(+x.sprint) || 0, pts = PTS.includes(+x.pts) ? +x.pts : '';
        a.itens.push({ id: novoId(), titulo: String(x.titulo || '').slice(0, 120), historia: String(x.historia || '').slice(0, 400), criterios: String(x.criterios || '').replace(/\\n/g, '\n').slice(0, 800), pts, prio: ['Alta', 'Média', 'Baixa'].includes(x.prio) ? x.prio : '', resp: '', col: s ? 'afazer' : 'backlog', sprint: s ? a.sprints[s - 1].id : '', ia: true });
      }
      a.ver = 'todas'; salvar(); monta(); aviso(`✨ ${L.length} histórias em ${maxS} sprint(s). Azul = sugestão da IA: confira pontos e critérios tocando no cartão.`);
    } catch (err) { aviso(String(err.message || err)); }
    b.disabled = false;
  }

  // para o relatório
  window.tracoAgil = {
    resumo(p) { const a = p.agil; if (!a?.itens?.length) return null; return { n: a.itens.length, pts: pontos(a.itens), feito: pontos(a.itens.filter((x) => x.col === 'feito')), sprints: a.sprints.length }; },
    html(p) {
      const a = p.agil; if (!a?.itens?.length) return '';
      const nome = (id) => { const i = a.sprints.findIndex((s) => s.id === id); return i >= 0 ? `Sprint ${i + 1}` : 'Backlog'; };
      return `<table><tr><th>História</th><th>Pts</th><th>Prioridade</th><th>Sprint</th><th>Situação</th><th>Responsável</th></tr>${a.itens.map((x) => `<tr><td><b>${esc(x.titulo)}</b>${x.historia ? `<br><small>${esc(x.historia)}</small>` : ''}</td><td>${x.pts || '?'}</td><td>${x.prio || ''}</td><td>${nome(x.sprint)}</td><td>${COLS.find(([c]) => c === x.col)?.[1] || ''}</td><td>${esc(x.resp)}</td></tr>`).join('')}</table>`;
    },
    COLS,
  };
})();
