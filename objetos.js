// Objetos na planta: biblioteca de móveis do Traço (paramétricos), modelos grátis do Poly Haven
// (domínio público) e importação de arquivos (OBJ, GLB/glTF, DAE/Collada do 3D Warehouse, STL).
// Cada objeto fica na planta (2D) e aparece no 3D; dá para mover, girar, mudar medidas e exportar.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (v) => String(+(+v).toFixed(2)).replace('.', ',');
  const O = { ativo: false, sel: null, pendente: null, drag: null };
  window.tracoObjetos = O;
  state.objetos = state.objetos || [];
  state.modelos = state.modelos || {};

  // ====================== BIBLIOTECA (caixas em metros, origem no centro, chão em z=0) ======================
  const MAD = '#a9744f', MAD2 = '#c9955f', TEC = '#7c8fa6', BRA = '#eeeeea', CIN = '#9aa0a3', PRE = '#3b3b3b', VID = '#bfe3ef', VER = '#6f9d63';
  const B = (x, y, z, w, d, h, c) => ({ x, y, z, w, d, h, c });
  const LIB = {
    cama_casal: { nome: 'Cama casal', cat: 'Quarto', dims: [1.38, 1.88, .55], f: (w, d, h) => [B(0, 0, 0, w, d, h * .55, MAD), B(0, .05, h * .55, w - .04, d - .14, h * .45, BRA), B(0, -d / 2 + .04, 0, w, .08, h * 1.7, MAD2), B(-w / 4, -d / 2 + .3, h, w / 2 - .1, .4, .12, '#fff'), B(w / 4, -d / 2 + .3, h, w / 2 - .1, .4, .12, '#fff')] },
    cama_solteiro: { nome: 'Cama solteiro', cat: 'Quarto', dims: [.88, 1.88, .55], f: (w, d, h) => [B(0, 0, 0, w, d, h * .55, MAD), B(0, .05, h * .55, w - .04, d - .14, h * .45, BRA), B(0, -d / 2 + .04, 0, w, .08, h * 1.7, MAD2), B(0, -d / 2 + .3, h, w - .2, .4, .12, '#fff')] },
    guarda_roupa: { nome: 'Guarda-roupa', cat: 'Quarto', dims: [1.6, .6, 2.1], f: (w, d, h) => [B(0, 0, 0, w, d, h, MAD2), B(0, d / 2 - .01, h / 2, .02, .02, h * .9, PRE)] },
    comoda: { nome: 'Cômoda', cat: 'Quarto', dims: [1.0, .45, .85], f: (w, d, h) => [B(0, 0, 0, w, d, h, MAD2), ...[.2, .45, .7].map((t) => B(0, d / 2, h * t, w * .9, .01, .02, PRE))] },
    sofa: { nome: 'Sofá', cat: 'Sala', dims: [2.0, .9, .85], f: (w, d, h) => [B(0, .05, 0, w - .3, d - .1, .42, TEC), B(0, -d / 2 + .1, 0, w, .2, h, TEC), B(-w / 2 + .08, .05, 0, .16, d - .1, .62, TEC), B(w / 2 - .08, .05, 0, .16, d - .1, .62, TEC)] },
    poltrona: { nome: 'Poltrona', cat: 'Sala', dims: [.8, .8, .85], f: (w, d, h) => [B(0, .05, 0, w - .3, d - .1, .42, TEC), B(0, -d / 2 + .1, 0, w, .2, h, TEC), B(-w / 2 + .08, .05, 0, .16, d - .1, .62, TEC), B(w / 2 - .08, .05, 0, .16, d - .1, .62, TEC)] },
    rack_tv: { nome: 'Rack + TV', cat: 'Sala', dims: [1.8, .45, 1.25], f: (w, d, h) => [B(0, 0, 0, w, d, .5, MAD2), B(0, 0, .5, .3, .2, .05, PRE), B(0, 0, .55, w * .7, .06, h - .55, PRE)] },
    mesa_centro: { nome: 'Mesa de centro', cat: 'Sala', dims: [1.0, .6, .4], f: (w, d, h) => [B(0, 0, h - .04, w, d, .04, MAD), ...pes(w, d, h - .04, .05, MAD)] },
    mesa_jantar: { nome: 'Mesa de jantar', cat: 'Cozinha', dims: [1.6, .9, .76], f: (w, d, h) => [B(0, 0, h - .04, w, d, .04, MAD), ...pes(w, d, h - .04, .06, MAD)] },
    cadeira: { nome: 'Cadeira', cat: 'Cozinha', dims: [.45, .5, .9], f: (w, d, h) => [B(0, .02, .43, w, d - .04, .04, MAD), ...pes(w, d - .04, .43, .04, MAD), B(0, -d / 2 + .02, .43, w, .03, h - .43, MAD)] },
    bancada_pia: { nome: 'Bancada com pia', cat: 'Cozinha', dims: [1.5, .6, .9], f: (w, d, h) => [B(0, 0, 0, w, d, h - .03, BRA), B(0, 0, h - .03, w, d, .03, CIN), B(w * .15, .03, h - .02, .5, .38, .01, '#cfd8dc')] },
    fogao: { nome: 'Fogão', cat: 'Cozinha', dims: [.6, .6, .85], f: (w, d, h) => [B(0, 0, 0, w, d, h, '#d8d8d8'), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => B(a * w / 4.5, b * d / 4.5, h, .14, .14, .02, PRE))] },
    geladeira: { nome: 'Geladeira', cat: 'Cozinha', dims: [.7, .7, 1.8], f: (w, d, h) => [B(0, 0, 0, w, d, h, '#e6e9ec'), B(w / 2 - .06, d / 2, h * .55, .02, .02, h * .35, CIN)] },
    vaso: { nome: 'Vaso sanitário', cat: 'Banheiro', dims: [.38, .65, .78], f: (w, d, h) => [B(0, .08, 0, w * .75, d * .65, .4, BRA), B(0, -d / 2 + .1, 0, w, .18, h, BRA)] },
    pia_banheiro: { nome: 'Pia de banheiro', cat: 'Banheiro', dims: [.6, .45, .85], f: (w, d, h) => [B(0, 0, 0, w * .9, d * .9, h - .12, MAD2), B(0, 0, h - .12, w, d, .12, BRA)] },
    box: { nome: 'Box de chuveiro', cat: 'Banheiro', dims: [.9, .9, 1.9], f: (w, d, h) => [B(0, 0, 0, w, d, .03, CIN), B(0, d / 2 - .01, .03, w, .01, h, VID), B(w / 2 - .01, 0, .03, .01, d, h, VID), B(-w / 2 + .1, -d / 2 + .1, h - .05, .2, .2, .03, CIN)] },
    escada: { nome: 'Escada reta', cat: 'Estrutura', dims: [.9, 3.0, 2.7], f: (w, d, h) => { const n = Math.max(3, Math.round(h / .18)), p = d / n; return Array.from({ length: n }, (_, i) => B(0, -d / 2 + p * (i + .5), 0, w, p, h * (i + 1) / n, CIN)); } },
    pilar: { nome: 'Pilar', cat: 'Estrutura', dims: [.2, .2, 2.8], f: (w, d, h) => [B(0, 0, 0, w, d, h, CIN)] },
    arvore: { nome: 'Árvore', cat: 'Externo', dims: [1.6, 1.6, 3.5], f: (w, d, h) => [B(0, 0, 0, .2, .2, h * .45, '#7a5232'), B(0, 0, h * .4, w, d, h * .45, VER), B(0, 0, h * .8, w * .6, d * .6, h * .2, VER)] },
    carro: { nome: 'Carro', cat: 'Externo', dims: [1.8, 4.3, 1.45], f: (w, d, h) => [B(0, 0, .2, w, d, h * .45, '#8a1c1c'), B(0, .2, .2 + h * .45, w * .9, d * .5, h * .4, '#4a5a6a'), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => B(a * (w / 2 - .12), b * d * .32, 0, .2, .6, .45, PRE))] },
  };
  function pes(w, d, h, s, c) { return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => B(a * (w / 2 - s), b * (d / 2 - s), 0, s, s, h, c)); }

  // ====================== GEOMETRIA ======================
  const BOXF = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  function boxTris(b) {
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, y0 = b.y - b.d / 2, y1 = b.y + b.d / 2, z0 = b.z, z1 = b.z + b.h;
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    return BOXF.flatMap(([a, b2, c, d]) => [[v[a], v[b2], v[c]], [v[a], v[c], v[d]]]);
  }
  // Triângulos do objeto já no mundo (metros): [{p:[[x,y,z]x3], c:'#hex'}]
  function trisMundo(o) {
    const [cx, cy] = worldPoint([o.x, o.y]), co = Math.cos(o.rot || 0), si = Math.sin(o.rot || 0);
    const tf = ([x, y, z]) => [cx + x * co - y * si, cy + x * si + y * co, z];
    const out = [];
    if (o.tipo === 'lib') {
      const L = LIB[o.ref]; if (!L) return out;
      for (const b of L.f(...o.dims)) for (const t of boxTris(b)) out.push({ p: t.map(tf), c: b.c });
    } else {
      const M = state.modelos[o.ref]; if (!M) return out;
      const sx = o.dims[0] / M.size[0], sy = o.dims[1] / M.size[1], sz = o.dims[2] / M.size[2], T = M.tris;
      for (let i = 0; i < T.length; i += 9) {
        const p = [0, 3, 6].map((k) => tf([T[i + k] * sx, T[i + k + 1] * sy, T[i + k + 2] * sz]));
        out.push({ p, c: M.pal[M.cor[i / 9]] || '#b9b1a8' });
      }
    }
    return out;
  }
  function sombra(c, p) {
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], L = Math.hypot(...n) || 1;
    const luz = .55 + .45 * Math.abs((n[0] * -.35 + n[1] * -.5 + n[2] * .8) / L);
    const h = c.replace('#', ''), k = [0, 2, 4].map((i) => Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) * luz)));
    return `rgb(${k[0]},${k[1]},${k[2]})`;
  }
  O.faces3d = (faces, toScreen) => {
    for (const o of state.objetos) for (const t of trisMundo(o)) {
      const corners = t.p.map(toScreen);
      faces.push({ corners, shade: sombra(t.c, t.p), depth: (corners[0].depth + corners[1].depth + corners[2].depth) / 3, imported: true });
    }
  };
  O.obj = (lines) => {
    let off = lines.filter((l) => l.startsWith('v ')).length + 1;
    state.objetos.forEach((o, i) => {
      lines.push(`o objeto_${i + 1}_${nomeDe(o).replace(/[^\w]+/g, '_')}`);
      for (const t of trisMundo(o)) { for (const q of t.p) lines.push(`v ${q.map((v) => v.toFixed(4)).join(' ')}`); lines.push(`f ${off} ${off + 1} ${off + 2}`); off += 3; }
    });
  };
  const nomeDe = (o) => o.tipo === 'lib' ? LIB[o.ref]?.nome || 'Objeto' : state.modelos[o.ref]?.nome || 'Modelo';

  // ====================== 2D ======================
  function cantos(o) {
    const ppm = state.pixelsPerMeter, w = o.dims[0] * ppm / 2, d = o.dims[1] * ppm / 2, co = Math.cos(o.rot || 0), si = Math.sin(o.rot || 0);
    return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, y]) => [o.x + x * co - y * si, o.y + x * si + y * co]);
  }
  function dentroObj(o, p) {
    const ppm = state.pixelsPerMeter, co = Math.cos(-(o.rot || 0)), si = Math.sin(-(o.rot || 0));
    const x = (p[0] - o.x) * co - (p[1] - o.y) * si, y = (p[0] - o.x) * si + (p[1] - o.y) * co;
    return Math.abs(x) <= o.dims[0] * ppm / 2 + 3 && Math.abs(y) <= o.dims[1] * ppm / 2 + 3;
  }
  O.desenhar = (ctx) => {
    const q = 1 / vk(), ppm = state.pixelsPerMeter;
    for (const o of state.objetos) {
      const c = cantos(o), sel = o === O.sel;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(...c[0]); for (const p of c.slice(1)) ctx.lineTo(...p); ctx.closePath();
      ctx.fillStyle = sel ? '#bbdefb99' : '#ffffffcc'; ctx.fill();
      ctx.strokeStyle = sel ? '#1565c0' : '#555'; ctx.lineWidth = (sel ? 2 : 1.2) * q; ctx.stroke();
      // contorno das peças (planta) para objetos da biblioteca
      if (o.tipo === 'lib' && LIB[o.ref]) {
        const co = Math.cos(o.rot || 0), si = Math.sin(o.rot || 0);
        ctx.lineWidth = .8 * q; ctx.strokeStyle = '#777';
        for (const b of LIB[o.ref].f(...o.dims)) {
          const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, e]) => { const x = (b.x + a * b.w / 2) * ppm, y = (b.y + e * b.d / 2) * ppm; return [o.x + x * co - y * si, o.y + x * si + y * co]; });
          ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.closePath(); ctx.stroke();
        }
      } else { ctx.setLineDash([3 * q, 3 * q]); ctx.beginPath(); ctx.moveTo(...c[0]); ctx.lineTo(...c[2]); ctx.moveTo(...c[1]); ctx.lineTo(...c[3]); ctx.stroke(); }
      ctx.setLineDash([]);
      ctx.font = `700 ${11 * q}px DM Sans, Arial, sans-serif`; ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(nomeDe(o), o.x, o.y);
      ctx.restore();
    }
    if (O.pendente && O.hover) {
      const fake = { ...O.pendente, x: O.hover[0], y: O.hover[1], rot: 0 };
      const c = cantos(fake); ctx.save(); ctx.setLineDash([5 * q, 4 * q]); ctx.strokeStyle = '#1565c0'; ctx.lineWidth = 1.5 * q;
      ctx.beginPath(); ctx.moveTo(...c[0]); for (const p of c.slice(1)) ctx.lineTo(...p); ctx.closePath(); ctx.stroke(); ctx.restore();
    }
  };

  // ====================== PERSISTÊNCIA ======================
  const _payload = window.projectPayload, _parse = window.parseProject;
  window.projectPayload = () => {
    const usados = {}; for (const o of state.objetos) if (o.tipo === 'modelo' && state.modelos[o.ref]) usados[o.ref] = state.modelos[o.ref];
    return { ..._payload(), objetos: state.objetos.map(({ tipo, ref, x, y, rot, dims }) => ({ tipo, ref, x, y, rot, dims })), modelos: usados };
  };
  window.parseProject = (raw) => {
    const r = _parse(raw); let j = null; try { j = JSON.parse(raw); } catch { /* */ }
    const num = (v) => Number.isFinite(v);
    r.modelos = {};
    for (const [k, m] of Object.entries(j?.modelos || {})) if (m && Array.isArray(m.tris) && m.tris.every(num) && Array.isArray(m.size) && Array.isArray(m.cor) && Array.isArray(m.pal)) r.modelos[k] = { nome: String(m.nome || 'Modelo').slice(0, 60), tris: m.tris, size: m.size, cor: m.cor, pal: m.pal.map(String) };
    r.objetos = (j?.objetos || []).filter((o) => o && ['lib', 'modelo'].includes(o.tipo) && num(o.x) && num(o.y) && Array.isArray(o.dims) && o.dims.length === 3 && o.dims.every((v) => num(v) && v > 0 && v < 100) &&
      (o.tipo === 'lib' ? LIB[o.ref] : r.modelos[o.ref])).map((o) => ({ tipo: o.tipo, ref: o.ref, x: o.x, y: o.y, rot: num(o.rot) ? o.rot : 0, dims: o.dims })).slice(0, 300);
    return r;
  };
  try { const raw = localStorage.getItem('traco-project-v1'); if (raw) { const r = parseProject(raw); state.objetos = r.objetos; state.modelos = r.modelos; } } catch { /* */ }
  const salvar = () => { saveProject(); refreshControls(); requestRender(); painel(); };

  // ====================== IMPORTADORES ======================
  const M4 = { id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    mul: (a, b) => { const r = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j]; return r; },
    ap: (m, [x, y, z]) => [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]] };
  const corHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')).join('');

  function parseObj(txt) {
    const v = [], tris = [], cores = []; let cor = '#b9b1a8'; const pal = {};
    const pc = ['#b9b1a8', '#a9744f', '#7c8fa6', '#9aa0a3', '#6f9d63', '#c9955f', '#eeeeea', '#3b3b3b'];
    for (const line of txt.split(/\r?\n/)) {
      const t = line.trim().split(/\s+/);
      if (t[0] === 'v') v.push([+t[1], +t[2], +t[3]]);
      else if (t[0] === 'usemtl') { if (!(t[1] in pal)) pal[t[1]] = pc[Object.keys(pal).length % pc.length]; cor = pal[t[1]]; }
      else if (t[0] === 'f') {
        const idx = t.slice(1).map((s) => { const i = parseInt(s, 10); return i < 0 ? v.length + i : i - 1; });
        for (let k = 1; k < idx.length - 1; k++) { tris.push([v[idx[0]], v[idx[k]], v[idx[k + 1]]]); cores.push(cor); }
      }
    }
    return { tris, cores, upY: true };
  }
  async function parseGltf(json, buffers, texColor) {
    if ((json.extensionsRequired || []).some((e) => /draco|meshopt/i.test(e))) throw new Error('Esse modelo usa compressão (Draco) que o Traço ainda não lê.');
    const acc = (i) => {
      const a = json.accessors[i], bv = json.bufferViews[a.bufferView], buf = buffers[bv.buffer];
      const comp = { 5126: [Float32Array, 4], 5125: [Uint32Array, 4], 5123: [Uint16Array, 2], 5121: [Uint8Array, 1] }[a.componentType];
      const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], stride = bv.byteStride || n * comp[1], off = (bv.byteOffset || 0) + (a.byteOffset || 0);
      const dv = new DataView(buf), out = [];
      for (let i2 = 0; i2 < a.count; i2++) {
        const row = [];
        for (let k = 0; k < n; k++) {
          const p = off + i2 * stride + k * comp[1];
          row.push(comp[0] === Float32Array ? dv.getFloat32(p, true) : comp[0] === Uint32Array ? dv.getUint32(p, true) : comp[0] === Uint16Array ? dv.getUint16(p, true) : dv.getUint8(p));
        }
        out.push(n === 1 ? row[0] : row);
      }
      return out;
    };
    const matCor = {};
    for (const [i, m] of (json.materials || []).entries()) {
      const p = m.pbrMetallicRoughness || {}, f = p.baseColorFactor || [1, 1, 1, 1];
      let c = [f[0], f[1], f[2]];
      if (p.baseColorTexture && texColor) { const t = await texColor(p.baseColorTexture.index).catch(() => null); if (t) c = [t[0] * f[0], t[1] * f[1], t[2] * f[2]]; }
      matCor[i] = corHex(...c);
    }
    const tris = [], cores = [];
    const local = (n) => {
      if (n.matrix) { const m = n.matrix; return [m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], 0, 0, 0, 1]; }
      const [tx, ty, tz] = n.translation || [0, 0, 0], [qx, qy, qz, qw] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1];
      const R = [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw), 2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw), 2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)];
      return [R[0] * sx, R[1] * sy, R[2] * sz, tx, R[3] * sx, R[4] * sy, R[5] * sz, ty, R[6] * sx, R[7] * sy, R[8] * sz, tz, 0, 0, 0, 1];
    };
    const visita = (ni, pai) => {
      const n = json.nodes[ni], m = M4.mul(pai, local(n));
      if (n.mesh != null) for (const pr of json.meshes[n.mesh].primitives) {
        if ((pr.mode ?? 4) !== 4 || pr.attributes.POSITION == null) continue;
        const pos = acc(pr.attributes.POSITION).map((p) => M4.ap(m, p));
        const ind = pr.indices != null ? acc(pr.indices) : pos.map((_, i) => i);
        const c = matCor[pr.material] || '#b9b1a8';
        for (let i = 0; i + 2 < ind.length; i += 3) { tris.push([pos[ind[i]], pos[ind[i + 1]], pos[ind[i + 2]]]); cores.push(c); }
      }
      for (const ch of n.children || []) visita(ch, m);
    };
    const cena = json.scenes?.[json.scene || 0];
    for (const ni of cena ? cena.nodes : json.nodes.map((_, i) => i)) visita(ni, M4.id());
    return { tris, cores, upY: true };
  }
  async function parseGlb(buf) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('GLB inválido');
    let off = 12, json = null, bin = null;
    while (off < buf.byteLength) {
      const len = dv.getUint32(off, true), tipo = dv.getUint32(off + 4, true), dados = buf.slice(off + 8, off + 8 + len);
      if (tipo === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(dados)); else if (tipo === 0x004E4942) bin = dados;
      off += 8 + len;
    }
    const texColor = async (ti) => {
      const img = json.images?.[json.textures?.[ti]?.source]; if (!img || img.bufferView == null) return null;
      const bv = json.bufferViews[img.bufferView];
      return mediaImagem(URL.createObjectURL(new Blob([bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)], { type: img.mimeType })));
    };
    return parseGltf(json, [bin], texColor);
  }
  async function mediaImagem(url) {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 4; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 4, 4);
    const d = x.getImageData(0, 0, 4, 4).data; let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const k = 1 / (16 * 255); return [Math.min(1, r * k * 1.15), Math.min(1, g * k * 1.15), Math.min(1, b * k * 1.15)];
  }
  function parseDae(txt) {
    const doc = new DOMParser().parseFromString(txt, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('DAE inválido');
    const byId = (id) => doc.getElementById(id.replace(/^#/, '')) || doc.querySelector(`[id="${id.replace(/^#/, '')}"]`);
    const up = doc.querySelector('asset up_axis')?.textContent?.trim() || 'Y_UP';
    const metro = +(doc.querySelector('asset unit')?.getAttribute('meter') || 1);
    const nums = (el) => el.textContent.trim().split(/\s+/).map(Number);
    const matCor = (matId) => {
      const mat = byId(matId); const eff = mat && byId(mat.querySelector('instance_effect')?.getAttribute('url') || '');
      const col = eff?.querySelector('diffuse color'); if (col) { const c = nums(col); return corHex(c[0], c[1], c[2]); }
      return '#b9b1a8';
    };
    const tris = [], cores = [];
    const geo = (gid, m, bind) => {
      const g = byId(gid); if (!g) return;
      for (const prim of g.querySelectorAll('mesh > triangles, mesh > polylist, mesh > polygons')) {
        const inputs = [...prim.querySelectorAll(':scope > input')], stride = Math.max(...inputs.map((i) => +i.getAttribute('offset'))) + 1;
        const vin = inputs.find((i) => i.getAttribute('semantic') === 'VERTEX'), voff = +vin.getAttribute('offset');
        const verts = byId(vin.getAttribute('source')), src = byId(verts.querySelector('input[semantic=POSITION]').getAttribute('source'));
        const fa = nums(src.querySelector('float_array')), pos = []; for (let i = 0; i + 2 < fa.length; i += 3) pos.push(M4.ap(m, [fa[i], fa[i + 1], fa[i + 2]]));
        const c = matCor(bind[prim.getAttribute('material')] || prim.getAttribute('material') || '');
        const ps = [...prim.querySelectorAll(':scope > p')].map(nums);
        if (prim.tagName === 'triangles') { const p = ps[0] || []; for (let i = 0; i + 3 * stride <= p.length; i += 3 * stride) { tris.push([pos[p[i + voff]], pos[p[i + stride + voff]], pos[p[i + 2 * stride + voff]]]); cores.push(c); } }
        else {
          const vc = prim.tagName === 'polylist' ? nums(prim.querySelector('vcount')) : null;
          const listas = prim.tagName === 'polylist' ? (() => { const p = ps[0] || [], out = []; let k = 0; for (const n of vc) { out.push(p.slice(k, k + n * stride)); k += n * stride; } return out; })() : ps;
          for (const p of listas) { const idx = []; for (let i = 0; i < p.length; i += stride) idx.push(p[i + voff]); for (let k = 1; k < idx.length - 1; k++) { tris.push([pos[idx[0]], pos[idx[k]], pos[idx[k + 1]]]); cores.push(c); } }
        }
      }
    };
    const xform = (node) => {
      let m = M4.id();
      for (const el of node.children) {
        const v = el.textContent.trim().split(/\s+/).map(Number);
        if (el.tagName === 'matrix') m = M4.mul(m, v);
        else if (el.tagName === 'translate') m = M4.mul(m, [1, 0, 0, v[0], 0, 1, 0, v[1], 0, 0, 1, v[2], 0, 0, 0, 1]);
        else if (el.tagName === 'scale') m = M4.mul(m, [v[0], 0, 0, 0, 0, v[1], 0, 0, 0, 0, v[2], 0, 0, 0, 0, 1]);
        else if (el.tagName === 'rotate') { const [x, y, z, a] = v, r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), t = 1 - c, L = Math.hypot(x, y, z) || 1, X = x / L, Y = y / L, Z = z / L;
          m = M4.mul(m, [t * X * X + c, t * X * Y - s * Z, t * X * Z + s * Y, 0, t * X * Y + s * Z, t * Y * Y + c, t * Y * Z - s * X, 0, t * X * Z - s * Y, t * Y * Z + s * X, t * Z * Z + c, 0, 0, 0, 0, 1]); }
      }
      return m;
    };
    let guarda = 0;
    const visita = (node, pai) => {
      if (++guarda > 20000) return;
      const m = M4.mul(pai, xform(node));
      for (const ig of node.querySelectorAll(':scope > instance_geometry')) {
        const bind = {}; for (const im of ig.querySelectorAll('instance_material')) bind[im.getAttribute('symbol')] = im.getAttribute('target');
        geo(ig.getAttribute('url'), m, bind);
      }
      for (const inn of node.querySelectorAll(':scope > instance_node')) { const n = byId(inn.getAttribute('url')); if (n) visita(n, m); }
      for (const ch of node.querySelectorAll(':scope > node')) visita(ch, m);
    };
    const cenaUrl = doc.querySelector('scene instance_visual_scene')?.getAttribute('url');
    const cena = cenaUrl ? byId(cenaUrl) : doc.querySelector('visual_scene');
    for (const n of cena.querySelectorAll(':scope > node')) visita(n, [metro, 0, 0, 0, 0, metro, 0, 0, 0, 0, metro, 0, 0, 0, 0, 1]);
    return { tris, cores, upY: up === 'Y_UP', jaMetros: true };
  }
  function parseStlBuf(buf) {
    const dv = new DataView(buf), n = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0, tris = [];
    if (84 + n * 50 === buf.byteLength) {
      for (let i = 0; i < n; i++) { const o = 84 + i * 50 + 12; tris.push([0, 1, 2].map((v) => [0, 1, 2].map((a) => dv.getFloat32(o + v * 12 + a * 4, true)))); }
    } else {
      const t = new TextDecoder().decode(buf), vs = [...t.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
      for (let i = 0; i + 2 < vs.length; i += 3) tris.push([vs[i], vs[i + 1], vs[i + 2]]);
    }
    return { tris, cores: tris.map(() => '#b9b1a8'), upY: false };
  }

  // Normaliza: (opcional) Y para cima → Z para cima, unidade → metros, centraliza, chão em z=0 e simplifica.
  const LIMITE = 3500;
  function normalizar(bruto, fator, upY) {
    let tris = bruto.tris.filter((t) => t.every((p) => p && p.every(Number.isFinite)));
    if (!tris.length) throw new Error('Nenhuma face encontrada no arquivo.');
    tris = tris.map((t) => t.map(([x, y, z]) => (upY ? [x * fator, -z * fator, y * fator] : [x * fator, y * fator, z * fator])));
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const t of tris) for (const p of t) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
    const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]];
    tris = tris.map((t) => t.map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]));
    let cores = bruto.cores.slice(0, tris.length);
    const size = [Math.max(1e-3, mx[0] - mn[0]), Math.max(1e-3, mx[1] - mn[1]), Math.max(1e-3, mx[2] - mn[2])];
    if (tris.length > LIMITE) { // simplifica agrupando vértices numa grade (mantém a forma)
      const ext = Math.max(...size);
      for (let N = 160; N >= 8; N = Math.floor(N * .8)) {
        const cel = ext / N, k = (p) => p.map((v) => Math.round(v / cel)).join(','), vis = new Set(), nt = [], nc = [];
        tris.forEach((t, i) => {
          const ks = t.map(k); if (ks[0] === ks[1] || ks[1] === ks[2] || ks[0] === ks[2]) return;
          const key = [...ks].sort().join('|'); if (vis.has(key)) return; vis.add(key);
          nt.push(t.map((p) => p.map((v) => Math.round(v / cel) * cel))); nc.push(cores[i]);
        });
        if (nt.length <= LIMITE) { tris = nt; cores = nc; break; }
      }
      if (tris.length > LIMITE) { const s = Math.ceil(tris.length / LIMITE); tris = tris.filter((_, i) => i % s === 0); cores = cores.filter((_, i) => i % s === 0); }
    }
    const pal = [...new Set(cores)];
    return { size, tris: tris.flat(2).map((v) => Math.round(v * 1000) / 1000), cor: cores.map((c) => pal.indexOf(c)), pal };
  }

  // ====================== FERRAMENTA "OBJETOS" ======================
  const linha = document.querySelector('#architectureMode .tools-row');
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'tool'; btn.textContent = '🪑 Objetos'; btn.title = 'Móveis da biblioteca, modelos grátis e importação (OBJ, GLB, DAE, STL)';
  linha.insertBefore(btn, linha.querySelector('.tool-divider'));
  btn.onclick = () => { ligar(); abrirBiblioteca(); };
  function ligar() {
    if (window.tracoFerramentas) window.tracoFerramentas.tool = null;
    window.setTool('ext'); O.ativo = true; btn.classList.add('active');
    document.querySelectorAll('[data-ext]').forEach((b) => b.classList.remove('active'));
    $('measureBox').hidden = true;
    $('toolHint').textContent = 'Objetos: arraste para mover · toque para selecionar e editar';
  }
  const _st = window.setTool;
  window.setTool = (t) => { if (t !== 'ext') desligar(); _st(t); };
  document.querySelectorAll('[data-ext]').forEach((b) => b.addEventListener('click', desligar));
  function desligar() { O.ativo = false; O.pendente = null; O.sel = null; btn.classList.remove('active'); painel(); requestRender(); }

  sketchCanvas.addEventListener('pointerdown', (ev) => {
    if (!O.ativo || window.tracoFerramentas?.tool || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    const p = sketchPoint(ev);
    if (O.pendente) {
      state.objetos.push({ ...O.pendente, x: p[0], y: p[1], rot: 0 });
      O.sel = state.objetos.at(-1); O.pendente = null; salvar();
      $('toolHint').textContent = 'Colocado. Arraste para ajustar · edite as medidas no painel';
      return;
    }
    const alvo = [...state.objetos].reverse().find((o) => dentroObj(o, p));
    O.sel = alvo || null; painel();
    if (alvo) { O.drag = { id: ev.pointerId, dx: alvo.x - p[0], dy: alvo.y - p[1] }; sketchCanvas.setPointerCapture(ev.pointerId); }
    requestRender();
  }, { capture: true });
  sketchCanvas.addEventListener('pointermove', (ev) => {
    if (!O.ativo || window.tracoFerramentas?.tool) return;
    ev.stopImmediatePropagation();
    const p = sketchPoint(ev);
    if (O.pendente) { O.hover = p; requestRender(); return; }
    if (O.drag && O.drag.id === ev.pointerId && O.sel) {
      const g = state.pixelsPerMeter / 20; // encaixe de 5 cm
      O.sel.x = Math.round((p[0] + O.drag.dx) / g) * g; O.sel.y = Math.round((p[1] + O.drag.dy) / g) * g; requestRender();
    }
  }, { capture: true });
  for (const tp of ['pointerup', 'pointercancel']) sketchCanvas.addEventListener(tp, (ev) => {
    if (!O.ativo || window.tracoFerramentas?.tool) return;
    ev.stopImmediatePropagation();
    if (O.drag) { O.drag = null; salvar(); }
  }, { capture: true });
  window.addEventListener('keydown', (ev) => {
    if (!O.ativo || !O.sel || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); excluir(); }
    if (ev.key === 'r' || ev.key === 'R') { O.sel.rot = ((O.sel.rot || 0) + Math.PI / 2) % (2 * Math.PI); salvar(); }
    if (ev.key === 'Escape') { O.sel = null; O.pendente = null; painel(); requestRender(); }
  });

  // painel do objeto selecionado
  const pn = document.createElement('div'); pn.className = 'obj-painel'; pn.hidden = true;
  document.querySelector('#architectureMode .sketch-wrap').appendChild(pn);
  pn.addEventListener('pointerdown', (e) => e.stopPropagation());
  function excluir() { state.objetos = state.objetos.filter((o) => o !== O.sel); O.sel = null; salvar(); }
  function painel() {
    const o = O.sel; pn.hidden = !o || !O.ativo; if (pn.hidden) return;
    pn.innerHTML = `<strong>${esc(nomeDe(o))}</strong>
      <div class="obj-dims">${['Larg.', 'Prof.', 'Alt.'].map((r, i) => `<label>${r}<input data-d="${i}" inputmode="decimal" value="${nf(o.dims[i])}" /> m</label>`).join('')}</div>
      <div class="obj-acoes"><button type="button" data-a="rot">⟲ 90°</button><button type="button" data-a="dup">Duplicar</button><button type="button" data-a="del">Excluir</button></div>`;
    pn.querySelectorAll('[data-d]').forEach((inp) => inp.onchange = () => {
      const v = window.tracoConta?.(inp.value) ?? Number(inp.value.replace(',', '.')); if (!(v > .01 && v < 100)) { inp.value = nf(o.dims[inp.dataset.d]); return; }
      o.dims[+inp.dataset.d] = v; salvar();
    });
    pn.querySelector('[data-a=rot]').onclick = () => { o.rot = ((o.rot || 0) + Math.PI / 2) % (2 * Math.PI); salvar(); };
    pn.querySelector('[data-a=dup]').onclick = () => { const n = { ...o, dims: [...o.dims], x: o.x + state.pixelsPerMeter * .3, y: o.y + state.pixelsPerMeter * .3 }; state.objetos.push(n); O.sel = n; salvar(); };
    pn.querySelector('[data-a=del]').onclick = excluir;
  }

  // ====================== JANELA DA BIBLIOTECA ======================
  const dlg = document.createElement('dialog'); dlg.className = 'foto-dialog lib-dialog'; document.body.appendChild(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  const fin = document.createElement('input'); fin.type = 'file'; fin.accept = '.obj,.glb,.gltf,.dae,.stl'; fin.hidden = true; document.body.appendChild(fin);
  let aba = 'traco', phCache = null;
  function escolher(pend, msg) { O.pendente = pend; dlg.close(); ligar(); $('toolHint').textContent = msg || 'Clique na planta para colocar'; requestRender(); }
  function abrirBiblioteca() {
    const abas = `<div class="lib-abas">${[['traco', 'Móveis do Traço'], ['ph', 'Grátis (Poly Haven)'], ['arq', 'Importar arquivo']].map(([k, r]) => `<button type="button" data-aba="${k}" class="${aba === k ? 'on' : ''}">${r}</button>`).join('')}</div>`;
    let corpo = '';
    if (aba === 'traco') {
      const cats = [...new Set(Object.values(LIB).map((l) => l.cat))];
      corpo = cats.map((c) => `<h4>${c}</h4><div class="lib-grade">${Object.entries(LIB).filter(([, l]) => l.cat === c).map(([k, l]) => `<button type="button" data-lib="${k}"><b>${l.nome}</b><small>${l.dims.map(nf).join(' × ')} m</small></button>`).join('')}</div>`).join('');
    } else if (aba === 'ph') {
      corpo = `<p class="foto-sub">Modelos 3D de domínio público (CC0) do Poly Haven. Toque para baixar e colocar.</p>
        <input type="search" id="phBusca" class="lib-busca" placeholder="Buscar (ex.: chair, table, sofa, lamp, plant)" />
        <div id="phLista" class="lib-grade ph">Carregando…</div>`;
    } else {
      corpo = `<p class="foto-sub">Abra um modelo baixado: <b>OBJ</b>, <b>GLB/glTF</b>, <b>DAE (Collada)</b> ou <b>STL</b>.<br>
        Do <b>3D Warehouse</b>: na página do modelo, toque em <b>Baixar</b> e escolha <b>Collada (.dae)</b> quando aparecer; os arquivos .skp o Traço não lê.</p>
        <button type="button" class="primary-button" data-x="arquivo">Escolher arquivo…</button>
        <p id="impMsg" class="foto-fecho"></p>
        ${Object.keys(state.modelos).length ? `<h4>Modelos já importados</h4><div class="lib-grade">${Object.entries(state.modelos).map(([k, m]) => `<button type="button" data-mod="${k}"><b>${esc(m.nome)}</b><small>${m.size.map(nf).join(' × ')} m</small></button>`).join('')}</div>` : ''}`;
    }
    dlg.innerHTML = `<h3>Objetos</h3>${abas}<div class="lib-corpo">${corpo}</div><div class="foto-acoes"><button type="button" class="secondary-button" data-x="fechar">Fechar</button></div>`;
    dlg.querySelector('[data-x=fechar]').onclick = () => dlg.close();
    dlg.querySelectorAll('[data-aba]').forEach((b) => b.onclick = () => { aba = b.dataset.aba; abrirBiblioteca(); });
    dlg.querySelectorAll('[data-lib]').forEach((b) => b.onclick = () => escolher({ tipo: 'lib', ref: b.dataset.lib, dims: [...LIB[b.dataset.lib].dims] }, `Clique na planta para colocar: ${LIB[b.dataset.lib].nome}`));
    dlg.querySelectorAll('[data-mod]').forEach((b) => b.onclick = () => escolher({ tipo: 'modelo', ref: b.dataset.mod, dims: [...state.modelos[b.dataset.mod].size] }));
    const ba = dlg.querySelector('[data-x=arquivo]'); if (ba) ba.onclick = () => { fin.value = ''; fin.click(); };
    if (aba === 'ph') carregarPh();
    if (!dlg.open) dlg.showModal();
  }
  async function carregarPh() {
    const lista = $('phLista'), busca = $('phBusca');
    try {
      if (!phCache) phCache = await fetch('https://api.polyhaven.com/assets?t=models').then((r) => r.json());
      const mostra = () => {
        const q = busca.value.trim().toLowerCase();
        const itens = Object.entries(phCache).filter(([k, a]) => !q || k.includes(q) || (a.name || '').toLowerCase().includes(q) || (a.tags || []).some((t) => t.includes(q)) || (a.categories || []).some((t) => t.includes(q)))
          .sort((a, b) => (b[1].categories || []).includes('furniture') - (a[1].categories || []).includes('furniture')).slice(0, 60);
        lista.innerHTML = itens.map(([k, a]) => `<button type="button" data-ph="${k}"><img loading="lazy" src="https://cdn.polyhaven.com/asset_img/thumbs/${k}.png?width=160&height=120" alt="" /><b>${esc(a.name)}</b></button>`).join('') || 'Nada encontrado.';
        lista.querySelectorAll('[data-ph]').forEach((b) => b.onclick = () => baixarPh(b.dataset.ph, b));
      };
      busca.oninput = mostra; mostra();
    } catch { lista.textContent = 'Não consegui acessar o Poly Haven agora.'; }
  }
  async function baixarPh(id, b) {
    b.classList.add('carregando'); b.querySelector('b').textContent = 'Baixando…';
    try {
      const files = await fetch('https://api.polyhaven.com/files/' + id).then((r) => r.json());
      const g = files.gltf['1k'].gltf, json = await fetch(g.url).then((r) => r.json());
      const buffers = await Promise.all(json.buffers.map((bf) => fetch(g.include[bf.uri].url).then((r) => r.arrayBuffer())));
      const texColor = (ti) => { const img = json.images?.[json.textures?.[ti]?.source]; const inc = img && g.include[img.uri]; return inc ? mediaImagem(inc.url) : Promise.resolve(null); };
      const bruto = await parseGltf(json, buffers, texColor);
      const m = normalizar(bruto, 1, true);
      const ref = 'ph_' + id; state.modelos[ref] = { nome: phCache[id]?.name || id, ...m };
      escolher({ tipo: 'modelo', ref, dims: [...m.size] }, `Clique na planta para colocar: ${state.modelos[ref].nome} (${m.size.map(nf).join(' × ')} m)`);
    } catch (e) { b.classList.remove('carregando'); b.querySelector('b').textContent = 'Falhou: ' + (e.message || 'erro'); }
  }
  fin.addEventListener('change', async () => {
    const f = fin.files?.[0]; if (!f) return;
    const msg = $('impMsg'); if (msg) msg.textContent = 'Lendo…';
    try {
      if (f.size > 40e6) throw new Error('Arquivo grande demais (máx. 40 MB).');
      const ext = f.name.split('.').pop().toLowerCase();
      let bruto;
      if (ext === 'obj') bruto = parseObj(await f.text());
      else if (ext === 'glb') bruto = await parseGlb(await f.arrayBuffer());
      else if (ext === 'gltf') { const j = JSON.parse(await f.text()); if ((j.buffers || []).some((b) => !String(b.uri || '').startsWith('data:'))) throw new Error('Esse .gltf usa arquivos separados; exporte como .glb.');
        bruto = await parseGltf(j, await Promise.all(j.buffers.map((b) => fetch(b.uri).then((r) => r.arrayBuffer()))), null); }
      else if (ext === 'dae') bruto = parseDae(await f.text());
      else if (ext === 'stl') bruto = parseStlBuf(await f.arrayBuffer());
      else throw new Error('Formato não suportado. Use OBJ, GLB, DAE ou STL.');
      confirmarImport(f.name.replace(/\.[^.]+$/, ''), bruto);
    } catch (e) { if (msg) msg.textContent = e.message || 'Não consegui ler esse arquivo.'; }
  });
  function confirmarImport(nome, bruto) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const t of bruto.tris) for (const p of t) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
    const ext = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
    const pal = bruto.jaMetros ? 'm' : ext <= 20 ? 'm' : ext <= 600 ? 'cm' : 'mm';
    const F = { m: 1, cm: .01, mm: .001, pol: .0254 };
    const tam = (u) => [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]].map((v) => nf(v * F[u])).join(' × ');
    dlg.innerHTML = `<h3>Importar “${esc(nome)}”</h3><p class="foto-sub">${bruto.tris.length.toLocaleString('pt-BR')} triângulos. Confira a unidade pelo tamanho final.</p>
      <label class="imp-op">Unidade do arquivo <select id="impUn">${Object.keys(F).map((u) => `<option value="${u}" ${u === pal ? 'selected' : ''}>${u === 'pol' ? 'polegadas' : u} → ${tam(u)} m</option>`).join('')}</select></label>
      <label class="imp-op"><input type="checkbox" id="impUp" ${bruto.upY ? 'checked' : ''}/> O modelo veio “deitado” (eixo Y para cima) — colocar em pé</label>
      <p id="impMsg" class="foto-fecho"></p>
      <div class="foto-acoes"><button type="button" class="secondary-button" data-x="c">Cancelar</button><button type="button" class="primary-button" data-x="ok">Colocar na planta</button></div>`;
    dlg.querySelector('[data-x=c]').onclick = () => dlg.close();
    dlg.querySelector('[data-x=ok]').onclick = () => {
      try {
        const m = normalizar(bruto, F[$('impUn').value], $('impUp').checked);
        const ref = 'imp_' + Date.now().toString(36); state.modelos[ref] = { nome: nome.slice(0, 60), ...m };
        escolher({ tipo: 'modelo', ref, dims: [...m.size] }, `Clique na planta para colocar: ${nome} (${m.size.map(nf).join(' × ')} m)`);
      } catch (e) { $('impMsg').textContent = e.message; }
    };
    if (!dlg.open) dlg.showModal();
  }
  O._teste = { parseObj, parseDae, parseGlb, parseGltf, normalizar, LIB };
  requestRender(); refreshControls();
})();

// Botão "Novo projeto" (Arquitetura): limpa paredes, aberturas, objetos, guias, cotas, textos e STL.
(() => {
  const ex = document.getElementById('exampleButton'); if (!ex) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'secondary-button foto-button'; b.id = 'novoProjeto'; b.textContent = '📄 Novo projeto';
  b.title = 'Começar uma planta em branco (o desenho atual fica no Histórico)';
  ex.parentElement.insertBefore(b, ex.parentElement.firstChild);
  b.onclick = () => {
    const tem = state.strokes.length || (state.objetos || []).length || state.stlMesh ||
      ['guias', 'cotas', 'textos'].some((k) => (state.extras?.[k] || []).length);
    if (tem && !confirm('Começar um projeto novo? O desenho atual fica salvo no 📚 Histórico.')) return;
    try { window.tracoHistorico?.agora('planta'); } catch { /* */ }
    {
      if (state.modelTool === 'push') stopPush();
      cancelLine();
      recordHistory();
      state.strokes = []; state.openings = []; state.objetos = []; state.stlMesh = null; state.wallsRaised = false;
      state.extras = { guias: [], cotas: [], textos: [] };
      if (window.tracoObjetos) window.tracoObjetos.sel = null;
      saveProject(); refreshControls(); setView('foundation'); requestRender();
      notify('Projeto novo. Use Desfazer para voltar as paredes, ou abra pelo Histórico.');
    }
  };
})();
