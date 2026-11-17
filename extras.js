// Extras do Traço: pintura da peça, exportação 3MF (com cores) e STEP (SolidWorks), e histórico.
(() => {
  const $ = (id) => document.getElementById(id);
  const P = () => window.tracoPeca;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const COR_PADRAO = '#D98A68';
  const PALETA = ['#FFFFFF', '#111111', '#D32F2F', '#F57C00', '#FBC02D', '#388E3C', '#1976D2', '#7B1FA2', '#8D6E63', '#9E9E9E'];

  // ====================== PINTURA ======================
  const pint = { ativa: false, cor: '#D32F2F', modo: 'face' };
  window.tracoPintura = pint;
  let viz = { key: '', mapa: null };
  function vizinhos(tris) { // triângulos que dividem aresta
    const key = P().geomKey();
    if (viz.key === key) return viz.mapa;
    const k = (q) => q.map((v) => v.toFixed(3)).join(',');
    const arestas = new Map(), mapa = tris.map(() => []);
    tris.forEach((t, i) => {
      for (let a = 0; a < 3; a++) {
        const e = [k(t.points[a]), k(t.points[(a + 1) % 3])].sort().join('|');
        const j = arestas.get(e);
        if (j === undefined) arestas.set(e, i); else { mapa[i].push(j); mapa[j].push(i); }
      }
    });
    viz = { key, mapa };
    return mapa;
  }
  function dentro(px, py, c) {
    const s = (a, b) => (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y);
    const d1 = s(c[0], c[1]), d2 = s(c[1], c[2]), d3 = s(c[2], c[0]);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  }
  pint.clique = (event) => {
    const api = P(); const part = api.part;
    if (part.sim) return false;
    const r = api.model.getBoundingClientRect(), x = event.clientX - r.left, y = event.clientY - r.top;
    const faces = part.lastFaces || [];
    let alvo = null;
    for (let i = faces.length - 1; i >= 0; i--) if (dentro(x, y, faces[i].corners)) { alvo = faces[i].idx; break; }
    if (alvo == null) return false;
    const tris = api.meshBase();
    const key = api.geomKey();
    if (!part.paint || part.paint.key !== key) part.paint = { key, cores: {} };
    const cores = part.paint.cores, cor = pint.cor === COR_PADRAO ? null : pint.cor;
    let marcar = [alvo];
    if (pint.modo === 'peca') {
      const pc = api.pecas().find((q) => alvo >= q.ini && alvo < q.ini + q.tris.length);
      marcar = pc ? Array.from({ length: pc.tris.length }, (_, i) => pc.ini + i) : [alvo];
    } else if (pint.modo === 'face') { // espalha por triângulos vizinhos com dobra < 25°
      const mapa = vizinhos(tris), vistos = new Set([alvo]), fila = [alvo], lim = Math.cos(25 * Math.PI / 180);
      while (fila.length) {
        const i = fila.pop();
        for (const j of mapa[i]) {
          if (vistos.has(j)) continue;
          const a = tris[i].normal, b = tris[j].normal;
          if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] >= lim) { vistos.add(j); fila.push(j); }
        }
      }
      marcar = [...vistos];
    }
    for (const i of marcar) { if (cor) cores[i] = cor; else delete cores[i]; }
    api.save(); api.render();
    event.preventDefault(); event.stopPropagation();
    return true;
  }

  function montarBarraPintura() {
    const wrap = document.querySelector('.part-model-wrap');
    if (!wrap) return;
    const bar = document.createElement('div');
    bar.className = 'paint-bar';
    bar.innerHTML = `<button type="button" data-p="toggle" class="paint-toggle">🎨 Pintar</button>
      <div class="paint-opts" hidden>
        ${[COR_PADRAO, ...PALETA].map((c) => `<button type="button" class="paint-cor" data-cor="${c}" style="background:${c}" title="${c === COR_PADRAO ? 'Cor original (apaga a pintura)' : c}"></button>`).join('')}
        <label class="paint-custom" title="Outra cor"><input type="color" value="#2e7d32" /></label>
        <select data-p="modo" title="O que o toque pinta">
          <option value="face">Face</option><option value="tri">Triângulo</option><option value="peca">Peça inteira</option>
        </select>
        <button type="button" data-p="limpar">Limpar</button>
      </div>`;
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    wrap.appendChild(bar);
    const opts = bar.querySelector('.paint-opts');
    const marcarCor = () => bar.querySelectorAll('.paint-cor').forEach((b) => b.classList.toggle('sel', b.dataset.cor === pint.cor));
    bar.querySelector('[data-p=toggle]').onclick = (e) => {
      pint.ativa = !pint.ativa; opts.hidden = !pint.ativa;
      if (pint.ativa && window.tracoCotas?.medindo) document.querySelector('.cota-bar [data-c=medir]')?.click();
      e.currentTarget.classList.toggle('on', pint.ativa);
      e.currentTarget.textContent = pint.ativa ? '✓ Pintando' : '🎨 Pintar';
      P().model.style.cursor = pint.ativa ? 'crosshair' : '';
      marcarCor();
    };
    bar.querySelectorAll('.paint-cor').forEach((b) => b.onclick = () => { pint.cor = b.dataset.cor; marcarCor(); });
    bar.querySelector('input[type=color]').oninput = (e) => { pint.cor = e.target.value.toUpperCase(); marcarCor(); };
    bar.querySelector('[data-p=modo]').onchange = (e) => { pint.modo = e.target.value; };
    bar.querySelector('[data-p=limpar]').onclick = () => { P().part.paint = null; P().save(); P().render(); };
  }

  // ====================== ZIP (sem compressão) ======================
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(arquivos) {
    const enc = new TextEncoder(), partes = [], central = [];
    let off = 0;
    for (const [nome, txt] of arquivos) {
      const n = enc.encode(nome), d = typeof txt === 'string' ? enc.encode(txt) : txt, crc = crc32(d);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, crc, true);
      h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
      partes.push(new Uint8Array(h.buffer), n, d);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true);
      c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), n);
      off += 30 + n.length + d.length;
    }
    const tam = central.reduce((s, x) => s + x.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, arquivos.length, true); e.setUint16(10, arquivos.length, true);
    e.setUint32(12, tam, true); e.setUint32(16, off, true);
    return new Blob([...partes, ...central, new Uint8Array(e.buffer)], { type: 'model/3mf' });
  }

  // ====================== 3MF ======================
  // Cores: material 0 = cor original; demais = cores pintadas. Também grava o "pintado" que o
  // Bambu Studio/OrcaSlicer (paint_color) e o PrusaSlicer (mmu_segmentation) usam por filamento.
  const estadoFil = (n) => n === 1 ? '4' : n === 2 ? '8' : (n - 3).toString(16).toUpperCase() + 'C';
  function exportar3mf() {
    const api = P(), pecas = api.pecas();
    if (!pecas.length) return alert('Gere a peça em 3D primeiro.');
    const part = api.part, cores = part.paint && part.paint.key === api.geomKey() ? part.paint.cores : {};
    const usadas = [COR_PADRAO, ...new Set(Object.values(cores))];
    const f = (v) => +v.toFixed(4);
    let id = 2, objs = '', itens = '';
    for (const pc of pecas) {
      const vmap = new Map(), vs = [], ts = [];
      const vi = (q) => { const k = q.map(f).join(' '); let i = vmap.get(k); if (i === undefined) { i = vs.length; vmap.set(k, i); vs.push(q.map(f)); } return i; };
      pc.tris.forEach((t, j) => {
        const cor = cores[pc.ini + j], m = cor ? usadas.indexOf(cor) : 0;
        const a = vi(t.points[0]), b = vi(t.points[1]), c = vi(t.points[2]);
        if (a === b || b === c || a === c) return;
        const extra = m ? ` paint_color="${estadoFil(m + 1)}" slic3rpe:mmu_segmentation="${estadoFil(m + 1)}"` : '';
        ts.push(`<triangle v1="${a}" v2="${b}" v3="${c}" pid="1" p1="${m}"${extra}/>`);
      });
      objs += `<object id="${id}" name="${esc(pc.nome)}" type="model" pid="1" pindex="0"><mesh><vertices>${vs.map((v) => `<vertex x="${v[0]}" y="${v[1]}" z="${v[2]}"/>`).join('')}</vertices><triangles>${ts.join('')}</triangles></mesh></object>`;
      itens += `<item objectid="${id}"/>`;
      id++;
    }
    const modelo = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="pt-BR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">
<metadata name="Application">Traco</metadata>
<resources><basematerials id="1">${usadas.map((c, i) => `<base name="Cor ${i + 1}" displaycolor="${c}FF"/>`).join('')}</basematerials>${objs}</resources>
<build>${itens}</build></model>`;
    const blob = zip([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'],
      ['3D/3dmodel.model', modelo],
    ]);
    api.download('traco-peca-cores.3mf', blob, 'model/3mf');
    return usadas.length;
  }

  // ====================== STEP (SolidWorks) ======================
  // AP203 com sólido facetado (FACETED_BREP): o SolidWorks abre como corpo sólido.
  function exportarStep() {
    const api = P(), pecas = api.pecas();
    if (!pecas.length) return alert('Gere a peça em 3D primeiro.');
    const L = []; let n = 0;
    const add = (t) => { n++; L.push(`#${n}=${t};`); return n; };
    const r = (v) => { const x = +v.toFixed(5); return Number.isInteger(x) ? x + '.' : String(x); };
    const ctxApp = add("APPLICATION_CONTEXT('configuration controlled 3D designs of mechanical parts and assemblies')");
    add(`APPLICATION_PROTOCOL_DEFINITION('international standard','config_control_design',1994,#${ctxApp})`);
    const mec = add(`MECHANICAL_CONTEXT('',#${ctxApp},'mechanical')`);
    const des = add(`DESIGN_CONTEXT('',#${ctxApp},'design')`);
    const prod = add(`PRODUCT('Traco','Traco','',(#${mec}))`);
    add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part','',(#${prod}))`);
    const pdf = add(`PRODUCT_DEFINITION_FORMATION('','',#${prod})`);
    const pd = add(`PRODUCT_DEFINITION('design','',#${pdf},#${des})`);
    const pds = add(`PRODUCT_DEFINITION_SHAPE('','',#${pd})`);
    const ul = add('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))');
    const ua = add('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))');
    const us = add('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())');
    const unc = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-05),#${ul},'distance_accuracy_value','')`);
    const gctx = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${ul},#${ua},#${us}))REPRESENTATION_CONTEXT('',''))`);
    const o = add("CARTESIAN_POINT('',(0.,0.,0.))"), dz = add("DIRECTION('',(0.,0.,1.))"), dx = add("DIRECTION('',(1.,0.,0.))");
    const eixo = add(`AXIS2_PLACEMENT_3D('',#${o},#${dz},#${dx})`);
    const breps = [];
    for (const pc of pecas) {
      const vmap = new Map(), faces = [];
      const vi = (q) => { const k = q.map((v) => v.toFixed(5)).join(','); let i = vmap.get(k); if (i === undefined) { i = add(`CARTESIAN_POINT('',(${q.map(r).join(',')}))`); vmap.set(k, i); } return i; };
      for (const t of pc.tris) {
        const a = vi(t.points[0]), b = vi(t.points[1]), c = vi(t.points[2]);
        if (a === b || b === c || a === c) continue;
        const loop = add(`POLY_LOOP('',(#${a},#${b},#${c}))`);
        const fb = add(`FACE_OUTER_BOUND('',#${loop},.T.)`);
        faces.push(add(`FACE('',(#${fb}))`));
      }
      const shell = add(`CLOSED_SHELL('',(${faces.map((x) => '#' + x).join(',')}))`);
      breps.push(add(`FACETED_BREP('${esc(pc.nome).replace(/'/g, '')}',#${shell})`));
    }
    const rep = add(`FACETED_BREP_SHAPE_REPRESENTATION('',(#${eixo},${breps.map((x) => '#' + x).join(',')}),#${gctx})`);
    add(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${rep})`);
    const data = new Date().toISOString().slice(0, 19);
    const txt = `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Traco 3D'),'2;1');\nFILE_NAME('traco-peca.step','${data}',(''),(''),'Traco','Traco','');\nFILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));\nENDSEC;\nDATA;\n${L.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
    api.download('traco-peca-solidworks.step', new Blob([txt], { type: 'application/step' }), 'application/step');
  }

  function montarBotoesExport() {
    const stl = $('exportPartStl'); if (!stl) return;
    const b3 = document.createElement('button');
    b3.id = 'export3mf'; b3.type = 'button'; b3.className = 'secondary-button'; b3.textContent = 'Exportar 3MF (cores)';
    b3.onclick = () => { const n = exportar3mf(); if (n) notifica(n > 1 ? `3MF com ${n} cores. No Bambu Studio cada cor vira um filamento.` : '3MF exportado (sem pintura).'); };
    const bs = document.createElement('button');
    bs.id = 'exportStep'; bs.type = 'button'; bs.className = 'secondary-button'; bs.textContent = 'SolidWorks (STEP)';
    bs.title = 'Arquivo STEP: o SolidWorks abre como sólido (Arquivo → Abrir)';
    bs.onclick = exportarStep;
    stl.insertAdjacentElement('beforebegin', bs);
    stl.insertAdjacentElement('beforebegin', b3);
  }
  function notifica(t) { const el = $('toast'); if (!el) return; el.textContent = t; el.classList.add('show'); clearTimeout(notifica.t); notifica.t = setTimeout(() => el.classList.remove('show'), 4200); }

  // ====================== HISTÓRICO ======================
  const HK = 'traco-historico-v1', MAX = 40;
  const ler = () => { try { return JSON.parse(localStorage.getItem(HK)) || []; } catch { return []; } };
  const gravar = (l) => { for (let n = l.length; n > 0; n--) { try { localStorage.setItem(HK, JSON.stringify(l.slice(0, n))); return; } catch { /* sem espaço: corta os mais antigos */ } } };
  const hash = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  function miniatura(canvas) {
    try {
      const c = document.createElement('canvas'), w = 160, h = Math.round(160 * canvas.height / Math.max(1, canvas.width));
      c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#e8ebe4'; x.fillRect(0, 0, w, h);
      x.drawImage(canvas, 0, 0, w, h); return c.toDataURL('image/jpeg', .7);
    } catch { return ''; }
  }
  function instantaneo(tipo) {
    if (tipo === 'peca') {
      const api = P(); if (!api || !api.meshBase().length) return null;
      const pr = api.projeto(), part = api.part;
      const nome = part.operation === 'narrado' ? part.narrado.pecas.map((p) => p.nome).join(' + ') :
        part.mode === 'cup' ? 'Copo cônico' : part.operation === 'thread' ? 'Rosca' : part.operation === 'spring' ? 'Mola' :
          part.operation === 'revolve' ? 'Peça por revolução' : 'Peça extrudada';
      return { tipo, nome, projeto: pr, geo: hash(api.geomKey()), canvas: api.model };
    }
    const pl = window.tracoPlanta; if (!pl || !pl.temDesenho()) return null;
    const pr = pl.projeto(); let paredes = 0; try { paredes = JSON.parse(pr).strokes.length; } catch { /* */ }
    return { tipo, nome: `Planta · ${paredes} paredes`, projeto: pr, geo: hash(pr), canvas: pl.canvas };
  }
  const timers = {};
  function registrar(tipo, formato) {
    const snap = instantaneo(tipo); if (!snap) return;
    const lista = ler(), agora = new Date().toISOString();
    let e = lista.find((x) => x.tipo === tipo && x.geo === snap.geo);
    if (!e) { e = { id: Date.now().toString(36), criado: agora, exportados: {} }; lista.unshift(e); }
    else { lista.splice(lista.indexOf(e), 1); lista.unshift(e); }
    Object.assign(e, { tipo, nome: snap.nome, projeto: snap.projeto, geo: snap.geo, atualizado: agora });
    const th = miniatura(snap.canvas); if (th) e.thumb = th;
    if (formato) e.exportados[formato] = agora;
    gravar(lista.slice(0, MAX));
  }
  window.tracoHistorico = {
    mudou(tipo) { clearTimeout(timers[tipo]); timers[tipo] = setTimeout(() => registrar(tipo), 2500); },
    exportou(tipo, nome) {
      const ext = (String(nome).split('.').pop() || '').toLowerCase();
      if (['stl', '3mf', 'step', 'obj'].includes(ext)) setTimeout(() => registrar(tipo, ext), 50);
    },
  };
  const dataBR = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const dlg = document.createElement('dialog'); dlg.className = 'foto-dialog'; dlg.id = 'historicoDialog'; document.body.appendChild(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  function abrirHistorico() {
    const lista = ler();
    const fmt = (e, f, rot) => e.exportados?.[f] ? `<span class="hist-ok">${rot} ✓ ${dataBR(e.exportados[f])}</span>` : '';
    dlg.innerHTML = `<h3>Histórico de desenhos</h3>
      <p class="foto-sub">Salvo neste aparelho. Mostra se cada desenho já virou arquivo para imprimir.</p>
      ${lista.length ? `<ul class="hist-lista">${lista.map((e) => `<li>
        ${e.thumb ? `<img src="${e.thumb}" alt="" />` : '<div class="hist-sem"></div>'}
        <div class="hist-info"><strong>${esc(e.nome)}</strong>
          <small>${e.tipo === 'peca' ? 'Peça (mm)' : 'Planta (m)'} · ${dataBR(e.atualizado)}</small>
          <div class="hist-badges">${e.tipo === 'peca' ? (e.exportados?.stl ? fmt(e, 'stl', 'STL') : '<span class="hist-nao">STL não gerado</span>') + fmt(e, '3mf', '3MF') + fmt(e, 'step', 'STEP') :
            (e.exportados?.obj ? fmt(e, 'obj', 'OBJ') : '<span class="hist-nao">Não exportado</span>')}</div></div>
        <div class="hist-acoes"><button type="button" class="secondary-button" data-abrir="${e.id}">Abrir</button>
          <button type="button" class="text-button" data-apagar="${e.id}">Excluir</button></div></li>`).join('')}</ul>` :
        '<p>Nenhum desenho ainda. Assim que você criar uma peça ou planta, ela aparece aqui.</p>'}
      <div class="foto-acoes"><button type="button" class="primary-button" data-x="ok">Fechar</button></div>`;
    dlg.querySelector('[data-x=ok]').onclick = () => dlg.close();
    dlg.querySelectorAll('[data-abrir]').forEach((b) => b.onclick = () => {
      const e = ler().find((x) => x.id === b.dataset.abrir); if (!e) return;
      try {
        if (e.tipo === 'peca') { $('partsTab').click(); P().abrir(e.projeto); }
        else { $('architectureTab').click(); window.tracoPlanta.abrir(e.projeto); }
        dlg.close(); notifica(`Aberto: ${e.nome}`);
      } catch { alert('Não foi possível abrir esse desenho.'); }
    });
    dlg.querySelectorAll('[data-apagar]').forEach((b) => b.onclick = () => {
      if (!confirm('Excluir este desenho do histórico?')) return;
      gravar(ler().filter((x) => x.id !== b.dataset.apagar)); abrirHistorico();
    });
    if (!dlg.open) dlg.showModal();
  }
  function botaoHistorico(antes) {
    if (!antes) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary-button foto-button'; b.textContent = '📚 Histórico';
    b.onclick = abrirHistorico; antes.insertAdjacentElement('beforebegin', b);
  }

  // ====================== COTAS ======================
  // Automáticas: largura × profundidade × altura de cada peça (+ Ø, rosca e furo das peças narradas).
  // Manuais: toque em dois cantos da peça e aparece a distância entre eles.
  const cotas = { auto: false, medindo: false, pendente: null, lista: [] };
  window.tracoCotas = cotas;
  const nf = (v) => String(+v.toFixed(2)).replace('.', ',');
  function seta(ctx, a, b, txt, cor = '#111') {
    ctx.save();
    ctx.strokeStyle = cor; ctx.fillStyle = cor; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    for (const [p, s] of [[a, 1], [b, -1]]) {
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + s * 7 * Math.cos(ang - .4), p.y + s * 7 * Math.sin(ang - .4));
      ctx.lineTo(p.x + s * 7 * Math.cos(ang + .4), p.y + s * 7 * Math.sin(ang + .4)); ctx.closePath(); ctx.fill();
    }
    rotulo(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2, txt, cor);
    ctx.restore();
  }
  function rotulo(ctx, x, y, txt, cor = '#111') {
    ctx.font = '700 12px DM Sans, Arial, sans-serif';
    const w = ctx.measureText(txt).width + 10;
    ctx.fillStyle = '#fffffff0'; ctx.strokeStyle = cor; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - 10, w, 20, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = cor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y + .5);
  }
  function caixa(tris) {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const t of tris) for (const q of t.points) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], q[k]); b[k + 3] = Math.max(b[k + 3], q[k]); }
    return b;
  }
  function detalhe(sp) {
    if (!sp) return [];
    const t = [];
    if (sp.tipo === 'cilindro') t.push(`Ø${nf(sp.diametro)}`);
    if (sp.tipo === 'parafuso') t.push(`M${nf(sp.diametro)}×${nf(sp.passo)} · ${nf(sp.comprimento)} mm${sp.cabeca === 'allen' ? ' · allen' : sp.cabeca === 'sextavada' ? ' · sextavado' : ''}`);
    if (sp.tipo === 'porca') t.push(`Porca M${nf(sp.diametro)}×${nf(sp.passo)}`);
    for (const f of sp.furos || []) t.push(`${f.rosca ? `M${nf(f.diametro)}×${nf(f.passo)}` : `Ø${nf(f.diametro)}`} ${f.passante ? 'passante' : `prof. ${nf(f.profundidade)}`}`);
    return t;
  }
  cotas.desenhar = (ctx, proj) => {
    const api = P(); if (!api || api.part.sim) return;
    if (cotas.auto) for (const pc of api.pecas()) {
      const [x0, y0, z0, x1, y1, z1] = caixa(pc.tris);
      const pr = (x, y, z) => proj([x, y, z]);
      // escolhe as arestas da frente (mais perto de quem olha)
      const yf = pr(0, y0, z0).depth > pr(0, y1, z0).depth ? y0 : y1;
      const xf = pr(x0, 0, z0).depth > pr(x1, 0, z0).depth ? x0 : x1;
      const xo = xf === x0 ? x1 : x0, yo = yf === y0 ? y1 : y0;
      const desl = (p, q, d) => { const dx = p.x - q.x, dy = p.y - q.y, L = Math.hypot(dx, dy) || 1; return (r) => ({ x: r.x + dx / L * d, y: r.y + dy / L * d }); };
      const o1 = desl(pr((x0 + x1) / 2, yf, z0), pr((x0 + x1) / 2, yo, z0), 16);
      seta(ctx, o1(pr(x0, yf, z0)), o1(pr(x1, yf, z0)), `${nf(x1 - x0)} mm`, '#b3261e');
      const o2 = desl(pr(xf, (y0 + y1) / 2, z0), pr(xo, (y0 + y1) / 2, z0), 16);
      seta(ctx, o2(pr(xf, y0, z0)), o2(pr(xf, y1, z0)), `${nf(y1 - y0)} mm`, '#1b5e20');
      const o3 = desl(pr(xf, yf, z0), pr(xo, yo, z0), 16);
      seta(ctx, o3(pr(xf, yf, z0)), o3(pr(xf, yf, z1)), `${nf(z1 - z0)} mm`, '#0d47a1');
      const top = pr((x0 + x1) / 2, (y0 + y1) / 2, z1);
      detalhe(pc.spec).forEach((t, i) => rotulo(ctx, top.x, top.y - 26 - i * 22, t, '#111'));
    }
    for (const c of cotas.lista) {
      const a = proj(c.a), b = proj(c.b);
      for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fillStyle = '#7B1FA2'; ctx.fill(); }
      seta(ctx, a, b, `${nf(Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]))} mm`, '#7B1FA2');
    }
    if (cotas.pendente) { const p = proj(cotas.pendente); ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.strokeStyle = '#7B1FA2'; ctx.lineWidth = 2; ctx.stroke(); }
  };
  cotas.clique = (event) => {
    const api = P(), part = api.part;
    if (part.sim || !part.lastProj) return false;
    const r = api.model.getBoundingClientRect(), x = event.clientX - r.left, y = event.clientY - r.top;
    const faces = part.lastFaces || [];
    let alvo = null;
    for (let i = faces.length - 1; i >= 0; i--) if (dentro(x, y, faces[i].corners)) { alvo = faces[i]; break; }
    if (!alvo) return false;
    const tri = api.mesh()[alvo.idx]; if (!tri) return false;
    // canto mais próximo do toque (os cantos é que têm medida exata)
    let melhor = tri.points[0], dm = Infinity;
    tri.points.forEach((q, k) => { const c = alvo.corners[k], d = Math.hypot(c.x - x, c.y - y); if (d < dm) { dm = d; melhor = q; } });
    if (!cotas.pendente) cotas.pendente = [...melhor];
    else { cotas.lista.push({ a: cotas.pendente, b: [...melhor] }); cotas.pendente = null; }
    api.render(); event.preventDefault(); event.stopPropagation();
    return true;
  };
  function montarBarraCotas() {
    const wrap = document.querySelector('.part-model-wrap'); if (!wrap) return;
    const bar = document.createElement('div'); bar.className = 'cota-bar';
    bar.innerHTML = `<button type="button" data-c="auto">📐 Cotas</button><button type="button" data-c="medir">📏 Medir</button><button type="button" data-c="limpar" hidden>Limpar</button>`;
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    wrap.appendChild(bar);
    const bAuto = bar.querySelector('[data-c=auto]'), bMed = bar.querySelector('[data-c=medir]'), bLim = bar.querySelector('[data-c=limpar]');
    const att = () => {
      bAuto.classList.toggle('on', cotas.auto); bMed.classList.toggle('on', cotas.medindo);
      bMed.textContent = cotas.medindo ? (cotas.pendente ? '📏 Toque no 2º ponto' : '📏 Toque no 1º ponto') : '📏 Medir';
      bLim.hidden = !cotas.lista.length && !cotas.pendente;
    };
    bAuto.onclick = () => { cotas.auto = !cotas.auto; att(); P().render(); };
    bMed.onclick = () => {
      cotas.medindo = !cotas.medindo; cotas.pendente = null;
      if (cotas.medindo && pint.ativa) bar.parentElement.querySelector('.paint-toggle')?.click();
      att(); P().render();
      if (cotas.medindo) notifica('Toque em dois cantos da peça para medir a distância entre eles.');
    };
    bLim.onclick = () => { cotas.lista = []; cotas.pendente = null; att(); P().render(); };
    P().model.addEventListener('pointerup', () => setTimeout(att, 0));
  }

  montarBarraPintura();
  montarBarraCotas();
  montarBotoesExport();
  botaoHistorico($('cupExample'));
  botaoHistorico($('exampleButton'));
})();
