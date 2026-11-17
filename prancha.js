// Prancha técnica (imprimir / salvar PDF): folha A4 ou A3 deitada com moldura, carimbo com a marca,
// escala normalizada, planta baixa cotada (Arquitetura) ou 3 vistas em 1º diedro cotadas (Peças),
// perspectiva 3D e notas. Gera SVG vetorial; o PDF sai pelo "Imprimir → Salvar como PDF".
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f2 = (v, c = 2) => (+v).toFixed(c).replace('.', ',');
  const fmm = (v) => String(+(+v).toFixed(1)).replace('.', ',');
  let icone = '';
  fetch('marca/traco-icone.svg').then((r) => r.text()).then((t) => { icone = t.replace(/<\/?svg[^>]*>/g, ''); }).catch(() => {});

  const FOLHAS = { A4: [297, 210], A3: [420, 297] };
  const ESC_ARQ = [20, 25, 50, 75, 100, 125, 200, 250, 500];
  const ESC_PECA = [[10, '10:1'], [5, '5:1'], [2, '2:1'], [1, '1:1'], [.5, '1:2'], [.2, '1:5'], [.1, '1:10'], [.05, '1:20']];

  // ---------- desenho de cota (paper mm) ----------
  function cota(a, b, off, txt, opt = {}) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < .5) return '';
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy, ny = ux;
    const A = [a[0] + nx * off, a[1] + ny * off], B = [b[0] + nx * off, b[1] + ny * off], s = Math.sign(off) || 1, ext = 1.6;
    let ang = Math.atan2(uy, ux) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, tsz = opt.t || 2.6;
    const tx = mx + nx * s * tsz * .62, ty = my + ny * s * tsz * .62;
    const tick = (P) => `<line x1="${P[0] - (ux + nx) * .9}" y1="${P[1] - (uy + ny) * .9}" x2="${P[0] + (ux + nx) * .9}" y2="${P[1] + (uy + ny) * .9}" stroke-width=".35"/>`;
    return `<g class="cota" stroke="#1d2b55" fill="#1d2b55">
      <line x1="${a[0] + nx * s * .8}" y1="${a[1] + ny * s * .8}" x2="${A[0] + nx * s * ext}" y2="${A[1] + ny * s * ext}" stroke-width=".18"/>
      <line x1="${b[0] + nx * s * .8}" y1="${b[1] + ny * s * .8}" x2="${B[0] + nx * s * ext}" y2="${B[1] + ny * s * ext}" stroke-width=".18"/>
      <line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke-width=".22"/>${tick(A)}${tick(B)}
      <text x="${tx}" y="${ty}" font-size="${tsz}" text-anchor="middle" dominant-baseline="middle" stroke="none" transform="rotate(${ang} ${tx} ${ty})">${esc(txt)}</text></g>`;
  }
  const caixaTexto = (x, y, txt, sz = 2.6, cor = '#111') => `<text x="${x}" y="${y}" font-size="${sz}" fill="${cor}" text-anchor="middle" dominant-baseline="middle">${esc(txt)}</text>`;

  // ---------- carimbo ----------
  function carimbo(W, H, d) {
    const w = 126, h = 42, x = W - 12 - w, y = H - 12 - h;
    const cel = (cx, cy, cw, ch, rot, val, big) => `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="none" stroke="#111" stroke-width=".25"/>
      <text x="${cx + 1.5}" y="${cy + 3}" font-size="1.9" fill="#555" letter-spacing=".2">${rot}</text>
      <text x="${cx + 1.5}" y="${cy + ch - 2.2}" font-size="${big ? 4 : 2.9}" font-weight="${big ? 800 : 600}" fill="#111">${esc(val)}</text>`;
    return `<g font-family="DM Sans, Arial, sans-serif">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#111" stroke-width=".5"/>
      <g transform="translate(${x + 2},${y + 2}) scale(.14)">${icone}</g>
      <text x="${x + 18}" y="${y + 9}" font-family="Manrope, DM Sans, Arial, sans-serif" font-size="7" font-weight="800" letter-spacing="-.2" fill="#14201A">traço<tspan fill="#D76845">.</tspan></text>
      <text x="${x + 18}" y="${y + 13}" font-size="2" font-weight="800" letter-spacing=".55" fill="#9F4D33">DO RASCUNHO AO ESPAÇO</text>
      ${cel(x + 62, y, 64, 16, 'PROJETO', d.titulo || 'Sem título', true)}
      ${cel(x, y + 16, 62, 9, 'CLIENTE', d.cliente || '—')}
      ${cel(x + 62, y + 16, 64, 9, 'CONTEÚDO', d.conteudo)}
      ${cel(x, y + 25, 62, 9, 'RESPONSÁVEL', d.resp || '—')}
      ${cel(x + 62, y + 25, 22, 9, 'ESCALA', d.escala)}
      ${cel(x + 84, y + 25, 22, 9, 'UNIDADE', d.unidade)}
      ${cel(x + 106, y + 25, 20, 9, 'FOLHA', d.folha)}
      ${cel(x, y + 34, 40, 8, 'DATA', d.data)}
      ${cel(x + 40, y + 34, 86, 8, 'OBSERVAÇÃO', d.obs || 'Confira as medidas na obra antes de executar.')}
    </g>`;
  }
  function moldura(W, H) {
    return `<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
      <rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#111" stroke-width=".6"/>
      <rect x="11.5" y="11.5" width="${W - 23}" height="${H - 23}" fill="none" stroke="#111" stroke-width=".15"/>`;
  }
  function imagem3d(canvas, x, y, w, h, rot) {
    let url = ''; try { url = canvas.toDataURL('image/png'); } catch { /* */ }
    const r = canvas.height / Math.max(1, canvas.width), iw = Math.min(w, h / r), ih = iw * r;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#111" stroke-width=".25"/>
      <text x="${x + 2}" y="${y + 4}" font-size="2.3" font-weight="800" letter-spacing=".4" fill="#111">${rot}</text>
      ${url ? `<image href="${url}" x="${x + (w - iw) / 2}" y="${y + 5 + (h - 5 - ih) / 2}" width="${iw}" height="${ih - 5}" preserveAspectRatio="xMidYMid meet"/>` : ''}`;
  }

  // ====================== ARQUITETURA ======================
  function folhaPlanta(W, H, d) {
    const ppm = state.pixelsPerMeter, segs = segments();
    const objs = state.objetos || [];
    if (!segs.length && !objs.length) throw new Error('Desenhe a planta antes de gerar a prancha.');
    const pts = [...segs.flat(), ...objs.map((o) => [o.x, o.y])];
    const xs = pts.map((p) => p[0] / ppm), ys = pts.map((p) => p[1] / ppm);
    const mn = [Math.min(...xs), Math.min(...ys)], mx = [Math.max(...xs), Math.max(...ys)];
    const larg = mx[0] - mn[0] + 1.4, alt = mx[1] - mn[1] + 1.4; // folga p/ cotas
    const areaW = W - 24 - 126 - 10, areaH = H - 20 - 20;
    const escala = ESC_ARQ.find((e) => larg * 1000 / e <= areaW && alt * 1000 / e <= areaH) || ESC_ARQ.at(-1);
    const k = 1000 / escala, ox = 17 + (areaW - (mx[0] - mn[0]) * k) / 2 - mn[0] * k, oy = 18 + (areaH - (mx[1] - mn[1]) * k) / 2 - mn[1] * k;
    const P = (p) => [ox + p[0] / ppm * k, oy + p[1] / ppm * k];
    const t = state.thickness * k;
    let g = '';
    // piso
    const floor = floorOutline();
    if (floor) g += `<polygon points="${floor.map((p) => P(p).join(',')).join(' ')}" fill="#f1efe8" stroke="none"/>`;
    // paredes (hachura cheia)
    for (const [a, b] of segs) {
      const A = P(a), B = P(b), L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < .1) continue;
      const nx = -(B[1] - A[1]) / L * t / 2, ny = (B[0] - A[0]) / L * t / 2;
      g += `<polygon points="${[[A[0] + nx, A[1] + ny], [B[0] + nx, B[1] + ny], [B[0] - nx, B[1] - ny], [A[0] - nx, A[1] - ny]].map((q) => q.join(',')).join(' ')}" fill="#3a3a3a" stroke="#111" stroke-width=".25"/>`;
      // aberturas
      const op = state.openings.find((o) => o.wallKey === wallKey(a, b));
      if (op) {
        const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, w = op.width * k, c = [A[0] + (B[0] - A[0]) * op.t, A[1] + (B[1] - A[1]) * op.t];
        const p1 = [c[0] - ux * w / 2, c[1] - uy * w / 2], p2 = [c[0] + ux * w / 2, c[1] + uy * w / 2];
        g += `<polygon points="${[[p1[0] + nx * 1.05, p1[1] + ny * 1.05], [p2[0] + nx * 1.05, p2[1] + ny * 1.05], [p2[0] - nx * 1.05, p2[1] - ny * 1.05], [p1[0] - nx * 1.05, p1[1] - ny * 1.05]].map((q) => q.join(',')).join(' ')}" fill="#fff"/>`;
        if (op.kind === 'door') {
          const nn = [nx / (t / 2), ny / (t / 2)], q = [p1[0] + nn[0] * w, p1[1] + nn[1] * w];
          g += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${q[0]}" y2="${q[1]}" stroke="#111" stroke-width=".3"/>
            <path d="M${q[0]} ${q[1]} A${w} ${w} 0 0 ${ux * nn[1] - uy * nn[0] > 0 ? 0 : 1} ${p2[0]} ${p2[1]}" fill="none" stroke="#111" stroke-width=".18" stroke-dasharray="1 .6"/>
            <text x="${c[0] + nn[0] * w * .55}" y="${c[1] + nn[1] * w * .55}" font-size="2" text-anchor="middle" fill="#111">P ${f2(op.width)}</text>`;
        } else {
          for (const s of [-.5, 0, .5]) g += `<line x1="${p1[0] + nx * s}" y1="${p1[1] + ny * s}" x2="${p2[0] + nx * s}" y2="${p2[1] + ny * s}" stroke="#111" stroke-width=".22"/>`;
          g += `<text x="${c[0] + nx * 3.2}" y="${c[1] + ny * 3.2}" font-size="2" text-anchor="middle" fill="#111">J ${f2(op.width)}</text>`;
        }
      }
    }
    // objetos (contorno)
    for (const o of objs) {
      const w = o.dims[0] * ppm / 2, dd = o.dims[1] * ppm / 2, co = Math.cos(o.rot || 0), si = Math.sin(o.rot || 0);
      const c4 = [[-w, -dd], [w, -dd], [w, dd], [-w, dd]].map(([x, y]) => P([o.x + x * co - y * si, o.y + x * si + y * co]));
      const nome = o.tipo === 'lib' ? (window.tracoObjetos?._teste?.LIB?.[o.ref]?.nome || 'Objeto') : (state.modelos?.[o.ref]?.nome || 'Modelo');
      const cc = P([o.x, o.y]);
      g += `<polygon points="${c4.map((q) => q.join(',')).join(' ')}" fill="none" stroke="#555" stroke-width=".22" stroke-dasharray="1.2 .6"/>${caixaTexto(cc[0], cc[1], nome, 1.9, '#444')}`;
    }
    // cotas de cada parede, do lado de fora (longe do centro)
    const cx = (mn[0] + mx[0]) / 2 * ppm, cy = (mn[1] + mx[1]) / 2 * ppm, C = P([cx, cy]);
    for (const [a, b] of segs) {
      const A = P(a), B = P(b), L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 1) continue;
      const nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L, m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      const lado = (C[0] - m[0]) * nx + (C[1] - m[1]) * ny > 0 ? -1 : 1;
      g += cota(A, B, lado * (t / 2 + 4.5), f2(Math.hypot(b[0] - a[0], b[1] - a[1]) / ppm));
    }
    // cotas totais
    const tl = P([mn[0] * ppm, mn[1] * ppm]), br = P([mx[0] * ppm, mx[1] * ppm]);
    if (segs.length) {
      g += cota([tl[0], br[1]], [br[0], br[1]], (t / 2 + 11), `${f2(mx[0] - mn[0])} (total)`);
      g += cota([tl[0], tl[1]], [tl[0], br[1]], (t / 2 + 11), `${f2(mx[1] - mn[1])} (total)`);
    }
    // cotas e textos feitos pelo usuário
    for (const c of state.extras?.cotas || []) g += cota(P(c.a), P(c.b), c.off / ppm * k, f2(Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]) / ppm), { t: 2.4 });
    for (const tx of state.extras?.textos || []) { const q = P(tx.p); g += caixaTexto(q[0], q[1], tx.t, 2.4); }
    // área
    let area = '';
    if (floor) { const a = polygonArea(floor) / ppm ** 2;
      // ponto do piso mais longe das paredes (o rótulo não cai em cima de parede)
      const dentro = (q) => { let c = false; for (let i = 0, j = floor.length - 1; i < floor.length; j = i++) { const A = floor[i], B = floor[j]; if ((A[1] > q[1]) !== (B[1] > q[1]) && q[0] < (B[0] - A[0]) * (q[1] - A[1]) / (B[1] - A[1]) + A[0]) c = !c; } return c; };
      const fx = floor.map((p) => p[0]), fy = floor.map((p) => p[1]); let melhor = [(Math.min(...fx) + Math.max(...fx)) / 2, (Math.min(...fy) + Math.max(...fy)) / 2], md = -1;
      for (let i = 1; i < 20; i++) for (let j = 1; j < 20; j++) { const q = [Math.min(...fx) + (Math.max(...fx) - Math.min(...fx)) * i / 20, Math.min(...fy) + (Math.max(...fy) - Math.min(...fy)) * j / 20];
        if (!dentro(q)) continue; const dd = Math.min(...segs.map(([s1, s2]) => pointSegmentDistance(q, s1, s2))); if (dd > md) { md = dd; melhor = q; } }
      const c = P(melhor);
      area = f2(a); g += `<text x="${c[0]}" y="${c[1] + 3}" font-size="2.8" font-weight="700" text-anchor="middle" fill="#1d2b55">Área ${area} m²</text>`; }
    // norte / título da vista
    const tituloVista = `<text x="17" y="${H - 18}" font-size="3.2" font-weight="800" fill="#111">PLANTA BAIXA</text><text x="17" y="${H - 14.5}" font-size="2.2" fill="#111">Escala 1:${escala} · medidas em metros</text>`;
    const colX = W - 12 - 126, notasY = 18 + 82 + 4;
    const notas = [
      `Paredes: ${segs.length} · espessura ${f2(state.thickness * 100, 0)} cm · pé-direito ${f2(state.height)} m`,
      area ? `Área do piso: ${area} m²` : null,
      state.openings.length ? `Aberturas: ${state.openings.filter((o) => o.kind === 'door').length} porta(s), ${state.openings.filter((o) => o.kind === 'window').length} janela(s)` : null,
      objs.length ? `Objetos: ${objs.length}` : null,
      'P = porta · J = janela (largura em m)',
    ].filter(Boolean);
    const corpo = `<g font-family="DM Sans, Arial, sans-serif">${g}</g>${tituloVista}
      ${imagem3d($('modelCanvas'), colX, 14, 126, 86, 'PERSPECTIVA')}
      <rect x="${colX}" y="${notasY}" width="126" height="${H - 12 - 42 - 4 - notasY}" fill="none" stroke="#111" stroke-width=".25"/>
      <text x="${colX + 2}" y="${notasY + 4}" font-size="2.3" font-weight="800" letter-spacing=".4" fill="#111">NOTAS</text>
      ${notas.map((n, i) => `<text x="${colX + 2}" y="${notasY + 9 + i * 4.2}" font-size="2.4" fill="#111">• ${esc(n)}</text>`).join('')}`;
    return { corpo, escala: `1:${escala}`, unidade: 'm', conteudo: 'Planta baixa · Perspectiva' };
  }

  // ====================== PEÇAS ======================
  function arestas(tris, dir) { // silhueta + vincos visíveis para a direção de vista
    const key = (p) => p.map((v) => v.toFixed(3)).join(',');
    const mapa = new Map();
    tris.forEach((t, i) => { for (let k = 0; k < 3; k++) { const a = t.points[k], b = t.points[(k + 1) % 3], ka = key(a), kb = key(b), e = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      const r = mapa.get(e); if (r) r.f.push(i); else mapa.set(e, { a, b, f: [i] }); } });
    const out = [];
    const frente = (i) => { const n = tris[i].normal; return n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < -1e-6; };
    for (const { a, b, f } of mapa.values()) {
      if (f.length === 1) { if (frente(f[0])) out.push([a, b]); continue; }
      const fa = frente(f[0]), fb = frente(f[1]);
      if (fa !== fb) { out.push([a, b]); continue; }
      if (fa && fb) { const n1 = tris[f[0]].normal, n2 = tris[f[1]].normal; if (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] < Math.cos(35 * Math.PI / 180)) out.push([a, b]); }
    }
    return out;
  }
  function folhaPeca(W, H, d) {
    const api = window.tracoPeca, pecas = api?.pecas() || [];
    if (!pecas.length) throw new Error('Gere a peça em 3D antes de fazer a prancha.');
    const tris = pecas.flatMap((p) => p.tris);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const t of tris) for (const q of t.points) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); }
    const [Lx, Ly, Lz] = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    const areaW = W - 24 - 126 - 10, areaH = H - 20 - 22, gap = 18;
    const [s, nomeEsc] = ESC_PECA.find(([e]) => (Lx + Ly) * e + gap <= areaW && (Lz + Ly) * e + gap <= areaH) || ESC_PECA.at(-1);
    const totW = (Lx + Ly) * s + gap, totH = (Lz + Ly) * s + gap;
    const x0 = 17 + (areaW - totW) / 2, y0 = 18 + (areaH - totH) / 2;
    // frente: (x, z) no canto sup. esq.; superior abaixo (1º diedro): (x, y); lateral esquerda à direita: (-y, z)
    const V = {
      frente: { dir: [0, 1, 0], ox: x0, oy: y0, w: Lx * s, h: Lz * s, P: (q) => [x0 + (q[0] - mn[0]) * s, y0 + (mx[2] - q[2]) * s], nome: 'VISTA FRONTAL' },
      topo: { dir: [0, 0, -1], ox: x0, oy: y0 + Lz * s + gap, w: Lx * s, h: Ly * s, P: (q) => [x0 + (q[0] - mn[0]) * s, y0 + Lz * s + gap + (q[1] - mn[1]) * s], nome: 'VISTA SUPERIOR' },
      lado: { dir: [1, 0, 0], ox: x0 + Lx * s + gap, oy: y0, w: Ly * s, h: Lz * s, P: (q) => [x0 + Lx * s + gap + (mx[1] - q[1]) * s, y0 + (mx[2] - q[2]) * s], nome: 'VISTA LATERAL ESQ.' },
    };
    let g = '';
    for (const v of Object.values(V)) {
      // preenchimento (silhueta) + arestas
      g += `<g>${tris.map((t) => { const p = t.points.map(v.P); return `<polygon points="${p.map((q) => q.map((n) => n.toFixed(2)).join(',')).join(' ')}"/>`; }).join('')}</g>`.replace('<g>', '<g fill="#efe9e1" stroke="#efe9e1" stroke-width=".05">');
      g += `<g stroke="#111" stroke-width=".3" stroke-linecap="round">${arestas(tris, v.dir).map(([a, b]) => { const A = v.P(a), B = v.P(b); return `<line x1="${A[0].toFixed(2)}" y1="${A[1].toFixed(2)}" x2="${B[0].toFixed(2)}" y2="${B[1].toFixed(2)}"/>`; }).join('')}</g>`;
      g += `<text x="${v.ox + v.w / 2}" y="${v.oy - 3}" font-size="2.3" font-weight="800" letter-spacing=".3" text-anchor="middle" fill="#111">${v.nome}</text>`;
    }
    // cotas gerais
    const F = V.frente, T = V.topo, Lt = V.lado;
    g += cota([F.ox, F.oy + F.h], [F.ox + F.w, F.oy + F.h], 7, fmm(Lx));
    g += cota([F.ox, F.oy], [F.ox, F.oy + F.h], 7, fmm(Lz));
    g += cota([T.ox, T.oy], [T.ox, T.oy + T.h], 7, fmm(Ly));
    g += cota([Lt.ox, Lt.oy + Lt.h], [Lt.ox + Lt.w, Lt.oy + Lt.h], 7, fmm(Ly));
    // eixos de simetria (traço-ponto) nas peças redondas
    const narr = api.part.operation === 'narrado' ? api.part.narrado : null;
    const eixo = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#b3261e" stroke-width=".18" stroke-dasharray="4 1 .6 1"/>`;
    for (const pc of pecas) {
      const pm = [Infinity, Infinity, Infinity], pM = [-Infinity, -Infinity, -Infinity];
      for (const t of pc.tris) for (const q of t.points) for (let k = 0; k < 3; k++) { pm[k] = Math.min(pm[k], q[k]); pM[k] = Math.max(pM[k], q[k]); }
      const c = [(pm[0] + pM[0]) / 2, (pm[1] + pM[1]) / 2];
      const redonda = narr ? ['cilindro', 'parafuso', 'porca'].includes(pc.spec?.tipo) || (pc.spec?.furos || []).length : api.part.operation !== 'extrude';
      if (!redonda) continue;
      const a = F.P([c[0], 0, pM[2]]), b = F.P([c[0], 0, pm[2]]); g += eixo(a[0], a[1] - 3, b[0], b[1] + 3);
      const ct = T.P([c[0], c[1], 0]), r = Math.max(pM[0] - pm[0], pM[1] - pm[1]) / 2 * s + 3;
      g += eixo(ct[0] - r, ct[1], ct[0] + r, ct[1]) + eixo(ct[0], ct[1] - r, ct[0], ct[1] + r);
      const cl = Lt.P([0, c[1], pM[2]]), cl2 = Lt.P([0, c[1], pm[2]]); g += eixo(cl[0], cl[1] - 3, cl2[0], cl2[1] + 3);
    }
    // notas técnicas
    const notas = [];
    if (narr) for (const pc of narr.pecas) {
      const fs = (pc.furos || []).map((f) => `${f.rosca ? `rosca M${fmm(f.diametro)}×${fmm(f.passo)}` : `furo Ø${fmm(f.diametro)}`} ${f.passante ? 'passante' : `prof. ${fmm(f.profundidade)}`} (${f.face})`).join(', ');
      if (pc.tipo === 'cilindro') notas.push(`${pc.nome}: Ø${fmm(pc.diametro)} × ${fmm(pc.altura)}${fs ? ' · ' + fs : ''}`);
      if (pc.tipo === 'bloco') notas.push(`${pc.nome}: ${fmm(pc.largura)} × ${fmm(pc.comprimento)} × ${fmm(pc.altura)}${fs ? ' · ' + fs : ''}`);
      if (pc.tipo === 'parafuso') notas.push(`${pc.nome}: M${fmm(pc.diametro)}×${fmm(pc.passo)} × ${fmm(pc.comprimento)} · ${pc.cabeca === 'allen' ? 'cabeça allen ISO 4762' : pc.cabeca === 'sextavada' ? 'cabeça sextavada ISO 4017' : 'sem cabeça'}`);
      if (pc.tipo === 'porca') notas.push(`${pc.nome}: porca sextavada M${fmm(pc.diametro)}×${fmm(pc.passo)} ISO 4032`);
    } else notas.push(`Dimensões gerais: ${fmm(Lx)} × ${fmm(Ly)} × ${fmm(Lz)} mm`);
    if (narr?.folga) notas.push(`Folga para impressão 3D: ${fmm(narr.folga)} mm`);
    notas.push('Projeção ortogonal no 1º diedro (NBR 10067)', 'Tolerância geral: ±0,2 mm (salvo indicação)');
    for (const c of window.tracoCotas?.lista || []) notas.push(`Medida conferida: ${fmm(Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]))} mm`);
    const colX = W - 12 - 126, notasY = 18 + 82 + 4;
    const diedro = `<g transform="translate(${colX + 108},${notasY + 2})" stroke="#111" stroke-width=".25" fill="none"><path d="M0 2 L8 0 L8 8 L0 6 Z"/><circle cx="14" cy="4" r="3.6"/><circle cx="14" cy="4" r="1.6"/></g>`;
    const corpo = `<g font-family="DM Sans, Arial, sans-serif">${g}</g>
      <text x="17" y="${H - 18}" font-size="3.2" font-weight="800" fill="#111">DESENHO DE PEÇA</text><text x="17" y="${H - 14.5}" font-size="2.2" fill="#111">Escala ${nomeEsc} · medidas em milímetros</text>
      ${imagem3d($('partModelCanvas'), colX, 14, 126, 86, 'PERSPECTIVA ISOMÉTRICA')}
      <rect x="${colX}" y="${notasY}" width="126" height="${H - 12 - 42 - 4 - notasY}" fill="none" stroke="#111" stroke-width=".25"/>
      <text x="${colX + 2}" y="${notasY + 4}" font-size="2.3" font-weight="800" letter-spacing=".4" fill="#111">NOTAS</text>${diedro}
      ${notas.slice(0, 9).map((n, i) => `<text x="${colX + 2}" y="${notasY + 10 + i * 4.2}" font-size="2.3" fill="#111">• ${esc(n)}</text>`).join('')}`;
    return { corpo, escala: nomeEsc, unidade: 'mm', conteudo: 'Vistas ortogonais · Perspectiva' };
  }

  // ====================== JANELA ======================
  const LK = 'traco-prancha-v1';
  const prefs = (() => { try { return JSON.parse(localStorage.getItem(LK)) || {}; } catch { return {}; } })();
  const dlg = document.createElement('dialog'); dlg.className = 'foto-dialog prancha-dialog'; document.body.appendChild(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  const area = document.createElement('div'); area.id = 'prancha-print'; document.body.appendChild(area);
  let modo = 'planta', svgAtual = '';
  function gerar() {
    const fol = prefs.folha === 'A3' ? 'A3' : 'A4', [W, H] = FOLHAS[fol];
    const d = { titulo: prefs.titulo, cliente: prefs.cliente, resp: prefs.resp, data: new Date().toLocaleDateString('pt-BR'), folha: '01/01', obs: prefs.obs };
    const r = modo === 'planta' ? folhaPlanta(W, H, d) : folhaPeca(W, H, d);
    Object.assign(d, r);
    svgAtual = `<svg xmlns="http://www.w3.org/2000/svg" font-family="DM Sans, Arial, sans-serif" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm">${moldura(W, H)}${r.corpo}${carimbo(W, H, d)}</svg>`;
    return { svg: svgAtual, fol };
  }
  function abrir(m) {
    modo = m;
    const campo = (k, rot, ph) => `<label>${rot}<input data-k="${k}" value="${esc(prefs[k] || '')}" placeholder="${ph}" /></label>`;
    dlg.innerHTML = `<h3>Prancha técnica · ${m === 'planta' ? 'Planta' : 'Peça'}</h3>
      <div class="prancha-campos">${campo('titulo', 'Projeto', m === 'planta' ? 'Ex.: Área de lazer' : 'Ex.: Suporte com rosca M6')}${campo('cliente', 'Cliente', 'Nome do cliente')}${campo('resp', 'Responsável', 'Seu nome / registro')}${campo('obs', 'Observação', 'Confira as medidas na obra')}
        <label>Folha<select data-k="folha"><option ${prefs.folha !== 'A3' ? 'selected' : ''}>A4</option><option ${prefs.folha === 'A3' ? 'selected' : ''}>A3</option></select></label></div>
      <div id="pranchaPrev" class="prancha-prev"></div>
      <p id="pranchaMsg" class="foto-fecho"></p>
      <div class="foto-acoes"><button type="button" class="secondary-button" data-x="svg">Baixar SVG</button><span style="flex:1"></span>
        <button type="button" class="secondary-button" data-x="f">Fechar</button><button type="button" class="primary-button" data-x="pdf">🖨️ Imprimir / Salvar PDF</button></div>`;
    const atualizar = () => {
      try { const { svg } = gerar(); $('pranchaPrev').innerHTML = svg; $('pranchaMsg').textContent = ''; dlg.querySelector('[data-x=pdf]').disabled = false; }
      catch (e) { $('pranchaPrev').innerHTML = ''; $('pranchaMsg').textContent = e.message; dlg.querySelector('[data-x=pdf]').disabled = true; }
    };
    dlg.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('input', () => { prefs[el.dataset.k] = el.value; try { localStorage.setItem(LK, JSON.stringify(prefs)); } catch { /* */ } clearTimeout(atualizar.t); atualizar.t = setTimeout(atualizar, 250); }));
    dlg.querySelector('[data-x=f]').onclick = () => dlg.close();
    dlg.querySelector('[data-x=svg]').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([svgAtual], { type: 'image/svg+xml' })); a.download = `traco-prancha-${modo}.svg`; a.click(); };
    dlg.querySelector('[data-x=pdf]').onclick = () => {
      const { svg, fol } = gerar();
      area.innerHTML = `<style>@page { size: ${fol} landscape; margin: 0; }</style>${svg}`;
      document.body.classList.add('imprimindo-prancha'); dlg.close();
      setTimeout(() => { window.print(); }, 150);
    };
    if (!dlg.open) dlg.showModal();
    setTimeout(atualizar, 30);
  }
  window.addEventListener('afterprint', () => document.body.classList.remove('imprimindo-prancha'));
  const bt = (alvo, m) => { if (!alvo) return; const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary-button foto-button'; b.textContent = '🖨️ Prancha PDF'; b.onclick = () => abrir(m); alvo.insertAdjacentElement('beforebegin', b); };
  bt($('exampleButton'), 'planta');
  bt($('cupExample'), 'peca');
  window.tracoPrancha = { abrir, gerar };
})();
