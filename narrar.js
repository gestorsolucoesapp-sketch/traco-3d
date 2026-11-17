// Narrar peça → 3D. O usuário fala ou escreve ("peça de Ø20 com rosca M6 de 7 mm e um parafuso
// para essa rosca"); a IA (função ler-desenho, modo texto) devolve as peças e as medidas DITAS.
// Um formulário mostra tudo; o que não foi dito fica em vermelho e precisa ser preenchido.
// Passo da rosca e cabeça/porca vêm das tabelas ISO (não é chute: é a norma da rosca pedida).
(() => {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n == null || !Number.isFinite(n) ? '' : String(Number(n.toFixed(3))).replace('.', ',');
  const num = (t) => { const v = Number(String(t ?? '').trim().replace(/\s*mm$/i, '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : null; };
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TAU = Math.PI * 2;

  // ---------- Tabelas ISO ----------
  const PASSO = { 2: .4, 2.5: .45, 3: .5, 4: .7, 5: .8, 6: 1, 8: 1.25, 10: 1.5, 12: 1.75, 14: 2, 16: 2, 20: 2.5, 24: 3 };
  const SEXT = { 3: [5.5, 2], 4: [7, 2.8], 5: [8, 3.5], 6: [10, 4], 8: [13, 5.3], 10: [16, 6.4], 12: [18, 7.5], 14: [21, 8.8], 16: [24, 10], 20: [30, 12.5], 24: [36, 15] }; // ISO 4017: s, k
  const ALLEN = { 3: [5.5, 3, 2.5, 1.3], 4: [7, 4, 3, 2], 5: [8.5, 5, 4, 2.5], 6: [10, 6, 5, 3], 8: [13, 8, 6, 4], 10: [16, 10, 8, 5], 12: [18, 12, 10, 6], 14: [21, 14, 12, 7], 16: [24, 16, 14, 8], 20: [30, 20, 17, 10], 24: [36, 24, 19, 12] }; // ISO 4762: dk, k, s, t
  const PORCA = { 3: [5.5, 2.4], 4: [7, 3.2], 5: [8, 4.7], 6: [10, 5.2], 8: [13, 6.8], 10: [16, 8.4], 12: [18, 10.8], 14: [21, 12.8], 16: [24, 14.8], 20: [30, 18], 24: [36, 21.5] }; // ISO 4032: s, m
  const diaDeRosca = (r) => { const m = /M\s*(\d+(?:[.,]\d+)?)/i.exec(r || ''); return m ? Number(m[1].replace(',', '.')) : null; };

  // ---------- Geometria ----------
  const N = 48; // divisões em volta (múltiplo de 6: cantos do sextavado caem na malha)
  const baseT = Array.from({ length: N }, (_, i) => i * TAU / N);
  function angulos(extras = []) {
    const t = [...baseT, ...extras.map((a) => ((a % TAU) + TAU) % TAU)];
    return [...new Set(t.map((a) => +a.toFixed(9)))].sort((a, b) => a - b);
  }
  const tri = (ph) => 1 - Math.abs(2 * ph - 1);
  const fase = (th, z, p) => { const v = z / p - th / TAU; return v - Math.floor(v); };
  const roscaExt = (d, p, folga, zTopo) => (th, z) => {
    const r = d / 2 - folga / 2 - .6134 * p * (1 - tri(fase(th, z, p)));
    const d3 = d / 2 - folga / 2 - .6134 * p;
    return zTopo == null ? r : Math.min(r, d3 + Math.max(0, zTopo - z)); // chanfro na ponta
  };
  const roscaInt = (d, p, folga) => (th, z) => d / 2 + folga / 2 - .5413 * p * (1 - tri(fase(th, z, p)));
  const liso = (d) => () => d / 2;
  const sext = (s) => (th) => { const a = ((th % (TAU / 6)) + TAU / 6) % (TAU / 6) - TAU / 12; return (s / 2) / Math.cos(a); };
  const retang = (w, l) => (th) => Math.min((w / 2) / Math.max(Math.abs(Math.cos(th)), 1e-9), (l / 2) / Math.max(Math.abs(Math.sin(th)), 1e-9));
  const circ = (D) => () => D / 2;

  function normal(a, b, c) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const L = Math.hypot(...n); return L > 1e-12 ? n.map((x) => x / L) : null;
  }
  // Superfície em grade: T ângulos (fecha a volta), V parâmetros; f(θ,v) → ponto; esperado(p) → direção da normal.
  function grade(out, T, V, f, esperado) {
    const P = T.map((th) => V.map((v) => f(th, v)));
    const n = T.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < V.length - 1; j++) {
      const a = P[i][j], b = P[(i + 1) % n][j], c = P[(i + 1) % n][j + 1], d = P[i][j + 1];
      for (let [x, y, z] of [[a, b, c], [a, c, d]]) {
        let nn = normal(x, y, z); if (!nn) continue;
        const m = [(x[0] + y[0] + z[0]) / 3, (x[1] + y[1] + z[1]) / 3, (x[2] + y[2] + z[2]) / 3];
        const e = esperado(m);
        if (nn[0] * e[0] + nn[1] * e[1] + nn[2] * e[2] < 0) { [y, z] = [z, y]; nn = nn.map((q) => -q); }
        out.push({ points: [x, y, z], normal: nn });
      }
    }
  }
  const pol = (r, th, z) => [r * Math.cos(th), r * Math.sin(th), z];
  const fora = (m) => [m[0], m[1], 0], dentro = (m) => [-m[0], -m[1], 0];
  const cima = () => [0, 0, 1], baixo = () => [0, 0, -1];
  function linhasZ(z0, z1, p) {
    if (!p) return [z0, z1];
    const n = Math.max(1, Math.ceil((z1 - z0) / (p / 10)));
    return Array.from({ length: n + 1 }, (_, i) => z0 + (z1 - z0) * i / n);
  }
  const parede = (o, T, r, z0, z1, p, para) => grade(o, T, linhasZ(z0, z1, p), (th, z) => pol(r(th, z), th, z), para);
  const tampa = (o, T, ri, ro, z, para) => grade(o, T, [0, 1], (th, t) => { const a = ri ? ri(th, z) : 0, b = ro(th, z); return pol(a + (b - a) * t, th, z); }, para);

  // Furo (liso ou roscado) a partir das medidas do formulário.
  function funcFuro(f, folga) {
    if (!f) return null;
    if (f.rosca) return { r: roscaInt(f.diametro, f.passo, folga), p: f.passo };
    return { r: liso(f.diametro), p: null };
  }

  function corpo(pc, folga) { // cilindro ou bloco, com furo no topo e/ou na base
    const o = [], H = pc.altura;
    const cantos = pc.tipo === 'bloco' ? [1, -1].flatMap((sx) => [1, -1].map((sy) => Math.atan2(sy * pc.comprimento / 2, sx * pc.largura / 2))) : [];
    const T = angulos(cantos);
    const R = pc.tipo === 'bloco' ? retang(pc.largura, pc.comprimento) : circ(pc.diametro);
    const ft = (pc.furos || []).find((f) => f.face === 'topo'), fb = (pc.furos || []).find((f) => f.face === 'base');
    const pass = [ft, fb].find((f) => f?.passante);
    const fo = (th) => R(th);
    parede(o, T, fo, 0, H, null, fora);
    if (pass) {
      const h = funcFuro(pass, folga);
      tampa(o, T, h.r, fo, 0, baixo); tampa(o, T, h.r, fo, H, cima);
      parede(o, T, h.r, 0, H, h.p, dentro);
      return o;
    }
    if (ft) {
      const h = funcFuro(ft, folga), z0 = H - ft.profundidade;
      tampa(o, T, h.r, fo, H, cima); parede(o, T, h.r, z0, H, h.p, dentro); tampa(o, T, null, h.r, z0, cima);
    } else tampa(o, T, null, fo, H, cima);
    if (fb) {
      const h = funcFuro(fb, folga), z1 = fb.profundidade;
      tampa(o, T, h.r, fo, 0, baixo); parede(o, T, h.r, 0, z1, h.p, dentro); tampa(o, T, null, h.r, z1, baixo);
    } else tampa(o, T, null, fo, 0, baixo);
    return o;
  }

  function parafuso(pc, folga) { // cabeça embaixo (melhor para imprimir), ponta para cima
    const o = [], T = angulos(), d = pc.diametro, p = pc.passo, L = pc.comprimento;
    let k = 0;
    if (pc.cabeca === 'sextavada') {
      const [s, kk] = SEXT[d]; k = kk; const hx = sext(s);
      tampa(o, T, null, hx, 0, baixo); parede(o, T, hx, 0, k, null, fora);
      tampa(o, T, (th, z) => roscaExt(d, p, folga, null)(th, z), hx, k, cima);
    } else if (pc.cabeca === 'allen') {
      const [dk, kk, s, t] = ALLEN[d]; k = kk; const hx = sext(s), cd = circ(dk);
      tampa(o, T, hx, cd, 0, baixo); parede(o, T, hx, 0, t, null, dentro); tampa(o, T, null, hx, t, baixo);
      parede(o, T, cd, 0, k, null, fora);
      tampa(o, T, (th, z) => roscaExt(d, p, folga, null)(th, z), cd, k, cima);
    } else { // barra roscada: chanfro nas duas pontas
      const r0 = roscaExt(d, p, folga, null), d3 = d / 2 - folga / 2 - .6134 * p;
      const rb = (th, z) => Math.min(r0(th, z), d3 + Math.max(0, z));
      tampa(o, T, null, rb, 0, baixo);
      const rr = (th, z) => Math.min(rb(th, z), roscaExt(d, p, folga, L)(th, z));
      parede(o, T, rr, 0, L, p, fora); tampa(o, T, null, rr, L, cima);
      return o;
    }
    const r = roscaExt(d, p, folga, k + L);
    parede(o, T, r, k, k + L, p, fora); tampa(o, T, null, r, k + L, cima);
    return o;
  }

  function porca(pc, folga) {
    const o = [], T = angulos(), d = pc.diametro, p = pc.passo, [s, m] = PORCA[d];
    const hx = sext(s), ri = roscaInt(d, p, folga);
    tampa(o, T, ri, hx, 0, baixo); parede(o, T, hx, 0, m, null, fora);
    tampa(o, T, ri, hx, m, cima); parede(o, T, ri, 0, m, p, dentro);
    return o;
  }

  function malhaPeca(pc, folga) {
    if (pc.tipo === 'parafuso') return parafuso(pc, folga);
    if (pc.tipo === 'porca') return porca(pc, folga);
    return corpo(pc, folga);
  }
  function caixa(tris) {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const t of tris) for (const q of t.points) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], q[k]); b[k + 3] = Math.max(b[k + 3], q[k]); }
    return b;
  }
  let cacheKey = '', cache = null;
  // Monta todas as peças lado a lado (em x). Devolve {tris, pecas:[{nome,tris}]}.
  function montar(spec) {
    const key = JSON.stringify(spec);
    if (key === cacheKey) return cache;
    const pecas = [], tris = [];
    let x = 0;
    for (const pc of spec.pecas) {
      const t = malhaPeca(pc, spec.folga || 0), b = caixa(t);
      const dx = x - b[0];
      const mov = t.map((tr) => ({ normal: tr.normal, points: tr.points.map(([a, c, z]) => [a + dx, c, z]) }));
      pecas.push({ nome: pc.nome || pc.tipo, tris: t });
      tris.push(...mov);
      x += (b[3] - b[0]) + 6;
    }
    cacheKey = key; cache = { tris, pecas };
    return cache;
  }
  // Corte axial nominal da 1ª peça, para o quadro 2D.
  function corte(pc) {
    if (pc.tipo === 'parafuso') {
      const d = pc.diametro, L = pc.comprimento;
      const [w, k] = pc.cabeca === 'sextavada' ? [SEXT[d][0] / 2, SEXT[d][1]] : pc.cabeca === 'allen' ? [ALLEN[d][0] / 2, ALLEN[d][1]] : [d / 2, 0];
      return k ? [[0, 0], [w, 0], [w, k], [d / 2, k], [d / 2, k + L], [0, k + L]] : [[0, 0], [d / 2, 0], [d / 2, L], [0, L]];
    }
    if (pc.tipo === 'porca') { const [s, m] = PORCA[pc.diametro]; return [[pc.diametro / 2, 0], [s / 2, 0], [s / 2, m], [pc.diametro / 2, m]]; }
    const R = pc.tipo === 'bloco' ? pc.largura / 2 : pc.diametro / 2, H = pc.altura;
    const ft = (pc.furos || []).find((f) => f.face === 'topo'), fb = (pc.furos || []).find((f) => f.face === 'base');
    const pass = [ft, fb].find((f) => f?.passante);
    if (pass) return [[pass.diametro / 2, 0], [R, 0], [R, H], [pass.diametro / 2, H]];
    const pts = [];
    if (fb) pts.push([0, fb.profundidade], [fb.diametro / 2, fb.profundidade], [fb.diametro / 2, 0]); else pts.push([0, 0]);
    pts.push([R, 0], [R, H]);
    if (ft) pts.push([ft.diametro / 2, H], [ft.diametro / 2, H - ft.profundidade], [0, H - ft.profundidade]); else pts.push([0, H]);
    return pts;
  }
  // Montagem: acha um furo roscado e um parafuso da mesma rosca. O parafuso desce girando
  // (avança 1 passo por volta) pelo eixo do furo. s = quanto já entrou (mm).
  function parMontagem(spec) {
    const corpoI = spec.pecas.findIndex((pc) => (pc.furos || []).some((f) => f.rosca));
    if (corpoI < 0) return null;
    const furo = spec.pecas[corpoI].furos.find((f) => f.rosca);
    const parI = spec.pecas.findIndex((pc) => pc.tipo === 'parafuso' && Math.abs(pc.diametro - furo.diametro) < 1e-6);
    if (parI < 0) return null;
    const pc = spec.pecas[corpoI], pf = spec.pecas[parI];
    const k = pf.cabeca === 'sextavada' ? SEXT[pf.diametro][1] : pf.cabeca === 'allen' ? ALLEN[pf.diametro][1] : 0;
    const prof = furo.passante ? pc.altura : furo.profundidade;
    const curso = Math.min(pf.comprimento, prof);
    const msgs = [];
    if (Math.abs(pf.passo - furo.passo) > 1e-6) msgs.push(`Passos diferentes: furo ${fmt(furo.passo)} mm × parafuso ${fmt(pf.passo)} mm — não rosqueia.`);
    if (!furo.passante && pf.comprimento > prof) msgs.push(`O parafuso (${fmt(pf.comprimento)} mm) é maior que o furo (${fmt(prof)} mm): bate no fundo e sobram ${fmt(pf.comprimento - prof)} mm de rosca para fora.`);
    else if (furo.passante && pf.comprimento > prof) msgs.push(`Furo passante: a ponta sai ${fmt(pf.comprimento - prof)} mm do outro lado.`);
    else if (pf.comprimento < prof) msgs.push(`Entra os ${fmt(pf.comprimento)} mm inteiros; sobram ${fmt(prof - pf.comprimento)} mm de furo vazio.`);
    else msgs.push('Entra até o fundo, encaixe exato.');
    return { corpoI, parI, furo, k, L: pf.comprimento, H: pc.altura, curso, passo: pf.passo, msgs };
  }
  function montagem(spec, s) {
    const m = parMontagem(spec); if (!m) return null;
    const { pecas } = montar(spec);
    const corpo = pecas[m.corpoI].tris, paraf = pecas[m.parI].tris;
    const folga = Math.max(4, m.L * .6), entrou = Math.max(0, Math.min(m.curso, s));
    const ang = -entrou / m.passo * TAU, c = Math.cos(ang), sn = Math.sin(ang);
    const topo = m.furo.face !== 'base';
    // topo: parafuso de cabeça para cima, ponta descendo até H - entrou.
    const zPonta = topo ? m.H + folga * (1 - entrou / m.curso) - entrou : -folga * (1 - entrou / m.curso) + entrou;
    const mov = (q) => {
      const x = q[0] * c - q[1] * sn, y = q[0] * sn + q[1] * c;
      const z = topo ? zPonta + (m.k + m.L - q[2]) : zPonta - (m.k + m.L - q[2]);
      return [x, topo ? -y : y, z];
    };
    const tris = corpo.map((t) => ({ ...t, ghost: true }));
    for (const t of paraf) {
      const pts = t.points.map(mov);
      const n = topo ? [t.normal[0] * c - t.normal[1] * sn, -(t.normal[0] * sn + t.normal[1] * c), -t.normal[2]] :
        [t.normal[0] * c - t.normal[1] * sn, t.normal[0] * sn + t.normal[1] * c, t.normal[2]];
      tris.push({ points: pts, normal: n });
    }
    return { tris, ...m };
  }
  window.tracoNarrado = { montar, corte, parMontagem, montagem };

  // ---------- Formulário ----------
  const CAMPOS = {
    cilindro: [['diametro', 'Diâmetro'], ['altura', 'Altura']],
    bloco: [['largura', 'Largura'], ['comprimento', 'Comprimento'], ['altura', 'Altura']],
    parafuso: [['diametro', 'Rosca M (diâmetro)'], ['passo', 'Passo'], ['comprimento', 'Comprimento roscado']],
    porca: [['diametro', 'Rosca M (diâmetro)'], ['passo', 'Passo']],
  };
  const NOMES = { cilindro: 'Cilindro', bloco: 'Bloco', parafuso: 'Parafuso', porca: 'Porca' };
  let spec = null; // { pecas:[], folga, avisos:[] }

  function normalizar(j) {
    const n = (v) => (Number.isFinite(+v) && +v > 0 ? +v : null);
    const pecas = (j.pecas || []).filter((p) => CAMPOS[p?.tipo]).map((p) => {
      const pc = { tipo: p.tipo, nome: typeof p.nome === 'string' ? p.nome.slice(0, 40) : NOMES[p.tipo], auto: {} };
      for (const [k] of CAMPOS[p.tipo]) pc[k] = n(p[k]);
      if (p.tipo === 'parafuso' || p.tipo === 'porca') {
        pc.diametro = pc.diametro ?? diaDeRosca(p.rosca);
        if (p.tipo === 'parafuso') pc.cabeca = ['sextavada', 'allen', 'sem_cabeca'].includes(p.cabeca) ? p.cabeca : null;
      }
      if (p.tipo === 'cilindro' || p.tipo === 'bloco') pc.furos = (p.furos || []).slice(0, 2).map((f) => ({
        face: f?.face === 'base' ? 'base' : 'topo', rosca: Boolean(f?.rosca), diametro: n(f?.diametro) ?? diaDeRosca(f?.rosca),
        passo: n(f?.passo), profundidade: n(f?.profundidade), passante: Boolean(f?.passante), auto: {},
      }));
      return pc;
    });
    const avisos = [...(j.avisos || []), ...(j.nao_suportado || []).map((t) => `Não dá para fazer ainda: ${t}`)].filter((t) => typeof t === 'string');
    return { pecas, folga: 0, avisos, texto: j._texto || '' };
  }
  // Preenche o que é NORMA (passo ISO grosso) e marca como automático.
  function normas() {
    const passo = (o) => { if (o.passo == null && PASSO[o.diametro]) { o.passo = PASSO[o.diametro]; o.auto.passo = true; } };
    for (const pc of spec.pecas) {
      if (pc.tipo === 'parafuso' || pc.tipo === 'porca') passo(pc);
      for (const f of pc.furos || []) if (f.rosca) passo(f);
    }
  }
  function faltas() {
    const out = [];
    spec.pecas.forEach((pc, i) => {
      const nome = pc.nome || NOMES[pc.tipo];
      for (const [k, rot] of CAMPOS[pc.tipo]) if (pc[k] == null) out.push(`${nome}: ${rot.toLowerCase()}`);
      if (pc.tipo === 'parafuso' && !pc.cabeca) out.push(`${nome}: tipo de cabeça`);
      if ((pc.tipo === 'parafuso' && pc.cabeca && pc.cabeca !== 'sem_cabeca' && !(pc.cabeca === 'sextavada' ? SEXT : ALLEN)[pc.diametro]) ||
          (pc.tipo === 'porca' && pc.diametro && !PORCA[pc.diametro])) out.push(`${nome}: M${fmt(pc.diametro)} fora da tabela ISO (M3 a M24)`);
      for (const f of pc.furos || []) {
        if (f.diametro == null) out.push(`${nome}: diâmetro do furo`);
        if (!f.passante && f.profundidade == null) out.push(`${nome}: profundidade do furo`);
        if (f.rosca && f.passo == null) out.push(`${nome}: passo da rosca`);
      }
    });
    return out;
  }
  function conflitos() {
    const out = [];
    for (const pc of spec.pecas) {
      const nome = pc.nome || NOMES[pc.tipo];
      if (pc.tipo === 'cilindro' || pc.tipo === 'bloco') {
        const minR = pc.tipo === 'bloco' ? Math.min(pc.largura, pc.comprimento) / 2 : pc.diametro / 2;
        let soma = 0;
        for (const f of pc.furos || []) {
          if (f.diametro / 2 >= minR - .5) out.push(`${nome}: o furo é largo demais para a peça.`);
          if (!f.passante) soma += f.profundidade;
        }
        if (soma >= pc.altura) out.push(`${nome}: a profundidade dos furos passa da altura (${fmt(pc.altura)} mm).`);
        if ((pc.furos || []).filter((f) => f.passante).length && (pc.furos || []).length > 1) out.push(`${nome}: com furo passante, use só um furo.`);
        if (new Set((pc.furos || []).map((f) => f.face)).size < (pc.furos || []).length) out.push(`${nome}: dois furos na mesma face.`);
      }
      for (const o of [pc, ...(pc.furos || [])]) if (o.passo && o.diametro && o.passo > o.diametro / 2) out.push(`${nome}: passo grande demais para o diâmetro.`);
    }
    return out;
  }

  const dlg = document.createElement('dialog');
  dlg.className = 'foto-dialog'; dlg.id = 'narrarDialog';
  document.body.appendChild(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  const fechar = () => dlg.close();
  function abrir(html) { dlg.innerHTML = html; if (!dlg.open) dlg.showModal(); }

  const btn = document.createElement('button');
  btn.id = 'narrarButton'; btn.type = 'button'; btn.className = 'secondary-button foto-button';
  btn.textContent = '🎙️ Narrar peça';
  btn.title = 'Fale ou escreva a peça que quer criar';
  $('cupExample')?.insertAdjacentElement('beforebegin', btn);
  btn.addEventListener('click', telaTexto);

  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let ouvindo = null;
  function telaTexto() {
    abrir(`<h3>Narrar peça</h3>
      <p class="foto-sub">Fale ou escreva o que quer criar, com as medidas. Ex.: <em>peça de diâmetro 20 mm e altura 15 mm, com rosca M6 de 7 mm de profundidade no topo, e um parafuso allen para essa rosca com 12 mm.</em></p>
      <textarea id="narrarTexto" rows="5" class="narrar-texto" placeholder="Descreva a peça…">${esc(spec?.texto || '')}</textarea>
      <div class="foto-acoes narrar-acoes">
        ${Rec ? '<button type="button" class="secondary-button" data-x="mic">🎙️ Falar</button>' : ''}
        <button type="button" class="secondary-button" data-x="manual">Montar sem IA</button>
        <span style="flex:1"></span>
        <button type="button" class="secondary-button" data-x="fechar">Cancelar</button>
        <button type="button" class="primary-button" data-x="ir">Interpretar</button></div>
      <p id="narrarMsg" class="foto-fecho"></p>`);
    dlg.querySelector('[data-x=fechar]').onclick = () => { ouvindo?.stop(); fechar(); };
    dlg.querySelector('[data-x=manual]').onclick = () => { spec = { pecas: [], folga: 0, avisos: [], texto: $('narrarTexto').value }; formulario(); };
    dlg.querySelector('[data-x=ir]').onclick = interpretar;
    const mic = dlg.querySelector('[data-x=mic]');
    if (mic) mic.onclick = () => {
      if (ouvindo) { ouvindo.stop(); return; }
      const r = new Rec(); r.lang = 'pt-BR'; r.interimResults = true; r.continuous = true;
      const base = $('narrarTexto').value ? $('narrarTexto').value.trim() + ' ' : '';
      r.onresult = (e) => { $('narrarTexto').value = base + [...e.results].map((x) => x[0].transcript).join(' '); };
      r.onend = () => { ouvindo = null; mic.textContent = '🎙️ Falar'; };
      r.onerror = (e) => { $('narrarMsg').textContent = e.error === 'not-allowed' ? 'Permita o microfone no navegador.' : 'Não consegui ouvir. Tente de novo ou escreva.'; };
      r.start(); ouvindo = r; mic.textContent = '⏹ Parar';
    };
  }

  async function interpretar() {
    ouvindo?.stop();
    const texto = $('narrarTexto').value.trim();
    if (!texto) { $('narrarMsg').textContent = 'Escreva ou fale a descrição primeiro.'; return; }
    if (!window.TRACO_LER_URL) { $('narrarMsg').textContent = 'A IA ainda não está ligada (faltam os segredos no GitHub). Use "Montar sem IA" por enquanto.'; return; }
    $('narrarMsg').textContent = 'Interpretando…';
    try {
      const r = await fetch(window.TRACO_LER_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto }) });
      const j = await r.json().catch(() => ({ erro: 'Resposta inválida do servidor.' }));
      if (!r.ok || j.erro) throw new Error(j.erro || `Erro ${r.status}`);
      spec = normalizar({ ...j, _texto: texto }); normas(); formulario();
    } catch (e) { $('narrarMsg').textContent = String(e.message || e); }
  }

  function campo(path, valor, rot, auto) {
    return `<label class="${valor == null ? 'falta' : ''}">${rot}<span><input data-p="${path}" inputmode="decimal" value="${fmt(valor)}" placeholder="falta" /> mm</span>${auto ? '<small>ISO</small>' : ''}</label>`;
  }
  function formulario() {
    const blocos = spec.pecas.map((pc, i) => {
      const linhas = CAMPOS[pc.tipo].map(([k, rot]) => campo(`${i}.${k}`, pc[k], rot, pc.auto?.[k])).join('');
      const cab = pc.tipo === 'parafuso' ? `<label class="${pc.cabeca ? '' : 'falta'}">Cabeça<select data-p="${i}.cabeca"><option value="">— escolha —</option>
          ${[['sextavada', 'Sextavada (ISO 4017)'], ['allen', 'Allen cilíndrica (ISO 4762)'], ['sem_cabeca', 'Sem cabeça (barra roscada)']].map(([v, t]) => `<option value="${v}" ${pc.cabeca === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : '';
      const furos = (pc.furos || []).map((f, fi) => `<div class="narrar-furo"><strong>Furo ${fi + 1}</strong>
          <label>Face<select data-p="${i}.furos.${fi}.face"><option value="topo" ${f.face === 'topo' ? 'selected' : ''}>Topo</option><option value="base" ${f.face === 'base' ? 'selected' : ''}>Base</option></select></label>
          <label><input type="checkbox" data-p="${i}.furos.${fi}.rosca" ${f.rosca ? 'checked' : ''}/> Roscado</label>
          ${campo(`${i}.furos.${fi}.diametro`, f.diametro, f.rosca ? 'Rosca M (diâmetro)' : 'Diâmetro')}
          ${f.rosca ? campo(`${i}.furos.${fi}.passo`, f.passo, 'Passo', f.auto?.passo) : ''}
          <label><input type="checkbox" data-p="${i}.furos.${fi}.passante" ${f.passante ? 'checked' : ''}/> Passante</label>
          ${f.passante ? '' : campo(`${i}.furos.${fi}.profundidade`, f.profundidade, 'Profundidade')}
          <button type="button" class="text-button" data-del-furo="${i}.${fi}">remover furo</button></div>`).join('');
      const addFuro = (pc.tipo === 'cilindro' || pc.tipo === 'bloco') && (pc.furos || []).length < 2 ? `<button type="button" class="text-button" data-add-furo="${i}">+ furo</button>` : '';
      return `<fieldset class="narrar-peca"><legend>${esc(pc.nome || NOMES[pc.tipo])} · ${NOMES[pc.tipo]} <button type="button" class="text-button" data-del="${i}">remover</button></legend>
        <div class="narrar-campos">${linhas}${cab}</div>${furos}${addFuro}</fieldset>`;
    }).join('');
    abrir(`<h3>Confira as medidas</h3>
      ${spec.texto ? `<p class="foto-sub">“${esc(spec.texto)}”</p>` : ''}
      ${spec.avisos.length ? `<ul class="foto-avisos">${spec.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      ${blocos || '<p class="foto-sub">Nenhuma peça ainda. Adicione abaixo.</p>'}
      <div class="narrar-add">Adicionar: ${Object.entries(NOMES).map(([t, n]) => `<button type="button" class="secondary-button" data-add="${t}">${n}</button>`).join('')}</div>
      <label class="narrar-folga">Folga para impressão 3D <span><input data-p="folga" inputmode="decimal" value="${fmt(spec.folga) || '0'}" /> mm</span><small>0 = medida nominal. Rosca impressa costuma pedir folga.</small></label>
      <p id="narrarMsg" class="foto-fecho"></p>
      <div class="foto-acoes"><button type="button" class="secondary-button" data-x="voltar">← Texto</button><span style="flex:1"></span>
        <button type="button" class="secondary-button" data-x="fechar">Cancelar</button>
        <button type="button" class="primary-button" data-x="gerar">Gerar 3D</button></div>`);
    dlg.querySelector('[data-x=fechar]').onclick = fechar;
    dlg.querySelector('[data-x=voltar]').onclick = telaTexto;
    dlg.querySelector('[data-x=gerar]').onclick = gerar;
    dlg.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => {
      const t = b.dataset.add, pc = { tipo: t, nome: NOMES[t], auto: {} };
      for (const [k] of CAMPOS[t]) pc[k] = null;
      if (t === 'parafuso') pc.cabeca = null;
      if (t === 'cilindro' || t === 'bloco') pc.furos = [];
      spec.pecas.push(pc); formulario();
    });
    dlg.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { spec.pecas.splice(+b.dataset.del, 1); formulario(); });
    dlg.querySelectorAll('[data-add-furo]').forEach((b) => b.onclick = () => {
      const pc = spec.pecas[+b.dataset.addFuro];
      pc.furos.push({ face: pc.furos.some((f) => f.face === 'topo') ? 'base' : 'topo', rosca: false, diametro: null, passo: null, profundidade: null, passante: false, auto: {} });
      formulario();
    });
    dlg.querySelectorAll('[data-del-furo]').forEach((b) => b.onclick = () => { const [i, fi] = b.dataset.delFuro.split('.').map(Number); spec.pecas[i].furos.splice(fi, 1); formulario(); });
    dlg.querySelectorAll('[data-p]').forEach((el) => el.addEventListener('change', () => {
      const path = el.dataset.p.split('.');
      if (path[0] === 'folga') { spec.folga = Number(String(el.value).replace(',', '.')) || 0; return estado(); }
      let alvo = spec.pecas[+path[0]]; const rest = path.slice(1);
      if (rest[0] === 'furos') { alvo = alvo.furos[+rest[1]]; rest.splice(0, 2); }
      const k = rest[0];
      if (el.type === 'checkbox') { alvo[k] = el.checked; if (k === 'rosca' && el.checked) { alvo.auto = {}; normasUm(alvo); } formulario(); return; }
      if (el.tagName === 'SELECT') { alvo[k] = el.value || null; if (k === 'cabeca') formulario(); else estado(); return; }
      alvo[k] = num(el.value); if (alvo.auto) delete alvo.auto[k];
      if (k === 'diametro' && (alvo.tipo === 'parafuso' || alvo.tipo === 'porca' || alvo.rosca) && alvo.auto?.passo !== false) {
        if (alvo.passo == null || alvo.auto?.passo) { alvo.passo = null; normasUm(alvo); formulario(); return; }
      }
      el.closest('label')?.classList.toggle('falta', alvo[k] == null);
      estado();
    }));
    estado();
  }
  function normasUm(o) { o.auto = o.auto || {}; if (o.passo == null && PASSO[o.diametro]) { o.passo = PASSO[o.diametro]; o.auto.passo = true; } }
  function estado() {
    const f = faltas(), c = f.length ? [] : conflitos();
    const b = dlg.querySelector('[data-x=gerar]');
    b.disabled = !spec.pecas.length || f.length > 0 || c.length > 0;
    dlg.querySelector('#narrarMsg').textContent = f.length ? `Falta: ${f.join(' · ')}` : c.join(' ');
  }
  function gerar() {
    const limpo = { folga: spec.folga || 0, pecas: spec.pecas.map(({ auto, ...pc }) => ({ ...pc, furos: (pc.furos || []).map(({ auto: _a, ...f }) => f) })) };
    try {
      $('partsTab').click();
      window.tracoAbrirNarrado(limpo);
      fechar();
      // nuvem de partículas montando o que foi pedido; depois rola até o 3D
      const nomes = limpo.pecas.map((p) => p.nome).join(' + ');
      window.tracoRedemoinho?.(window.tracoNarrado.montar(limpo).tris, `Montando ${nomes}…`)
        .then(() => document.querySelector('.parts-workspace > .panel:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    } catch (e) { dlg.querySelector('#narrarMsg').textContent = 'Não consegui gerar: ' + (e.message || e); }
  }
})();
