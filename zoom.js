// 🔍 Zoom com dois dedos só na área de trabalho (desenho/3D/canvas) — a página e as ferramentas não ampliam.
(() => {
  // 1) a página inteira não amplia (iPad/iPhone ignoram o "user-scalable", então bloqueia o gesto)
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });

  // 2) pinça vira zoom da própria área (as áreas que já tratam a pinça sozinhas ficam fora: quadro, 3D dos projetos)
  const ALVOS = { sketchCanvas: 'suave', partSketchCanvas: 'suave', modelCanvas: 'passo', partModelCanvas: 'passo' };
  const dedos = new Map(); let pin = null;
  // junta o movimento e manda 1 zoom por quadro de tela (fluido mesmo com desenho pesado)
  let fila = null, raf = 0;
  const envia = (alvo, x, y, dy) => alvo.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  const roda = (alvo, x, y, dy, passo) => {
    if (passo) { envia(alvo, x, y, dy); return; }
    if (fila && fila.alvo === alvo) { fila.dy += dy; fila.x = x; fila.y = y; } else fila = { alvo, x, y, dy };
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; const f = fila; fila = null; if (f) envia(f.alvo, f.x, f.y, f.dy); });
  };
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !ALVOS[e.target.id]) return;
    dedos.set(e.pointerId, [e.clientX, e.clientY]);
    if (dedos.size === 2) {
      const [a, b] = [...dedos.values()];
      pin = { alvo: e.target, modo: ALVOS[e.target.id], d: Math.hypot(a[0] - b[0], a[1] - b[1]), acc: 0 };
      e.stopImmediatePropagation(); e.preventDefault(); // o 2º dedo não desenha
    }
  }, { capture: true });
  window.addEventListener('pointermove', (e) => {
    if (!dedos.has(e.pointerId)) return;
    dedos.set(e.pointerId, [e.clientX, e.clientY]);
    if (!pin) return;
    e.stopImmediatePropagation(); // enquanto há pinça, nada desenha nem gira
    if (dedos.size < 2) return;
    const [a, b] = [...dedos.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
    if (pin.d < 10) { pin.d = d; return; }
    const r = Math.log(d / pin.d); pin.d = d;
    if (pin.modo === 'suave') roda(pin.alvo, cx, cy, -r / 0.01);
    else { pin.acc += r; while (Math.abs(pin.acc) > Math.log(1.08)) { roda(pin.alvo, cx, cy, pin.acc > 0 ? -1 : 1, true); pin.acc -= Math.sign(pin.acc) * Math.log(1.08); } }
  }, { capture: true });
  const solta = (e) => {
    if (!dedos.has(e.pointerId)) return;
    dedos.delete(e.pointerId);
    if (pin) { e.stopImmediatePropagation(); if (!dedos.size) pin = null; } // o dedo que sobrou não vira clique
  };
  window.addEventListener('pointerup', solta, { capture: true });
  window.addEventListener('pointercancel', solta, { capture: true });

  // 3) caminho reserva pelos eventos de toque (alguns iPhones não mandam os dois dedos como "pointer")
  const TODOS = { ...ALVOS, rasCanvas: 'suave', prjCanvas: 'prj' };
  const ativoPeloPointer = (id) => (ALVOS[id] ? Boolean(pin) : id === 'rasCanvas' ? Boolean(window.tracoRascunhos?.gesto?.()) : id === 'prjCanvas' ? Boolean(window.tracoProjetos?.gesto?.()) : false);
  let tq = null;
  const alvoDoToque = (e) => { for (let el = e.target; el; el = el.parentElement) if (TODOS[el.id]) return el; return null; };
  document.addEventListener('touchstart', (e) => {
    const alvo = alvoDoToque(e); if (!alvo || e.touches.length !== 2) { if (e.touches.length < 2) tq = null; return; }
    const [a, b] = e.touches; tq = { alvo, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), c: [(a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2], acc: 0 };
  }, { passive: true, capture: true });
  document.addEventListener('touchmove', (e) => {
    if (!tq || e.touches.length !== 2) return;
    e.preventDefault();
    const [a, b] = e.touches, d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), c = [(a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2];
    const r = Math.log(d / (tq.d || d)), dx = c[0] - tq.c[0], dy = c[1] - tq.c[1]; tq.d = d; tq.c = c;
    if (ativoPeloPointer(tq.alvo.id)) return; // o caminho normal já está cuidando
    const modo = TODOS[tq.alvo.id];
    if (modo === 'passo') { tq.acc += r; while (Math.abs(tq.acc) > Math.log(1.08)) { envia(tq.alvo, c[0], c[1], tq.acc > 0 ? -1 : 1); tq.acc -= Math.sign(tq.acc) * Math.log(1.08); } return; }
    if (modo === 'prj') { roda(tq.alvo, c[0], c[1], -r / 0.002); return; }
    roda(tq.alvo, c[0], c[1], -r / 0.01);
    if (tq.alvo.id === 'rasCanvas' && (dx || dy)) tq.alvo.dispatchEvent(new WheelEvent('wheel', { deltaX: -dx, deltaY: -dy, clientX: c[0], clientY: c[1], bubbles: true, cancelable: true })); // arrastar com 2 dedos
  }, { passive: false, capture: true });
  document.addEventListener('touchend', (e) => { if (e.touches.length < 2) tq = null; }, { passive: true, capture: true });
})();
