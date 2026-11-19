// Coluna de ícones em CARROSSEL (tambor que gira), como o seletor de armas do GTA:
// o ícone do meio fica grande e destacado; arraste para cima/baixo (ou role o mouse) para girar.
// Tocar num ícone escolhe a ferramenta e ele vem para o meio.
(() => {
  const lat = document.querySelector('.pc-lateral'); if (!lat) return;
  lat.classList.add('tambor');
  const nome = document.createElement('div'); nome.className = 'tambor-nome'; document.body.appendChild(nome);
  const faixa = document.createElement('div'); faixa.className = 'tambor-faixa'; lat.appendChild(faixa);
  const modo = () => (document.getElementById('architectureMode')?.hidden ? 'pecas' : 'arq');
  let pos = 0, alvo = 0, itens = [], ultimoAtivo = -1, ultimoModo = '', arrasto = null, arrastou = false, tNome = 0;
  try { const s = JSON.parse(localStorage.getItem('traco-tambor') || '{}'); pos = alvo = s[modo()] || 0; } catch { /* */ }
  const passo = () => 52 / Math.max(120, lat.clientHeight * .44); // ~52 px entre ícones no meio

  function lista() { itens = [...lat.querySelectorAll('.pc-ferr')]; }
  function mostraNome(txt) {
    const r = lat.getBoundingClientRect();
    nome.textContent = txt; nome.style.top = `${r.top + r.height / 2}px`; nome.style.left = `${r.right + 8}px`;
    nome.classList.add('on'); tNome = performance.now();
  }
  function desenha() {
    const H = lat.clientHeight, R = H * .44, c = H / 2, a = passo();
    const n = itens.length; if (!n) return;
    const meio = Math.round(pos);
    itens.forEach((el, i) => {
      const th = (i - pos) * a;
      if (Math.abs(th) > 1.5) { el.style.visibility = 'hidden'; return; }
      const cs = Math.cos(th), y = c + R * Math.sin(th);
      el.style.visibility = 'visible';
      el.style.transform = `translate(-50%, -50%) translateY(${y}px) rotateX(${(-th * 57.3).toFixed(1)}deg) scale(${(.5 + .62 * cs).toFixed(3)})`;
      el.style.opacity = Math.max(0, Math.pow(cs, 1.6)).toFixed(3);
      el.style.zIndex = String(Math.round(cs * 100));
      el.classList.toggle('centro', i === meio);
    });
    faixa.style.top = `${c}px`;
  }
  function anima() {
    if (!arrasto) { const d = alvo - pos; pos += Math.abs(d) < .002 ? d : d * .22; }
    desenha();
    if (nome.classList.contains('on') && !arrasto && performance.now() - tNome > 1300) nome.classList.remove('on');
    requestAnimationFrame(anima);
  }
  function limita(v) { return Math.max(0, Math.min(itens.length - 1, v)); }
  function vaiPara(i, comNome = true) {
    alvo = limita(i);
    try { const s = JSON.parse(localStorage.getItem('traco-tambor') || '{}'); s[modo()] = alvo; localStorage.setItem('traco-tambor', JSON.stringify(s)); } catch { /* */ }
    if (comNome && itens[alvo]) mostraNome(itens[alvo].title);
  }

  // arrastar para girar
  lat.addEventListener('pointerdown', (e) => {
    arrasto = { y: e.clientY, pos, id: e.pointerId }; arrastou = false;
  });
  addEventListener('pointermove', (e) => {
    if (!arrasto || e.pointerId !== arrasto.id) return;
    const dy = e.clientY - arrasto.y;
    if (Math.abs(dy) > 6) arrastou = true;
    if (!arrastou) return;
    const H = lat.clientHeight, porItem = H * .44 * passo();
    pos = Math.max(-.4, Math.min(itens.length - .6, arrasto.pos - dy / porItem));
    const m = Math.round(limita(pos)); if (itens[m]) mostraNome(itens[m].title);
  });
  addEventListener('pointerup', (e) => {
    if (!arrasto || e.pointerId !== arrasto.id) return;
    arrasto = null;
    if (arrastou) vaiPara(Math.round(pos));
  });
  // depois de arrastar não conta como toque; tocar num ícone o traz para o meio
  lat.addEventListener('click', (e) => {
    const b = e.target.closest('.pc-ferr');
    if (arrastou) { e.stopPropagation(); e.preventDefault(); arrastou = false; return; }
    if (b) vaiPara(itens.indexOf(b));
  }, true);
  lat.addEventListener('wheel', (e) => { e.preventDefault(); vaiPara(Math.round(alvo) + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });

  // a coluna é refeita quando muda de aba: reorganiza e mostra a ferramenta em uso no meio
  new MutationObserver(() => { if (!faixa.isConnected) lat.appendChild(faixa); lista(); if (modo() !== ultimoModo) { ultimoModo = modo(); ultimoAtivo = -1; } }).observe(lat, { childList: true });
  setInterval(() => {
    const i = itens.findIndex((el) => el.classList.contains('on'));
    if (i >= 0 && i !== ultimoAtivo) { ultimoAtivo = i; if (!arrasto) vaiPara(i, false); }
  }, 300);
  lista(); requestAnimationFrame(anima);
})();
