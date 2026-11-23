// Foto do desenho → 3D. Manda a foto para a função ler-desenho (Supabase), mostra o que a IA leu
// numa folha de conferência e só gera o 3D quando TODAS as medidas estão preenchidas.
// Regra: medida que não estava escrita no papel volta vazia — o usuário digita; nada é estimado.
(() => {
  const $ = (id) => document.getElementById(id);
  const fmt = (n, casas) => n == null ? '' : String(Number(n.toFixed(casas))).replace('.', ',');
  const num = (txt) => {
    const v = Number(String(txt).trim().replace(/\s*(mm|cm|m)$/i, '').replace(',', '.'));
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  let tipoPedido = 'planta';
  let leitura = null;

  // ---------- Interface ----------
  const dlg = document.createElement('dialog');
  dlg.id = 'fotoDialog';
  dlg.className = 'foto-dialog';
  document.body.appendChild(dlg);
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
  document.body.appendChild(input);

  function botao(id, alvo, tipo) {
    const b = document.createElement('button');
    b.id = id; b.type = 'button'; b.className = 'secondary-button foto-button';
    b.textContent = '📷 Foto do desenho';
    b.title = 'Tire uma foto de um desenho com medidas e transforme em 3D';
    b.addEventListener('click', () => { tipoPedido = tipo; input.value = ''; input.click(); });
    alvo?.insertAdjacentElement('beforebegin', b);
  }
  botao('fotoArchButton', $('exampleButton'), 'planta');
  botao('fotoPartButton', $('cupExample'), 'peca');

  function abrir(html) { dlg.innerHTML = html; if (!dlg.open) dlg.showModal(); }
  function fechar() { if (dlg.open) dlg.close(); }
  dlg.addEventListener('click', (e) => { if (e.target === dlg) fechar(); });

  // ---------- Foto ----------
  async function reduzir(file) {
    const img = await createImageBitmap(file).catch(() => null);
    if (!img) throw new Error('Não consegui abrir essa imagem.');
    const max = 1568, k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', .85) };
  }

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const url = window.TRACO_LER_URL;
    if (!url) {
      abrir(`<h3>Leitura de foto ainda não ligada</h3>
        <p>O servidor que lê a foto ainda não foi publicado. Assim que os segredos forem colocados no GitHub, este botão passa a funcionar sozinho.</p>
        <div class="foto-acoes"><button type="button" class="primary-button" data-x="fechar">OK</button></div>`);
      dlg.querySelector('[data-x=fechar]').onclick = fechar;
      return;
    }
    let foto;
    try { foto = await reduzir(file); } catch (e) { alert(e.message); return; }
    abrir(`<h3>Lendo o desenho…</h3><img class="foto-previa" src="${foto.dataUrl}" alt="Foto enviada" />
      <p class="foto-sub">A IA está lendo as medidas escritas. Leva alguns segundos.</p>`);
    try {
      const j = await window.tracoChamarIA({ imagem: foto.dataUrl, midia: 'image/jpeg', tipo: tipoPedido });
      leitura = normalizar(j, foto.dataUrl);
      conferir();
    } catch (e) {
      abrir(`<h3>Não deu para ler</h3><p>${String(e.message || e).replace(/</g, '&lt;')}</p>
        <div class="foto-acoes"><button type="button" class="primary-button" data-x="fechar">Fechar</button></div>`);
      dlg.querySelector('[data-x=fechar]').onclick = fechar;
    }
  });

  // ---------- Leitura → estrutura editável ----------
  function normalizar(j, foto) {
    const tipo = j.tipo === 'peca' ? 'peca' : 'planta';
    const avisos = Array.isArray(j.avisos) ? j.avisos.filter((a) => typeof a === 'string') : [];
    const seg = (s, campo) => ({
      angulo: Number.isFinite(+s?.angulo) ? ((+s.angulo % 360) + 360) % 360 : 0,
      valor: Number.isFinite(+s?.[campo]) && +s[campo] > 0 ? +s[campo] : null,
      lido: typeof s?.texto_lido === 'string' ? s.texto_lido : null,
    });
    if (tipo === 'peca') {
      const p = j.peca || {};
      return { tipo, foto, avisos, parede: null,
        operacao: p.operacao === 'revolucao' ? 'revolucao' : 'extrusao',
        profundidade: Number.isFinite(+p.profundidade_mm) && +p.profundidade_mm > 0 ? +p.profundidade_mm : null,
        contornos: [{ fechado: true, segmentos: (p.segmentos || []).map((s) => seg(s, 'comprimento_mm')) }] };
    }
    const cs = (j.planta?.contornos || []).map((c) => ({ fechado: Boolean(c.fechado),
      segmentos: (c.segmentos || []).map((s) => seg(s, 'comprimento_m')) })).filter((c) => c.segmentos.length);
    return { tipo, foto, avisos, contornos: cs };
  }

  const DIRS = [[0, '→ direita'], [90, '↑ cima'], [180, '← esquerda'], [270, '↓ baixo']];
  function conferir() {
    const L = leitura, peca = L.tipo === 'peca', un = peca ? 'mm' : 'm', casas = peca ? 1 : 2;
    const linhas = L.contornos.map((c, ci) => `
      ${L.contornos.length > 1 ? `<h4>Contorno ${ci + 1}${c.fechado ? ' · fechado' : ''}</h4>` : ''}
      <table class="foto-tab"><thead><tr><th>#</th><th>Direção</th><th>Medida (${un})</th><th>No papel</th></tr></thead><tbody>
      ${c.segmentos.map((s, si) => {
        const temDir = DIRS.some(([a]) => a === Math.round(s.angulo));
        return `<tr class="${s.valor == null ? 'falta' : ''}">
          <td>${si + 1}</td>
          <td><select data-c="${ci}" data-s="${si}" data-k="angulo">
            ${DIRS.map(([a, t]) => `<option value="${a}" ${Math.round(s.angulo) === a ? 'selected' : ''}>${t}</option>`).join('')}
            ${temDir ? '' : `<option value="${s.angulo}" selected>${fmt(s.angulo, 1)}°</option>`}
          </select></td>
          <td><input data-c="${ci}" data-s="${si}" data-k="valor" inputmode="decimal" value="${fmt(s.valor, casas)}" placeholder="falta" /></td>
          <td class="foto-lido">${s.lido ? s.lido.replace(/</g, '&lt;') : '—'}</td></tr>`;
      }).join('')}</tbody></table>`).join('');
    abrir(`<h3>Confira o que foi lido</h3>
      <p class="foto-sub">${peca ? 'Peça em milímetros' : 'Planta em metros'} · ${L.contornos.reduce((n, c) => n + c.segmentos.length, 0)} traços.
        Corrija o que estiver errado. Campo vermelho = medida que não estava escrita: digite.</p>
      <img class="foto-previa mini" src="${L.foto}" alt="Foto enviada" />
      ${L.avisos.length ? `<ul class="foto-avisos">${L.avisos.map((a) => `<li>${a.replace(/</g, '&lt;')}</li>`).join('')}</ul>` : ''}
      ${L.contornos.length ? `<div class="foto-2d"><canvas id="foto2d" height="300"></canvas><small>Desenho com as medidas lidas. Toque numa linha da tabela para ver onde ela fica.</small></div>` : ''}
      ${L.contornos.length ? linhas : '<p>Nenhum traço com medida foi encontrado nessa foto.</p>'}
      ${peca ? `<div class="foto-peca">
        <label>Como virar 3D <select data-k="operacao"><option value="extrusao" ${L.operacao === 'extrusao' ? 'selected' : ''}>Extrusão</option><option value="revolucao" ${L.operacao === 'revolucao' ? 'selected' : ''}>Revolução 360°</option></select></label>
        <label class="${L.operacao === 'extrusao' && L.profundidade == null ? 'falta' : ''}" ${L.operacao === 'extrusao' ? '' : 'hidden'}>Profundidade (mm) <input data-k="profundidade" inputmode="decimal" value="${fmt(L.profundidade, 1)}" placeholder="falta" /></label>
        <label ${L.operacao === 'revolucao' ? '' : 'hidden'}>Parede (pote oco) <input data-k="parede" inputmode="decimal" value="${fmt(L.parede, 2)}" placeholder="maciço" /> mm</label></div>
        <p class="foto-sub" ${L.operacao === 'revolucao' ? '' : 'hidden'}>Parede: deixe vazio para peça maciça. Com espessura, o app usa o contorno de fora e faz a parede para dentro (fundo e lateral), com a boca aberta em cima.</p>` : ''}
      <p id="fotoFecho" class="foto-fecho"></p>
      <div class="foto-acoes"><button type="button" class="secondary-button" data-x="fechar">Cancelar</button>
        <button type="button" class="primary-button" data-x="gerar">Gerar 3D</button></div>`);
    dlg.querySelector('[data-x=fechar]').onclick = fechar;
    dlg.querySelector('[data-x=gerar]').onclick = gerar;
    dlg.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('change', () => {
      const k = el.dataset.k;
      if (k === 'operacao') { L.operacao = el.value; conferir(); return; }
      if (k === 'profundidade') L.profundidade = num(el.value);
      else if (k === 'parede') L.parede = num(el.value) > 0 ? num(el.value) : null;
      else {
        const s = L.contornos[+el.dataset.c].segmentos[+el.dataset.s];
        if (k === 'angulo') s.angulo = +el.value; else s.valor = num(el.value);
        el.closest('tr')?.classList.toggle('falta', s.valor == null);
      }
      estado(); desenho2d();
    }));
    dlg.querySelectorAll('tbody tr').forEach((tr, i) => tr.addEventListener('focusin', () => { realce = i; desenho2d(); }));
    dlg.querySelectorAll('tbody tr').forEach((tr, i) => tr.addEventListener('click', () => { realce = i; desenho2d(); }));
    estado(); realce = -1; desenho2d();
  }
  // ---------- 2D para conferir: o perfil desenhado com as medidas lidas ----------
  let realce = -1;
  function desenho2d() {
    const cv = dlg.querySelector('#foto2d'); if (!cv) return;
    const L = leitura, peca = L.tipo === 'peca', rev = peca && L.operacao === 'revolucao';
    const W = cv.clientWidth || 320, H = 300, dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const linhas = []; // [x0,y0,x1,y1,valor,falta,idx]
    let k = 0;
    for (const c of L.contornos) {
      let x = 0, y = 0;
      for (const s of c.segmentos) { const a = s.angulo * Math.PI / 180, v = s.valor ?? 0; const nx = x + Math.cos(a) * v, ny = y + Math.sin(a) * v; linhas.push([x, y, nx, ny, s.valor, s.valor == null, k++]); x = nx; y = ny; }
    }
    if (!linhas.length) return;
    const xs = linhas.flatMap((l) => [l[0], l[2]]).concat(rev ? linhas.flatMap((l) => [-l[0], -l[2]]) : []), ys = linhas.flatMap((l) => [l[1], l[3]]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const M = 46, esc = Math.min((W - 2 * M) / Math.max(x1 - x0, 1e-6), (H - 70) / Math.max(y1 - y0, 1e-6));
    const P = (x, y) => [M + (x - x0) * esc + ((W - 2 * M) - (x1 - x0) * esc) / 2, H - 35 - (y - y0) * esc];
    ctx.lineCap = 'round';
    if (rev) { // eixo e o outro lado espelhado, para ver a peça inteira
      const [ax] = P(0, 0); ctx.strokeStyle = '#9aa7a1'; ctx.setLineDash([6, 5]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, 8); ctx.lineTo(ax, H - 8); ctx.stroke();
      ctx.strokeStyle = 'rgba(215,104,69,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); for (const l of linhas) { const a = P(-l[0], l[1]), b = P(-l[2], l[3]); ctx.moveTo(...a); ctx.lineTo(...b); } ctx.stroke(); ctx.setLineDash([]);
    }
    for (const l of linhas) {
      const a = P(l[0], l[1]), b = P(l[2], l[3]), sel = l[6] === realce;
      ctx.strokeStyle = l[5] ? '#d32f2f' : sel ? '#1565C0' : '#c0582f'; ctx.lineWidth = sel ? 4 : 2.2; ctx.setLineDash(l[5] ? [4, 4] : []);
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.font = '700 11px DM Sans, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const l of linhas) { // número da linha (igual à tabela) e a medida
      const a = P(l[0], l[1]), b = P(l[2], l[3]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, sel = l[6] === realce;
      const dx = b[0] - a[0], dy = b[1] - a[1], ln = Math.hypot(dx, dy) || 1, ox = -dy / ln * 12, oy = dx / ln * 12;
      const curto = ln < 22 && !sel, r0 = curto ? 6 : 9; // linha curta: só o número, menor (toque na tabela para ver a medida)
      ctx.fillStyle = sel ? '#1565C0' : l[5] ? '#d32f2f' : '#2e4b3f'; ctx.beginPath(); ctx.arc(mx + ox, my + oy, r0, 0, Math.PI * 2); ctx.fill();
      ctx.font = `700 ${curto ? 8 : 11}px DM Sans, Arial, sans-serif`; ctx.fillStyle = '#fff'; ctx.fillText(String(l[6] + 1), mx + ox, my + oy);
      if (!curto) { const txt = l[5] ? '?' : fmt(l[4], peca ? 1 : 2); ctx.font = '700 11px DM Sans, Arial, sans-serif'; ctx.fillStyle = sel ? '#1565C0' : '#333'; ctx.fillText(txt, mx + ox * 2.4, my + oy * 2.4); }
    }
    const ini = P(0, 0); ctx.fillStyle = '#2e7d4f'; ctx.beginPath(); ctx.arc(ini[0], ini[1], 4, 0, Math.PI * 2); ctx.fill();
  }

  function pontos(c, escala) {
    const pts = [[0, 0]];
    for (const s of c.segmentos) {
      const a = s.angulo * Math.PI / 180, [x, y] = pts.at(-1);
      pts.push([x + Math.cos(a) * s.valor * escala, y + Math.sin(a) * s.valor * escala]);
    }
    return pts;
  }

  function estado() {
    const L = leitura, peca = L.tipo === 'peca';
    const faltam = L.contornos.reduce((n, c) => n + c.segmentos.filter((s) => s.valor == null).length, 0) +
      (peca && L.operacao === 'extrusao' && L.profundidade == null ? 1 : 0);
    const btn = dlg.querySelector('[data-x=gerar]');
    btn.disabled = faltam > 0 || !L.contornos.length;
    const msgs = [];
    if (faltam) msgs.push(`Faltam ${faltam} medida${faltam > 1 ? 's' : ''}.`);
    else for (const [i, c] of L.contornos.entries()) {
      if (!(c.fechado || peca)) continue;
      const p = pontos(c, 1), gap = Math.hypot(p.at(-1)[0], p.at(-1)[1]);
      const tol = peca ? .5 : .02;
      if (gap > tol) msgs.push(`${L.contornos.length > 1 ? `Contorno ${i + 1}: ` : ''}as medidas não fecham — sobra ${fmt(gap, peca ? 1 : 2)} ${peca ? 'mm' : 'm'}. Confira as medidas.`);
    }
    dlg.querySelector('#fotoFecho').textContent = msgs.join(' ');
    if (peca && !faltam && msgs.length) btn.disabled = true; // peça precisa fechar para virar sólido
  }

  // ---------- Gerar ----------
  function gerar() {
    const L = leitura;
    if (L.tipo === 'peca') return gerarPeca(L);
    return gerarPlanta(L);
  }

  function gerarPlanta(L) {
    if (state.strokes.length && !confirm('Isso substitui o desenho atual da planta. Continuar?')) return;
    // Medidas em metros → caixa total, para escolher a escala que cabe no quadro.
    const brutos = L.contornos.map((c) => pontos(c, 1).map(([x, y]) => [x, -y]));
    let off = 0; const pos = [];
    for (const pts of brutos) { // contornos lado a lado, com 1 m de folga
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const mx = Math.min(...xs), my = Math.min(...ys);
      pos.push(pts.map(([x, y]) => [x - mx + off, y - my]));
      off += Math.max(...xs) - mx + 1;
    }
    const all = pos.flat();
    const W = Math.max(...all.map((p) => p[0])), H = Math.max(...all.map((p) => p[1]));
    const ppm = Math.max(40, Math.min(160, Math.floor(Math.min((DESIGN_WIDTH - 80) / Math.max(W, .1), (DESIGN_HEIGHT - 80) / Math.max(H, .1)) / 5) * 5));
    if (W * ppm > DESIGN_WIDTH - 20 || H * ppm > DESIGN_HEIGHT - 20) {
      alert('Essa planta é grande demais para o quadro, mesmo na menor escala.'); return;
    }
    // Escala só muda com o quadro vazio (as medidas já confirmadas ficam preservadas).
    state.strokes = []; state.openings = [];
    state.pixelsPerMeter = ppm;
    const ox = (DESIGN_WIDTH - W * ppm) / 2, oy = (DESIGN_HEIGHT - H * ppm) / 2;
    const r2 = (v) => Math.round(v * 100) / 100;
    const strokes = [];
    pos.forEach((pts, ci) => {
      const P = pts.map(([x, y]) => [r2(ox + x * ppm), r2(oy + y * ppm)]);
      if (L.contornos[ci].fechado) {
        const gap = Math.hypot(P.at(-1)[0] - P[0][0], P.at(-1)[1] - P[0][1]);
        if (gap < 2) P[P.length - 1] = [...P[0]]; // diferença de arredondamento (< 2 cm)
      }
      for (let i = 1; i < P.length; i++) strokes.push([P[i - 1], P[i]]);
    });
    commit(strokes, []);
    fechar();
    notify(`Planta criada com ${strokes.length} paredes. Use Equidistância e Empurrar/puxar para subir em 3D.`);
  }

  function gerarPeca(L) {
    const c = L.contornos[0];
    let p = pontos(c, 1);
    if (Math.hypot(p.at(-1)[0], p.at(-1)[1]) <= .5) p = p.slice(0, -1);
    const mx = Math.min(...p.map((q) => q[0])), my = Math.min(...p.map((q) => q[1]));
    p = p.map(([x, y]) => [Math.round((x - mx) * 100) / 100, Math.round((y - my) * 100) / 100]);
    if (L.operacao === 'revolucao' && L.parede > 0) { // pote oco: contorno de fora (sem o eixo e sem a tampa) + parede para dentro
      const tolE = Math.max(.6, Math.max(...p.map((q) => q[0])) * .02); // medidas lidas não fecham exato no eixo
      let lin = p.slice(); while (lin.length > 2 && Math.abs(lin.at(-1)[0]) < tolE) lin.pop(); // tira a volta pelo eixo/tampa
      lin[0] = [0, lin[0][1]];
      if (Math.abs(p[0][0]) > tolE) { dlg.querySelector('#fotoFecho').textContent = 'Para fazer a parede, o perfil precisa começar no eixo (no centro do fundo).'; return; }
      $('partsTab').click();
      window.tracoAbrirPeca({ mode: 'custom', profile: lin, closed: false, operation: 'revolve', extrudeDepth: 20, shapeType: null, holeDiameter: 0 });
      const ok = window.tracoEspessuraAuto?.(L.parede);
      if (!ok) { window.tracoAbrirPeca({ mode: 'custom', profile: p, closed: true, operation: 'revolve', extrudeDepth: 20, shapeType: null, holeDiameter: 0 });
        notify('Com essa parede as linhas se cruzam. Gerei a peça maciça; use ⧉ Espessura com um valor menor.'); }
      fechar(); return;
    }
    try {
      $('partsTab').click();
      window.tracoAbrirPeca({ mode: 'custom', profile: p, closed: true,
        operation: L.operacao === 'revolucao' ? 'revolve' : 'extrude',
        extrudeDepth: L.profundidade ?? 20, shapeType: null, holeDiameter: 0 });
      fechar();
    } catch {
      dlg.querySelector('#fotoFecho').textContent = 'Esse contorno se cruza ou não forma uma peça válida. Confira as direções.';
    }
  }
})();
