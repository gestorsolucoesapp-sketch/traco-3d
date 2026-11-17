// Modo PC: tela no estilo SketchUp. Menu no alto (Arquivo, Editar, Exibir, Desenhar,
// Ferramentas, Modelar, Janela), barra de ferramentas na lateral esquerda, desenho grande
// no centro, 3D à direita e uma barra de status embaixo.
// Os botões daqui só repassam o clique aos botões originais do app, que continuam valendo.
(() => {
  const $ = (id) => document.getElementById(id);
  const CHAVE = 'traco-modo-pc';
  const modo = () => ($('architectureMode')?.hidden ? 'pecas' : 'arq');
  const escopo = () => modo() === 'arq' ? $('partsMode') : $('architectureMode'); // o que NÃO procurar

  // Acha um botão: '#id' ou começo do texto. Vários alvos separados por '|'.
  function acha(alvo) {
    for (const s of alvo.split('|')) {
      if (s.startsWith('#')) { const el = $(s.slice(1)); if (el && !escopo()?.contains(el)) return el; continue; }
      const fora = escopo();
      const el = [...document.querySelectorAll('button')].find((b) => !fora?.contains(b) && !b.closest('.pc-barra,.pc-lateral') && b.textContent.trim().startsWith(s));
      if (el) return el;
    }
    return null;
  }
  const ativo = (b) => b.classList.contains('active') || b.getAttribute('aria-pressed') === 'true';

  const ICONES = {
    drawProfileTool: '／', freehandProfileTool: '✎', rectangleTool: '▭', circleTool: '◯', addProfilePoint: '⌖',
    extrudeTool: '⬆', revolveTool: '⟳', pushPullTool: '⇕', holeTool: '◎', threadTool: '🔩', springTool: '〰',
    doorTool: '🚪', windowTool: '🪟', undoButton: '↶', redoButton: '↷', clearButton: '🗑',
  };
  function partes(b) {
    const ic = b.querySelector('.tool-icon');
    let txt = b.textContent.replace(/\s+/g, ' ').trim();
    let icone = ic ? ic.textContent.trim() : '';
    if (ic) txt = txt.replace(icone, '').trim();
    if (!icone && ICONES[b.id]) icone = ICONES[b.id];
    if (!icone) {
      const seg = window.Intl?.Segmenter ? [...new Intl.Segmenter('pt', { granularity: 'grapheme' }).segment(txt)].map((s) => s.segment) : Array.from(txt);
      const tok = txt.match(/^(\S{1,2})\s+(.+)$/);
      if (seg[0] && !/[\p{L}\p{N}]/u.test(seg[0])) { icone = seg[0]; txt = seg.slice(1).join('').trim(); }
      else if (tok) { icone = tok[1]; txt = tok[2]; }
      else icone = txt.slice(0, 2);
    }
    if (ICONES[b.id] && txt.length <= 2) txt = b.title || b.getAttribute('aria-label') || txt;
    return { icone, txt: txt || b.title || '' };
  }

  // ---------- barra de menus ----------
  const MENUS = () => {
    const arq = modo() === 'arq';
    return [
      ['Arquivo', [
        ['📄 Novo projeto', arq ? '#novoProjeto' : '#newProfile'],
        ['📂 Abrir…', arq ? '#openButton' : '#openPart'],
        ['💾 Salvar', arq ? '#saveButton' : '#savePart'],
        null,
        ['📷 Foto do desenho', arq ? '#fotoArchButton' : '#fotoPartButton'],
        ['🎙️ Narrar peça', arq ? '' : '🎙️ Narrar'],
        ['Exemplo pronto', arq ? '#exampleButton' : '#cupExample'],
        null,
        ['Importar STL', arq ? '#importStlButton' : ''],
        ['Exportar STL', arq ? '#exportButton' : '#exportPartStl'],
        ['Exportar 3MF (cores)', arq ? '' : '#export3mf'],
        ['SolidWorks (STEP)', arq ? '' : '#exportStep'],
        ['🖨️ Prancha PDF', '🖨️ Prancha'],
        ['📚 Histórico', '📚 Histórico'],
      ]],
      ['Editar', [
        ['↶ Desfazer', arq ? '#undoButton' : '#undoProfilePoint'],
        ['↷ Refazer', arq ? '#redoButton' : ''],
        ['🗑 Limpar desenho', arq ? '#clearButton' : '#newProfile'],
        ['Fechar perfil', arq ? '' : '#closeProfile'],
        ['📐 Cotar', arq ? '' : '#cotarPerfil'],
      ]],
      ['Exibir', [
        ['Ver tudo', '#__fit'],
        ['＋ Aproximar', '#__in'],
        ['− Afastar', '#__out'],
        ['⛶ Tela cheia', '#__full'],
        ['〰 Linha e cotas', '#__estilo'],
        null,
        ['3D · Perspectiva', arq ? '#viewPerspective' : ''],
        ['3D · Alicerce (planta)', arq ? '#viewFoundation' : ''],
        ['3D · Frontal', arq ? '#viewFront' : ''],
        ['3D · Redefinir vista', arq ? '#resetView' : '#resetPartView'],
        ['Simular montagem', arq ? '' : '#simularMontagem'],
      ]],
      ['Desenhar', null, 'desenho'],
      arq ? ['Ferramentas', null, 'ferramentas'] : ['Ferramentas', [['📐 Cotar', '#cotarPerfil'], ['🎙️ Narrar peça', '🎙️ Narrar'], ['📷 Foto do desenho', '#fotoPartButton'], ['Simular montagem', '#simularMontagem']]],
      ['Modelar', arq ? [['↑ Empurrar / puxar paredes', '#pushWallsTool'], ['🪑 Objetos', '🪑 Objetos']] : null, arq ? null : 'modelo'],
      ['Janela', [
        ['🏠 Arquitetura · ambientes', '#architectureTab'],
        ['⚙️ Mecânica · peças', '#partsTab'],
        null,
        ['📱 Sair do modo PC', '#__sair'],
      ]],
    ];
  };

  function zoomBar(z) {
    const wrap = modo() === 'arq' ? document.querySelector('#architectureMode .sketch-wrap') : document.querySelector('#partsMode .parts-canvas-wrap');
    return wrap?.querySelector(`.zoom-bar [data-z="${z}"]`);
  }
  function executa(alvo) {
    if (!alvo) return;
    if (alvo === '#__sair') return liga(false);
    const z = alvo.match(/^#__(\w+)$/);
    const b = z ? zoomBar(z[1]) : acha(alvo);
    if (!b) return;
    b.closest('details')?.setAttribute('open', '');
    b.click();
  }

  const barra = document.createElement('div');
  barra.className = 'pc-barra'; barra.setAttribute('role', 'menubar');
  const lateral = document.createElement('div');
  lateral.className = 'pc-lateral'; lateral.setAttribute('role', 'toolbar'); lateral.setAttribute('aria-label', 'Ferramentas');
  const status = document.createElement('div');
  status.className = 'pc-status';
  let aberto = null;

  function itensGrupo(grupo) {
    if (grupo === 'desenho') return botoesLateral().filter((x) => x && x.g === 'd').map((x) => x.b);
    if (grupo === 'ferramentas') return botoesLateral().filter((x) => x && x.g === 'f').map((x) => x.b);
    if (grupo === 'modelo') return [...document.querySelectorAll('#modelMenu .part-menu-content button')];
    return [];
  }
  function abreMenu(nome, botao) {
    fechaMenu();
    const def = MENUS().find((m) => m[0] === nome); if (!def) return;
    const caixa = document.createElement('div'); caixa.className = 'pc-menu'; caixa.setAttribute('role', 'menu');
    let lista = def[1];
    if (!lista) lista = itensGrupo(def[2]).map((b) => { const p = partes(b); return [`${p.icone}  ${p.txt}`, b]; });
    let ultimoSep = true;
    for (const it of lista) {
      if (!it) { if (!ultimoSep) { caixa.appendChild(Object.assign(document.createElement('hr'))); ultimoSep = true; } continue; }
      const [rot, alvo] = it;
      const el = typeof alvo === 'string' ? (alvo.startsWith('#__') ? zoomBar(alvo.slice(3)) || (alvo === '#__sair' ? true : null) : alvo ? acha(alvo) : null) : alvo;
      if (!el) continue;
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
      b.textContent = rot;
      if (el !== true && el.disabled) b.disabled = true;
      if (el !== true && ativo(el)) b.classList.add('marcado');
      b.onclick = () => { fechaMenu(); if (typeof alvo === 'string') executa(alvo); else { alvo.closest('details')?.setAttribute('open', ''); alvo.click(); } };
      caixa.appendChild(b); ultimoSep = false;
    }
    if (caixa.lastElementChild?.tagName === 'HR') caixa.lastElementChild.remove();
    if (!caixa.children.length) { const v = document.createElement('div'); v.className = 'pc-vazio'; v.textContent = 'Nada aqui neste modo'; caixa.appendChild(v); }
    const r = botao.getBoundingClientRect();
    caixa.style.left = `${r.left}px`; caixa.style.top = `${r.bottom}px`;
    document.body.appendChild(caixa); aberto = { caixa, botao }; botao.classList.add('aberto');
  }
  function fechaMenu() { if (!aberto) return; aberto.caixa.remove(); aberto.botao.classList.remove('aberto'); aberto = null; }
  document.addEventListener('pointerdown', (e) => { if (aberto && !aberto.caixa.contains(e.target) && !barra.contains(e.target)) fechaMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechaMenu(); });

  function montaBarra() {
    barra.innerHTML = `<a class="pc-logo" href="#inicio" title="Traço"><img src="marca/traco-icone.svg" alt=""><b>traço<span>.</span></b></a>`;
    for (const [nome] of MENUS()) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pc-menu-bt'; b.textContent = nome; b.setAttribute('role', 'menuitem');
      b.onclick = () => (aberto?.botao === b ? fechaMenu() : abreMenu(nome, b));
      b.onpointerenter = () => { if (aberto && aberto.botao !== b) abreMenu(nome, b); };
      barra.appendChild(b);
    }
    const dir = document.createElement('div'); dir.className = 'pc-dir';
    const arq = modo() === 'arq';
    dir.innerHTML = `<div class="pc-troca"><button type="button" data-m="arq" class="${arq ? 'on' : ''}">Arquitetura</button><button type="button" data-m="pecas" class="${arq ? '' : 'on'}">Peças</button></div>
      <button type="button" class="pc-sair" title="Voltar ao layout do celular">📱 Sair do modo PC</button>`;
    dir.querySelector('[data-m=arq]').onclick = () => $('architectureTab').click();
    dir.querySelector('[data-m=pecas]').onclick = () => $('partsTab').click();
    dir.querySelector('.pc-sair').onclick = () => liga(false);
    barra.appendChild(dir);
  }

  // ---------- barra lateral ----------
  function botoesLateral() {
    const out = [];
    if (modo() === 'arq') {
      const linha = document.querySelector('#architectureMode .tools-row');
      if (!linha) return out;
      let grupo = 'd';
      for (const el of linha.children) {
        if (el.classList.contains('tool-divider')) { out.push(null); grupo = 'e'; continue; }
        if (el.tagName !== 'BUTTON') continue;
        const g = el.dataset.ext || el.classList.contains('ext-copia') || el.textContent.includes('guias') || el.textContent.includes('Objetos') ? 'f' : grupo;
        out.push({ b: el, g });
      }
      // separa desenho / ferramentas / edição
      out.sort((a, b) => (a && b ? 'dfe'.indexOf(a.g) - 'dfe'.indexOf(b.g) : 0));
      const res = []; let ult = null;
      for (const x of out.filter(Boolean)) { if (ult && ult !== x.g) res.push(null); res.push(x); ult = x.g; }
      return res;
    }
    for (const b of document.querySelectorAll('#sketchMenu .part-menu-content button')) out.push({ b, g: 'd' });
    out.push(null);
    for (const b of document.querySelectorAll('#modelMenu .part-menu-content button')) out.push({ b, g: 'm' });
    return out;
  }
  let assinatura = '';
  function montaLateral() {
    const itens = botoesLateral();
    const ass = modo() + itens.map((x) => (x ? x.b.id || x.b.textContent : '|') + (x?.b.hidden ? 'h' : '')).join(',');
    if (ass === assinatura) return; assinatura = ass;
    lateral.innerHTML = '';
    for (const x of itens) {
      if (!x) { if (lateral.lastElementChild && !lateral.lastElementChild.classList.contains('pc-sep')) lateral.appendChild(Object.assign(document.createElement('span'), { className: 'pc-sep' })); continue; }
      if (x.b.hidden) continue;
      const { icone, txt } = partes(x.b);
      const p = document.createElement('button'); p.type = 'button'; p.className = 'pc-ferr';
      p.title = x.b.title ? `${txt} — ${x.b.title}` : txt;
      p.innerHTML = '<span class="pc-ic"></span><span class="pc-rot"></span>';
      p.querySelector('.pc-ic').textContent = icone; p.querySelector('.pc-rot').textContent = txt;
      p.onclick = () => { x.b.closest('details')?.setAttribute('open', ''); x.b.click(); sincroniza(); };
      p._alvo = x.b;
      lateral.appendChild(p);
    }
  }
  function sincroniza() {
    for (const p of lateral.querySelectorAll('.pc-ferr')) {
      p.classList.toggle('on', ativo(p._alvo)); p.disabled = !!p._alvo.disabled;
    }
    const dica = modo() === 'arq' ? $('toolHint')?.textContent : $('profileHint')?.textContent;
    const est = modo() === 'arq' ? $('wallCount')?.textContent : $('profileStatus')?.textContent;
    const txt = `${est || ''}${dica ? '  ·  ' + dica : ''}`;
    if (status.textContent !== txt) status.textContent = txt;
  }

  // ---------- liga / desliga ----------
  let laco = null, ultimoModo = '';
  function liga(on) {
    document.body.classList.toggle('modo-pc', on);
    try { localStorage.setItem(CHAVE, on ? '1' : '0'); } catch { /* */ }
    fechaMenu();
    if (on) {
      if (!barra.isConnected) document.body.append(barra, lateral, status);
      ultimoModo = ''; assinatura = '';
      clearInterval(laco);
      laco = setInterval(() => {
        if (modo() !== ultimoModo) { ultimoModo = modo(); montaBarra(); }
        montaLateral(); sincroniza();
      }, 350);
    } else {
      clearInterval(laco); barra.remove(); lateral.remove(); status.remove();
    }
    botaoPC.hidden = on;
    setTimeout(() => dispatchEvent(new Event('resize')), 60);
  }

  // botão para entrar no modo PC (fica no cabeçalho)
  const botaoPC = document.createElement('button');
  botaoPC.type = 'button'; botaoPC.className = 'pc-entrar'; botaoPC.textContent = '🖥 Modo PC';
  botaoPC.title = 'Tela de computador igual ao SketchUp: menus no alto e ferramentas na lateral';
  botaoPC.onclick = () => liga(true);
  document.querySelector('.topbar-right')?.prepend(botaoPC);

  let salvo = null; try { salvo = localStorage.getItem(CHAVE); } catch { /* */ }
  const telaGrande = matchMedia('(min-width: 1100px) and (pointer: fine)').matches;
  if (salvo === '1' || (salvo === null && telaGrande)) liga(true);
  window.tracoModoPC = liga;
})();
