// 🗂️ Project Model Canvas (PM Canvas, Finocchio) dentro de cada projeto: post-its por bloco, ✨ IA, 🎤 pitch, PNG.
(() => {
  const $ = (id) => document.getElementById(id);
  const painel = $('projetosMode'); if (!painel) return;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const BLOCOS = [
    // id, título, ícone, pergunta, coluna, linha inicial, altura (grade 5 × 6)
    ['justificativas', 'Justificativas', '💬', 'Por quê? · passado', 1, 1, 2],
    ['objetivo', 'Objetivo SMART', '🎯', 'Por quê?', 1, 3, 2],
    ['beneficios', 'Benefícios', '📈', 'Por quê? · futuro', 1, 5, 2],
    ['produto', 'Produto', '📦', 'O quê?', 2, 1, 3],
    ['requisitos', 'Requisitos', '📝', 'O quê?', 2, 4, 3],
    ['stakeholders', 'Stakeholders & fatores externos', '🤝', 'Quem?', 3, 1, 3],
    ['equipe', 'Equipe', '👥', 'Quem?', 3, 4, 3],
    ['premissas', 'Premissas', '☁️', 'Como?', 4, 1, 2],
    ['entregas', 'Grupo de entregas', '🧱', 'Como?', 4, 3, 2],
    ['restricoes', 'Restrições', '⛔', 'Como?', 4, 5, 2],
    ['riscos', 'Riscos', '💣', 'Quando? Quanto?', 5, 1, 2],
    ['linha_do_tempo', 'Linha do tempo', '⏱️', 'Quando?', 5, 3, 2],
    ['custos', 'Custos', '💲', 'Quanto?', 5, 5, 2],
  ];
  const COR = { usuario: '#ffe57a', ia: '#bfe0ff' };

  // abas internas do projeto: Peças 3D | Canvas
  const corpo = painel.querySelector('.prj-corpo');
  const abas = document.createElement('div'); abas.className = 'prj-abas';
  abas.innerHTML = '<button type="button" data-a="pecas" class="on">🧩 Peças 3D</button><button type="button" data-a="canvas">🗂️ Canvas do projeto</button>';
  corpo.before(abas);
  const area = document.createElement('div'); area.className = 'pmc'; area.hidden = true;
  area.innerHTML = `
    <div class="pmc-barra">
      <button type="button" class="pmc-ia" data-c="ia">✨ Preencher com IA</button>
      <button type="button" data-c="pitch">🎤 Pitch</button>
      <button type="button" data-c="png">⬇ Imagem</button>
      <button type="button" data-c="limpaia" title="Apagar só os post-its azuis (sugeridos pela IA)">🧹 Tirar sugestões da IA</button>
      <span class="pmc-zoom"><button type="button" data-z="-">−</button><b id="pmcZ">100%</b><button type="button" data-z="+">＋</button></span>
      <span class="pmc-msg" id="pmcMsg"></span>
    </div>
    <p class="pmc-dica">Amarelo = seu · azul = sugestão da IA (toque para editar; apague o que não servir). Deslize para o lado no celular.</p>
    <div class="pmc-rola"><div class="pmc-grade" id="pmcGrade"></div></div>
    <dialog class="ras-dlg pmc-dlg" id="pmcPitch"><form method="dialog"><h3>🎤 Pitch do projeto</h3><div id="pmcPitchTxt" class="pmc-pitch"></div>
      <div class="ras-acoes"><button type="button" class="secondary-button" data-p="copiar">Copiar</button><button class="primary-button">Fechar</button></div></form></dialog>`;
  corpo.after(area);
  // abas internas do projeto (outras abas, como o Cronograma, entram aqui pelo mesmo clique)
  abas.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    abas.querySelectorAll('button').forEach((q) => q.classList.toggle('on', q === b));
    corpo.hidden = b.dataset.a !== 'pecas'; area.hidden = b.dataset.a !== 'canvas'; if (!area.hidden) monta();
    document.dispatchEvent(new CustomEvent('traco-prj-aba', { detail: b.dataset.a }));
  });

  const P = () => window.tracoProjetos?.atual?.();
  const salvar = () => window.tracoProjetos?.salvar?.();
  const notas = (p, k) => ((p.canvas ||= {})[k] ||= []);
  const novoId = () => Math.random().toString(36).slice(2, 9);

  let monta = function () {
    const p = P(); if (!p) return;
    $('pmcGrade').innerHTML = BLOCOS.map(([k, t, ic, q, c, l, a]) => `
      <section class="pmc-bloco" data-k="${k}" style="grid-column:${c};grid-row:${l} / span ${a}">
        <header><span>${ic}</span><div><b>${esc(t)}</b><small>${esc(q)}</small></div><button type="button" data-add="${k}" title="Novo post-it">＋</button></header>
        <div class="pmc-notas">${notas(p, k).map((n) => `<div class="pmc-nota" data-id="${n.id}" style="background:${n.ia ? COR.ia : COR.usuario}"><textarea rows="2" data-k="${k}" data-id="${n.id}">${esc(n.t)}</textarea><button type="button" data-del="${n.id}" data-k="${k}" title="Apagar">×</button></div>`).join('')}</div>
      </section>`).join('');
    $('pmcGrade').querySelectorAll('textarea').forEach(ajusta);
  };
  function ajusta(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
  $('pmcGrade').addEventListener('input', (e) => {
    const ta = e.target; if (ta.tagName !== 'TEXTAREA') return;
    const n = notas(P(), ta.dataset.k).find((x) => x.id === ta.dataset.id); if (n) { n.t = ta.value; n.ia = false; ta.parentElement.style.background = COR.usuario; salvar(); }
    ajusta(ta);
  });
  $('pmcGrade').addEventListener('focusout', (e) => { // post-it vazio some
    const ta = e.target; if (ta.tagName !== 'TEXTAREA' || ta.value.trim()) return;
    const p = P(), l = notas(p, ta.dataset.k), i = l.findIndex((x) => x.id === ta.dataset.id); if (i >= 0) { l.splice(i, 1); salvar(); setTimeout(monta, 0); }
  });
  $('pmcGrade').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]'), del = e.target.closest('[data-del]'), p = P();
    if (add) { const n = { id: novoId(), t: '', ia: false }; notas(p, add.dataset.add).push(n); salvar(); monta(); $('pmcGrade').querySelector(`textarea[data-id="${n.id}"]`)?.focus(); }
    if (del) { const l = notas(p, del.dataset.k), i = l.findIndex((x) => x.id === del.dataset.del); if (i >= 0) { l.splice(i, 1); salvar(); monta(); } }
  });

  // ---------- IA ----------
  function contexto(p) {
    const q = (window.tracoRascunhos?.quadros?.() || []).find((x) => x.id === p.quadro);
    const quadro = q ? q.objs.filter((o) => (o.t === 'nota' || o.t === 'texto') && o.texto?.trim()).map((o) => '- ' + o.texto.trim().replace(/\s+/g, ' ')).join('\n') : '';
    const pecas = p.spec ? [p.spec.resumo, ...(p.spec.pecas || []).map((x) => `- ${x.nome}`), ...(p.spec.componentes || []).map((c) => `- comprar: ${c.nome}`)].filter(Boolean).join('\n') : '';
    const canvas = JSON.stringify(Object.fromEntries(BLOCOS.map(([k]) => [k, notas(p, k).filter((n) => n.t.trim()).map((n) => n.t)])));
    return { nome: p.nome, ideia: [p.ideia, p.pedido].filter(Boolean).join(' — '), quadro, pecas, canvas };
  }
  const msg = (t) => ($('pmcMsg').textContent = t);
  area.querySelector('[data-c=ia]').onclick = async (e) => {
    const p = P(), b = e.currentTarget; if (!p) return;
    if (!(p.ideia || '').trim() && !p.quadro && !p.spec) { msg('Escreva a ideia do projeto (aba Peças 3D) ou ligue um quadro.'); return; }
    b.disabled = true; msg('✨ Preenchendo o canvas… (20 a 40 s)');
    try {
      const r = await window.tracoChamarIA({ canvas: contexto(p) });
      let n = 0;
      for (const [k] of BLOCOS) for (const t of Array.isArray(r[k]) ? r[k] : []) {
        const s = String(t || '').trim(); if (!s || notas(p, k).some((x) => x.t.trim().toLowerCase() === s.toLowerCase())) continue;
        notas(p, k).push({ id: novoId(), t: s.slice(0, 200), ia: true }); n++;
      }
      salvar(); monta(); msg(n ? `✨ ${n} post-its sugeridos (azuis).` : 'A IA não tinha nada novo para sugerir.');
    } catch (err) { msg(String(err.message || err)); }
    b.disabled = false;
  };
  area.querySelector('[data-c=limpaia]').onclick = () => {
    const p = P(); let n = 0; for (const [k] of BLOCOS) { const l = notas(p, k), antes = l.length; p.canvas[k] = l.filter((x) => !x.ia); n += antes - p.canvas[k].length; }
    if (!n) { msg('Não há sugestões da IA.'); return; } salvar(); monta(); msg(`🧹 ${n} sugestões tiradas.`);
  };
  area.querySelector('[data-c=pitch]').onclick = async (e) => {
    const p = P(), b = e.currentTarget, vazio = BLOCOS.every(([k]) => !notas(p, k).some((n) => n.t.trim()));
    if (vazio) { msg('Preencha o canvas primeiro (ou use ✨ Preencher com IA).'); return; }
    b.disabled = true; msg('🎤 Escrevendo o pitch…');
    try {
      const r = await window.tracoChamarIA({ canvas: { ...contexto(p), fase: 'pitch' } });
      p.pitch = r.pitch || ''; salvar();
      $('pmcPitchTxt').innerHTML = esc(p.pitch).split(/\n+/).map((x) => `<p>${x}</p>`).join('') + ((r.lacunas || []).length ? `<div class="prj-aviso"><b>Vale completar</b><ul>${r.lacunas.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '');
      $('pmcPitch').showModal(); msg('');
    } catch (err) { msg(String(err.message || err)); }
    b.disabled = false;
  };
  $('pmcPitch').querySelector('[data-p=copiar]').onclick = async (e) => { try { await navigator.clipboard.writeText(P()?.pitch || ''); e.target.textContent = 'Copiado ✓'; } catch { e.target.textContent = 'Não deu para copiar'; } };

  // ---------- imagem (PNG) ----------
  area.querySelector('[data-c=png]').onclick = () => {
    const p = P(); const W = 2400, H = 1500, m = 40, top = 110, cw = (W - 2 * m) / 5, rh = (H - top - m) / 6;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#111'; g.font = '800 44px Manrope, Arial'; g.textBaseline = 'top';
    g.fillText(`${p.nome} — Project Model Canvas`, m, 36);
    const quebra = (t, w, f) => { g.font = f; const out = []; let l = ''; for (const x of t.split(/\s+/)) { const n = l ? l + ' ' + x : x; if (g.measureText(n).width > w && l) { out.push(l); l = x; } else l = n; } if (l) out.push(l); return out; };
    for (const [k, t, ic, , col, lin, alt] of BLOCOS) {
      const x = m + (col - 1) * cw, y = top + (lin - 1) * rh, w = cw - 10, h = alt * rh - 10;
      g.strokeStyle = '#bbb'; g.lineWidth = 3; g.strokeRect(x, y, w, h);
      g.fillStyle = '#111'; g.font = '800 26px Manrope, Arial'; g.fillText(`${ic} ${t}`, x + 14, y + 12);
      let yy = y + 54, xx = x + 12; const nw = (w - 36) / 2;
      for (const n of notas(p, k).filter((q) => q.t.trim())) {
        const lin2 = quebra(n.t, nw - 20, '600 19px DM Sans, Arial').slice(0, 5), nh = 18 + lin2.length * 23;
        if (yy + nh > y + h - 8) { if (xx === x + 12) { xx += nw + 12; yy = y + 54; } else break; }
        if (yy + nh > y + h - 8) break;
        g.fillStyle = n.ia ? COR.ia : COR.usuario; g.fillRect(xx, yy, nw, nh); g.fillStyle = '#1b1b1b'; g.font = '600 19px DM Sans, Arial';
        lin2.forEach((l, i) => g.fillText(l, xx + 10, yy + 9 + i * 23)); yy += nh + 10;
      }
    }
    c.toBlob((bl) => { const u = URL.createObjectURL(bl), a = document.createElement('a'); a.href = u; a.download = `canvas-${p.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').toLowerCase()}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); });
  };

  // ---------- zoom do canvas (botões e pinça com dois dedos) ----------
  let zoom = 1; try { zoom = +localStorage.getItem('traco-pmc-zoom') || 1; } catch { /* */ }
  function aplicaZoom(z, cx, cy) {
    const rola = area.querySelector('.pmc-rola'), g = $('pmcGrade'), antes = zoom;
    zoom = Math.max(.4, Math.min(2.5, z)); g.style.zoom = zoom; $('pmcZ').textContent = Math.round(zoom * 100) + '%';
    if (cx != null) { const r = rola.getBoundingClientRect(), px = cx - r.left; rola.scrollLeft = (rola.scrollLeft + px) * zoom / antes - px; }
    try { localStorage.setItem('traco-pmc-zoom', String(zoom)); } catch { /* */ }
  }
  area.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => aplicaZoom(zoom * (b.dataset.z === '+' ? 1.2 : 1 / 1.2))));
  const toques = new Map(); let d0 = 0;
  const rola = area.querySelector('.pmc-rola');
  rola.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { const [a, b] = e.touches; d0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); } }, { passive: true });
  rola.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2 || !d0) return; e.preventDefault();
    const [a, b] = e.touches, d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    aplicaZoom(zoom * d / d0, (a.clientX + b.clientX) / 2); d0 = d;
  }, { passive: false });
  rola.addEventListener('touchend', (e) => { if (e.touches.length < 2) d0 = 0; });
  rola.addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); aplicaZoom(zoom * Math.exp(-e.deltaY * .01), e.clientX); }, { passive: false });
  void toques;
  const montaAntes = monta; monta = function () { montaAntes(); aplicaZoom(zoom); };

  // trocou de projeto → redesenha se o canvas estiver aberto
  document.addEventListener('traco-projeto', () => { if (!area.hidden) monta(); });
  window.tracoCanvas = { BLOCOS, notas: (p, k) => (p.canvas?.[k] || []).filter((n) => n.t?.trim()) };
})();
