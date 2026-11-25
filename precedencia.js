// 🔗 Diagrama de precedência (rede em blocos / MPM): tabela → rede com PDI, PDT, UDI, UDT, folgas e caminho crítico.
(() => {
  const $ = (id) => document.getElementById(id);
  const painel = $('projetosMode'), abas = painel?.querySelector('.prj-abas'); if (!abas) return;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = () => window.tracoProjetos?.atual?.();
  const salvar = () => window.tracoProjetos?.salvar?.();
  const fmt = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100).replace('.', ','));

  const bt = document.createElement('button'); bt.type = 'button'; bt.dataset.a = 'pdm'; bt.textContent = '🔗 Diagrama de precedência';
  abas.appendChild(bt);
  const area = document.createElement('div'); area.className = 'pdm'; area.hidden = true;
  area.innerHTML = `
    <div class="cro-barra">
      <button type="button" data-c="add">＋ Atividade</button>
      <button type="button" data-c="crono" title="Trazer as tarefas do Cronograma">📅 Trazer do Cronograma</button>
      <button type="button" data-c="limpa">🗑 Limpar</button>
      <label class="cro-chk"><input type="checkbox" id="pdmUm" /> contar a partir de 1</label>
      <span class="cro-sep"></span>
      <button type="button" data-c="png">⬇ Imagem</button>
      <span class="pmc-zoom"><button type="button" data-z="-">−</button><b id="pdmZ">100%</b><button type="button" data-z="+">＋</button></span>
    </div>
    <div class="pdm-corpo">
      <div class="pdm-tab"><table><thead><tr><th>Atividade</th><th>Descrição</th><th>Duração</th><th>Predecessoras</th><th></th></tr></thead><tbody id="pdmLin"></tbody></table>
        <p class="pdm-ajuda">Predecessoras: as atividades que precisam terminar antes, separadas por vírgula (ex.: A, B). Vazio = começa no início.</p>
        <p class="pdm-erro" id="pdmErro"></p>
        <div id="pdmRes"></div></div>
      <div class="pdm-rede"><div class="pdm-leg"><span class="pdm-bloco-leg"><b>PDI</b><b>Dur</b><b>PDT</b><i>Atividade</i><b>UDI</b><b>Folga</b><b>UDT</b></span>
        <small>PDI/PDT = primeira data de início/término (cedo) · UDI/UDT = última data (tarde) · vermelho = caminho crítico (folga 0)</small></div>
        <div class="pdm-rola" id="pdmRola"><div id="pdmSvg"></div></div></div>
    </div>`;
  (painel.querySelector('.cro') || painel.querySelector('.pmc')).after(area);
  document.addEventListener('traco-prj-aba', (e) => { area.hidden = e.detail !== 'pdm'; if (!area.hidden) monta(); });
  document.addEventListener('traco-projeto', () => { if (!area.hidden) monta(); });

  const D = () => { const p = P(); p.pdm ||= { um: false, linhas: [] }; return p.pdm; };
  const proxId = (L) => { for (let k = 0; k < 702; k++) { const id = k < 26 ? String.fromCharCode(65 + k) : String.fromCharCode(64 + Math.floor(k / 26)) + String.fromCharCode(65 + (k % 26)); if (!L.some((l) => l.id.toUpperCase() === id)) return id; } return 'X'; };

  // ---------- cálculo (ida e volta) ----------
  function calcula(d) {
    const L = d.linhas.filter((l) => String(l.id).trim()), erros = [], ids = new Map();
    L.forEach((l, i) => { const k = String(l.id).trim().toUpperCase(); if (ids.has(k)) erros.push(`Atividade "${l.id}" repetida.`); else ids.set(k, i); });
    const pred = L.map((l) => String(l.pred || '').split(/[;,\s]+/).map((x) => x.trim().toUpperCase()).filter((x) => x && x !== '-').filter((x) => { if (!ids.has(x)) { erros.push(`"${l.id}" depende de "${x}", que não está na tabela.`); return false; } return true; }).map((x) => ids.get(x)));
    const n = L.length, dur = L.map((l) => Math.max(0, parseFloat(String(l.dur).replace(',', '.')) || 0));
    // ordem topológica
    const grau = pred.map((p) => p.length), suc = L.map(() => []); pred.forEach((ps, i) => ps.forEach((p) => suc[p].push(i)));
    const fila = [], ordem = []; grau.forEach((g, i) => { if (!g) fila.push(i); });
    while (fila.length) { const i = fila.shift(); ordem.push(i); for (const s of suc[i]) if (--grau[s] === 0) fila.push(s); }
    if (ordem.length < n) { erros.push(`Há um ciclo nas predecessoras (${L.filter((_, i) => !ordem.includes(i)).map((l) => l.id).join(', ')}): uma atividade não pode depender dela mesma.`); return { L, erros }; }
    const base = d.um ? 1 : 0, es = new Array(n), ef = new Array(n);
    for (const i of ordem) { es[i] = pred[i].length ? Math.max(...pred[i].map((p) => ef[p])) + (d.um ? 1 : 0) : base; ef[i] = es[i] + dur[i] - (d.um && dur[i] > 0 ? 1 : 0); }
    const fim = n ? Math.max(...ef) : 0, ls = new Array(n), lf = new Array(n);
    for (const i of [...ordem].reverse()) { lf[i] = suc[i].length ? Math.min(...suc[i].map((s) => ls[s])) - (d.um ? 1 : 0) : fim; ls[i] = lf[i] - dur[i] + (d.um && dur[i] > 0 ? 1 : 0); }
    const ft = L.map((_, i) => ls[i] - es[i]);
    const fl = L.map((_, i) => (suc[i].length ? Math.min(...suc[i].map((s) => es[s])) - (d.um ? 1 : 0) - ef[i] : fim - ef[i]));
    const crit = ft.map((f) => Math.abs(f) < 1e-9);
    // colunas = maior caminho em número de atividades
    const col = new Array(n).fill(0); for (const i of ordem) for (const p of pred[i]) col[i] = Math.max(col[i], col[p] + 1);
    return { L, erros, pred, suc, dur, es, ef, ls, lf, ft, fl, crit, col, ordem, fim, inicio: base };
  }

  // ---------- tela ----------
  function monta() {
    const p = P(); if (!p) return; const d = D();
    $('pdmUm').checked = d.um;
    $('pdmLin').innerHTML = d.linhas.map((l, i) => `<tr data-i="${i}"><td><input data-k="id" value="${esc(l.id)}" class="pdm-id" /></td><td><input data-k="desc" value="${esc(l.desc || '')}" /></td>
      <td><input data-k="dur" inputmode="decimal" value="${esc(l.dur ?? '')}" class="num" /></td><td><input data-k="pred" value="${esc(l.pred || '')}" class="pdm-pred" /></td>
      <td><button type="button" data-del="${i}" title="Apagar">×</button></td></tr>`).join('');
    desenha();
  }
  function desenha() {
    const d = D(), R = calcula(d);
    $('pdmErro').innerHTML = R.erros.map((e) => `⚠️ ${esc(e)}`).join('<br>');
    if (!R.es || !R.L.length) { $('pdmSvg').innerHTML = `<p class="cro-vazio">${R.L.length ? 'Corrija os avisos para desenhar a rede.' : 'Preencha a tabela: cada linha é uma atividade.'}</p>`; $('pdmRes').innerHTML = ''; return; }
    const { L } = R, n = L.length;
    // resultado em tabela
    $('pdmRes').innerHTML = `<p class="pdm-total">Duração do projeto: <b>${fmt(R.fim - R.inicio + (d.um ? 1 : 0))}</b> · Caminho crítico: <b class="crit">${caminhos(R).map((c) => c.join(' → ')).join(' | ')}</b></p>
      <table class="pdm-res"><thead><tr><th>Ativ.</th><th>Dur</th><th>PDI</th><th>PDT</th><th>UDI</th><th>UDT</th><th>Folga total</th><th>Folga livre</th></tr></thead><tbody>${
        R.ordem.map((i) => `<tr class="${R.crit[i] ? 'crit' : ''}"><td>${esc(L[i].id)}</td><td>${fmt(R.dur[i])}</td><td>${fmt(R.es[i])}</td><td>${fmt(R.ef[i])}</td><td>${fmt(R.ls[i])}</td><td>${fmt(R.lf[i])}</td><td>${fmt(R.ft[i])}</td><td>${fmt(R.fl[i])}</td></tr>`).join('')}</tbody></table>`;
    // posições: coluna pelo nível; ordem na coluna pela média das predecessoras (menos cruzamentos)
    const cols = []; R.ordem.forEach((i) => (cols[R.col[i]] ||= []).push(i));
    const lin = new Array(n).fill(0);
    cols.forEach((c, k) => {
      if (k) c.sort((a, b) => media(a) - media(b));
      c.forEach((i, j) => (lin[i] = j));
      function media(i) { return R.pred[i].length ? R.pred[i].reduce((s, p) => s + lin[p], 0) / R.pred[i].length : 0; }
    });
    const BW = 150, BH = 96, GX = 70, GY = 34, M = 70, maxL = Math.max(...cols.map((c) => c.length));
    const extraIni = true, ncol = cols.length + 2;
    const W = M * 2 + ncol * BW + (ncol - 1) * GX, H = M + maxL * (BH + GY) + 20;
    const cx = (k) => M + (k + 1) * (BW + GX), cy = (i) => { const c = cols[R.col[i]]; const off = (maxL - c.length) * (BH + GY) / 2; return 40 + off + lin[i] * (BH + GY); };
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="DM Sans, Arial, sans-serif"><defs>
      <marker id="pdmS" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9z" fill="#555"/></marker>
      <marker id="pdmSc" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9z" fill="#d1495b"/></marker></defs><rect width="${W}" height="${H}" fill="#fff"/>`;
    const seta = (x1, y1, x2, y2, c) => { const mx = (x1 + x2) / 2; s += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 2},${y2}" fill="none" stroke="${c ? '#d1495b' : '#777'}" stroke-width="${c ? 2.6 : 1.5}" marker-end="url(#${c ? 'pdmSc' : 'pdmS'})"/>`; };
    // nós Início e Fim
    const yMid = 40 + (maxL * (BH + GY) - GY) / 2, xI = M, xF = cx(cols.length);
    const ini = L.map((_, i) => i).filter((i) => !R.pred[i].length), fins = L.map((_, i) => i).filter((i) => !R.suc[i].length);
    for (const i of ini) seta(xI + 90, yMid, cx(R.col[i]), cy(i) + BH / 2, R.crit[i]);
    for (const i of fins) seta(cx(R.col[i]) + BW, cy(i) + BH / 2, xF, yMid, R.crit[i] && Math.abs(R.ef[i] - R.fim) < 1e-9);
    R.pred.forEach((ps, i) => ps.forEach((p) => seta(cx(R.col[p]) + BW, cy(p) + BH / 2, cx(R.col[i]), cy(i) + BH / 2, R.crit[i] && R.crit[p] && Math.abs(R.ef[p] + (d.um ? 1 : 0) - R.es[i]) < 1e-9)));
    s += `<g><rect x="${xI}" y="${yMid - 26}" width="90" height="52" rx="26" fill="#2e9b5b"/><text x="${xI + 45}" y="${yMid + 5}" text-anchor="middle" font-weight="800" font-size="14" fill="#fff">Início</text></g>`;
    s += `<g><rect x="${xF}" y="${yMid - 26}" width="90" height="52" rx="26" fill="#222"/><text x="${xF + 45}" y="${yMid - 2}" text-anchor="middle" font-weight="800" font-size="14" fill="#fff">Fim</text><text x="${xF + 45}" y="${yMid + 15}" text-anchor="middle" font-size="12" fill="#fff">${fmt(R.fim)}</text></g>`;
    void extraIni;
    for (let i = 0; i < n; i++) {
      const x = cx(R.col[i]), y = cy(i), c = R.crit[i], bd = c ? '#d1495b' : '#555', w3 = BW / 3, h3 = BH / 3;
      s += `<g><rect x="${x}" y="${y}" width="${BW}" height="${BH}" fill="${c ? '#fff1f2' : '#fff'}" stroke="${bd}" stroke-width="${c ? 2.6 : 1.5}" rx="4"/>
        <line x1="${x}" y1="${y + h3}" x2="${x + BW}" y2="${y + h3}" stroke="${bd}"/><line x1="${x}" y1="${y + 2 * h3}" x2="${x + BW}" y2="${y + 2 * h3}" stroke="${bd}"/>
        <line x1="${x + w3}" y1="${y}" x2="${x + w3}" y2="${y + h3}" stroke="${bd}"/><line x1="${x + 2 * w3}" y1="${y}" x2="${x + 2 * w3}" y2="${y + h3}" stroke="${bd}"/>
        <line x1="${x + w3}" y1="${y + 2 * h3}" x2="${x + w3}" y2="${y + BH}" stroke="${bd}"/><line x1="${x + 2 * w3}" y1="${y + 2 * h3}" x2="${x + 2 * w3}" y2="${y + BH}" stroke="${bd}"/>
        ${[[R.es[i], 0, 0], [R.dur[i], 1, 0], [R.ef[i], 2, 0], [R.ls[i], 0, 2], [R.ft[i], 1, 2], [R.lf[i], 2, 2]].map(([v, a, b]) => `<text x="${x + a * w3 + w3 / 2}" y="${y + b * h3 + h3 / 2 + 5}" text-anchor="middle" font-size="14" font-weight="${a === 1 && b === 2 && c ? 800 : 600}" fill="${a === 1 && b === 2 && c ? '#d1495b' : '#222'}">${fmt(v)}</text>`).join('')}
        <text x="${x + BW / 2}" y="${y + h3 + h3 / 2 + 1}" text-anchor="middle" font-size="15" font-weight="800" fill="${c ? '#b8283d' : '#111'}">${esc(L[i].id)}</text>
        <text x="${x + BW / 2}" y="${y + h3 + h3 / 2 + 14}" text-anchor="middle" font-size="10" fill="#555">${esc(String(L[i].desc || '').slice(0, 24))}</text></g>`;
    }
    $('pdmSvg').innerHTML = s + '</svg>';
    aplicaZoom(zoom);
  }
  function caminhos(R) { // todos os caminhos críticos de início a fim
    const out = [], ini = R.L.map((_, i) => i).filter((i) => R.crit[i] && !R.pred[i].some((p) => R.crit[p]));
    const vai = (i, cam) => {
      if (out.length > 5) return; const prox = R.suc[i].filter((s) => R.crit[s] && Math.abs(R.ef[i] + (D().um ? 1 : 0) - R.es[s]) < 1e-9);
      if (!prox.length) { if (Math.abs(R.ef[i] - R.fim) < 1e-9) out.push([...cam, R.L[i].id]); return; }
      for (const s of prox) vai(s, [...cam, R.L[i].id]);
    };
    ini.forEach((i) => vai(i, [])); return out.length ? out : [['—']];
  }

  // ---------- edição ----------
  $('pdmLin').addEventListener('input', (e) => {
    const el = e.target, tr = el.closest('tr[data-i]'); if (!tr || !el.dataset.k) return;
    let v = el.value; if (el.dataset.k === 'id' || el.dataset.k === 'pred') { v = v.toUpperCase(); if (el.value !== v) { const p = el.selectionStart; el.value = v; el.setSelectionRange(p, p); } }
    D().linhas[+tr.dataset.i][el.dataset.k] = v; salvar(); clearTimeout(tD); tD = setTimeout(desenha, 250);
  });
  let tD = 0;
  $('pdmLin').addEventListener('keydown', (e) => { // Enter na última linha cria outra
    if (e.key !== 'Enter') return; const tr = e.target.closest('tr[data-i]'); if (!tr) return; e.preventDefault();
    const i = +tr.dataset.i, L = D().linhas; if (i === L.length - 1) { acoes.add(); } else $('pdmLin').querySelector(`tr[data-i="${i + 1}"] input[data-k="${e.target.dataset.k}"]`)?.focus();
  });
  $('pdmLin').addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (!b) return; D().linhas.splice(+b.dataset.del, 1); salvar(); monta(); });
  $('pdmUm').addEventListener('change', (e) => { D().um = e.target.checked; salvar(); desenha(); });
  const acoes = {
    add() { const L = D().linhas, ant = L[L.length - 1]; L.push({ id: proxId(L), desc: '', dur: '', pred: ant?.id || '' }); salvar(); monta(); $('pdmLin').querySelector(`tr[data-i="${L.length - 1}"] input[data-k="desc"]`)?.focus(); },
    limpa() { if (!D().linhas.length || !confirm('Apagar todas as atividades da tabela?')) return; D().linhas = []; salvar(); monta(); },
    crono() {
      const T = P().crono?.tarefas || []; if (!T.length) { $('pdmErro').textContent = 'O Cronograma deste projeto está vazio.'; return; }
      if (D().linhas.length && !confirm('Substituir a tabela pelas tarefas do Cronograma?')) return;
      const folha = T.map((t, i) => !(T[i + 1]?.nivel > t.nivel)), idx = []; let k = 0;
      T.forEach((t, i) => { if (folha[i]) idx[i] = k++; });
      const L = []; T.forEach((t, i) => { if (!folha[i]) return; const id = proxId(L); L.push({ id, desc: t.nome, dur: +t.dur || 0, _p: t.pred }); });
      L.forEach((l) => { l.pred = String(l._p || '').split(/[;,\s]+/).map((x) => idx[parseInt(x, 10) - 1]).filter((x) => x != null).map((x) => L[x].id).join(', '); delete l._p; });
      D().linhas = L; salvar(); monta();
    },
  };
  area.querySelectorAll('[data-c]').forEach((b) => { if (acoes[b.dataset.c]) b.onclick = acoes[b.dataset.c]; });

  // ---------- zoom e imagem ----------
  let zoom = 1;
  function aplicaZoom(z) { zoom = Math.max(.3, Math.min(2.5, z)); const sv = $('pdmSvg').firstElementChild; if (sv) sv.style.zoom = zoom; $('pdmZ').textContent = Math.round(zoom * 100) + '%'; }
  area.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => aplicaZoom(zoom * (b.dataset.z === '+' ? 1.2 : 1 / 1.2))));
  let d0 = 0; const rola = $('pdmRola');
  rola.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { const [a, b] = e.touches; d0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); } }, { passive: true });
  rola.addEventListener('touchmove', (e) => { if (e.touches.length !== 2 || !d0) return; e.preventDefault(); const [a, b] = e.touches, d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); aplicaZoom(zoom * d / d0); d0 = d; }, { passive: false });
  rola.addEventListener('touchend', () => { d0 = 0; });
  rola.addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); aplicaZoom(zoom * Math.exp(-e.deltaY * .01)); }, { passive: false });
  area.querySelector('[data-c=png]').onclick = () => {
    const sv = $('pdmSvg').querySelector('svg'); if (!sv) return;
    const w = +sv.getAttribute('width'), h = +sv.getAttribute('height'), k = Math.min(2, 4000 / Math.max(w, h));
    const img = new Image(); img.onload = () => {
      const c = document.createElement('canvas'); c.width = w * k; c.height = h * k; const g = c.getContext('2d'); g.scale(k, k); g.drawImage(img, 0, 0);
      c.toBlob((bl) => { const u = URL.createObjectURL(bl), a = document.createElement('a'); a.href = u; a.download = `diagrama-precedencia-${(P().nome || 'projeto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').toLowerCase()}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); });
    };
    const clone = sv.cloneNode(true); clone.style.zoom = '';
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  };
  window.tracoPdm = { html(p) { if (P() !== p || !(p.pdm?.linhas?.length)) return ''; monta(); return `<div class="rel-pdm">${$('pdmSvg').innerHTML}</div><div class="rel-pdmres">${$('pdmRes').innerHTML}</div>`; } };
})();
