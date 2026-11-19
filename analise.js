// 🔬 Análise de engenharia das peças (aba Peças).
// Tirado da geometria (sem suposição): volume, massa, centro de massa, balanço (desbalanceamento),
// estabilidade em pé, paredes finas (com destaque no 3D) e encaixe da rosca parafuso × porca/furo.
// Resistência e fadiga só calculam com os dados que o usuário digitar (carga e limites do material).
(() => {
  const $ = (id) => document.getElementById(id);
  const P = () => window.tracoPeca;
  const fmt = (n, c = 2) => (n == null || !Number.isFinite(n) ? '—' : Number(n.toFixed(c)).toLocaleString('pt-BR'));
  const num = (t) => { const v = Number(String(t ?? '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : null; };
  // Densidade (g/cm³) — dado de material, não de projeto.
  const MAT = { PLA: 1.24, PETG: 1.27, ABS: 1.04, ASA: 1.07, PP: 0.9, 'Nylon (PA12)': 1.01, TPU: 1.21, Resina: 1.15, 'Aço': 7.85, 'Alumínio': 2.7, 'Latão': 8.5 };
  let cfg = { mat: 'PLA', preench: 100, carga: '', resist: '', fadigaCarga: '', fadigaLim: '', kt: '', minParede: 1.2 };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem('traco-analise') || '{}')); } catch { /* */ }
  const guarda = () => { try { localStorage.setItem('traco-analise', JSON.stringify(cfg)); } catch { /* */ } };

  // ---------- geometria ----------
  function massa(tris) {
    let V = 0, cx = 0, cy = 0, cz = 0, A = 0;
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const t of tris) {
      const [a, p, q] = t.points;
      const v = (a[0] * (p[1] * q[2] - p[2] * q[1]) - a[1] * (p[0] * q[2] - p[2] * q[0]) + a[2] * (p[0] * q[1] - p[1] * q[0])) / 6;
      V += v; cx += v * (a[0] + p[0] + q[0]) / 4; cy += v * (a[1] + p[1] + q[1]) / 4; cz += v * (a[2] + p[2] + q[2]) / 4;
      const u = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], w = [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
      A += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
      for (const r of t.points) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], r[k]); b[k + 3] = Math.max(b[k + 3], r[k]); }
    }
    return { V, A, c: [cx / V, cy / V, cz / V], b };
  }
  function casco(pts) { // casco convexo 2D (monotone chain)
    const p = [...new Map(pts.map((q) => [`${q[0].toFixed(3)},${q[1].toFixed(3)}`, q])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
    for (const q of [...p].reverse()) { while (up.length >= 2 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function estabilidade(tris, m) {
    const z0 = m.b[2], pts = [];
    for (const t of tris) if (t.normal[2] < -.98 && t.points.every((q) => q[2] < z0 + .05)) for (const q of t.points) pts.push([q[0], q[1]]);
    if (pts.length < 3) return { ok: null };
    const h = casco(pts), [x, y] = m.c;
    let dentro = true, folga = Infinity;
    for (let i = 0; i < h.length; i++) {
      const a = h[i], b = h[(i + 1) % h.length], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
      const d = ((x - a[0]) * ey - (y - a[1]) * ex) / L; // >0 fora (casco anti-horário)
      if (d > 1e-9) dentro = false; folga = Math.min(folga, Math.abs(d));
    }
    return { ok: dentro, folga, altura: m.c[2] - z0 };
  }
  // paredes finas: raio para dentro de cada face (amostra) até bater na face oposta
  function raio(o, d, t) {
    const [a, b, c] = t.points, e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2]; if (Math.abs(det) < 1e-12) return Infinity;
    const iv = 1 / det, s = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
    const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * iv; if (u < 0 || u > 1) return Infinity;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * iv; if (v < 0 || u + v > 1) return Infinity;
    const tt = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * iv; return tt > 1e-4 ? tt : Infinity;
  }
  async function paredes(tris, ini, prog) {
    const n = tris.length, passo = Math.max(1, Math.floor(n / 900)), res = [];
    const kv = (q) => `${q[0].toFixed(4)},${q[1].toFixed(4)},${q[2].toFixed(4)}`;
    const chaves = tris.map((t) => t.points.map(kv));
    const caixas = tris.map((t) => { const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (const q of t.points) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], q[k]); b[k + 3] = Math.max(b[k + 3], q[k]); } return b; });
    for (let i = 0, cont = 0; i < n; i += passo, cont++) {
      const t = tris[i], c = [0, 1, 2].map((k) => (t.points[0][k] + t.points[1][k] + t.points[2][k]) / 3), d = t.normal.map((x) => -x);
      const o = [c[0] + d[0] * 1e-3, c[1] + d[1] * 1e-3, c[2] + d[2] * 1e-3];
      let best = Infinity;
      for (let j = 0; j < n; j++) {
        if (j === i) continue; const B = caixas[j];
        if (chaves[j].some((k) => chaves[i].includes(k))) continue; // vizinho colado (ponta de canto), não é parede
        // corte rápido: a caixa precisa estar no caminho do raio até a melhor distância achada
        let tmin = 0, tmax = best;
        for (let k = 0; k < 3 && tmin <= tmax; k++) {
          if (Math.abs(d[k]) < 1e-12) { if (o[k] < B[k] || o[k] > B[k + 3]) tmax = -1; continue; }
          let t1 = (B[k] - o[k]) / d[k], t2 = (B[k + 3] - o[k]) / d[k]; if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        }
        if (tmin > tmax) continue;
        const h = raio(o, d, tris[j]); if (h < best) best = h;
      }
      if (Number.isFinite(best)) res.push({ idx: ini + i, e: best });
      if (cont % 40 === 0) { prog(i / n); await new Promise((r) => setTimeout(r, 0)); }
    }
    return res;
  }

  // ---------- encaixe de rosca ----------
  function encaixes(spec) {
    if (!spec?.pecas) return [];
    const out = [], f = spec.folga || 0;
    const parafusos = spec.pecas.filter((p) => p.tipo === 'parafuso');
    const femeas = [...spec.pecas.filter((p) => p.tipo === 'porca').map((p) => ({ nome: p.nome, d: p.diametro, p: p.passo, alt: window.tracoNarrado?.porcaAltura?.(p.diametro) })),
      ...spec.pecas.flatMap((pc) => (pc.furos || []).filter((h) => h.rosca).map((h) => ({ nome: `${pc.nome} (furo ${h.face})`, d: h.diametro, p: h.passo, alt: h.passante ? pc.altura : h.profundidade })))];
    for (const pf of parafusos) for (const fe of femeas) {
      if (Math.abs(pf.diametro - fe.d) > 1e-6) continue;
      const p = pf.passo;
      const passoOk = Math.abs(pf.passo - fe.p) < 1e-6;
      const gMin = f, gMax = f + (.6134 - .5413) * p; // folga radial na crista e no fundo
      const normal = gMin / Math.hypot(1, 1.2268) * 1; // folga medida perpendicular ao flanco (aprox.)
      let veredito, cor;
      if (!passoOk) { veredito = `Não rosqueia: passo ${fmt(pf.passo)} × ${fmt(fe.p)} mm.`; cor = 'ruim'; }
      else if (gMin < 0) { veredito = 'Interfere: não entra.'; cor = 'ruim'; }
      else if (gMin < .1) { veredito = gMin === 0 ? 'Encaixe exato (sem folga): na impressão 3D vai entrar MUITO apertada ou travar.' : 'Vai entrar apertada.'; cor = 'atencao'; }
      else if (gMin <= .3) { veredito = 'Boa para impressão 3D: entra com atrito leve.'; cor = 'bom'; }
      else { veredito = 'Folgada: entra fácil, pode ter jogo.'; cor = 'atencao'; }
      const filetes = fe.alt ? fe.alt / p : null;
      out.push({ par: `${pf.nome} × ${fe.nome}`, veredito, cor, onde: gMin < .1 ? 'Encosta primeiro na CRISTA do parafuso contra o FUNDO da rosca de dentro (ponto de menor folga).' : 'Menor folga fica na crista do parafuso.',
        gMin, gMax, normal, filetes, d: pf.diametro, p });
    }
    return out;
  }

  // ---------- janela ----------
  const dlg = document.createElement('dialog'); dlg.className = 'foto-dialog analise-dlg'; dlg.id = 'analiseDialog';
  document.body.appendChild(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  let realce = null;
  async function abrir() {
    const api = P(); if (!api) return;
    const pecas = api.pecas();
    if (!pecas.length) { avisa('Feche o perfil (ou narre uma peça) para analisar.'); return; }
    const spec = api.part.operation === 'narrado' ? api.part.narrado : null;
    const dens = MAT[cfg.mat] * (cfg.preench / 100);
    const linhas = pecas.map((pc) => {
      const m = massa(pc.tris), est = estabilidade(pc.tris, m);
      const g = m.V / 1000 * dens; // mm³→cm³ × g/cm³
      const eixo = [(m.b[0] + m.b[3]) / 2, (m.b[1] + m.b[4]) / 2];
      const e = Math.hypot(m.c[0] - eixo[0], m.c[1] - eixo[1]);
      return `<tr><td><b>${pc.nome}</b></td><td>${fmt(m.V / 1000, 3)} cm³</td><td><b>${fmt(g, 2)} g</b></td>
        <td>X ${fmt(m.c[0] - m.b[0])} · Y ${fmt(m.c[1] - m.b[1])} · Z ${fmt(m.c[2] - m.b[2])}</td>
        <td>${fmt(e, 3)} mm${e > .01 ? ` · U = ${fmt(g * e, 2)} g·mm` : ' · balanceada'}</td>
        <td>${est.ok == null ? 'sem base plana' : est.ok ? `fica em pé (margem ${fmt(est.folga)} mm)` : '<span class="ruim">tomba</span>'}</td>
        <td>${fmt(m.b[3] - m.b[0], 1)} × ${fmt(m.b[4] - m.b[1], 1)} × ${fmt(m.b[5] - m.b[2], 1)}</td></tr>`;
    }).join('');
    const enc = encaixes(spec);
    const encHtml = enc.length ? enc.map((x) => `<div class="an-card ${x.cor}"><b>${x.par}</b><p>${x.veredito}</p>
      <small>Folga radial: ${fmt(x.gMin, 3)} mm (crista) a ${fmt(x.gMax, 3)} mm (fundo) · no flanco ≈ ${fmt(x.normal, 3)} mm${x.filetes ? ` · ${fmt(x.filetes, 1)} filetes engatados` : ''}</small>
      <small>${x.onde}</small></div>`).join('') : '<p class="an-sub">Sem par parafuso × porca/furo roscado nesta peça.</p>';
    dlg.innerHTML = `<h3>🔬 Análise de engenharia</h3>
      <div class="an-linha"><label>Material <select data-c="mat">${Object.keys(MAT).map((k) => `<option ${k === cfg.mat ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label>Preenchimento <span><input data-c="preench" inputmode="decimal" value="${cfg.preench}" /> %</span></label>
        <small>densidade ${fmt(MAT[cfg.mat], 2)} g/cm³ · massa considera ${cfg.preench}% de material</small></div>
      <h4>Massa, centro de massa e balanço</h4>
      <div class="an-tab"><table><tr><th>Peça</th><th>Volume</th><th>Massa</th><th>Centro de massa (a partir do canto)</th><th>Desbalanceamento (CM fora do eixo)</th><th>Em pé</th><th>Caixa (mm)</th></tr>${linhas}</table></div>
      <h4>Encaixe da rosca</h4>${encHtml}
      <h4>Paredes finas (pontos fracos de impressão)</h4>
      <div class="an-linha"><label>Avisar abaixo de <span><input data-c="minParede" inputmode="decimal" value="${cfg.minParede}" /> mm</span></label><button type="button" class="secondary-button" data-x="paredes">Procurar paredes finas</button></div>
      <p class="an-sub" id="anParedes">Toque em "Procurar" — as paredes finas ficam vermelhas no 3D.</p>
      <h4>Resistência (precisa dos seus dados)</h4>
      <div class="an-linha"><label>Carga axial no parafuso <span><input data-c="carga" inputmode="decimal" value="${cfg.carga}" placeholder="N" /> N</span></label>
        <label>Limite de resistência do material <span><input data-c="resist" inputmode="decimal" value="${cfg.resist}" placeholder="MPa" /> MPa</span></label></div>
      <div class="an-linha"><label>Carga que vai e volta (fadiga) <span><input data-c="fadigaCarga" inputmode="decimal" value="${cfg.fadigaCarga}" placeholder="N" /> N</span></label>
        <label>Limite de fadiga do material <span><input data-c="fadigaLim" inputmode="decimal" value="${cfg.fadigaLim}" placeholder="MPa" /> MPa</span></label>
        <label>Kt (concentração na rosca) <span><input data-c="kt" inputmode="decimal" value="${cfg.kt}" placeholder="ex.: 3" /></span></label></div>
      <div id="anResist"></div>
      <div class="foto-acoes"><span style="flex:1"></span><button type="button" class="secondary-button" data-x="limpar">Tirar destaque</button><button type="button" class="primary-button" data-x="ok">Fechar</button></div>`;
    dlg.querySelector('[data-x=ok]').onclick = () => dlg.close();
    dlg.querySelector('[data-x=limpar]').onclick = () => { api.part.realce = null; api.render(); };
    dlg.querySelectorAll('[data-c]').forEach((el) => el.addEventListener('change', () => {
      cfg[el.dataset.c] = el.tagName === 'SELECT' ? el.value : el.value.trim(); if (el.dataset.c === 'preench') cfg.preench = num(el.value) || 100;
      guarda(); if (el.dataset.c === 'mat' || el.dataset.c === 'preench') abrir(); else resist();
    }));
    dlg.querySelector('[data-x=paredes]').onclick = async () => {
      const msg = dlg.querySelector('#anParedes'), lim = num(cfg.minParede) || 1.2; msg.textContent = 'Procurando… 0%';
      const todas = [];
      for (const pc of pecas) todas.push(...(await paredes(pc.tris, pc.ini, (f) => { msg.textContent = `Procurando em ${pc.nome}… ${Math.round(f * 100)}%`; })).map((r) => ({ ...r, nome: pc.nome })));
      const finas = todas.filter((r) => r.e < lim);
      const min = todas.reduce((a, r) => (r.e < a.e ? r : a), { e: Infinity });
      api.part.realce = new Set(finas.map((r) => r.idx)); api.render();
      const temRosca = (spec?.pecas || []).some((pc) => pc.tipo === 'parafuso' || pc.tipo === 'porca' || (pc.furos || []).some((h) => h.rosca));
      const notaRosca = temRosca ? '<br><small>Nas roscas os dentes são naturalmente finos (cerca de metade do passo). Isso é normal; para impressão, use camada fina e folga na rosca.</small>' : '';
      msg.innerHTML = notaRosca + (finas.length ? `<span class="ruim">${finas.length} trechos com parede abaixo de ${fmt(lim, 1)} mm</span> (mais fina: ${fmt(min.e, 2)} mm em ${min.nome}). Ficaram vermelhos no 3D.`
        : `Nenhuma parede abaixo de ${fmt(lim, 1)} mm. A mais fina medida: ${fmt(min.e, 2)} mm${min.nome ? ` (${min.nome})` : ''}.`);
    };
    resist();
    if (!dlg.open) dlg.showModal();
    function resist() {
      const box = dlg.querySelector('#anResist'); if (!box) return;
      const pf = spec?.pecas?.find((p) => p.tipo === 'parafuso');
      if (!pf) { box.innerHTML = '<p class="an-sub">Cálculo de resistência por enquanto é para parafuso (narre um parafuso).</p>'; return; }
      const As = Math.PI / 4 * (pf.diametro - .9382 * pf.passo) ** 2; // área resistente ISO 898
      const F = num(cfg.carga), R = num(cfg.resist), Fa = num(cfg.fadigaCarga), Se = num(cfg.fadigaLim), Kt = num(cfg.kt);
      const out = [`Área resistente do ${pf.nome}: <b>${fmt(As, 2)} mm²</b> (ISO 898).`];
      if (F) {
        const s = F / As; out.push(`Tensão na rosca: <b>${fmt(s, 1)} MPa</b>.`);
        out.push(R ? `Coeficiente de segurança: <b class="${R / s >= 2 ? 'bom' : R / s >= 1 ? 'atencao' : 'ruim'}">${fmt(R / s, 2)}</b> ${R / s < 1 ? '— quebra.' : R / s < 2 ? '— no limite.' : '— folgado.'}` : '<span class="atencao">Falta o limite de resistência do material para dizer se aguenta.</span>');
      } else out.push('<span class="atencao">Falta a carga (N) para calcular a tensão.</span>');
      if (Fa || Se || Kt) {
        if (Fa && Se && Kt) { const sa = Kt * Fa / As; out.push(`Fadiga: tensão alternada com Kt = <b>${fmt(sa, 1)} MPa</b> · segurança à fadiga <b class="${Se / sa >= 1.5 ? 'bom' : Se / sa >= 1 ? 'atencao' : 'ruim'}">${fmt(Se / sa, 2)}</b>${Se / sa < 1 ? ' — vai trincar com o tempo.' : ''}`); }
        else out.push('<span class="atencao">Fadiga: preencha a carga que vai e volta, o limite de fadiga e o Kt.</span>');
      }
      box.innerHTML = `<p class="an-sub">${out.join('<br>')}</p>`;
    }
  }
  function avisa(t) { const el = $('toast'); if (!el) return; el.textContent = t; el.classList.add('show'); clearTimeout(avisa.t); avisa.t = setTimeout(() => el.classList.remove('show'), 2400); }

  const bt = document.createElement('button');
  bt.id = 'analisePeca'; bt.type = 'button'; bt.className = 'secondary-button'; bt.textContent = '🔬 Análise';
  bt.title = 'Massa, centro de massa, balanço, paredes finas, encaixe da rosca, resistência e fadiga';
  bt.onclick = abrir;
  $('savePart')?.insertAdjacentElement('beforebegin', bt);
  window.tracoAnalise = { abrir };
})();

// Botões do 3D nos cantos, só ícone (mais espaço para a peça) + ▶ simulador e 🔬 análise na própria tela.
(() => {
  const wrap = document.querySelector('.part-model-wrap'); if (!wrap) return;
  const so = (b, ic) => { if (!b || b.dataset.icone) return; b.title = b.title || b.textContent.trim(); b.dataset.icone = ic; };
  const lado = document.createElement('div'); lado.className = 'canto-3d';
  lado.innerHTML = '<button type="button" data-a="sim" title="Simular montagem">▶</button><button type="button" data-a="an" title="Análise de engenharia">🔬</button>';
  wrap.appendChild(lado);
  lado.addEventListener('pointerdown', (e) => e.stopPropagation());
  const sim = lado.querySelector('[data-a=sim]');
  sim.onclick = () => document.getElementById('simularMontagem')?.click();
  lado.querySelector('[data-a=an]').onclick = () => window.tracoAnalise?.abrir();
  setInterval(() => {
    const s = document.getElementById('simularMontagem');
    sim.hidden = !s || s.hidden; sim.textContent = window.tracoPeca?.part?.sim ? '⏹' : '▶';
    sim.classList.toggle('on', !!window.tracoPeca?.part?.sim);
    // Cotas/Medir/Pintar: só o ícone enquanto não estão em uso
    wrap.querySelectorAll('.cota-bar button, .paint-toggle').forEach((b) => {
      const ic = (b.textContent.trim().match(/^\S+/) || [''])[0];
      if (!b.classList.contains('on') && b.textContent.trim().length > ic.length) { b.title = b.textContent.trim(); b.textContent = ic; }
      b.classList.add('ic-canto');
    });
  }, 300);
})();
