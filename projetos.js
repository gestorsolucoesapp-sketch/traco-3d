// 🧩 Projetos: guarda a ideia do projeto, liga a um quadro de Rascunhos e gera as peças prontas para impressão 3D (STL).
// A IA desenha as peças com formas e PARÂMETROS (medidas com nome); o app gera a malha no aparelho e baixa o STL.
(() => {
  const $ = (id) => document.getElementById(id);
  const sw = document.querySelector('.discipline-switch');
  if (!sw || !$('architectureMode')) return;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v, c = 1) => (Number.isFinite(+v) ? (+v).toFixed(c).replace(/\.?0+$/, '').replace('.', ',') : '—');

  const tab = document.createElement('button');
  tab.id = 'projetosTab'; tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', 'false');
  tab.textContent = 'Projetos · impressão 3D'; sw.appendChild(tab);
  const painel = document.createElement('div'); painel.id = 'projetosMode'; painel.setAttribute('role', 'tabpanel'); painel.hidden = true;
  painel.innerHTML = `
    <section class="prj-panel">
      <div class="ras-topo prj-topo">
        <select id="prjSel" aria-label="Projeto"></select>
        <button type="button" data-q="novo">＋ Novo</button>
        <button type="button" data-q="nome" title="Renomear">✎</button>
        <button type="button" data-q="apagar" title="Apagar projeto">🗑</button>
      </div>
      <div class="prj-corpo">
        <div class="prj-ideia">
          <label>Ideia do projeto<textarea id="prjIdeia" rows="4" placeholder="Descreva a ideia"></textarea></label>
          <label>Quadro de rascunhos ligado <select id="prjQuadro"></select></label>
          <label>O que imprimir <input id="prjPedido" placeholder="Descreva a peça a imprimir" /></label>
          <label>Medidas que você já tem <textarea id="prjMedidas" rows="2" placeholder="Medidas reais das suas peças"></textarea></label>
          <button type="button" class="primary-button prj-gerar" id="prjGerar">🧩 Gerar objeto para impressão 3D</button>
          <p class="prj-msg" id="prjMsg"></p>
        </div>
        <div class="prj-res" id="prjRes" hidden>
          <div class="prj-vista">
            <canvas id="prjCanvas"></canvas>
            <div class="prj-vbar"><button type="button" data-v="montado" class="on">Montado</button><button type="button" data-v="mesa">Mesa de impressão</button><button type="button" data-v="corte">✂️ Corte</button></div>
            <p class="prj-calc" id="prjCalc"></p>
          </div>
          <h4>Peças</h4><div id="prjPecas"></div>
          <div class="prj-baixa"><button type="button" class="primary-button" id="prjTodas">⬇ Baixar todas (STL)</button></div>
          <h4>Componentes para comprar <small>toque para pesquisar preço, links e medidas</small></h4>
          <div id="prjComp"></div>
          <h4>Medidas do projeto <small>mude e o 3D refaz na hora</small></h4>
          <div id="prjParams"></div>
          <div id="prjConf"></div>
          <div id="prjMont"></div>
          <div class="prj-ajuste"><input id="prjAjuste" placeholder="Ajustar com IA: o que mudar" /><button type="button" class="secondary-button" id="prjAjBt">✨ Ajustar</button></div>
        </div>
      </div>
    </section>`;
  $('rascunhosMode')?.insertAdjacentElement('afterend', painel) || $('partsMode').insertAdjacentElement('afterend', painel);

  // ---------- guardar ----------
  let lista = [], P = null, db = null;
  const novoId = () => Math.random().toString(36).slice(2, 10);
  const vazio = (nome) => ({ id: novoId(), nome, ideia: '', quadro: '', pedido: '', medidas: '', spec: null, valores: {}, quando: Date.now() });
  const abrirDB = () => new Promise((ok) => { try { const r = indexedDB.open('traco-projetos', 1); r.onupgradeneeded = () => r.result.createObjectStore('p', { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); } catch { ok(null); } });
  async function carregar() {
    db = await abrirDB();
    if (db) lista = await new Promise((ok) => { const r = db.transaction('p').objectStore('p').getAll(); r.onsuccess = () => ok(r.result || []); r.onerror = () => ok([]); });
    else try { lista = JSON.parse(localStorage.getItem('traco-projetos') || '[]'); } catch { lista = []; }
    lista.sort((a, b) => b.quando - a.quando);
    if (!lista.length) lista.push(vazio('Meu primeiro projeto'));
    let u = null; try { u = localStorage.getItem('traco-projeto-atual'); } catch { /* */ }
    P = lista.find((p) => p.id === u) || lista[0]; mostraProjeto();
  }
  let tS = 0;
  function salvar() { P.quando = Date.now(); clearTimeout(tS); tS = setTimeout(() => { if (db) try { db.transaction('p', 'readwrite').objectStore('p').put(P); } catch { /* */ } else try { localStorage.setItem('traco-projetos', JSON.stringify(lista)); } catch { /* */ } window.tracoSync?.mudou(); }, 300); }
  function listaSel() { $('prjSel').innerHTML = lista.map((p) => `<option value="${p.id}" ${p === P ? 'selected' : ''}>${esc(p.nome)}</option>`).join(''); try { localStorage.setItem('traco-projeto-atual', P.id); } catch { /* */ } }
  function quadros() { return window.tracoRascunhos?.quadros?.() || []; }
  function listaQuadros() { $('prjQuadro').innerHTML = `<option value="">— nenhum —</option>` + quadros().map((q) => `<option value="${q.id}" ${q.id === P.quadro ? 'selected' : ''}>${esc(q.nome)}</option>`).join(''); }
  function mostraProjeto() {
    listaSel(); listaQuadros();
    $('prjIdeia').value = P.ideia || ''; $('prjPedido').value = P.pedido || ''; $('prjMedidas').value = P.medidas || ''; $('prjMsg').textContent = '';
    malhas = []; mostraResultado(); if (P.spec) refazer();
    document.dispatchEvent(new Event('traco-projeto'));
  }
  for (const [id, k] of [['prjIdeia', 'ideia'], ['prjPedido', 'pedido'], ['prjMedidas', 'medidas']]) $(id).addEventListener('input', (e) => { P[k] = e.target.value; salvar(); });
  $('prjQuadro').addEventListener('change', (e) => { P.quadro = e.target.value; salvar(); });
  $('prjSel').addEventListener('change', (e) => { P = lista.find((p) => p.id === e.target.value) || P; mostraProjeto(); });
  painel.querySelector('[data-q=novo]').onclick = () => { const n = prompt('Nome do projeto:', `Projeto ${lista.length + 1}`); if (n == null) return; P = vazio(n.trim() || `Projeto ${lista.length + 1}`); lista.unshift(P); salvar(); mostraProjeto(); };
  painel.querySelector('[data-q=nome]').onclick = () => { const n = prompt('Novo nome:', P.nome); if (!n?.trim()) return; P.nome = n.trim(); listaSel(); salvar(); };
  painel.querySelector('[data-q=apagar]').onclick = () => {
    if (!confirm(`Apagar o projeto "${P.nome}"? Isso não tem volta.`)) return;
    if (db) try { db.transaction('p', 'readwrite').objectStore('p').delete(P.id); } catch { /* */ }
    window.tracoSync?.apagou('projeto', P.id);
    lista = lista.filter((p) => p !== P); if (!lista.length) lista.push(vazio('Meu primeiro projeto')); P = lista[0]; salvar(); mostraProjeto();
  };

  // ---------- IA ----------
  async function pedirIA(ajuste) {
    const msg = $('prjMsg'), bts = [$('prjGerar'), $('prjAjBt')];
    if (!ajuste && !(P.ideia || '').trim() && !P.quadro) { msg.textContent = 'Escreva a ideia do projeto ou ligue um quadro de rascunhos.'; $('prjIdeia').focus(); return; }
    const q = quadros().find((x) => x.id === P.quadro);
    const contexto = q ? q.objs.filter((o) => (o.t === 'nota' || o.t === 'texto') && o.texto?.trim()).map((o) => '- ' + o.texto.trim().replace(/\s+/g, ' ')).join('\n') : '';
    bts.forEach((b) => (b.disabled = true));
    msg.textContent = ajuste ? '✨ Ajustando o projeto… (1 a 2 minutos)' : '🧩 Projetando as peças… (1 a 2 minutos)';
    window.tracoNuvem?.('Projetando as peças…');
    try {
      // etapa 1: plano (medidas + lista de peças)
      const base = { ideia: P.ideia || '', pedido: P.pedido || '', medidas: P.medidas || '', quadro: contexto };
      if (ajuste) { base.ajuste = ajuste; base.atual = JSON.stringify({ ...P.spec, parametros: (P.spec.parametros || []).map((p) => ({ ...p, valor: P.valores[p.id] ?? p.valor })) }); }
      const plano = await window.tracoChamarIA({ projeto: { ...base, fase: 'plano' } });
      if (!Array.isArray(plano?.pecas) || !plano.pecas.length) throw new Error('A IA não devolveu peças. Explique melhor o que quer imprimir.');
      // etapa 2: cada peça em paralelo
      let prontas = 0; const n = plano.pecas.length;
      msg.textContent = `🧩 Plano pronto (${n} peça${n > 1 ? 's' : ''}). Desenhando as peças… 0/${n}`;
      const planoTxt = JSON.stringify(plano), faltam = {};
      const umaPeca = async (pc, i) => {
        for (let t = 0; t < 2; t++) {
          try {
            const r = await window.tracoChamarIA({ projeto: { fase: 'peca', plano: planoTxt, indice: String(i), nome: pc.nome || '', ajuste: [ajuste || '', faltam[i] ? `Declare em parametros_novos: ${faltam[i]}.` : ''].filter(Boolean).join(' ') } });
            const conhecidos = new Set([...(plano.parametros || []), ...(r?.parametros_novos || [])].map((p) => p.id));
            const falta = [...new Set((JSON.stringify(r?.forma || {}).match(/"[^"]*"/g) || []).flatMap((q) => q.slice(1, -1).match(/[A-Za-z_]\w*/g) || []))]
              .filter((w) => !conhecidos.has(w) && !['min', 'max', 'sqrt', 'abs', 'round', 'floor', 'ceil'].includes(w) && !/^(op|tipo|itens|item|centro|rot|tam|raio|d|d1|d2|h|s|D|n|passo|eixo|uniao|diferenca|intersecao|repetir|espelho|caixa|cilindro|cone|esfera|hexagono|toro|x|y|z)$/.test(w));
            if (falta.length && !t) { faltam[i] = falta.join(', '); continue; } // pediu medida sem declarar: tenta de novo
            if (r?.forma) { prontas++; msg.textContent = `🧩 Desenhando as peças… ${prontas}/${n}`; return r; }
          } catch (e) { if (t) return { erro: String(e.message || e) }; }
        }
        return { erro: 'A IA não conseguiu desenhar esta peça.' };
      };
      const res = await Promise.all(plano.pecas.map(umaPeca));
      const ids = new Set((plano.parametros || []).map((p) => p.id));
      res.forEach((r, i) => {
        plano.pecas[i].forma = r.forma || null; if (r.erro) plano.pecas[i].erroIA = r.erro;
        for (const q of r.parametros_novos || []) if (q?.id && !ids.has(q.id)) { ids.add(q.id); (plano.parametros ||= []).push(q); }
      });
      if (!res.some((r) => r.forma)) throw new Error(res[0]?.erro || 'A IA não conseguiu desenhar as peças.');
      const valoresAntes = ajuste ? P.valores : {};
      P.spec = plano; P.valores = Object.fromEntries(Object.entries(valoresAntes).filter(([k]) => ids.has(k)));
      if (!ajuste && plano.nome && /^(Meu primeiro projeto|Projeto \d+)$/.test(P.nome)) { P.nome = plano.nome; listaSel(); }
      salvar(); $('prjAjuste').value = '';
      const falhou = res.filter((r) => !r.forma).length;
      msg.textContent = falhou ? `⚠️ ${falhou} peça(s) não saíram. Toque em ✨ Ajustar com "refazer as peças que faltaram".` : '';
      refazer();
    } catch (e) { msg.textContent = String(e.message || e); }
    bts.forEach((b) => (b.disabled = false));
  }
  $('prjGerar').onclick = () => pedirIA(null);
  $('prjAjBt').onclick = () => { const t = $('prjAjuste').value.trim(); if (!P.spec) return; if (t.length < 4) { $('prjAjuste').focus(); return; } pedirIA(t); };

  // ---------- malha (Worker) ----------
  let worker = null, pedidoId = 0, malhas = [], calc = {};
  const ver = (document.querySelector('script[src*="projetos.js"]')?.src.match(/\?(v=\d+)/) || [])[1] || 'v=1';
  function trabalhar(fino) {
    worker ??= new Worker(`projeto-worker.js?${ver}`);
    const id = ++pedidoId;
    return new Promise((ok) => {
      const h = (e) => { if (e.data.id !== id) return; worker.removeEventListener('message', h); ok(e.data); };
      worker.addEventListener('message', h);
      worker.postMessage({ id, projeto: P.spec, valores: P.valores, fino });
    });
  }
  let tR = 0;
  function refazer() { clearTimeout(tR); tR = setTimeout(async () => {
    $('prjCalc').textContent = 'Gerando o 3D…';
    const r = await trabalhar(false); if (r.id !== pedidoId) return;
    malhas = r.pecas; P._erros = r.erros; calc = r.calc || {}; mostraResultado(); enquadra(); desenhar();
  }, 150); }

  // ---------- resultado ----------
  const CORES = ['#d76845', '#2e6fd8', '#2e9b5b', '#e0a800', '#8a4fd1', '#3aa6a6', '#b5546b'];
  const ORIG = { usuario: ['você', 'ok'], componente: ['ficha do componente', 'conf'], estimado: ['estimado — confira', 'est'], projeto: ['regra de projeto', 'ok'] };
  function mostraResultado() {
    const S = P.spec; $('prjRes').hidden = !S; if (!S) return;
    $('prjPecas').innerHTML = (S.pecas || []).map((pc, i) => {
      const m = malhas.find((x) => x.i === i);
      const peso = m?.vol ? `${fmt(m.vol / 1000, 1)} cm³ · ≈ ${fmt(m.vol / 1000 * 1.24, 0)} g de PLA maciço` : '';
      const tam = m?.bb ? `${fmt(m.bb[3] - m.bb[0])} × ${fmt(m.bb[4] - m.bb[1])} × ${fmt(m.bb[5] - m.bb[2])} mm` : '';
      return `<div class="prj-peca"><i style="background:${CORES[i % CORES.length]}"></i><div><b>${esc(pc.nome || `Peça ${i + 1}`)}</b>
        <small>${m?.erro ? '⚠️ ' + esc(m.erro) : `${tam}${peso ? ' · ' + peso : ''}`}</small>${pc.impressao ? `<small>🖨️ ${esc(pc.impressao)}</small>` : ''}</div>
        <button type="button" class="secondary-button" data-stl="${i}" ${m?.erro ? 'disabled' : ''}>⬇ STL</button></div>`;
    }).join('');
    const params = S.parametros || [];
    $('prjParams').innerHTML = params.length ? `<table class="prj-tab"><tbody>${params.map((p) => { const o = ORIG[p.origem] || ORIG.estimado; return `<tr class="${o[1]}">
      <td><b>${esc(p.nome || p.id)}</b>${p.obs ? `<small>${esc(p.obs)}</small>` : ''}</td>
      <td><input data-par="${esc(p.id)}" inputmode="decimal" value="${esc(String(P.valores[p.id] ?? p.valor).replace('.', ','))}" title="${esc(String(P.valores[p.id] ?? p.valor))}" /> <span>${esc(p.unidade || 'mm')}</span>${/[A-Za-z_]/.test(String(P.valores[p.id] ?? p.valor)) && Number.isFinite(calc[p.id]) ? `<small>= ${fmt(calc[p.id], 2)}</small>` : ''}</td>
      <td><em>${o[0]}</em></td></tr>`; }).join('')}</tbody></table>` : '';
    const comps = S.componentes || [];
    $('prjComp').innerHTML = comps.map((c, i) => `<button type="button" class="prj-comp" data-comp="${i}"><span>${c.qtd > 1 ? `<b>${esc(c.qtd)}×</b> ` : ''}${esc(c.nome)}${c.funcao ? `<small>${esc(c.funcao)}</small>` : ''}</span><em>${pesquisado(c.nome) ? '✓ ' : ''}🔎</em></button>`).join('')
      + `<button type="button" class="prj-comp outro" data-comp="-1"><span>🔎 Pesquisar outro componente…</span></button>`;
    painel.querySelectorAll('[data-comp]').forEach((b) => (b.onclick = () => pesquisarComp(+b.dataset.comp < 0 ? '' : comps[+b.dataset.comp].nome)));
    const conf = [...(S.conferir || []), ...(P._erros || [])];
    $('prjConf').innerHTML = conf.length ? `<div class="prj-aviso"><b>Confira antes de imprimir</b><ul>${conf.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : '';
    $('prjMont').innerHTML = (S.montagem || []).length ? `<h4>Montagem</h4><ol class="prj-mont">${S.montagem.map((m) => `<li>${esc(m)}</li>`).join('')}</ol>` : '';
    painel.querySelectorAll('[data-stl]').forEach((b) => (b.onclick = () => baixar([+b.dataset.stl])));
    painel.querySelectorAll('[data-par]').forEach((el) => el.addEventListener('change', () => {
      const t = el.value.trim().replace(/(\d),(\d)/g, '$1.$2'); if (t === '') delete P.valores[el.dataset.par]; else P.valores[el.dataset.par] = t; salvar(); refazer();
    }));
    const tot = malhas.reduce((s, m) => s + (m.vol || 0), 0);
    $('prjCalc').textContent = malhas.length ? `${(S.pecas || []).length} peça(s) · ${fmt(tot / 1000, 1)} cm³ no total` : '';
  }
  function pesquisado(nome) { try { return JSON.stringify(JSON.parse(localStorage.getItem('traco-pesquisas') || '{}')).toLowerCase().includes(`"nome":${JSON.stringify(nome).toLowerCase()}`); } catch { return false; } }
  function pesquisarComp(nome) {
    const S = P.spec, ps = (S.parametros || []).filter((p) => p.origem === 'componente' || p.origem === 'estimado');
    window.tracoPesquisar?.({
      aoResultado: () => document.dispatchEvent(new Event('traco-compras')),
      item: nome, auto: Boolean(nome), contexto: `${S.nome || P.nome}: ${S.resumo || P.ideia || ''}`.slice(0, 600),
      parametros: ps.map((p) => `${p.id}: ${p.nome} = ${P.valores[p.id] ?? p.valor} mm${p.obs ? ` (${p.obs})` : ''}`).join('\n'),
      parametrosIds: ps.map((p) => p.id), nomeParam: (id) => ps.find((p) => p.id === id)?.nome || id,
      aoAplicar: (lista) => {
        for (const m of lista) {
          const p = S.parametros.find((q) => q.id === m.id); if (!p || !Number.isFinite(+m.valor)) continue;
          P.valores[m.id] = String(+m.valor); p.origem = 'componente';
          try { p.obs = `pesquisado em ${new URL(m.fonte).host.replace(/^www\./, '')}`; } catch { /* */ }
        }
        salvar(); mostraResultado(); refazer();
      },
    });
  }
  $('prjTodas').onclick = () => baixar((P.spec?.pecas || []).map((_, i) => i));

  // ---------- STL (malha fina, já deitada para imprimir) ----------
  function rotaciona(T, rot) {
    if (!rot || !rot.some((x) => +x)) return T;
    const R = Math.PI / 180, [a, b, c] = rot.map((x) => (+x || 0) * R), ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    const m = [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa, sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa, -sb, cb * sa, cb * ca];
    const o = new Float32Array(T.length);
    for (let i = 0; i < T.length; i += 3) { const x = T[i], y = T[i + 1], z = T[i + 2]; o[i] = m[0] * x + m[1] * y + m[2] * z; o[i + 1] = m[3] * x + m[4] * y + m[5] * z; o[i + 2] = m[6] * x + m[7] * y + m[8] * z; }
    return o;
  }
  function naMesa(T) { // centro no meio da mesa, apoiada em z = 0
    let a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < T.length; i += 3) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], T[i + k]); b[k] = Math.max(b[k], T[i + k]); }
    const d = [-(a[0] + b[0]) / 2, -(a[1] + b[1]) / 2, -a[2]], o = new Float32Array(T.length);
    for (let i = 0; i < T.length; i += 3) for (let k = 0; k < 3; k++) o[i + k] = T[i + k] + d[k];
    return { T: o, tam: [b[0] - a[0], b[1] - a[1], b[2] - a[2]] };
  }
  function stl(T, nome) {
    const n = T.length / 9, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
    new Uint8Array(buf).set(new TextEncoder().encode(`Traco projeto ${nome}`.slice(0, 79)));
    dv.setUint32(80, n, true);
    for (let t = 0, o = 84; t < n; t++, o += 50) {
      const i = t * 9, ux = T[i + 3] - T[i], uy = T[i + 4] - T[i + 1], uz = T[i + 5] - T[i + 2], vx = T[i + 6] - T[i], vy = T[i + 7] - T[i + 1], vz = T[i + 8] - T[i + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
      dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
      for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, T[i + k], true);
    }
    return buf;
  }
  async function baixar(quais) {
    const msg = $('prjMsg'); msg.textContent = '⏳ Gerando o STL com a malha fina…'; $('prjTodas').disabled = true;
    const r = await trabalhar(true);
    const grande = [];
    for (const i of quais) {
      const m = r.pecas.find((x) => x.i === i); if (!m?.T) continue;
      const pc = P.spec.pecas[i], { T, tam } = naMesa(rotaciona(m.T, pc.imprimir_rot));
      if (Math.max(tam[0], tam[1]) > 256 || tam[2] > 256) grande.push(`${pc.nome}: ${fmt(tam[0])} × ${fmt(tam[1])} × ${fmt(tam[2])} mm`);
      const nome = `${P.nome}-${pc.nome || 'peca' + (i + 1)}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').toLowerCase();
      const u = URL.createObjectURL(new Blob([stl(T, nome)], { type: 'model/stl' })), a = document.createElement('a');
      a.href = u; a.download = nome + '.stl'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
      await new Promise((q) => setTimeout(q, 400));
    }
    $('prjTodas').disabled = false;
    msg.textContent = grande.length ? `⚠️ Maior que a mesa de 256 mm: ${grande.join('; ')}` : '✓ STL baixado, já deitado na posição de imprimir.';
  }

  // ---------- visualização 3D ----------
  const cv = $('prjCanvas'), ctx = cv.getContext('2d'), cam = { yaw: -.7, pitch: .5, zoom: 1 }; let modo = 'montado', W = 0, H = 0, dpr = 1, caixa = null;
  function tamanho() { const r = cv.getBoundingClientRect(); if (!r.width) return; dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; desenhar(); }
  new ResizeObserver(tamanho).observe(cv);
  function posicoes() { // por peça: deslocamento para a vista
    const S = P.spec; if (!S) return [];
    if (modo !== 'mesa') return malhas.map((m) => ({ m, T: m.T, d: [0, 0, 0] }));
    let x = 0; return malhas.filter((m) => m.T).map((m) => { const { T, tam } = naMesa(rotaciona(m.T, S.pecas[m.i]?.imprimir_rot)); const d = [x + tam[0] / 2, 0, 0]; x += tam[0] + 10; return { m, T, d }; });
  }
  function enquadra() {
    const ps = posicoes(); if (!ps.length) { caixa = null; return; }
    const a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
    for (const { T, d } of ps) if (T) for (let i = 0; i < T.length; i += 30) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], T[i + k] + d[k]); b[k] = Math.max(b[k], T[i + k] + d[k]); }
    caixa = { c: [0, 1, 2].map((k) => (a[k] + b[k]) / 2), r: Math.max(...[0, 1, 2].map((k) => b[k] - a[k])) || 1 };
  }
  let rafD = 0;
  function desenhar() { if (!rafD) rafD = requestAnimationFrame(() => { rafD = 0; desenharJa(); }); }
  function desenharJa() {
    if (painel.hidden || !W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#e8ebe4'; ctx.fillRect(0, 0, W, H);
    if (!caixa) return;
    const s = Math.min(W, H) / (caixa.r * 1.5) * cam.zoom, cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const proj = (x, y, z) => { x -= caixa.c[0]; y -= caixa.c[1]; z -= caixa.c[2]; const X = x * cy - y * sy, Y = x * sy + y * cy; return [W / 2 + X * s, H / 2 - (z * cp - Y * sp) * s, Y * cp + z * sp]; };
    const faces = [];
    posicoes().forEach(({ m, T, d }) => {
      if (!T) return; const cor = CORES[m.i % CORES.length], rgb = [1, 3, 5].map((k) => parseInt(cor.slice(k, k + 2), 16));
      for (let i = 0; i < T.length; i += 9) {
        if (modo === 'corte' && (T[i + 1] + T[i + 4] + T[i + 7]) / 3 + d[1] < caixa.c[1]) continue;
        const A = proj(T[i] + d[0], T[i + 1] + d[1], T[i + 2] + d[2]), B = proj(T[i + 3] + d[0], T[i + 4] + d[1], T[i + 5] + d[2]), C = proj(T[i + 6] + d[0], T[i + 7] + d[1], T[i + 8] + d[2]);
        const cr = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
        if (modo !== 'corte' && cr > 0) continue; // face de costas
        const ux = T[i + 3] - T[i], uy = T[i + 4] - T[i + 1], uz = T[i + 5] - T[i + 2], vx = T[i + 6] - T[i], vy = T[i + 7] - T[i + 1], vz = T[i + 8] - T[i + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
        let luz = .35 + .65 * Math.max(0, nx * -.4 * cy + ny * .4 * sy + nz * .75 + (-nx * sy - ny * cy) * .35);
        if (cr > 0) luz *= .55; // parte de dentro vista pelo corte
        faces.push([A, B, C, (A[2] + B[2] + C[2]) / 3, `rgb(${rgb.map((v) => Math.round(Math.min(255, v * (.45 + .75 * luz)))).join(',')})`]);
      }
    });
    faces.sort((a, b) => a[3] - b[3]);
    for (const [A, B, C, , cor] of faces) { ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.closePath(); ctx.fillStyle = cor; ctx.fill(); ctx.strokeStyle = cor; ctx.lineWidth = .5; ctx.stroke(); }
  }
  const toque = new Map(); let gesto = null;
  cv.addEventListener('pointerdown', (e) => { try { cv.setPointerCapture(e.pointerId); } catch { /* */ } toque.set(e.pointerId, [e.clientX, e.clientY]); if (toque.size === 2) { const [a, b] = [...toque.values()]; gesto = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  cv.addEventListener('pointermove', (e) => {
    const ant = toque.get(e.pointerId); if (!ant) return; toque.set(e.pointerId, [e.clientX, e.clientY]);
    if (toque.size >= 2) { const [a, b] = [...toque.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (gesto) cam.zoom = Math.max(.3, Math.min(8, cam.zoom * d / gesto)); gesto = d; }
    else { cam.yaw += (e.clientX - ant[0]) * .008; cam.pitch = Math.max(-1.55, Math.min(1.55, cam.pitch + (e.clientY - ant[1]) * .006)); }
    desenhar();
  });
  const solta = (e) => { toque.delete(e.pointerId); if (toque.size < 2) gesto = null; };
  cv.addEventListener('pointerup', solta); cv.addEventListener('pointercancel', solta);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); cam.zoom = Math.max(.3, Math.min(8, cam.zoom * Math.exp(-e.deltaY * .002))); desenhar(); }, { passive: false });
  painel.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { modo = b.dataset.v; painel.querySelectorAll('[data-v]').forEach((q) => q.classList.toggle('on', q === b)); enquadra(); desenhar(); }));

  // ---------- trocar de aba ----------
  function mostrar(sim) {
    painel.hidden = !sim; tab.setAttribute('aria-selected', String(sim)); document.body.classList.toggle('aba-livre', sim || !(document.getElementById('rascunhosMode')?.hidden ?? true));
    if (!sim) return;
    for (const id of ['architectureMode', 'partsMode', 'rascunhosMode']) { const el = $(id); if (el) el.hidden = true; }
    for (const id of ['architectureTab', 'partsTab', 'rascunhosTab']) $(id)?.setAttribute('aria-selected', 'false');
    document.body.classList.remove('em-rascunhos');
    try { localStorage.setItem('traco-active-mode', 'projetos'); } catch { /* */ }
    if (P) listaQuadros();
    requestAnimationFrame(tamanho);
  }
  tab.addEventListener('click', () => mostrar(true));
  for (const id of ['architectureTab', 'partsTab', 'rascunhosTab']) $(id)?.addEventListener('click', () => mostrar(false));
  // chamado pelo quadro de Rascunhos: "🧩 Projeto"
  window.tracoProjetos = {
    gesto: () => Boolean(gesto),
    atual: () => P,
    recarregar: () => carregar(),
    malhas: () => malhas,
    gerar: () => pedirIA(null),
    mostra: () => mostraProjeto(),
    pesquisar: (nome) => pesquisarComp(nome),
    salvar: () => salvar(),
    // projeto vindo de um HTML exportado: atualiza o mesmo projeto ou cria cópia
    importar(d) {
      const i = lista.findIndex((x) => x.id === d.id); let r = 'novo';
      if (i >= 0) { if (confirm(`Atualizar o projeto "${lista[i].nome}" com o que foi editado no HTML?\n\nOK = substituir · Cancelar = importar como cópia`)) { lista[i] = d; r = 'atualizado'; } else { d.id = novoId(); d.nome += ' (cópia)'; lista.unshift(d); } }
      else lista.unshift(d);
      P = d; salvar(); mostraProjeto(); return r;
    },
    // abre o projeto do quadro e, se ainda não tem 3D, já começa a gerar (ideia = tema pedido ou notas do quadro)
    doQuadro(q, opc = {}) {
      if (!P) return;
      let p = lista.find((x) => x.quadro === q.id);
      if (!p) { p = vazio(q.nome); p.quadro = q.id; lista.unshift(p); }
      if (opc.ideia && !(p.ideia || '').includes(opc.ideia)) p.ideia = [p.ideia, opc.ideia].filter(Boolean).join('\n');
      P = p; salvar(); mostraProjeto(); tab.click();
      const temTexto = (p.ideia || '').trim() || q.objs.some((o) => (o.t === 'nota' || o.t === 'texto') && o.texto?.trim());
      if (opc.gerar || (!p.spec && temTexto)) { $('prjGerar').scrollIntoView({ block: 'center' }); pedirIA(null); }
      else if (!temTexto) { $('prjIdeia').focus(); $('prjMsg').textContent = 'Escreva a ideia do projeto e toque em 🧩 Gerar.'; }
    },
  };
  carregar().then(() => { try { if (localStorage.getItem('traco-active-mode') === 'projetos') mostrar(true); } catch { /* */ } });
})();
