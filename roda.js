// Roda de ferramentas, igual à roda de armas do GTA.
// Celular: segure o botão redondo (canto de baixo), arraste até o ícone e solte.
//          Ou toque rápido no botão: a roda fica aberta e você toca no ícone.
// Computador: segure a tecla Q, aponte com o mouse e solte o Q.
// Trocar de grupo: toque no meio da roda, use as setas ‹ › ou a rodinha do mouse.
(() => {
  if (!window.tracoRodaGrupos) return;
  const modo = () => (document.getElementById('architectureMode')?.hidden ? 'pecas' : 'arq');
  const grupoSalvo = { arq: 1, pecas: 1 }; // abre em "Desenhar"
  try { Object.assign(grupoSalvo, JSON.parse(localStorage.getItem('traco-roda') || '{}')); } catch { /* */ }

  const fab = document.createElement('button');
  fab.type = 'button'; fab.className = 'roda-fab'; fab.setAttribute('aria-label', 'Roda de ferramentas');
  fab.title = 'Roda de ferramentas (segure Q no computador)';
  fab.innerHTML = '<span></span>';
  document.body.appendChild(fab);

  const ov = document.createElement('div'); ov.className = 'roda-ov'; ov.hidden = true;
  ov.innerHTML = '<div class="roda"><div class="roda-fatias"></div><div class="roda-centro"><button type="button" class="roda-seta" data-d="-1">‹</button><div class="roda-txt"><small></small><b></b><i></i></div><button type="button" class="roda-seta" data-d="1">›</button></div></div>';
  document.body.appendChild(ov);
  const roda = ov.querySelector('.roda'), fatias = ov.querySelector('.roda-fatias');

  let grupos = [], g = 0, itens = [], sel = -1, cx = 0, cy = 0, R = 140, segurando = false, moveu = false;

  function monta() {
    grupos = window.tracoRodaGrupos(); if (!grupos.length) return false;
    g = Math.min(grupoSalvo[modo()] ?? 0, grupos.length - 1);
    desenha(); return true;
  }
  function desenha() {
    itens = grupos[g].itens; sel = -1;
    const n = itens.length, raio = R * .74;
    fatias.innerHTML = '';
    // fundo em fatias (anel) como no GTA
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `${-R} ${-R} ${2 * R} ${2 * R}`); svg.classList.add('roda-anel');
    const r0 = R * .42, r1 = R;
    itens.forEach((_, i) => {
      const a0 = (i / n) * 2 * Math.PI - Math.PI / 2 - Math.PI / n + .02, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2 - Math.PI / n - .02;
      const P = (r, a) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
      const big = a1 - a0 > Math.PI ? 1 : 0;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${P(r0, a0)} L ${P(r1, a0)} A ${r1} ${r1} 0 ${big} 1 ${P(r1, a1)} L ${P(r0, a1)} A ${r0} ${r0} 0 ${big} 0 ${P(r0, a0)} Z`);
      path.dataset.i = i; svg.appendChild(path);
    });
    fatias.appendChild(svg);
    itens.forEach((it, i) => {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      const el = document.createElement('button'); el.type = 'button'; el.className = 'roda-item' + (it.ativo ? ' ativo' : '');
      el.style.left = `${R + raio * Math.cos(a)}px`; el.style.top = `${R + raio * Math.sin(a)}px`;
      el.textContent = it.icone; el.dataset.i = i; el.setAttribute('aria-label', it.nome);
      fatias.appendChild(el);
    });
    const t = ov.querySelector('.roda-txt');
    t.querySelector('small').textContent = `${grupos[g].nome}  ·  ${g + 1}/${grupos.length}`;
    t.querySelector('b').textContent = itens.find((x) => x.ativo)?.nome || 'Escolha';
    t.querySelector('i').innerHTML = grupos.map((_, k) => `<span class="${k === g ? 'on' : ''}"></span>`).join('');
  }
  function marca(i) {
    if (i === sel) return; sel = i;
    fatias.querySelectorAll('.roda-item').forEach((el) => el.classList.toggle('on', +el.dataset.i === i));
    fatias.querySelectorAll('path').forEach((el) => el.classList.toggle('on', +el.dataset.i === i));
    ov.querySelector('.roda-txt b').textContent = i >= 0 ? itens[i].nome : (itens.find((x) => x.ativo)?.nome || 'Escolha');
    if (i >= 0 && navigator.vibrate) try { navigator.vibrate(6); } catch { /* */ }
  }
  function apontado(x, y) {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    if (d < R * .38 || d > R * 1.6) return -1;
    const n = itens.length; let a = Math.atan2(dy, dx) + Math.PI / 2 + Math.PI / n;
    a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return Math.floor(a / (2 * Math.PI) * n) % n;
  }
  function abre(x, y) {
    if (!monta()) return;
    R = Math.max(110, Math.min(165, Math.min(innerWidth, innerHeight) * .4));
    cx = Math.min(innerWidth - R - 8, Math.max(R + 8, x)); cy = Math.min(innerHeight - R - 8, Math.max(R + 8, y));
    roda.style.width = roda.style.height = `${2 * R}px`;
    roda.style.left = `${cx - R}px`; roda.style.top = `${cy - R}px`;
    desenha(); ov.hidden = false; requestAnimationFrame(() => ov.classList.add('on'));
  }
  function fecha() { ov.classList.remove('on'); ov.hidden = true; segurando = false; }
  function escolhe(i) {
    const it = itens[i]; fecha(); if (!it) return;
    it.b.closest('details')?.setAttribute('open', ''); it.b.click(); it.b.blur?.();
    const el = document.getElementById('toast');
    if (el) { el.textContent = `${it.icone}  ${it.nome}`; el.classList.add('show'); clearTimeout(escolhe.t); escolhe.t = setTimeout(() => el.classList.remove('show'), 1400); }
  }
  function trocaGrupo(d) {
    g = (g + d + grupos.length) % grupos.length; grupoSalvo[modo()] = g;
    try { localStorage.setItem('traco-roda', JSON.stringify(grupoSalvo)); } catch { /* */ }
    desenha();
  }

  // botão redondo: segurar e arrastar, ou tocar
  fab.addEventListener('pointerdown', (e) => {
    e.preventDefault(); fab.setPointerCapture(e.pointerId);
    segurando = true; moveu = false;
    abre(innerWidth / 2, innerHeight / 2);
  });
  fab.addEventListener('pointermove', (e) => { if (!segurando || ov.hidden) return; if (Math.hypot(e.clientX - cx, e.clientY - cy) > R * .38) moveu = true; marca(apontado(e.clientX, e.clientY)); });
  fab.addEventListener('pointerup', (e) => {
    if (!segurando) return; segurando = false;
    if (moveu && sel >= 0) escolhe(sel); // soltou em cima de um ícone
    // senão, fica aberta para tocar
  });

  // roda aberta: tocar no ícone, no meio (troca grupo) ou fora (fecha)
  ov.addEventListener('pointermove', (e) => { if (!ov.hidden) marca(apontado(e.clientX, e.clientY)); });
  ov.addEventListener('click', (e) => {
    const seta = e.target.closest('.roda-seta'); if (seta) { trocaGrupo(+seta.dataset.d); return; }
    if (e.target.closest('.roda-txt')) { trocaGrupo(1); return; }
    const i = apontado(e.clientX, e.clientY);
    if (i >= 0) escolhe(i); else if (Math.hypot(e.clientX - cx, e.clientY - cy) > R * .38) fecha();
  });
  ov.addEventListener('wheel', (e) => { e.preventDefault(); trocaGrupo(e.deltaY > 0 ? 1 : -1); }, { passive: false });

  // computador: segurar Q
  let mx = innerWidth / 2, my = innerHeight / 2, porQ = false;
  addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, true);
  const digitando = (t) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  addEventListener('keydown', (e) => {
    if (!ov.hidden && e.key === 'Escape') { e.preventDefault(); fecha(); return; }
    if (!ov.hidden && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); trocaGrupo(e.key === 'ArrowRight' ? 1 : -1); return; }
    if ((e.key === 'q' || e.key === 'Q') && !e.repeat && !digitando(e.target) && ov.hidden) { e.preventDefault(); porQ = true; abre(mx, my); }
  });
  addEventListener('keyup', (e) => {
    if ((e.key === 'q' || e.key === 'Q') && porQ) { porQ = false; if (sel >= 0) escolhe(sel); }
  });
  window.tracoRoda = { abre: () => abre(innerWidth / 2, innerHeight / 2), fecha };
})();
