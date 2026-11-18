// Desenhar no 3D (igual ao SketchUp): as ferramentas de desenho da Arquitetura passam a
// funcionar direto no chão da vista 3D. O clique no 3D vira um ponto no chão (z = 0) e é
// repassado às mesmas ferramentas do rascunho 2D, então medida digitada, inferência,
// equidistância e empurrar/puxar continuam iguais. A câmera fica parada enquanto desenha.
(() => {
  const $ = (id) => document.getElementById(id);
  const sketch = $('sketchCanvas'), model = $('modelCanvas');
  if (!sketch || !model || typeof window.sketchPoint !== 'function') return;
  const wrap = model.parentElement;
  const st = () => state;
  let ligado = false, repassando = false;

  // ponto da tela do 3D -> ponto no chão -> coordenada do rascunho
  function noChao(ev) {
    const cam = window.tracoCam3D; if (!cam) return null;
    const r = model.getBoundingClientRect();
    const right = (ev.clientX - r.left - cam.centerX) / cam.unit;
    const v = (ev.clientY - r.top - cam.centerY) / cam.unit;
    const sp = Math.max(.08, Math.sin(st().pitch));
    const depth = v / sp;
    const c = Math.cos(st().yaw), s = Math.sin(st().yaw);
    const x = right * c + depth * s + cam.cx, y = -right * s + depth * c + cam.cy;
    const ppm = st().pixelsPerMeter;
    return [Math.max(0, Math.min(DESIGN_WIDTH, x * ppm + DESIGN_WIDTH / 2)), Math.max(0, Math.min(DESIGN_HEIGHT, y * ppm + DESIGN_HEIGHT / 2))];
  }
  const original = window.sketchPoint;
  window.sketchPoint = function (ev) { if (repassando) { const p = noChao(ev); if (p) return p; } return original(ev); };
  const capOrig = sketch.setPointerCapture.bind(sketch);
  sketch.setPointerCapture = (id) => { if (repassando) return; try { capOrig(id); } catch { /* */ } };

  function repassa(e) {
    if (!ligado || $('architectureMode').hidden) return;
    if (st().modelTool === 'push') return; // empurrar/puxar continua no próprio 3D
    if (e.pointerType === 'mouse' && e.button > 0 && e.type === 'pointerdown') return; // botão direito/meio gira
    if (e.pointerType === 'mouse' && e.buttons > 1 && e.type === 'pointermove') return;
    e.stopPropagation(); e.preventDefault();
    const tipo = e.type === 'pointerleave' ? 'pointerleave' : e.type;
    const ne = new PointerEvent(tipo, { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, pointerType: e.pointerType,
      button: e.button, buttons: e.buttons, altKey: e.altKey, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, bubbles: true, cancelable: true, isPrimary: e.isPrimary });
    repassando = true;
    try { sketch.dispatchEvent(ne); } finally { repassando = false; }
    window.requestRender?.();
  }
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave']) wrap.addEventListener(t, repassa, true);

  // prévia do desenho no chão do 3D
  window.tracoDes3D = {
    camera: null,
    desenhar(ctx, toScreen, unit) {
      if (!ligado) return;
      const S = st(), ppm = S.pixelsPerMeter;
      const W = (p, z = .012) => toScreen([(p[0] - DESIGN_WIDTH / 2) / ppm, (p[1] - DESIGN_HEIGHT / 2) / ppm, z]);
      ctx.save();
      // eixos longos, como no SketchUp
      for (const [a, b, cor] of [[[60, 0, 0], [-60, 0, 0], '#d33d2f'], [[0, 60, 0], [0, -60, 0], '#2f9b4c'], [[0, 0, 30], [0, 0, 0], '#2f63d3']]) {
        const o = toScreen([0, 0, 0]), pa = toScreen(a), pb = toScreen(b);
        ctx.strokeStyle = cor; ctx.lineWidth = .8; ctx.globalAlpha = .7;
        ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(pa.x, pa.y); ctx.stroke();
        if (b[2] === 0 && b !== a) { ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(pb.x, pb.y); ctx.stroke(); }
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // traço à mão / retângulo em andamento
      if (S.draft?.length > 1) {
        ctx.strokeStyle = '#D76845'; ctx.lineWidth = 2; ctx.beginPath();
        S.draft.forEach((p, i) => { const q = W(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.stroke();
      }
      // linha elástica com a medida
      if (S.lineStart) {
        const a = W(S.lineStart);
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(a.x, a.y, 3.5, 0, Math.PI * 2); ctx.fill();
        if (S.linePreview) {
          const b = W(S.linePreview);
          ctx.strokeStyle = '#111'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          const m = Math.hypot(S.linePreview[0] - S.lineStart[0], S.linePreview[1] - S.lineStart[1]) / ppm;
          const txt = `${m.toFixed(2).replace('.', ',')} m`;
          ctx.font = '700 12px DM Sans, Arial, sans-serif'; const w = ctx.measureText(txt).width + 12;
          ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect((a.x + b.x) / 2 - w / 2, (a.y + b.y) / 2 - 20, w, 18);
          ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, (a.x + b.x) / 2, (a.y + b.y) / 2 - 11);
          const cor = { point: '#2f9b4c', mid: '#24a6c9', edge: '#c0392b', align: '#7b55c9', x: '#d33d2f', y: '#2f9b4c' }[S.lineSnapKind] || '#D76845';
          ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(b.x, b.y, 4.5, 0, Math.PI * 2); ctx.fill();
        }
      } else if (S.lineHover?.point) {
        const h = W(S.lineHover.point);
        ctx.fillStyle = { point: '#2f9b4c', mid: '#24a6c9', edge: '#c0392b', align: '#7b55c9' }[S.lineHover.kind] || '#D76845';
        ctx.beginPath(); ctx.arc(h.x, h.y, 4.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    },
  };

  // caixa da medida acompanha o 3D enquanto desenha nele
  const caixa = document.querySelector('#architectureMode .measure-entry')?.parentElement;
  const casaCaixa = caixa?.parentElement, depoisCaixa = caixa?.nextSibling;

  function liga(on) {
    ligado = on;
    document.body.classList.toggle('des3d', on);
    botao.classList.toggle('active', on); botao.setAttribute('aria-pressed', String(on));
    if (on) {
      const c = window.tracoCam3D;
      window.tracoDes3D.camera = c ? { cx: c.cx, cy: c.cy, base: c.base } : { cx: 0, cy: 0, base: 40 };
      if (st().pitch > 1.45) { $('viewPerspective')?.click(); }
      if (caixa) wrap.appendChild(caixa);
      if (!['line', 'rectangle', 'draw'].includes(st().tool)) $('lineTool')?.click();
    } else {
      window.tracoDes3D.camera = null;
      if (caixa && casaCaixa) casaCaixa.insertBefore(caixa, depoisCaixa);
    }
    setTimeout(() => { dispatchEvent(new Event('resize')); window.requestRender?.(); }, 50);
  }

  const botao = document.createElement('button');
  botao.type = 'button'; botao.id = 'desenhar3d'; botao.className = 'view-option des3d-bt';
  botao.textContent = '✏️ Desenhar no 3D'; botao.title = 'Desenhar direto no chão do 3D, como no SketchUp';
  botao.setAttribute('aria-pressed', 'false');
  botao.onclick = () => {
    if (ligado) return liga(false);
    // a câmera é fixada depois que o 3D desenha uma vez na posição atual
    liga(true);
  };
  const lugar = document.querySelector('#architectureMode .view-switcher');
  lugar ? lugar.appendChild(botao) : wrap.after(botao);
  window.tracoDesenhar3D = liga;
})();
