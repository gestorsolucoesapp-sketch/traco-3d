// Modo escuro + barrinha de brilho (clarear / escurecer). Vale para o app todo, inclusive desenho e 3D.
(() => {
  const CH = 'traco-tema';
  let cfg = { escuro: false, brilho: 100 };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(CH) || '{}')); } catch { /* */ }
  const aplica = () => {
    const f = `${cfg.escuro ? 'invert(1) hue-rotate(180deg) ' : ''}brightness(${cfg.brilho / 100})`;
    document.documentElement.style.filter = (cfg.escuro || cfg.brilho !== 100) ? f : '';
    document.documentElement.classList.toggle('tema-escuro', cfg.escuro);
    try { localStorage.setItem(CH, JSON.stringify(cfg)); } catch { /* */ }
    pinta();
  };
  const bt = document.createElement('button');
  bt.type = 'button'; bt.className = 'tema-bt'; bt.title = 'Modo escuro e brilho'; bt.setAttribute('aria-label', 'Modo escuro e brilho');
  const pop = document.createElement('div'); pop.className = 'tema-pop'; pop.hidden = true;
  pop.innerHTML = `<b>Aparência</b>
    <div class="tema-seg"><button type="button" data-e="0">☀️ Claro</button><button type="button" data-e="1">🌙 Escuro</button></div>
    <label>Brilho <span class="tema-val"></span><input type="range" min="60" max="140" step="5" /></label>
    <div class="tema-fim"><button type="button" data-r>Voltar ao normal</button></div>`;
  document.body.appendChild(pop);
  const rng = pop.querySelector('input');
  function pinta() {
    bt.textContent = cfg.escuro ? '🌙' : '☀️';
    pop.querySelectorAll('[data-e]').forEach((b) => b.classList.toggle('on', (b.dataset.e === '1') === cfg.escuro));
    rng.value = cfg.brilho; pop.querySelector('.tema-val').textContent = `${cfg.brilho}%`;
  }
  pop.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => { cfg.escuro = b.dataset.e === '1'; aplica(); }));
  rng.addEventListener('input', () => { cfg.brilho = +rng.value; aplica(); });
  pop.querySelector('[data-r]').onclick = () => { cfg = { escuro: false, brilho: 100 }; aplica(); };
  const abre = (ancora) => {
    if (!pop.hidden) { pop.hidden = true; return; }
    const r = ancora.getBoundingClientRect();
    pop.style.top = `${r.bottom + 8}px`; pop.style.left = `${Math.max(8, Math.min(innerWidth - 250, r.right - 240))}px`;
    pop.hidden = false;
  };
  bt.onclick = () => abre(bt);
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.tema-bt')) pop.hidden = true; });
  document.querySelector('.topbar-right')?.prepend(bt);
  // também no Modo PC (barra de cima)
  setInterval(() => {
    const dir = document.querySelector('.pc-barra .pc-dir');
    if (dir && !dir.querySelector('.tema-bt')) { const b2 = bt.cloneNode(true); b2.onclick = () => abre(b2); dir.prepend(b2); b2.textContent = bt.textContent; }
    document.querySelectorAll('.pc-barra .tema-bt').forEach((b) => (b.textContent = bt.textContent));
  }, 500);
  window.tracoTema = { abre: () => abre(bt), set: (o) => { Object.assign(cfg, o); aplica(); } };
  aplica();
})();
