// Aparência: FUNDO (o app) e ÁREA DE TRABALHO (desenho 2D e 3D) separados — cada um com claro/escuro e brilho.
(() => {
  const CH = 'traco-tema';
  let cfg = { escuro: false, brilho: 100, areaEscuro: false, areaBrilho: 100, grade: true, gradeForca: 100, gradeTam: 'medio' };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(CH) || '{}')); } catch { /* */ }
  const INV = 'invert(1) hue-rotate(180deg)';
  const aplica = () => {
    const html = `${cfg.escuro ? INV + ' ' : ''}brightness(${cfg.brilho / 100})`;
    document.documentElement.style.filter = (cfg.escuro || cfg.brilho !== 100) ? html : '';
    // área = (efeito desejado) e depois desfaz o filtro do fundo
    const area = `${cfg.areaEscuro ? INV + ' ' : ''}brightness(${cfg.areaBrilho / 100}) brightness(${100 / cfg.brilho})${cfg.escuro ? ' hue-rotate(-180deg) invert(1)' : ''}`;
    const neutro = cfg.escuro === cfg.areaEscuro && cfg.brilho === cfg.areaBrilho;
    document.documentElement.style.setProperty('--filtro-area', neutro ? 'none' : area);
    document.documentElement.classList.toggle('tema-escuro', cfg.escuro);
    window.tracoAreaEscura = !!cfg.areaEscuro; // a área escura inverte as cores do canvas; mapas de cor compensam
    window.tracoGrade = { mostrar: cfg.grade, forca: cfg.gradeForca, tam: cfg.gradeTam };
    try { window.requestRender?.(); window.tracoPeca?.render(); } catch { /* */ }
    try { localStorage.setItem(CH, JSON.stringify(cfg)); } catch { /* */ }
    pinta();
  };
  const bt = document.createElement('button');
  bt.type = 'button'; bt.className = 'tema-bt'; bt.title = 'Aparência: fundo e área de trabalho'; bt.setAttribute('aria-label', 'Aparência');
  const pop = document.createElement('div'); pop.className = 'tema-pop'; pop.hidden = true;
  const bloco = (id, titulo) => `<div class="tema-bloco"><b>${titulo}</b>
    <div class="tema-seg"><button type="button" data-${id}="0">☀️ Claro</button><button type="button" data-${id}="1">🌙 Escuro</button></div>
    <label>Brilho <span class="tema-val" data-v="${id}"></span><input type="range" min="50" max="150" step="5" data-r="${id}" /></label></div>`;
  pop.innerHTML = `${bloco('f', 'Fundo')}${bloco('a', 'Área de trabalho (desenho e 3D)')}
    <div class="tema-bloco"><b>Quadriculado</b>
      <div class="tema-seg"><button type="button" data-g="1">Mostrar</button><button type="button" data-g="0">Esconder</button></div>
      <div class="tema-seg"><button type="button" data-t="fino">Fino</button><button type="button" data-t="medio">Médio</button><button type="button" data-t="grosso">Grosso</button></div>
      <label>Intensidade <span class="tema-val" data-v="g"></span><input type="range" min="20" max="300" step="10" data-r="g" /></label></div>
    <div class="tema-fim"><button type="button" data-reset>Voltar ao normal</button></div>`;
  document.body.appendChild(pop);
  const chave = { f: ['escuro', 'brilho'], a: ['areaEscuro', 'areaBrilho'] };
  function pinta() {
    bt.textContent = cfg.escuro ? '🌙' : '☀️';
    for (const id of ['f', 'a']) {
      const [e, b] = chave[id];
      pop.querySelectorAll(`[data-${id}]`).forEach((x) => x.classList.toggle('on', (x.dataset[id] === '1') === cfg[e]));
      pop.querySelector(`[data-r="${id}"]`).value = cfg[b];
      pop.querySelector(`[data-v="${id}"]`).textContent = `${cfg[b]}%`;
    }
    pop.querySelectorAll('[data-g]').forEach((x) => x.classList.toggle('on', (x.dataset.g === '1') === cfg.grade));
    pop.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x.dataset.t === cfg.gradeTam));
    pop.querySelector('[data-r="g"]').value = cfg.gradeForca; pop.querySelector('[data-v="g"]').textContent = `${cfg.gradeForca}%`;
    document.querySelectorAll('.pc-barra .tema-bt').forEach((x) => (x.textContent = bt.textContent));
  }
  pop.querySelectorAll('[data-g]').forEach((x) => (x.onclick = () => { cfg.grade = x.dataset.g === '1'; aplica(); }));
  pop.querySelectorAll('[data-t]').forEach((x) => (x.onclick = () => { cfg.gradeTam = x.dataset.t; aplica(); }));
  pop.querySelector('[data-r="g"]').addEventListener('input', (ev) => { cfg.gradeForca = +ev.target.value; aplica(); });
  for (const id of ['f', 'a']) {
    const [e, b] = chave[id];
    pop.querySelectorAll(`[data-${id}]`).forEach((x) => (x.onclick = () => {
      const antes = cfg[e]; cfg[e] = x.dataset[id] === '1';
      if (id === 'f' && antes !== cfg.escuro && cfg.areaEscuro === antes) cfg.areaEscuro = cfg.escuro; // área acompanha, se estava igual
      aplica();
    }));
    pop.querySelector(`[data-r="${id}"]`).addEventListener('input', (ev) => { cfg[b] = +ev.target.value; aplica(); });
  }
  pop.querySelector('[data-reset]').onclick = () => { cfg = { escuro: false, brilho: 100, areaEscuro: false, areaBrilho: 100, grade: true, gradeForca: 100, gradeTam: 'medio' }; aplica(); };
  const abre = (ancora) => {
    if (!pop.hidden) { pop.hidden = true; return; }
    const r = ancora.getBoundingClientRect();
    pop.style.top = `${r.bottom + 8}px`; pop.style.left = `${Math.max(8, Math.min(innerWidth - 270, r.right - 260))}px`;
    pop.hidden = false;
  };
  bt.onclick = () => abre(bt);
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.tema-bt')) pop.hidden = true; });
  document.querySelector('.topbar-right')?.prepend(bt);
  setInterval(() => {
    const dir = document.querySelector('.pc-barra .pc-dir');
    if (dir && !dir.querySelector('.tema-bt')) { const b2 = bt.cloneNode(true); b2.onclick = () => abre(b2); dir.prepend(b2); }
  }, 500);
  window.tracoTema = { abre: () => abre(bt), set: (o) => { Object.assign(cfg, o); aplica(); }, cfg: () => ({ ...cfg }) };
  aplica();
})();
