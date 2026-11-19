// Mecanismos em movimento para a narração: engrenagens, cremalheira, biela-manivela, came,
// dobradiça e polias com correia. Cada um gera as peças em 3D já montadas e a pose no tempo t
// (para animar), mais os números de engenharia (relação, curso, velocidade...).
// Tudo em mm. Os mecanismos ficam deitados no plano XY (eixos de giro em Z), exceto a dobradiça.
(() => {
  const TAU = Math.PI * 2;
  const fmt = (n, c = 2) => String(Number((+n).toFixed(c))).replace('.', ',');

  // ---------- malha ----------
  const nrm = (a, b, c) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1; return n.map((x) => x / l); };
  const T = (a, b, c) => ({ normal: nrm(a, b, c), points: [a, b, c] });
  const quad = (o, a, b, c, d) => { o.push(T(a, b, c), T(a, c, d)); };
  function fora(tris) { // garante faces para fora
    let v = 0; for (const t of tris) { const [a, b, c] = t.points; v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]); }
    if (v < 0) for (const t of tris) { t.points.reverse(); t.normal = t.normal.map((x) => -x); }
    return tris;
  }
  // prisma de contorno polar r(θ) com furo central, altura h em z (de z0)
  function prisma(fr, N, h, furo = 0, z0 = 0) {
    const o = [], th = Array.from({ length: N }, (_, i) => i / N * TAU);
    const ext = th.map((t) => [fr(t) * Math.cos(t), fr(t) * Math.sin(t)]);
    const int = th.map((t) => [furo * Math.cos(t), furo * Math.sin(t)]);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, A = ext[i], B = ext[j];
      quad(o, [A[0], A[1], z0], [B[0], B[1], z0], [B[0], B[1], z0 + h], [A[0], A[1], z0 + h]);
      if (furo > 0) {
        const a = int[i], b = int[j];
        quad(o, [b[0], b[1], z0], [a[0], a[1], z0], [a[0], a[1], z0 + h], [b[0], b[1], z0 + h]);
        quad(o, [a[0], a[1], z0 + h], [A[0], A[1], z0 + h], [B[0], B[1], z0 + h], [b[0], b[1], z0 + h]);
        quad(o, [b[0], b[1], z0], [B[0], B[1], z0], [A[0], A[1], z0], [a[0], a[1], z0]);
      } else {
        o.push(T([0, 0, z0 + h], [A[0], A[1], z0 + h], [B[0], B[1], z0 + h]), T([0, 0, z0], [B[0], B[1], z0], [A[0], A[1], z0]));
      }
    }
    return fora(o);
  }
  // cilindro entre p0 e p1, raio r
  function cil(p0, p1, r, n = 24) {
    const ax = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], L = Math.hypot(...ax) || 1, a = ax.map((x) => x / L);
    const t0 = Math.abs(a[2]) < .9 ? [0, 0, 1] : [1, 0, 0];
    const u = [a[1] * t0[2] - a[2] * t0[1], a[2] * t0[0] - a[0] * t0[2], a[0] * t0[1] - a[1] * t0[0]], ul = Math.hypot(...u); u.forEach((x, i) => (u[i] = x / ul));
    const w = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
    const ring = (p) => Array.from({ length: n }, (_, i) => { const c = Math.cos(i / n * TAU) * r, s = Math.sin(i / n * TAU) * r; return [p[0] + u[0] * c + w[0] * s, p[1] + u[1] * c + w[1] * s, p[2] + u[2] * c + w[2] * s]; });
    const A = ring(p0), B = ring(p1), o = [];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(o, A[i], A[j], B[j], B[i]); o.push(T(p0, A[j], A[i]), T(p1, B[i], B[j])); }
    return fora(o);
  }
  // caixa por 8 cantos (ordem: base a,b,c,d / topo e,f,g,h)
  function bloco(c) {
    const [a, b, cc, d, e, f, g, h] = c, o = [];
    quad(o, a, d, cc, b); quad(o, e, f, g, h); quad(o, a, b, f, e); quad(o, b, cc, g, f); quad(o, cc, d, h, g); quad(o, d, a, e, h);
    return fora(o);
  }
  // barra no plano XY de p0 a p1 (centros arredondados com cilindros), largura w, espessura h a partir de z0
  function barra(p0, p1, w, h, z0 = 0) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * w / 2, ny = dx / L * w / 2;
    const P = (p, s, z) => [p[0] + nx * s, p[1] + ny * s, z];
    return [...bloco([P(p0, -1, z0), P(p1, -1, z0), P(p1, 1, z0), P(p0, 1, z0), P(p0, -1, z0 + h), P(p1, -1, z0 + h), P(p1, 1, z0 + h), P(p0, 1, z0 + h)]),
      ...cil([p0[0], p0[1], z0], [p0[0], p0[1], z0 + h], w / 2), ...cil([p1[0], p1[1], z0], [p1[0], p1[1], z0 + h], w / 2)];
  }
  const caixa = (x0, y0, z0, x1, y1, z1) => bloco([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
  // transformações
  const rotZ = (tris, a, cx = 0, cy = 0) => { const c = Math.cos(a), s = Math.sin(a);
    const f = (p) => [cx + (p[0] - cx) * c - (p[1] - cy) * s, cy + (p[0] - cx) * s + (p[1] - cy) * c, p[2]];
    return tris.map((t) => ({ normal: [t.normal[0] * c - t.normal[1] * s, t.normal[0] * s + t.normal[1] * c, t.normal[2]], points: t.points.map(f) })); };
  const rotX = (tris, a) => { const c = Math.cos(a), s = Math.sin(a);
    const f = (p) => [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
    return tris.map((t) => ({ normal: f(t.normal), points: t.points.map(f) })); };
  const mov = (tris, dx, dy, dz = 0) => tris.map((t) => ({ normal: t.normal, points: t.points.map((p) => [p[0] + dx, p[1] + dy, p[2] + dz]) }));

  // engrenagem de dentes retos (perfil aproximado do envolvente), dente centrado em θ = (k+½)·2π/z
  function rEngrenagem(m, z) {
    const rp = m * z / 2, ra = rp + m, rf = Math.max(m, rp - 1.25 * m);
    return (t) => { const u = ((t * z / TAU) % 1 + 1) % 1, d = Math.abs(u - .5);
      if (d < .13) return ra; if (d > .31) return rf; return ra - (ra - rf) * (d - .13) / .18; };
  }
  function engrenagem(m, z, h, furo) { return prisma(rEngrenagem(m, z), Math.max(120, z * 24), h, furo || 0); }

  // ---------- tipos ----------
  const CAMPOS = {
    engrenagens: [['modulo', 'Módulo'], ['dentes1', 'Dentes da engrenagem 1'], ['dentes2', 'Dentes da engrenagem 2'], ['espessura', 'Espessura']],
    cremalheira: [['modulo', 'Módulo'], ['dentes', 'Dentes do pinhão'], ['comprimento', 'Comprimento da cremalheira'], ['espessura', 'Espessura']],
    biela_manivela: [['manivela', 'Raio da manivela'], ['biela', 'Comprimento da biela'], ['pistao', 'Diâmetro do pistão'], ['espessura', 'Espessura']],
    came: [['raio', 'Raio do came'], ['excentricidade', 'Excentricidade'], ['espessura', 'Espessura'], ['haste', 'Diâmetro da haste']],
    dobradica: [['comprimento', 'Comprimento'], ['largura', 'Largura de cada aba'], ['espessura', 'Espessura da aba'], ['pino', 'Diâmetro do pino'], ['abertura', 'Abertura máxima']],
    polias: [['diametro1', 'Diâmetro da polia 1'], ['diametro2', 'Diâmetro da polia 2'], ['distancia', 'Distância entre centros'], ['largura', 'Largura']],
  };
  const NOMES = { engrenagens: 'Engrenagens', cremalheira: 'Pinhão e cremalheira', biela_manivela: 'Biela-manivela', came: 'Came e seguidor', dobradica: 'Dobradiça', polias: 'Polias com correia' };
  const UNID = { dentes1: 'dentes', dentes2: 'dentes', dentes: 'dentes', abertura: '°' };

  function conflitos(pc) {
    const o = [], n = NOMES[pc.tipo];
    if (pc.tipo === 'engrenagens') { if (pc.dentes1 < 8 || pc.dentes2 < 8) o.push(`${n}: use pelo menos 8 dentes.`); }
    if (pc.tipo === 'cremalheira') { if (pc.dentes < 8) o.push(`${n}: use pelo menos 8 dentes no pinhão.`); if (pc.comprimento < Math.PI * pc.modulo * 3) o.push(`${n}: cremalheira curta demais (mínimo 3 dentes).`); }
    if (pc.tipo === 'biela_manivela' && pc.biela <= pc.manivela * 1.2) o.push(`${n}: a biela precisa ser bem maior que o raio da manivela (senão trava).`);
    if (pc.tipo === 'came' && pc.excentricidade >= pc.raio * .8) o.push(`${n}: a excentricidade precisa ser menor que o raio do came.`);
    if (pc.tipo === 'dobradica') { if (pc.abertura > 270) o.push(`${n}: abertura máxima de 270°.`); if (pc.pino >= pc.largura) o.push(`${n}: pino grosso demais para a aba.`); }
    if (pc.tipo === 'polias' && pc.distancia <= (pc.diametro1 + pc.diametro2) / 2 + 2) o.push(`${n}: as polias se encostam — aumente a distância entre centros.`);
    return o;
  }
  function info(pc) {
    if (pc.tipo === 'engrenagens') { const a = pc.modulo * (pc.dentes1 + pc.dentes2) / 2, i = pc.dentes2 / pc.dentes1;
      return `Distância entre centros ${fmt(a)} mm · relação ${fmt(1)}:${fmt(i)} — a engrenagem 2 gira ${fmt(1 / i, 3)}× a velocidade da 1, no sentido contrário, com ${fmt(i, 3)}× o torque.`; }
    if (pc.tipo === 'cremalheira') { const r = pc.modulo * pc.dentes / 2;
      return `Cada volta do pinhão anda ${fmt(TAU * r)} mm na cremalheira (π × módulo × dentes). Passo ${fmt(Math.PI * pc.modulo)} mm.`; }
    if (pc.tipo === 'biela_manivela') { const r = pc.manivela, L = pc.biela, lam = r / L;
      return `Curso do pistão ${fmt(2 * r)} mm · relação r/L ${fmt(lam, 3)} · aceleração máxima ≈ ${fmt(1 + lam, 3)} × r·ω² no ponto morto superior.`; }
    if (pc.tipo === 'came') return `Elevação total do seguidor ${fmt(2 * pc.excentricidade)} mm (movimento senoidal, 2 × excentricidade).`;
    if (pc.tipo === 'dobradica') return `Abre de 0° a ${fmt(pc.abertura, 0)}° em volta do pino de ${fmt(pc.pino)} mm.`;
    if (pc.tipo === 'polias') { const i = pc.diametro2 / pc.diametro1, d1 = pc.diametro1 / 2, d2 = pc.diametro2 / 2, C = pc.distancia;
      const Lc = 2 * C + Math.PI * (d1 + d2) + (d2 - d1) ** 2 / C;
      const ab = Math.PI - 2 * Math.asin(Math.min(1, Math.abs(d2 - d1) / C));
      return `Relação ${fmt(1)}:${fmt(i, 3)} (a polia 2 gira ${fmt(1 / i, 3)}× a 1, mesmo sentido) · comprimento da correia ≈ ${fmt(Lc, 1)} mm · abraçamento na polia menor ${fmt(ab * 180 / Math.PI, 0)}°.`; }
    return '';
  }

  // ---------- peças na pose t (s) — 1 volta da entrada a cada 4 s ----------
  function pecas(pc, t = 0) {
    const w = TAU / 4 * t, out = [];
    if (pc.tipo === 'engrenagens') {
      const { modulo: m, dentes1: z1, dentes2: z2, espessura: h } = pc, a = m * (z1 + z2) / 2;
      const f1 = Math.min(m * z1 / 2 - 1.25 * m - 1, Math.max(1.5, m * z1 / 10)), f2 = Math.min(m * z2 / 2 - 1.25 * m - 1, Math.max(1.5, m * z2 / 10));
      out.push({ nome: `Engrenagem 1 (${z1} dentes)`, tris: rotZ(engrenagem(m, z1, h, f1), w) });
      out.push({ nome: `Engrenagem 2 (${z2} dentes)`, tris: mov(rotZ(engrenagem(m, z2, h, f2), Math.PI - Math.PI / z2 - w * z1 / z2), a, 0) });
    } else if (pc.tipo === 'cremalheira') {
      const { modulo: m, dentes: z, comprimento: L, espessura: h } = pc, r = m * z / 2, p = Math.PI * m;
      const amp = Math.max(p / 2, L / 2 - 1.5 * p), alfa = amp / r * Math.sin(w), desloc = r * alfa; // vai e volta
      const furo = Math.max(1.5, Math.min(r - 1.25 * m - 1, r / 5));
      out.push({ nome: `Pinhão (${z} dentes)`, tris: rotZ(engrenagem(m, z, h, furo), -Math.PI / 2 + alfa) });
      const ha = m, hf = 1.25 * m, base = -r - hf - Math.max(2 * m, 3), x0 = -L / 2, x1 = L / 2, pts = [[x0, -r - hf]];
      for (let k = Math.floor(x0 / p) - 1; k <= Math.ceil(x1 / p) + 1; k++) { const c = k * p;
        for (const [dx, y] of [[-p * .32, -r - hf], [-p * .14, -r + ha], [p * .14, -r + ha], [p * .32, -r - hf]]) if (c + dx > x0 && c + dx < x1) pts.push([c + dx, y]); }
      pts.push([x1, -r - hf]);
      const o = [];
      for (let i2 = 0; i2 < pts.length - 1; i2++) { const A = pts[i2], B = pts[i2 + 1];
        quad(o, [A[0], base, 0], [B[0], base, 0], [B[0], B[1], 0], [A[0], A[1], 0]); quad(o, [A[0], A[1], h], [B[0], B[1], h], [B[0], base, h], [A[0], base, h]);
        quad(o, [A[0], A[1], 0], [B[0], B[1], 0], [B[0], B[1], h], [A[0], A[1], h]); quad(o, [B[0], base, 0], [A[0], base, 0], [A[0], base, h], [B[0], base, h]); }
      const A = pts[0], B = pts.at(-1);
      quad(o, [A[0], base, 0], [A[0], A[1], 0], [A[0], A[1], h], [A[0], base, h]); quad(o, [B[0], B[1], 0], [B[0], base, 0], [B[0], base, h], [B[0], B[1], h]);
      out.push({ nome: 'Cremalheira', tris: mov(fora(o), desloc, 0) });
    } else if (pc.tipo === 'biela_manivela') {
      const { manivela: r, biela: L, pistao: D, espessura: h } = pc, wb = Math.max(4, D * .35);
      const a = w, pin = [r * Math.cos(a), r * Math.sin(a)], xp = r * Math.cos(a) + Math.sqrt(L * L - (r * Math.sin(a)) ** 2);
      out.push({ nome: 'Manivela', tris: [...barra([0, 0], pin, wb, h, 0), ...cil([0, 0, -h], [0, 0, 0], wb * .35)] });
      out.push({ nome: 'Biela', tris: barra(pin, [xp, 0], wb * .8, h, h + .3) });
      out.push({ nome: 'Pistão', tris: cil([xp, 0, h + .3 + h / 2], [xp + D, 0, h + .3 + h / 2], D / 2, 32) });
    } else if (pc.tipo === 'came') {
      const { raio: R, excentricidade: e, espessura: h, haste: d } = pc;
      const fr = (th) => e * Math.cos(th) + Math.sqrt(Math.max(0, R * R - (e * Math.sin(th)) ** 2));
      out.push({ nome: 'Came', tris: rotZ(prisma(fr, 120, h, Math.max(1.5, Math.min(R - e - 2, R / 5))), w) });
      const yc = e * Math.sin(w) + R; // contato no topo (direção +y)
      const Lh = R * 2.2;
      out.push({ nome: 'Seguidor', tris: [...cil([0, yc, h / 2], [0, yc + Lh, h / 2], d / 2), ...caixa(-d, yc - .01, h / 2 - d / 2, d, yc + d * .3, h / 2 + d / 2)] });
    } else if (pc.tipo === 'dobradica') {
      const { comprimento: C, largura: W, espessura: e, pino: dp, abertura: ab } = pc, rk = dp / 2 + e;
      const n = 5, seg = C / n, ang = (ab * Math.PI / 180) * (0.5 - 0.5 * Math.cos(w)); // abre e fecha
      const abaA = [...caixa(0, -W, -e / 2, C, -rk * .6, e / 2)], abaB = [...caixa(0, rk * .6, -e / 2, C, W, e / 2)];
      const nA = [], nB = [];
      const tubo = (xa, xb) => prisma(() => rk, 32, xb - xa, dp / 2 + .2).map((t) => ({ normal: [t.normal[2], t.normal[0], t.normal[1]], points: t.points.map(([x, y, z]) => [z + xa, x, y]) }));
      for (let k = 0; k < n; k++) (k % 2 ? nB : nA).push(...tubo(k * seg + .15, (k + 1) * seg - .15));
      out.push({ nome: 'Aba fixa', tris: [...abaA, ...nA] });
      out.push({ nome: 'Aba móvel', tris: rotX([...abaB, ...nB], ang) });
      out.push({ nome: 'Pino', tris: cil([-1, 0, 0], [C + 1, 0, 0], dp / 2 - .15, 20) });
    } else if (pc.tipo === 'polias') {
      const { diametro1: D1, diametro2: D2, distancia: Cc, largura: B } = pc, r1 = D1 / 2, r2 = D2 / 2;
      const polia = (r) => {
        return [...prisma(() => r + 1.5, 96, B * .15, Math.max(1.5, r / 5), 0), ...prisma(() => r, 96, B * .7, Math.max(1.5, r / 5), B * .15), ...prisma(() => r + 1.5, 96, B * .15, Math.max(1.5, r / 5), B * .85),
          ...caixa(r * .45, -1, B, r * .75, 1, B + 1)]; }; // marca para ver o giro
      out.push({ nome: `Polia 1 (Ø${fmt(D1)})`, tris: rotZ(polia(r1), w) });
      out.push({ nome: `Polia 2 (Ø${fmt(D2)})`, tris: mov(rotZ(polia(r2), w * r1 / r2), Cc, 0) });
      // correia aberta: tangentes externas + arcos
      const fi = Math.asin((r1 - r2) / Cc), cam = [];
      const arco = (cx, r, a0, a1, N) => { for (let i = 0; i <= N; i++) { const a = a0 + (a1 - a0) * i / N; cam.push([cx + (r + .6) * Math.cos(a), (r + .6) * Math.sin(a)]); } };
      arco(Cc, r2, -Math.PI / 2 + fi, Math.PI / 2 - fi, 40);
      arco(0, r1, Math.PI / 2 - fi, 3 * Math.PI / 2 + fi, 60);
      const o = [], esp = 1.6, z0 = B * .2, z1 = B * .8;
      const nN = cam.length;
      for (let i = 0; i < nN; i++) { const A = cam[i], Bp = cam[(i + 1) % nN];
        const nx = A[0] - (i < 41 ? Cc : 0), ny = A[1], L = Math.hypot(nx, ny) || 1, ox = nx / L * esp, oy = ny / L * esp;
        const nx2 = Bp[0] - ((i + 1) % nN < 41 ? Cc : 0), ny2 = Bp[1], L2 = Math.hypot(nx2, ny2) || 1, ox2 = nx2 / L2 * esp, oy2 = ny2 / L2 * esp;
        quad(o, [A[0] + ox, A[1] + oy, z0], [Bp[0] + ox2, Bp[1] + oy2, z0], [Bp[0] + ox2, Bp[1] + oy2, z1], [A[0] + ox, A[1] + oy, z1]);
        quad(o, [Bp[0], Bp[1], z0], [A[0], A[1], z0], [A[0], A[1], z1], [Bp[0], Bp[1], z1]);
        quad(o, [A[0], A[1], z1], [A[0] + ox, A[1] + oy, z1], [Bp[0] + ox2, Bp[1] + oy2, z1], [Bp[0], Bp[1], z1]);
        quad(o, [Bp[0], Bp[1], z0], [Bp[0] + ox2, Bp[1] + oy2, z0], [A[0] + ox, A[1] + oy, z0], [A[0], A[1], z0]); }
      // marca andando na correia
      const per = []; let tot = 0; for (let i = 0; i < nN; i++) { const d = Math.hypot(cam[(i + 1) % nN][0] - cam[i][0], cam[(i + 1) % nN][1] - cam[i][1]); per.push(d); tot += d; }
      let s = ((r1 * w) % tot + tot) % tot, i = 0; while (s > per[i]) { s -= per[i]; i = (i + 1) % nN; }
      const A = cam[i], Bp = cam[(i + 1) % nN], u = s / (per[i] || 1), px = A[0] + (Bp[0] - A[0]) * u, py = A[1] + (Bp[1] - A[1]) * u;
      out.push({ nome: 'Correia', tris: [...fora(o), ...caixa(px - 1.5, py - 1.5, z1, px + 1.5, py + 1.5, z1 + 1)] });
    }
    return out;
  }
  window.tracoMeca = { CAMPOS, NOMES, UNID, pecas, info, conflitos, eh: (t) => !!CAMPOS[t] };
})();
