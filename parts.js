(() => {
  const MAX_MM = 10_000_000;
  const MAX_POINTS = 128;
  const SIDES = 64;
  const STORAGE = 'traco-part-v1';
  const $ = (id) => document.getElementById(id);
  const sketch = $('partSketchCanvas');
  const model = $('partModelCanvas');
  const sketchCtx = sketch.getContext('2d');
  const modelCtx = model.getContext('2d');
  const example = { top: 90, bottom: 65, height: 110, wall: 2.5, base: 4 };
  const part = {
    mode: 'cup', cup: { ...example }, profile: [], closed: true,
    operation: 'revolve', extrudeDepth: 20, shapeType: null, holeDiameter: 0,
    helix: { diameter: 20, pitch: 5, turns: 5, thickness: 2 }, shapeTool: null, shapeDrag: null,
    selected: [0, 0], yaw: -.65, pitch: .45, zoom: 1, drag: null,
    drawLine: false, freehand: false, freehandDrag: null,
    pending: false, sketchPointer: null, view: { r: 60, z: 140 },
  };
  let scheduled = false;

  const display = (value) => Number(value.toFixed(2)).toString().replace('.', ',');
  const number = (raw) => {
    const value = Number(String(raw).trim().replace(',', '.'));
    return Number.isFinite(value) && value >= 0 && value <= MAX_MM ? value : null;
  };
  const validCup = (cup) => cup && Object.values(cup).every((value) =>
    Number.isFinite(value) && value > 0 && value <= MAX_MM) &&
    cup.wall < Math.min(cup.top, cup.bottom) / 2 && cup.base < cup.height;
  const cupProfile = (cup) => [
    [0, 0], [cup.bottom / 2, 0], [cup.top / 2, cup.height],
    [cup.top / 2 - cup.wall, cup.height],
    [cup.bottom / 2 - cup.wall, cup.base], [0, cup.base],
  ];
  const signedArea = (points) => points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    return sum + x * ny - nx * y;
  }, 0) / 2;
  const validProfile = (points) => Array.isArray(points) && points.length <= MAX_POINTS &&
    points.every((point) => Array.isArray(point) && point.length === 2 &&
      point.every((value) => Number.isFinite(value) && value >= 0 && value <= MAX_MM));
  function simpleProfile(points) {
    if (new Set(points.map(([r, z]) => `${r},${z}`)).size !== points.length) return false;
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) -
      (b[1] - a[1]) * (c[0] - a[0]);
    const on = (a, b, c) => Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) &&
      Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      for (let j = i + 1; j < points.length; j++) {
        if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
        const c = points[j], d = points[(j + 1) % points.length];
        const abC = cross(a, b, c), abD = cross(a, b, d);
        const cdA = cross(c, d, a), cdB = cross(c, d, b);
        if ((abC * abD < 0 && cdA * cdB < 0) ||
            (abC === 0 && on(a, b, c)) || (abD === 0 && on(a, b, d)) ||
            (cdA === 0 && on(c, d, a)) || (cdB === 0 && on(c, d, b))) return false;
      }
    }
    return true;
  }

  function save() {
    try { window.tracoHistorico?.mudou('peca'); } catch { /* opcional */ }
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ version: 1, kind: 'rotational-part',
        mode: part.mode, cup: part.cup, profile: part.profile, closed: part.closed,
        operation: part.operation, extrudeDepth: part.extrudeDepth,
        shapeType: part.shapeType, holeDiameter: part.holeDiameter, helix: part.helix, narrado: part.narrado, paint: part.paint }));
    } catch { $('profileStatus').textContent = 'Armazenamento indisponível; use Salvar peça.'; }
  }

  function openProject(raw) {
    const data = JSON.parse(raw);
    if (data?.version !== 1 || data.kind !== 'rotational-part' ||
        !['cup', 'custom'].includes(data.mode) || !validCup(data.cup) ||
        !validProfile(data.profile) || typeof data.closed !== 'boolean' ||
        (data.operation !== undefined && !['extrude', 'revolve', 'thread', 'spring', 'narrado'].includes(data.operation)) ||
        (data.operation === 'narrado' && (!data.narrado || !Array.isArray(data.narrado.pecas) || !data.narrado.pecas.length)) ||
        (data.shapeType !== undefined && data.shapeType !== null && !['rectangle', 'circle'].includes(data.shapeType)) ||
        (data.holeDiameter !== undefined && (!Number.isFinite(data.holeDiameter) || data.holeDiameter < 0 || data.holeDiameter > MAX_MM)) ||
        (data.helix !== undefined && (!data.helix || !['diameter', 'pitch', 'turns', 'thickness'].every((key) =>
          Number.isFinite(data.helix[key]) && data.helix[key] > 0 && data.helix[key] <= MAX_MM) ||
          !Number.isInteger(data.helix.turns) || data.helix.turns > 20 ||
          data.helix.thickness >= data.helix.diameter / 2 ||
          data.helix.pitch * data.helix.turns + data.helix.thickness > MAX_MM ||
          (data.operation === 'spring' && data.helix.pitch < data.helix.thickness))) ||
        (data.extrudeDepth !== undefined &&
          (!Number.isFinite(data.extrudeDepth) || data.extrudeDepth <= 0 || data.extrudeDepth > MAX_MM)) ||
        (data.mode === 'cup' && !data.closed) ||
        (data.mode === 'custom' && data.closed &&
          (data.profile.length < 3 || Math.abs(signedArea(data.profile)) < .001 ||
            !simpleProfile(data.profile))) ||
        (data.holeDiameter > 0 && (data.operation !== 'extrude' ||
          !['rectangle', 'circle'].includes(data.shapeType) ||
          data.holeDiameter >= Math.min(
            Math.max(...data.profile.map((p) => p[0])) - Math.min(...data.profile.map((p) => p[0])),
            Math.max(...data.profile.map((p) => p[1])) - Math.min(...data.profile.map((p) => p[1]))))))
      throw new Error('Projeto de peça inválido');
    part.mode = data.mode;
    part.operation = data.mode === 'cup' ? 'revolve' : data.operation ??
      (data.closed ? 'revolve' : 'extrude');
    part.extrudeDepth = data.extrudeDepth ?? 20;
    part.shapeType = data.shapeType ?? null;
    part.holeDiameter = data.holeDiameter ?? 0;
    part.helix = data.helix ?? { diameter: 20, pitch: 5, turns: 5, thickness: 2 };
    part.narrado = data.operation === 'narrado' ? data.narrado : null;
    part.paint = data.paint && typeof data.paint.key === 'string' && data.paint.cores && typeof data.paint.cores === 'object' ? data.paint : null;
    part.cup = { ...data.cup };
    part.profile = part.mode === 'cup' ? cupProfile(part.cup) : data.profile.map((p) => [...p]);
    part.closed = data.closed;
    part.drawLine = false;
    part.freehand = false;
    part.drawLine = part.mode === 'custom' && !part.closed;
    part.pending = false;
    part.shapeTool = null; part.shapeDrag = null;
    part.selected = [...(part.profile.at(-1) ?? [0, 0])];
    $('profileHint').textContent = part.freehand ?
      'Mão livre ativa. Arraste no corte a partir da ponta do perfil.' :
      'Novo perfil → Linha mm ou Mão livre';
    fitSketchView();
    refresh();
  }

  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) openProject(raw);
    else part.profile = cupProfile(part.cup);
  } catch { part.profile = cupProfile(part.cup); }
  fitSketchView();

  function resize(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
    }
    return { width: rect.width, height: rect.height, ratio };
  }

  function fitSketchView() {
    const points = part.profile.length ? part.profile : [[0, 0]];
    part.view = {
      r: (part.operation === 'spring' || part.operation === 'thread' ?
        part.helix.diameter : Math.max(10, ...points.map((point) => point[0]))) * 1.2,
      z: Math.max(10, ...points.map((point) => point[1])) * 1.2,
    };
    if (part.mode === 'custom' && part.profile.length < 2)
      part.view = { r: 60, z: 140 };
  }

  function sketchTransform(width, height) {
    const extent = part.view;
    const left = 42, right = width - 24, top = 26, bottom = height - 35;
    return {
      extent,
      screen: ([r, z]) => [left + (r - (extent.r0 || 0)) / extent.r * (right - left),
        bottom - (z - (extent.z0 || 0)) / extent.z * (bottom - top)],
      world: ([x, y]) => [Math.max(0, Math.min((extent.r0 || 0) + extent.r, (extent.r0 || 0) + (x - left) / (right - left) * extent.r)),
        Math.max(0, Math.min((extent.z0 || 0) + extent.z, (extent.z0 || 0) + (bottom - y) / (bottom - top) * extent.z))],
      left, right, top, bottom,
    };
  }

  function previewEndpoint() {
    if (!part.profile.length) return part.selected;
    const length = number($('profileLength').value);
    const rawAngle = $('profileAngle').value.trim();
    const angle = Number(rawAngle.replace(',', '.'));
    if (length == null || length < .01 || (rawAngle && !Number.isFinite(angle)))
      return part.selected;
    const [r, z] = part.profile.at(-1);
    if (rawAngle) return [r + Math.cos(angle * Math.PI / 180) * length,
      z + Math.sin(angle * Math.PI / 180) * length];
    const dx = part.selected[0] - r, dz = part.selected[1] - z;
    const direction = Math.hypot(dx, dz);
    return direction < .01 ? part.selected :
      [r + dx / direction * length, z + dz / direction * length];
  }

  function shapePoints(type, start, end) {
    const left = Math.min(start[0], end[0]), right = Math.max(start[0], end[0]);
    const bottom = Math.min(start[1], end[1]), top = Math.max(start[1], end[1]);
    if (right - left < .5 || top - bottom < .5) return [];
    if (type === 'rectangle') return [[left, bottom], [right, bottom], [right, top], [left, top]];
    const cx = (left + right) / 2, cz = (bottom + top) / 2;
    const radius = Math.min(right - left, top - bottom) / 2;
    return Array.from({ length: 64 }, (_, i) => {
      const angle = i * Math.PI * 2 / 64;
      return [cx + radius * Math.cos(angle), cz + radius * Math.sin(angle)];
    });
  }

  function drawSketch() {
    const { width, height, ratio } = resize(sketch);
    if (width < 2) return;
    const ctx = sketchCtx;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const t = sketchTransform(width, height);
    ctx.save();
    ctx.font = '11px DM Sans, Arial, sans-serif';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const x = t.left + (t.right - t.left) * i / 5;
      const y = t.bottom - (t.bottom - t.top) * i / 5;
      ctx.strokeStyle = i === 0 ? '#96b39f' : '#e1e8df';
      ctx.beginPath(); ctx.moveTo(x, t.top); ctx.lineTo(x, t.bottom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(t.left, y); ctx.lineTo(t.right, y); ctx.stroke();
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'center'; ctx.fillText(display((t.extent.r0 || 0) + t.extent.r * i / 5), x, t.bottom + 17);
      ctx.textAlign = 'right'; ctx.fillText(display((t.extent.z0 || 0) + t.extent.z * i / 5), t.left - 6, y + 4);
    }
    ctx.beginPath(); ctx.rect(t.left - 8, t.top - 8, t.right - t.left + 16, t.bottom - t.top + 16); ctx.clip();
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'left'; ctx.fillText(part.operation === 'extrude' && part.mode === 'custom' ?
      'PLANO' : 'EIXO', t.left + 5, t.top + 12);
    const generated = part.operation === 'spring' || part.operation === 'thread';
    if (generated) {
      const { diameter, pitch, turns, thickness } = part.helix;
      const height = pitch * turns;
      const radius = diameter / 2 - thickness / 2;
      const samples = turns * 48;
      ctx.beginPath();
      for (let i = 0; i <= samples; i++) {
        const z = height * i / samples;
        const phase = 2 * Math.PI * z / pitch;
        const x = part.operation === 'spring' ? diameter / 2 + radius * Math.cos(phase) :
          diameter / 2 - thickness + thickness *
          (1 - Math.abs(((i / samples * turns) % 1) * 2 - 1));
        const p = t.screen([x, z + (part.operation === 'spring' ? thickness / 2 : 0)]);
        if (i) ctx.lineTo(...p); else ctx.moveTo(...p);
      }
      ctx.strokeStyle = '#c57650'; ctx.lineWidth = part.operation === 'spring' ? 3 : 2.5;
      ctx.stroke();
      if (part.operation === 'thread') {
        ctx.beginPath();
        const bottom = t.screen([diameter / 2 - thickness, 0]);
        const top = t.screen([diameter / 2 - thickness, height]);
        ctx.moveTo(...bottom); ctx.lineTo(...top);
        ctx.strokeStyle = '#8caa92'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.fillStyle = '#111111'; ctx.textAlign = 'left';
      ctx.fillText(`${display(diameter)} mm · ${turns} voltas · passo ${display(pitch)} mm`,
        t.left + 5, t.top + 27);
    } else if (part.profile.length) {
      ctx.beginPath();
      const first = t.screen(part.profile[0]);
      ctx.moveTo(...first);
      for (const point of part.profile.slice(1)) ctx.lineTo(...t.screen(point));
      if (part.closed) ctx.closePath();
      if (part.closed) { ctx.fillStyle = '#c8795555'; ctx.fill(); }
      ctx.strokeStyle = '#c57650'; ctx.lineWidth = 3; ctx.stroke();
      for (const point of part.profile) {
        const [x, y] = t.screen(point);
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#ad6749'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    if (part.shapeDrag) {
      const outline = shapePoints(part.shapeDrag.type, part.shapeDrag.start, part.shapeDrag.end);
      if (outline.length) {
        ctx.beginPath(); ctx.moveTo(...t.screen(outline[0]));
        for (const point of outline.slice(1)) ctx.lineTo(...t.screen(point));
        ctx.closePath(); ctx.setLineDash([6, 4]); ctx.strokeStyle = '#286855';
        ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
      }
    }
    if (part.holeDiameter > 0 && part.closed && ['rectangle', 'circle'].includes(part.shapeType)) {
      const xs = part.profile.map((p) => p[0]), zs = part.profile.map((p) => p[1]);
      const center = t.screen([(Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...zs) + Math.max(...zs)) / 2]);
      const radius = part.holeDiameter / 2 / t.extent.r * (t.right - t.left);
      ctx.beginPath(); ctx.ellipse(center[0], center[1], radius,
        part.holeDiameter / 2 / t.extent.z * (t.bottom - t.top), 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#2e6044'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (part.freehandDrag?.points.length > 1) {
      ctx.beginPath();
      const first = t.screen(part.freehandDrag.points[0]);
      ctx.moveTo(...first);
      for (const point of part.freehandDrag.points.slice(1)) ctx.lineTo(...t.screen(point));
      ctx.strokeStyle = '#286855'; ctx.lineWidth = 2.5; ctx.stroke();
    }
    if (part.mode === 'custom' && part.drawLine && !part.closed && part.profile.length) {
      const preview = previewEndpoint();
      const start = t.screen(part.profile.at(-1)), end = t.screen(preview);
      const dr = preview[0] - part.profile.at(-1)[0];
      const dz = preview[1] - part.profile.at(-1)[1];
      ctx.beginPath(); ctx.moveTo(...start); ctx.lineTo(...end);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = part.infer?.kind === 'x' ? '#d0342c' : part.infer?.kind === 'y' ? '#2e9e4f' : '#286855';
      ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#111111'; ctx.textAlign = 'center';
      ctx.fillText(`${display(Math.hypot(dr, dz))} mm · ${display(Math.atan2(dz, dr) * 180 / Math.PI)}°`,
      (start[0] + end[0]) / 2, (start[1] + end[1]) / 2 - 9);
    }
    if (part.mode === 'custom' && part.drawLine && !part.closed && part.infer && !$('profileLength').value.trim()) {
      const at = t.screen(part.selected);
      ctx.save(); ctx.setLineDash([2, 4]); ctx.lineWidth = 1.5;
      for (const g of part.infer.guides) {
        const from = t.screen(g.from);
        ctx.beginPath(); ctx.moveTo(...from);
        ctx.lineTo(g.axis === 'h' ? at[0] : from[0], g.axis === 'h' ? from[1] : at[1]);
        ctx.strokeStyle = g.axis === 'h' ? '#d0342c' : '#2e9e4f'; ctx.stroke();
      }
      ctx.setLineDash([]);
      const k = part.infer.kind;
      if (k === 'point' || k === 'fechar') {
        ctx.beginPath(); ctx.arc(at[0], at[1], 7, 0, Math.PI * 2);
        ctx.fillStyle = '#144422'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      }
      const nomes = { ang: `Ângulo ${$('profileAngle').value}°`, point: 'Ponto final', fechar: 'Fechar perfil', x: 'No eixo vermelho', y: 'No eixo verde', align: 'A partir do ponto' };
      let txt = nomes[k];
      if ((k === 'x' || k === 'y') && part.infer.guides.length) txt += ' · a partir do ponto';
      if (txt) {
        ctx.font = '600 11px DM Sans, Arial, sans-serif';
        const w = ctx.measureText(txt).width + 12;
        let x = at[0] + 14, y = at[1] + 14;
        if (x + w > width) x = at[0] - 14 - w;
        if (y + 20 > height) y = at[1] - 34;
        ctx.fillStyle = 'rgba(255,255,240,.95)'; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.rect(x, y, w, 20); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#222'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, x + 6, y + 10); ctx.textBaseline = 'alphabetic';
      }
      ctx.restore();
    }
    if (!generated) {
      const [sx, sy] = t.screen(part.selected);
      ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#286855'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.fillStyle = '#111111'; ctx.textAlign = 'right';
    ctx.fillText(generated ? 'projeção · mm' :
      `${part.mode === 'custom' && part.operation === 'extrude' ? 'x' : 'r'} ${display(part.selected[0])} · ${part.mode === 'custom' && part.operation === 'extrude' ? 'y' : 'z'} ${display(part.selected[1])} mm`, width - 10, 20);
    ctx.restore();
  }

  function normal(a, b, c) {
    const u = b.map((value, i) => value - a[i]);
    const v = c.map((value, i) => value - a[i]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...n);
    return length > 1e-9 ? n.map((value) => value / length) : null;
  }

  function extrusionMesh() {
    const original = part.profile;
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - b[1]) -
      (b[1] - a[1]) * (c[0] - b[0]);
    const points = original.filter((point, i) =>
      Math.abs(cross(original[(i - 1 + original.length) % original.length], point,
        original[(i + 1) % original.length])) > 1e-7);
    if (points.length < 3 || !simpleProfile(points)) return [];
    const orientation = Math.sign(signedArea(points));
    if (!orientation) return [];
    const remaining = points.map((_, i) => i), caps = [];
    const contains = (p, a, b, c) => {
      const side = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) -
        (v[1] - u[1]) * (w[0] - u[0]);
      return side(a, b, p) * orientation >= -1e-7 &&
        side(b, c, p) * orientation >= -1e-7 &&
        side(c, a, p) * orientation >= -1e-7;
    };
    while (remaining.length > 3) {
      let found = false;
      for (let i = 0; i < remaining.length; i++) {
        const a = remaining[(i - 1 + remaining.length) % remaining.length];
        const b = remaining[i], c = remaining[(i + 1) % remaining.length];
        if (cross(points[a], points[b], points[c]) * orientation <= 1e-7) continue;
        if (remaining.some((index) => index !== a && index !== b && index !== c &&
          contains(points[index], points[a], points[b], points[c]))) continue;
        caps.push([a, b, c]); remaining.splice(i, 1); found = true; break;
      }
      if (!found) return [];
    }
    caps.push(remaining);
    const triangles = [], depth = part.extrudeDepth;
    const vertex = (index, y) => [points[index][0], y, points[index][1]];
    const add = (a, b, c) => {
      const n = normal(a, b, c);
      if (n) triangles.push({ points: [a, b, c], normal: n });
    };
    for (const [a, b, c] of caps) {
      const front = orientation > 0 ? [a, b, c] : [c, b, a];
      add(...front.map((i) => vertex(i, 0)));
      add(...[...front].reverse().map((i) => vertex(i, depth)));
    }
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      if (orientation > 0) {
        add(vertex(i, 0), vertex(j, depth), vertex(j, 0));
        add(vertex(i, 0), vertex(i, depth), vertex(j, depth));
      } else {
        add(vertex(i, 0), vertex(j, 0), vertex(j, depth));
        add(vertex(i, 0), vertex(j, depth), vertex(i, depth));
      }
    }
    return triangles;
  }

  function drilledMesh() {
    if (!part.closed || !['rectangle', 'circle'].includes(part.shapeType)) return [];
    const xs = part.profile.map((p) => p[0]), zs = part.profile.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const rx = (maxX - minX) / 2, rz = (maxZ - minZ) / 2;
    const hole = part.holeDiameter / 2;
    if (hole <= 0 || hole >= Math.min(rx, rz)) return [];
    const segments = 64, triangles = [], depth = part.extrudeDepth;
    const add = (a, b, c) => {
      const n = normal(a, b, c);
      if (n) triangles.push({ points: [a, b, c], normal: n });
    };
    const outer = [], inner = [];
    for (let i = 0; i < segments; i++) {
      const angle = 2 * Math.PI * i / segments;
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      const radius = part.shapeType === 'circle' ? Math.min(rx, rz) :
        Math.min(rx / Math.max(Math.abs(cosine), 1e-9), rz / Math.max(Math.abs(sine), 1e-9));
      outer.push([cx + radius * cosine, cz + radius * sine]);
      inner.push([cx + hole * cosine, cz + hole * sine]);
    }
    const v = (point, y) => [point[0], y, point[1]];
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      const a = outer[i], b = outer[j], c = inner[j], d = inner[i];
      add(v(a, 0), v(b, 0), v(c, 0)); add(v(a, 0), v(c, 0), v(d, 0));
      add(v(c, depth), v(b, depth), v(a, depth)); add(v(d, depth), v(c, depth), v(a, depth));
      add(v(a, 0), v(b, depth), v(b, 0)); add(v(a, 0), v(a, depth), v(b, depth));
      add(v(d, 0), v(c, 0), v(c, depth)); add(v(d, 0), v(c, depth), v(d, depth));
    }
    return triangles;
  }

  function helixMesh() {
    const { diameter, pitch, turns, thickness } = part.helix;
    const spring = part.operation === 'spring';
    const pathSteps = Math.round(turns * 24), sides = spring ? 12 : 32;
    const triangles = [];
    const add = (a, b, c) => {
      const n = normal(a, b, c);
      if (n) triangles.push({ points: [a, b, c], normal: n });
    };
    const ring = (step, side) => {
      const angle = 2 * Math.PI * step / 24;
      const phi = 2 * Math.PI * side / sides;
      if (!spring) {
        const phase = ((side / sides - step / 24) % 1 + 1) % 1;
        const tooth = 1 - Math.abs(phase * 2 - 1);
        const radius = diameter / 2 - thickness + thickness * tooth;
        return [radius * Math.cos(phi), radius * Math.sin(phi), pitch * step / 24];
      }
      const centerR = diameter / 2 - thickness / 2;
      const slope = pitch / (2 * Math.PI);
      const length = Math.hypot(centerR, slope);
      const radial = [Math.cos(angle), Math.sin(angle), 0];
      const binormal = [-slope * Math.sin(angle) / length,
        slope * Math.cos(angle) / length, -centerR / length];
      const tubeAngle = phi;
      return [centerR * Math.cos(angle) + thickness / 2 *
        (Math.cos(tubeAngle) * radial[0] + Math.sin(tubeAngle) * binormal[0]),
      centerR * Math.sin(angle) + thickness / 2 *
        (Math.cos(tubeAngle) * radial[1] + Math.sin(tubeAngle) * binormal[1]),
      thickness / 2 + pitch * step / 24 + thickness / 2 * Math.sin(tubeAngle) * binormal[2]];
    };
    for (let step = 0; step < pathSteps; step++) {
      for (let side = 0; side < sides; side++) {
        const next = (side + 1) % sides;
        const a = ring(step, side), b = ring(step, next);
        const c = ring(step + 1, next), d = ring(step + 1, side);
        if (spring) { add(a, c, b); add(a, d, c); }
        else { add(a, b, c); add(a, c, d); }
      }
    }
    if (spring) {
      const start = [diameter / 2 - thickness / 2, 0, thickness / 2];
      const end = [diameter / 2 - thickness / 2, 0, thickness / 2 + pitch * turns];
      for (let side = 0; side < sides; side++) {
        const next = (side + 1) % sides;
        add(start, ring(0, next), ring(0, side));
        add(end, ring(pathSteps, side), ring(pathSteps, next));
      }
    } else {
      for (let side = 0; side < sides; side++) {
        const next = (side + 1) % sides;
        add([0, 0, 0], ring(0, side), ring(0, next));
        add([0, 0, pitch * turns], ring(pathSteps, next), ring(pathSteps, side));
      }
    }
    if (spring) for (const triangle of triangles) {
      [triangle.points[1], triangle.points[2]] = [triangle.points[2], triangle.points[1]];
      triangle.normal = triangle.normal.map((value) => -value);
    }
    return triangles;
  }

  // Pintura: cores por triângulo (índice global da malha), válidas só para a mesma geometria.
  function geomKey() {
    return JSON.stringify([part.mode, part.operation, part.profile, part.closed, part.extrudeDepth, part.holeDiameter, part.shapeType, part.helix, part.cup, part.narrado]);
  }
  function mesh() {
    const tris = meshBase();
    if (part.sim || !part.paint || part.paint.key !== geomKey()) return tris;
    const cores = part.paint.cores;
    return tris.map((t, i) => cores[i] ? { ...t, cor: cores[i] } : t);
  }
  function meshBase() {
    if (part.operation === 'narrado') {
      try {
        if (part.sim) return window.tracoNarrado.montagem(part.narrado, part.sim.s)?.tris || [];
        return window.tracoNarrado?.montar(part.narrado).tris || [];
      } catch { return []; }
    }
    if (!part.closed || part.profile.length < 3) return [];
    if (part.operation === 'thread' || part.operation === 'spring') return helixMesh();
    if (part.mode === 'custom' && part.operation === 'extrude' && part.holeDiameter > 0)
      return drilledMesh();
    if (part.mode === 'custom' && part.operation === 'extrude') return extrusionMesh();
    const triangles = [];
    const flip = signedArea(part.profile) > 0;
    const vertex = ([r, z], angle) => [r * Math.cos(angle), r * Math.sin(angle), z];
    for (let j = 0; j < part.profile.length; j++) {
      const from = part.profile[j], to = part.profile[(j + 1) % part.profile.length];
      for (let i = 0; i < SIDES; i++) {
        const a = vertex(from, i * 2 * Math.PI / SIDES);
        const b = vertex(to, i * 2 * Math.PI / SIDES);
        const c = vertex(to, (i + 1) * 2 * Math.PI / SIDES);
        const d = vertex(from, (i + 1) * 2 * Math.PI / SIDES);
        for (const points of flip ? [[a, c, b], [a, d, c]] : [[a, b, c], [a, c, d]]) {
          const n = normal(...points);
          if (n) triangles.push({ points, normal: n });
        }
      }
    }
    return triangles;
  }

  function project([x, y, z], width, height, unit, centerZ) {
    const cy = Math.cos(part.yaw), sy = Math.sin(part.yaw);
    const right = x * cy - y * sy;
    const depth = x * sy + y * cy;
    return { x: width / 2 + right * unit,
      y: height * .55 + (depth * Math.sin(part.pitch) - (z - centerZ) * Math.cos(part.pitch)) * unit,
      depth: depth * Math.cos(part.pitch) + (z - centerZ) * Math.sin(part.pitch) };
  }

  function drawModel() {
    const { width, height, ratio } = resize(model);
    if (width < 2) return;
    const ctx = modelCtx;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const triangles = mesh();
    if (!triangles.length) {
      const points = [...part.profile,
        ...(part.freehandDrag ? part.freehandDrag.points.slice(part.profile.length ? 1 : 0) :
          part.drawLine && part.profile.length ? [previewEndpoint()] : [])];
      if (part.mode === 'custom' && points.length >= 2) {
        if (part.operation === 'extrude') {
          const xs = points.map((p) => p[0]), zs = points.map((p) => p[1]);
          const minX = Math.min(...xs), maxX = Math.max(...xs);
          const minZ = Math.min(...zs), maxZ = Math.max(...zs);
          const depth = part.extrudeDepth;
          const unit = Math.min(width, height) /
            (Math.max(maxX - minX, maxZ - minZ, depth, 1) * 1.65) * part.zoom;
          const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;
          const projected = (p, y) => project([p[0] - centerX, y - depth / 2, p[1]],
            width, height, unit, centerZ);
          for (const y of [0, depth]) {
            ctx.beginPath();
            points.forEach((point, i) => {
              const p = projected(point, y);
              if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
            });
            ctx.strokeStyle = y ? '#5b977e' : '#c57650';
            ctx.lineWidth = y ? 1.7 : 2.7; ctx.stroke();
          }
          ctx.strokeStyle = '#86a58d'; ctx.lineWidth = 1;
          for (const point of points) {
            const a = projected(point, 0), b = projected(point, depth);
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
          return;
        }
        const maxR = Math.max(1, ...points.map((p) => p[0]));
        const minZ = Math.min(...points.map((p) => p[1]));
        const maxZ = Math.max(...points.map((p) => p[1]));
        const unit = Math.min(width, height) / (Math.max(maxR * 2, maxZ - minZ, 1) * 1.65) * part.zoom;
        const centerZ = (minZ + maxZ) / 2;
        ctx.strokeStyle = '#6a9479'; ctx.lineWidth = 1.2;
        for (let angleIndex = 0; angleIndex < 12; angleIndex++) {
          const angle = angleIndex * Math.PI / 6;
          ctx.beginPath();
          points.forEach(([r, z], index) => {
            const p = project([r * Math.cos(angle), r * Math.sin(angle), z],
              width, height, unit, centerZ);
            if (index) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
          });
          ctx.stroke();
        }
        for (const [r, z] of points) {
          ctx.beginPath();
          for (let i = 0; i <= 24; i++) {
            const angle = i * Math.PI / 12;
            const p = project([r * Math.cos(angle), r * Math.sin(angle), z],
              width, height, unit, centerZ);
            if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
          }
          ctx.stroke();
        }
        return;
      }
      ctx.fillStyle = '#111111'; ctx.font = '13px DM Sans, Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('Feche o perfil 2D para gerar o 3D', width / 2, height / 2);
      return;
    }
    if (part.operation === 'narrado') {
      const b = part.sim?.box ? [...part.sim.box] : [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      if (!part.sim?.box) for (const t of triangles) for (const q of t.points) for (let k = 0; k < 3; k++) { if (q[k] < b[k]) b[k] = q[k]; if (q[k] > b[k + 3]) b[k + 3] = q[k]; }
      const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2;
      const unitN = Math.min(width, height) / (Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2], 1) * 1.65) * part.zoom;
      const facesN = triangles.map((triangle, idx) => {
        const corners = triangle.points.map((q) => project([q[0] - cx, q[1] - cy, q[2]], width, height, unitN, cz));
        const [nx, ny, nz] = triangle.normal;
        const light = Math.max(0, nx * -.5 + ny * -.35 + nz * .72);
        return { idx, corners, depth: (corners[0].depth + corners[1].depth + corners[2].depth) / 3, color: corFace(triangle, light) };
      });
      facesN.sort((a, c) => a.depth - c.depth);
      part.lastFaces = facesN;
      part.lastProj = (q) => project([q[0] - cx, q[1] - cy, q[2]], width, height, unitN, cz);
      for (const face of facesN) {
        ctx.beginPath(); ctx.moveTo(face.corners[0].x, face.corners[0].y);
        ctx.lineTo(face.corners[1].x, face.corners[1].y); ctx.lineTo(face.corners[2].x, face.corners[2].y);
        ctx.closePath(); ctx.fillStyle = face.color; ctx.fill();
      }
      try { window.tracoCotas?.desenhar(ctx, part.lastProj, width, height); } catch { /* opcional */ }
      return;
    }
    const extruded = part.mode === 'custom' && part.operation === 'extrude';
    const minX = extruded ? Math.min(...part.profile.map((point) => point[0])) : 0;
    const maxX = Math.max(...part.profile.map((point) => point[0]));
    const maxZ = Math.max(...part.profile.map((point) => point[1]));
    const minZ = Math.min(...part.profile.map((point) => point[1]));
    const span = Math.max(extruded ? maxX - minX : maxX * 2,
      maxZ - minZ, extruded ? part.extrudeDepth : 1, 1);
    const unit = Math.min(width, height) / (span * 1.65) * part.zoom;
    const centerZ = (minZ + maxZ) / 2;
    const faces = triangles.map((triangle, idx) => {
      const corners = triangle.points.map((point) => project(extruded ?
        [point[0] - (minX + maxX) / 2, point[1] - part.extrudeDepth / 2, point[2]] : point,
      width, height, unit, centerZ));
      const [nx, ny, nz] = triangle.normal;
      const light = Math.max(0, nx * -.5 + ny * -.35 + nz * .72);
      return { idx, corners, depth: corners.reduce((sum, corner) => sum + corner.depth, 0) / 3, color: corFace(triangle, light) };
    });
    faces.sort((a, b) => a.depth - b.depth);
    part.lastFaces = faces;
    part.lastProj = (q) => project(extruded ? [q[0] - (minX + maxX) / 2, q[1] - part.extrudeDepth / 2, q[2]] : q, width, height, unit, centerZ);
    for (const face of faces) {
      ctx.beginPath(); ctx.moveTo(face.corners[0].x, face.corners[0].y);
      ctx.lineTo(face.corners[1].x, face.corners[1].y);
      ctx.lineTo(face.corners[2].x, face.corners[2].y);
      ctx.closePath(); ctx.fillStyle = face.color; ctx.fill();
      ctx.strokeStyle = '#8d604522'; ctx.lineWidth = .5; ctx.stroke();
    }
    try { window.tracoCotas?.desenhar(ctx, part.lastProj, width, height); } catch { /* opcional */ }
  }

  function corFace(triangle, light) {
    const shade = Math.round(135 + 73 * light);
    if (triangle.ghost) return `rgba(${Math.round(shade * .62)},${Math.round(shade * .78)},${Math.round(shade * .9)},.16)`;
    if (triangle.cor) {
      const h = triangle.cor.replace('#', ''), k = .5 + .55 * light;
      const c = [0, 2, 4].map((i) => Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) * k)));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
    return `rgb(${Math.min(255, shade + 33)},${Math.round(shade * .80)},${Math.round(shade * .66)})`;
  }
  function render() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; drawSketch(); drawModel(); });
  }

  function refresh() {
    for (const [id, key] of [['cupTop', 'top'], ['cupBottom', 'bottom'],
      ['cupHeight', 'height'], ['cupWall', 'wall'], ['cupBase', 'base']])
      $(id).value = display(part.cup[key]);
    const custom = part.mode === 'custom';
    const extruded = custom && part.operation === 'extrude';
    const helix = part.operation === 'thread' || part.operation === 'spring';
    $('shapeMethod').hidden = helix;
    $('helixControls').hidden = !helix;
    $('partCoordinateEntry').hidden = helix;
    $('partSegmentEntry').hidden = helix;
    $('helixThicknessLabel').firstChild.textContent = part.operation === 'thread' ?
      'Altura do filete ' : 'Espessura ';
    $('partOperation').value = helix ? 'extrude' : part.operation;
    $('partOperation').disabled = !custom;
    $('extrudeDepthLabel').hidden = !extruded;
    $('extrudeDepth').value = display(part.extrudeDepth);
    $('confirmExtrudeDepth').hidden = true;
    $('partSketchKicker').textContent = helix ? 'PROJEÇÃO LATERAL · 2D' :
      extruded ? 'CONTORNO · 2D' : 'CORTE AXIAL · 2D';
    $('partSketchTitle').textContent = helix ?
      (part.operation === 'thread' ? 'Projeção da rosca' : 'Projeção da mola') : 'Perfil da peça';
    $('firstAxisLabel').textContent = extruded || helix ? 'X' : 'Raio';
    $('partViewBadge').textContent = helix ?
      (part.operation === 'thread' ? 'ROSCA HELICOIDAL' : 'MOLA HELICOIDAL') :
      extruded ? `EXTRUSÃO ${display(part.extrudeDepth)} mm` : 'REVOLUÇÃO 360°';
    $('operationHint').textContent = extruded ?
      'O contorno mantém a forma desenhada. Feche para criar um sólido.' :
      'O perfil gira ao redor do eixo para criar uma peça redonda.';
    $('addProfilePoint').disabled = !custom || part.closed;
    $('drawProfileTool').disabled = false;
    $('drawProfileTool').setAttribute('aria-pressed', String(part.drawLine));
    $('freehandProfileTool').disabled = !custom || part.closed;
    $('freehandProfileTool').setAttribute('aria-pressed', String(part.freehand));
    for (const [id, type] of [['rectangleTool', 'rectangle'], ['circleTool', 'circle']])
      $(id).setAttribute('aria-pressed', String(part.shapeTool === type));
    $('holeTool').disabled = !custom || !part.closed || !extruded ||
      !['rectangle', 'circle'].includes(part.shapeType);
    $('pushPullTool').disabled = !extruded || !part.closed;
    $('holeControls').hidden = $('holeTool').disabled || !part.showHoleControls;
    $('holeDiameter').value = display(part.holeDiameter || 5);
    for (const [id, key] of [['helixDiameter', 'diameter'], ['helixPitch', 'pitch'],
      ['helixTurns', 'turns'], ['helixThickness', 'thickness']]) $(id).value = display(part.helix[key]);
    $('applyProfileLength').disabled = !custom || part.closed || !part.drawLine || !part.profile.length;
    $('profileLength').disabled = !custom || part.closed || !part.drawLine || !part.profile.length;
    $('profileAngle').disabled = !custom || part.closed || !part.drawLine || !part.profile.length;
    $('undoProfilePoint').disabled = !custom || !part.profile.length || helix;
    $('closeProfile').disabled = !custom || part.closed || part.profile.length < 3 || helix;
    $('profileStatus').textContent = helix ?
      `${part.operation === 'thread' ? 'Rosca' : 'Mola'} · ${part.helix.turns} voltas` : custom ?
      `${part.profile.length} pontos · ${part.closed ? 'perfil fechado' : 'perfil aberto'}` :
      'Copo cônico · seção oca';
    const triangles = mesh().length;
    if (part.operation === 'narrado') {
      const n = part.narrado.pecas.length;
      $('shapeMethod').hidden = true;
      $('partViewBadge').textContent = 'PEÇA NARRADA';
      $('profileStatus').textContent = `Corte da 1ª peça · ${n} peça${n > 1 ? 's' : ''}`;
      $('partStatus').textContent = `${part.narrado.pecas.map((pc) => pc.nome).join(' + ')} · ${triangles.toLocaleString('pt-BR')} triângulos`;
      const pm = window.tracoNarrado.parMontagem(part.narrado);
      $('partDimensions').textContent = part.sim ? pm.msgs.join(' ') : 'Exportar gera um STL por peça';
      $('simularMontagem').hidden = !pm;
      $('simularMontagem').textContent = part.sim ? '⏹ Parar simulação' : '▶ Simular montagem';
      $('exportPartStl').disabled = !triangles;
      render(); return;
    }
    if ($('simularMontagem')) $('simularMontagem').hidden = true;
    $('partStatus').textContent = triangles ? `${custom ? 'Peça livre' : 'Copo cônico'} · ${helix ? (part.operation === 'thread' ? 'rosca' : 'mola') : extruded ? 'extrusão' : 'revolução'} · ${triangles.toLocaleString('pt-BR')} triângulos` :
      custom && part.profile.length >= 2 ? `Prévia 3D do contorno aberto · ${extruded ? 'extrusão' : 'revolução'} · feche para gerar sólido` :
        'Aguardando perfil fechado';
    const maxR = part.profile.length ? Math.max(...part.profile.map((point) => point[0])) : 0;
    const minR = part.profile.length ? Math.min(...part.profile.map((point) => point[0])) : 0;
    const maxZ = part.profile.length ? Math.max(...part.profile.map((point) => point[1])) : 0;
    const minZ = part.profile.length ? Math.min(...part.profile.map((point) => point[1])) : 0;
    $('partDimensions').textContent = helix ?
      `Diâmetro ${display(part.helix.diameter)} mm · altura ${display(part.helix.pitch * part.helix.turns + (part.operation === 'spring' ? part.helix.thickness : 0))} mm` : extruded ?
      `Largura ${display(maxR - minR)} mm · altura ${display(maxZ - minZ)} mm · profundidade ${display(part.extrudeDepth)} mm` :
      `Raio máximo ${display(maxR)} mm · altura ${display(maxZ)} mm`;
    $('exportPartStl').disabled = !triangles;
    render();
  }

  function download(name, content, type) {
    try { window.tracoHistorico?.exportou('peca', name); } catch { /* opcional */ }
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function stlBuffer(triangles) {
    const buffer = new ArrayBuffer(84 + triangles.length * 50);
    const view = new DataView(buffer);
    new Uint8Array(buffer).set(new TextEncoder().encode('Traco 3D part, units millimeters').slice(0, 80));
    view.setUint32(80, triangles.length, true);
    let offset = 84;
    for (const triangle of triangles) {
      for (const value of triangle.normal) { view.setFloat32(offset, value, true); offset += 4; }
      for (const point of triangle.points) for (const value of point) { view.setFloat32(offset, value, true); offset += 4; }
      view.setUint16(offset, 0, true); offset += 2;
    }
    return buffer;
  }
  function exportStl() {
    if (part.operation === 'narrado') {
      // Um botão por peça: o iPhone só deixa baixar um arquivo por toque.
      const { pecas } = window.tracoNarrado.montar(part.narrado);
      const nome = (pc, i) => `traco-${(pc.nome || 'peca').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}-${i + 1}-mm.stl`;
      let d = $('stlDialog');
      if (!d) { d = document.createElement('dialog'); d.id = 'stlDialog'; d.className = 'foto-dialog'; document.body.appendChild(d);
        d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); }
      d.innerHTML = `<h3>Exportar STL</h3><p class="foto-sub">Um arquivo por peça, em mm. Toque em cada uma.</p>
        <div class="stl-lista">${pecas.length > 1 ? '<button type="button" class="primary-button" data-todas="1">⬇ Todas juntas na mesma mesa (1 arquivo)</button>' : ''}${pecas.map((pc, i) => `<button type="button" class="secondary-button" data-i="${i}">⬇ ${pc.nome || 'Peça ' + (i + 1)}</button>`).join('')}</div>
        <div class="foto-acoes"><button type="button" class="primary-button" data-x="ok">Fechar</button></div>`;
      d.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => {
        const i = +b.dataset.i; download(nome(pecas[i], i), stlBuffer(pecas[i].tris), 'model/stl');
        b.textContent = '✓ ' + (pecas[i].nome || 'Peça ' + (i + 1)) + ' baixado';
      });
      const todas = d.querySelector('[data-todas]');
      if (todas) todas.onclick = () => {
        // Peças lado a lado (6 mm entre elas), todas apoiadas em z = 0 e centradas na mesa.
        const t = window.tracoNarrado.montar(part.narrado).tris;
        let mx = Infinity, Mx = -Infinity, my = Infinity, My = -Infinity;
        for (const tr of t) for (const q of tr.points) { mx = Math.min(mx, q[0]); Mx = Math.max(Mx, q[0]); my = Math.min(my, q[1]); My = Math.max(My, q[1]); }
        const cx = (mx + Mx) / 2, cy = (my + My) / 2;
        const centr = t.map((tr) => ({ normal: tr.normal, points: tr.points.map(([x, y, z]) => [x - cx, y - cy, z]) }));
        download('traco-mesa-completa-mm.stl', stlBuffer(centr), 'model/stl');
        todas.textContent = '✓ Mesa completa baixada';
      };
      d.querySelector('[data-x=ok]').onclick = () => d.close();
      d.showModal();
      return;
    }
    const triangles = mesh();
    if (!triangles.length) return;
    const buffer = new ArrayBuffer(84 + triangles.length * 50);
    const view = new DataView(buffer);
    const header = new TextEncoder().encode('Traco 3D part, units millimeters');
    new Uint8Array(buffer).set(header.slice(0, 80));
    view.setUint32(80, triangles.length, true);
    let offset = 84;
    for (const triangle of triangles) {
      for (const value of triangle.normal) { view.setFloat32(offset, value, true); offset += 4; }
      for (const point of triangle.points)
        for (const value of point) { view.setFloat32(offset, value, true); offset += 4; }
      view.setUint16(offset, 0, true); offset += 2;
    }
    download('traco-peca-mm.stl', buffer, 'model/stl');
  }

  $('architectureTab').addEventListener('click', () => switchMode('architecture'));
  $('partsTab').addEventListener('click', () => switchMode('parts'));
  function switchMode(mode) {
    $('architectureMode').hidden = mode !== 'architecture';
    $('partsMode').hidden = mode !== 'parts';
    $('architectureTab').setAttribute('aria-selected', String(mode === 'architecture'));
    $('partsTab').setAttribute('aria-selected', String(mode === 'parts'));
    try { localStorage.setItem('traco-active-mode', mode); } catch { /* Optional preference. */ }
    if (mode === 'parts') render();
  }

  for (const id of ['cupTop', 'cupBottom', 'cupHeight', 'cupWall', 'cupBase']) {
    $(id).addEventListener('change', () => {
      const key = { cupTop: 'top', cupBottom: 'bottom', cupHeight: 'height',
        cupWall: 'wall', cupBase: 'base' }[id];
      const value = number($(id).value);
      const next = { ...part.cup, [key]: value };
      if (value == null || !validCup(next)) {
        $('profileStatus').textContent = 'Medidas inválidas: confira diâmetros, parede e fundo.';
        $(id).value = display(part.cup[key]);
        return;
      }
      part.cup = next; part.mode = 'cup'; part.operation = 'revolve'; part.profile = cupProfile(next);
      part.closed = true; part.drawLine = false; part.freehand = false;
      part.selected = [...part.profile.at(-1)]; fitSketchView();
      save(); refresh();
    });
  }

  $('cupExample').addEventListener('click', () => {
    part.cup = { ...example }; part.mode = 'cup'; part.operation = 'revolve'; part.profile = cupProfile(part.cup);
    part.shapeType = null; part.holeDiameter = 0; part.shapeTool = null;
    part.closed = true; part.drawLine = false; part.freehand = false; part.pending = false;
    part.selected = [0, 0]; fitSketchView(); save(); refresh();
  });
  $('newProfile').addEventListener('click', () => {
    part.mode = 'custom'; part.operation = 'extrude'; part.profile = []; part.closed = false;
    part.shapeType = null; part.holeDiameter = 0; part.shapeTool = null; part.showHoleControls = false;
    part.drawLine = true; part.freehand = false; part.pending = false;
    part.selected = [0, 0]; $('profileLength').value = ''; $('profileAngle').value = '';
    $('profileHint').textContent = 'Linha mm ativa: clique para começar; cada clique conclui uma linha. Digite os mm a qualquer hora.';
    fitSketchView(); save(); refresh();
  });
  for (const [id, type] of [['rectangleTool', 'rectangle'], ['circleTool', 'circle']]) {
    $(id).addEventListener('click', () => {
      if (part.mode !== 'custom' || part.closed) $('newProfile').click();
      part.shapeTool = type; part.drawLine = false; part.freehand = false; part.pending = false;
      $('sketchMenu').open = false;
      $('profileHint').textContent = type === 'rectangle' ?
        'Arraste no plano do primeiro ao canto oposto do retângulo.' :
        'Arraste no plano para definir o diâmetro do círculo.';
      refresh();
    });
  }
  function setOperation(operation) {
    if (part.mode !== 'custom') {
      $('newProfile').click();
    }
    part.operation = operation; part.shapeTool = null; part.drawLine = false;
    if (operation !== 'extrude') part.holeDiameter = 0;
    part.freehand = false; part.pending = false; part.showHoleControls = false;
    $('modelMenu').open = false; save(); refresh();
  }
  $('extrudeTool').addEventListener('click', () => setOperation('extrude'));
  $('revolveTool').addEventListener('click', () => setOperation('revolve'));
  $('pushPullTool').addEventListener('click', () => {
    $('modelMenu').open = false;
    $('extrudeDepth').focus(); $('extrudeDepth').select();
    $('profileHint').textContent = 'Digite a nova profundidade e confirme em OK.';
  });
  $('holeTool').addEventListener('click', () => {
    part.showHoleControls = true; $('modelMenu').open = false; refresh();
    $('holeDiameter').focus(); $('holeDiameter').select();
  });
  $('confirmHole').addEventListener('click', () => {
    const diameter = number($('holeDiameter').value);
    const xs = part.profile.map((p) => p[0]), zs = part.profile.map((p) => p[1]);
    const limit = Math.min(Math.max(...xs) - Math.min(...xs),
      Math.max(...zs) - Math.min(...zs));
    if (diameter == null || diameter <= 0 || diameter >= limit) {
      $('profileStatus').textContent = `O furo deve ter diâmetro maior que 0 e menor que ${display(limit)} mm.`;
      return;
    }
    part.holeDiameter = diameter; save(); refresh();
    $('profileHint').textContent = `Furo passante de ${display(diameter)} mm criado.`;
  });
  $('removeHole').addEventListener('click', () => {
    part.holeDiameter = 0; part.showHoleControls = false; save(); refresh();
  });
  function createHelix(operation) {
    const values = ['helixDiameter', 'helixPitch', 'helixTurns', 'helixThickness']
      .map((id) => number($(id).value));
    const [diameter, pitch, turns, thickness] = values;
    if (values.some((value) => value == null || value <= 0) ||
        !Number.isInteger(turns) || turns > 20 || thickness >= diameter / 2 ||
        (operation === 'spring' && pitch < thickness) || pitch * turns + thickness > MAX_MM) {
      $('profileStatus').textContent = 'Confira: diâmetro > 2× espessura, 1 a 20 voltas inteiras e passo válido.';
      return;
    }
    part.helix = { diameter, pitch, turns, thickness };
    part.mode = 'custom'; part.operation = operation; part.closed = true;
    part.shapeType = null; part.holeDiameter = 0; part.showHoleControls = false;
    part.shapeTool = null; part.drawLine = false; part.freehand = false;
    part.profile = [[0, 0], [diameter / 2, 0],
      [diameter / 2, pitch * turns + (operation === 'spring' ? thickness : 0)],
      [0, pitch * turns + (operation === 'spring' ? thickness : 0)]];
    part.selected = [...part.profile.at(-1)]; fitSketchView(); save(); refresh();
    $('profileHint').textContent = `${operation === 'spring' ? 'Mola' : 'Rosca'} criada. Ajuste as medidas e confirme para refazer.`;
  }
  for (const [id, operation] of [['threadTool', 'thread'], ['springTool', 'spring']])
    $(id).addEventListener('click', () => {
      $('modelMenu').open = false;
      createHelix(operation);
    });
  $('confirmHelix').addEventListener('click', () => createHelix(part.operation));
  $('partOperation').addEventListener('change', () => {
    if (part.mode !== 'custom') return;
    part.operation = $('partOperation').value;
    if (part.operation !== 'extrude') part.holeDiameter = 0;
    part.showHoleControls = false;
    save(); refresh();
  });
  $('extrudeDepth').addEventListener('input', () => {
    $('confirmExtrudeDepth').hidden = $('extrudeDepth').value.trim() === display(part.extrudeDepth);
  });
  function confirmExtrudeDepth() {
    const depth = number($('extrudeDepth').value);
    if (depth == null || depth <= 0) {
      $('profileStatus').textContent = 'Digite uma profundidade maior que 0 mm.';
      return;
    }
    part.extrudeDepth = depth;
    $('extrudeDepth').blur();
    save(); refresh();
    $('profileHint').textContent = `Profundidade confirmada: ${display(depth)} mm.`;
  }
  $('confirmExtrudeDepth').addEventListener('click', confirmExtrudeDepth);
  $('extrudeDepth').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); confirmExtrudeDepth(); }
  });
  $('drawProfileTool').addEventListener('click', () => {
    if (part.mode !== 'custom' || part.closed) { $('newProfile').click(); $('sketchMenu').open = false; return; }
    part.drawLine = !part.drawLine; part.freehand = false; part.pending = false;
    $('profileHint').textContent = part.drawLine ?
      'Cada clique conclui uma linha · digite os mm a qualquer hora · clique no 1º ponto para fechar' :
      'Toque no corte para escolher coordenadas; Adicionar ponto confirma';
    refresh();
  });
  $('freehandProfileTool').addEventListener('click', () => {
    if (part.mode !== 'custom' || part.closed) return;
    part.freehand = !part.freehand; part.drawLine = false; part.pending = false;
    $('profileLength').value = ''; $('profileAngle').value = '';
    $('profileHint').textContent = part.freehand ?
      'Arraste no corte. Continue do último ponto para manter o perfil ligado.' :
      'Escolha Linha mm ou toque no corte para definir coordenadas.';
    refresh();
  });
  $('fitProfileView').addEventListener('click', () => {
    fitSketchView(); render();
    $('profileHint').textContent = 'Enquadramento ajustado. O plano fica fixo durante o traço.';
  });
  // Tecla A: ângulo digitado trava a direção; o cursor só puxa o comprimento ao longo dela.
  function anguloTravado() {
    if (part.angleTyping) return null;
    const txt = $('profileAngle').value.trim();
    const a = Number(txt.replace(',', '.'));
    return txt && Number.isFinite(a) ? a : null;
  }
  function projetarAngulo([r, z], graus, passo) {
    const [r0, z0] = part.profile.at(-1), rad = graus * Math.PI / 180;
    const ux = Math.cos(rad), uz = Math.sin(rad);
    const L = Math.max(0, Math.round(((r - r0) * ux + (z - z0) * uz) / passo) * passo);
    part.infer = { kind: 'ang', guides: [] };
    return [Math.max(0, Math.round((r0 + ux * L) * 100) / 100), Math.max(0, Math.round((z0 + uz * L) * 100) / 100)];
  }
  // Inferência igual à Arquitetura/SketchUp: ponto existente > eixo > alinhamento > grade de mm.
  function sketchPoint(event) {
    const rect = sketch.getBoundingClientRect();
    const t = sketchTransform(rect.width, rect.height);
    const [lx, ly] = window.tracoLapis?.desvio(event) || [0, 0];
    let [r, z] = t.world([event.clientX + lx - rect.left, event.clientY + ly - rect.top]);
    part.infer = null; part.lastRaw = [r, z];
    if (!part.drawLine || event.altKey) return [Math.round(r * 100) / 100, Math.round(z * 100) / 100];
    const mmPorPx = t.extent.r / (t.right - t.left);
    const travado = anguloTravado();
    if (travado != null && part.profile.length) return projetarAngulo([r, z], travado, t.extent.r > 120 ? 1 : t.extent.r > 30 ? .5 : .1);
    const tol = (event.pointerType === 'touch' ? 16 : 10) * mmPorPx;
    const passo = t.extent.r > 120 ? 1 : t.extent.r > 30 ? .5 : .1;
    const grade = (v) => Math.round(v / passo) * passo;
    const ultimo = part.profile.at(-1);
    // 1) ponto já desenhado (o primeiro fecha o perfil)
    let melhor = null, dist = tol * 1.4;
    part.profile.forEach((q, i) => {
      if (i === part.profile.length - 1) return;
      const d = Math.hypot(q[0] - r, q[1] - z);
      if (d < dist) { dist = d; melhor = { q, i }; }
    });
    if (melhor) {
      part.infer = { kind: melhor.i === 0 && part.profile.length >= 3 ? 'fechar' : 'point', guides: [] };
      return [...melhor.q];
    }
    const guias = [];
    const alinhar = (eixo, valor) => { // eixo 0 = mesma coluna (x), 1 = mesma altura (z)
      let alvo = null, dd = tol;
      for (const q of part.profile.slice(0, -1)) {
        const d = Math.abs(q[eixo] - valor);
        if (d < dd) { dd = d; alvo = q; }
      }
      if (alvo) guias.push({ from: [...alvo], axis: eixo === 0 ? 'v' : 'h' });
      return alvo ? alvo[eixo] : null;
    };
    let kind = 'grid';
    if (ultimo) {
      const dr = r - ultimo[0], dz = z - ultimo[1];
      if (Math.abs(dr) < Math.abs(dz) * .18) { r = ultimo[0]; z = alinhar(1, z) ?? grade(z); kind = 'y'; }
      else if (Math.abs(dz) < Math.abs(dr) * .18) { z = ultimo[1]; r = alinhar(0, r) ?? grade(r); kind = 'x'; }
    }
    if (kind === 'grid') {
      r = alinhar(0, r) ?? grade(r); z = alinhar(1, z) ?? grade(z);
      if (guias.length) kind = 'align';
    }
    part.infer = { kind, guides: guias };
    return [Math.max(0, Math.round(r * 100) / 100), Math.max(0, Math.round(z * 100) / 100)];
  }
  function selectPoint(point) {
    part.selected = point;
    $('profileRadius').value = display(point[0]);
    $('profileZ').value = display(point[1]);
    render();
  }
  function applySegmentLength() {
    if (part.mode !== 'custom' || part.closed || !part.profile.length) return;
    const length = number($('profileLength').value);
    if (length == null || length < .01) {
      $('profileStatus').textContent = 'Digite um comprimento maior que 0 em mm para criar a linha.';
      return;
    }
    const start = part.profile.at(-1);
    let dx = part.selected[0] - start[0], dz = part.selected[1] - start[1];
    const angleText = $('profileAngle').value.trim();
    const angle = angleText ? Number(angleText.replace(',', '.')) : null;
    if (angleText && (!Number.isFinite(angle) || angle < -360 || angle > 360)) {
      $('profileStatus').textContent = 'Digite um ângulo entre -360° e 360°.';
      return;
    }
    if (angle !== null) {
      dx = Math.cos(angle * Math.PI / 180);
      dz = Math.sin(angle * Math.PI / 180);
    }
    const preview = Math.hypot(dx, dz);
    if (preview < .01) {
      $('profileStatus').textContent = 'Aponte a direção da linha no corte antes de confirmar.';
      return;
    }
    const end = [start[0] + dx / preview * length, start[1] + dz / preview * length]
      .map((value) => Math.round(value * 100) / 100);
    if (end.some((value) => value < 0 || value > MAX_MM) || part.profile.length >= MAX_POINTS) {
      $('profileStatus').textContent = 'A linha ultrapassa o eixo/quadro ou o limite de 128 pontos.';
      return;
    }
    if (Math.hypot(end[0] - start[0], end[1] - start[1]) < .01) return;
    part.profile.push(end); part.selected = end; part.pending = false;
    $('profileLength').value = '';
    $('profileAngle').value = '';
    $('profileHint').textContent = 'Linha criada. Aponte a próxima ou feche o perfil.';
    $('profileLength').blur(); save(); refresh();
  }
  $('applyProfileLength').addEventListener('click', applySegmentLength);
  $('profileLength').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); applySegmentLength(); }
    if (event.key === 'Escape') {
      event.preventDefault(); part.pending = false; $('profileLength').blur();
      $('profileHint').textContent = 'Prévia cancelada. Aponte uma nova direção.';
      render();
    }
  });
  $('profileAngle').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); applySegmentLength(); }
  });
  window.addEventListener('keydown', (event) => {
    if ($('partsMode').hidden || !part.drawLine || part.closed || !part.profile.length ||
        event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    if (event.target !== sketch && event.target !== document.body) return;
    if (part.angleTyping) {
      event.preventDefault();
      const ang = $('profileAngle');
      if (event.key === 'Escape') { part.angleTyping = false; ang.value = ''; }
      else if (event.key === 'Enter') {
        part.angleTyping = false;
        if (!Number.isFinite(Number(ang.value.replace(',', '.'))) || !ang.value.trim()) ang.value = '';
        else if (part.lastRaw) part.selected = projetarAngulo(part.lastRaw, Number(ang.value.replace(',', '.')),
          part.view.r > 120 ? 1 : part.view.r > 30 ? .5 : .1);
      } else if (/^[0-9,.\-]$/.test(event.key)) ang.value += event.key;
      else if (event.key === 'Backspace') ang.value = ang.value.slice(0, -1);
      $('profileHint').textContent = part.angleTyping ? `Ângulo: ${ang.value || '_'}° · Enter trava · Esc cancela` :
        ang.value ? `Ângulo ${ang.value}° travado · puxe ou digite os mm e Enter` : 'Ângulo cancelado.';
      render(); return;
    }
    if (event.key === 'a' || event.key === 'A') {
      event.preventDefault(); part.angleTyping = true; $('profileAngle').value = '';
      $('profileHint').textContent = 'Ângulo: _° · digite e Enter (0° = direita, 90° = cima)';
      render(); return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const last = part.profile.at(-1);
      if (!$('profileLength').value.trim() && Math.hypot(part.selected[0] - last[0], part.selected[1] - last[1]) >= .01) {
        if (part.infer?.kind === 'fechar') { $('closeProfile').click(); return; }
        part.profile.push([...part.selected]); part.pending = false; $('profileAngle').value = ''; save(); refresh(); return;
      }
      applySegmentLength(); return;
    }
    if (event.key === 'Escape') {
      event.preventDefault(); part.pending = false;
      $('profileLength').value = ''; $('profileAngle').value = ''; part.selected = [...part.profile.at(-1)];
      $('profileHint').textContent = 'Medida cancelada. Aponte uma nova direção.';
      render(); return;
    }
    const input = $('profileLength');
    if (/^[0-9,.]$/.test(event.key)) input.value += event.key;
    else if (event.key === 'Backspace') input.value = input.value.slice(0, -1);
    else return;
    event.preventDefault(); render();
  });
  $('profileLength').addEventListener('input', render);
  $('profileAngle').addEventListener('input', render);
  function simplifyFreehand(points, tolerance = .5) {
    if (points.length <= 2) return points;
    const keep = new Set([0, points.length - 1]);
    const visit = (first, last) => {
      const [ax, ay] = points[first], [bx, by] = points[last];
      const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
      let index = -1, farthest = tolerance;
      for (let i = first + 1; i < last; i++) {
        const [x, y] = points[i];
        const t = length2 ? Math.max(0, Math.min(1,
          ((x - ax) * dx + (y - ay) * dy) / length2)) : 0;
        const distance = Math.hypot(x - ax - t * dx, y - ay - t * dy);
        if (distance > farthest) { farthest = distance; index = i; }
      }
      if (index >= 0) { keep.add(index); visit(first, index); visit(index, last); }
    };
    visit(0, points.length - 1);
    return [...keep].sort((a, b) => a - b).map((index) => points[index]);
  }
  function finishFreehand(event, cancel = false) {
    const drag = part.freehandDrag;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    if (!cancel) {
      const point = sketchPoint(event);
      if (Math.hypot(point[0] - drag.points.at(-1)[0], point[1] - drag.points.at(-1)[1]) >= .2)
        drag.points.push(point);
    }
    part.freehandDrag = null;
    if (cancel) { render(); return true; }
    const simplified = simplifyFreehand(drag.points);
    const added = simplified.slice(part.profile.length ? 1 : 0);
    const remaining = MAX_POINTS - part.profile.length;
    if (added.length > remaining) {
      $('profileStatus').textContent = 'Limite de 128 pontos. Desfaça ou feche o perfil.';
      render(); return true;
    }
    if (added.length) {
      part.profile.push(...added); selectPoint([...part.profile.at(-1)]);
      $('profileHint').textContent = 'Traço livre adicionado ao plano. Continue da ponta ou feche o perfil.';
      save(); refresh();
    } else render();
    return true;
  }
  sketch.addEventListener('pointerdown', (event) => {
    if (part.drawLine && part.mode === 'custom' && !part.closed)
      sketch.focus({ preventScroll: true });
    if (part.shapeTool) {
      event.preventDefault();
      const point = sketchPoint(event);
      part.shapeDrag = { pointerId: event.pointerId, type: part.shapeTool,
        start: point, end: point };
      sketch.setPointerCapture(event.pointerId); render(); return;
    }
    if (part.mode === 'custom' && !part.closed && (part.freehand || part.drawLine))
      event.preventDefault();
    const point = sketchPoint(event);
    if (part.freehand && part.mode === 'custom' && !part.closed) {
      const last = part.profile.at(-1);
      if (last) {
        const rect = sketch.getBoundingClientRect();
        const t = sketchTransform(rect.width, rect.height);
        const [x, y] = t.screen(last);
        if (Math.hypot(event.clientX - rect.left - x, event.clientY - rect.top - y) > 26) {
          $('profileStatus').textContent = 'Comece o traço livre na ponta do perfil existente.';
          return;
        }
      }
      part.freehandDrag = { pointerId: event.pointerId, points: [last ? [...last] : point] };
      sketch.setPointerCapture(event.pointerId); render(); return;
    }
    if (!part.drawLine || part.mode !== 'custom' || part.closed) {
      selectPoint(point); return;
    }
    if (!part.profile.length) {
      part.profile.push(point); selectPoint(point); save(); refresh();
      $('profileHint').textContent = 'Aponte a direção, digite os mm direto no teclado e pressione Enter.';
      return;
    }
    const validLength = number($('profileLength').value);
    if (event.pointerType === 'mouse' && (validLength == null || validLength < .01)) {
      // Igual à Arquitetura: o clique conclui a linha no ponto inferido e já segue para a próxima.
      if (part.infer?.kind === 'fechar') { $('closeProfile').click(); return; }
      const last = part.profile.at(-1);
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) < .01) return;
      if (part.profile.length >= MAX_POINTS) { $('profileStatus').textContent = 'Limite de 128 pontos.'; return; }
      part.profile.push(point); selectPoint(point); part.pending = false; $('profileAngle').value = '';
      $('profileHint').textContent = 'Linha criada. Siga para a próxima, digite os mm, ou clique no 1º ponto para fechar.';
      save(); refresh(); return;
    }
    if (part.pending && (validLength == null || validLength < .01) &&
      Math.hypot(point[0] - part.selected[0], point[1] - part.selected[1]) > 8) {
      $('profileStatus').textContent = 'Esta linha ainda é prévia. Digite mm e pressione Enter.';
      if (event.pointerType === 'mouse') $('profileLength').focus();
      return;
    }
    $('profileLength').blur(); selectPoint(point); part.pending = true;
    part.sketchPointer = { origin: point, pointerId: event.pointerId,
      confirm: validLength != null && validLength >= .01, type: event.pointerType };
    sketch.setPointerCapture(event.pointerId);
  });
  sketch.addEventListener('pointermove', (event) => {
    if (part.shapeDrag?.pointerId === event.pointerId) {
      event.preventDefault(); part.shapeDrag.end = sketchPoint(event); render(); return;
    }
    if (part.freehandDrag && event.pointerId === part.freehandDrag.pointerId) {
      event.preventDefault();
      const point = sketchPoint(event);
      const points = part.freehandDrag.points;
      if (points.length < MAX_POINTS * 4 &&
        Math.hypot(point[0] - points.at(-1)[0], point[1] - points.at(-1)[1]) >= .3) {
        points.push(point); part.selected = point; render();
      }
      return;
    }
    if (!part.drawLine || part.mode !== 'custom' || part.closed || !part.profile.length ||
      (part.pending && !part.sketchPointer)) return;
    selectPoint(sketchPoint(event));
  });
  sketch.addEventListener('pointerup', (event) => {
    if (part.shapeDrag?.pointerId === event.pointerId) {
      const drag = part.shapeDrag;
      drag.end = sketchPoint(event);
      part.shapeDrag = null;
      const points = shapePoints(drag.type, drag.start, drag.end);
      if (!points.length) {
        $('profileStatus').textContent = 'Arraste pelo menos 0,5 mm em cada direção.';
        render(); return;
      }
      part.profile = points; part.closed = true; part.shapeType = drag.type;
      part.holeDiameter = 0; part.shapeTool = null;
      part.selected = [...points.at(-1)]; save(); refresh();
      $('profileHint').textContent = `${drag.type === 'circle' ? 'Círculo' : 'Retângulo'} criado no plano. Use Modelagem 3D para editar.`;
      return;
    }
    if (finishFreehand(event)) return;
    const pointer = part.sketchPointer;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    const point = sketchPoint(event);
    const moved = Math.hypot(point[0] - pointer.origin[0], point[1] - pointer.origin[1]) >= 1;
    if (moved) selectPoint(point);
    part.sketchPointer = null;
    if (pointer.confirm) { applySegmentLength(); return; }
    $('profileHint').textContent = 'Prévia pronta: digite o comprimento em mm e Enter';
    if (pointer.type === 'mouse' && !moved) $('profileLength').focus();
    render();
  });
  sketch.addEventListener('pointercancel', (event) => {
    if (part.shapeDrag?.pointerId === event.pointerId) {
      part.shapeDrag = null; render(); return;
    }
    if (finishFreehand(event, true)) return;
    part.sketchPointer = null; render();
  });
  sketch.addEventListener('contextmenu', (event) => event.preventDefault());
  $('addProfilePoint').addEventListener('click', () => {
    const r = number($('profileRadius').value), z = number($('profileZ').value);
    if (r == null || z == null || part.profile.length >= MAX_POINTS) {
      $('profileStatus').textContent = 'Use coordenadas válidas em mm; até 128 pontos.'; return;
    }
    if (part.profile.length && Math.hypot(r - part.profile.at(-1)[0], z - part.profile.at(-1)[1]) < .001) {
      $('profileStatus').textContent = 'Esse ponto coincide com o anterior.'; return;
    }
    part.selected = [r, z]; part.profile.push([r, z]);
    part.pending = false;
    save(); refresh();
  });
  $('undoProfilePoint').addEventListener('click', () => {
    part.profile.pop(); part.closed = false; part.pending = false;
    part.shapeType = null; part.holeDiameter = 0;
    part.selected = [...(part.profile.at(-1) ?? [0, 0])]; save(); refresh();
  });
  $('closeProfile').addEventListener('click', () => {
    if (part.profile.length < 3 || Math.abs(signedArea(part.profile)) < .001 ||
        !simpleProfile(part.profile) ||
        (part.operation === 'extrude' && !extrusionMesh().length)) {
      $('profileStatus').textContent = 'Feche um contorno simples com ao menos 3 pontos.'; return;
    }
    part.closed = true; part.pending = false; part.drawLine = false; part.freehand = false;
    save(); refresh();
  });
  model.addEventListener('pointerdown', (event) => {
    if (window.tracoPintura?.ativa && window.tracoPintura.clique(event)) return;
    if (window.tracoCotas?.medindo && window.tracoCotas.clique(event)) return;
    model.setPointerCapture(event.pointerId); part.drag = [event.clientX, event.clientY];
  });
  model.addEventListener('pointermove', (event) => {
    if (!part.drag) return;
    part.yaw += (event.clientX - part.drag[0]) * .008;
    part.pitch = Math.max(.02, Math.min(1.5, part.pitch + (event.clientY - part.drag[1]) * .006));
    part.drag = [event.clientX, event.clientY]; render();
  });
  model.addEventListener('pointerup', () => { part.drag = null; });
  model.addEventListener('pointercancel', () => { part.drag = null; });
  model.addEventListener('wheel', (event) => {
    event.preventDefault(); part.zoom = Math.max(.5, Math.min(3, part.zoom * (event.deltaY > 0 ? .92 : 1.08)));
    render();
  }, { passive: false });
  $('resetPartView').addEventListener('click', () => {
    part.yaw = -.65; part.pitch = .45; part.zoom = 1; render();
  });
  $('exportPartStl').addEventListener('click', exportStl);
  $('savePart').addEventListener('click', () => {
    save();
    download('traco-peca.json', JSON.stringify({ version: 1, kind: 'rotational-part',
      mode: part.mode, cup: part.cup, profile: part.profile, closed: part.closed,
      operation: part.operation, extrudeDepth: part.extrudeDepth,
      shapeType: part.shapeType, holeDiameter: part.holeDiameter, helix: part.helix, narrado: part.narrado, paint: part.paint }), 'application/json');
  });
  $('openPart').addEventListener('click', () => $('partFile').click());
  $('partFile').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.size > 200_000) { $('profileStatus').textContent = 'Projeto de peça grande demais.'; return; }
    try { openProject(await file.text()); save(); }
    catch { $('profileStatus').textContent = 'Não foi possível abrir esse projeto de peça.'; }
  });
  // API para extras.js (pintura, 3MF, STEP, histórico).
  window.tracoPeca = {
    part, mesh, meshBase, geomKey, render, model, download, save: () => { save(); }, refresh: () => refresh(),
    // Peças para exportar: [{nome, tris, ini}] — ini = índice do 1º triângulo na malha global.
    pecas() {
      if (part.operation === 'narrado') {
        const m = window.tracoNarrado.montar(part.narrado); let ini = 0; let x = 0;
        return m.pecas.map((pc, i) => { const r = { nome: pc.nome, tris: m.tris.slice(ini, ini + pc.tris.length), ini, spec: part.narrado.pecas[i] }; ini += pc.tris.length; return r; });
      }
      const t = meshBase();
      return t.length ? [{ nome: part.mode === 'cup' ? 'Copo' : 'Peça', tris: t, ini: 0 }] : [];
    },
    projeto() { return JSON.stringify({ version: 1, kind: 'rotational-part', mode: part.mode, cup: part.cup, profile: part.profile, closed: part.closed,
      operation: part.operation, extrudeDepth: part.extrudeDepth, shapeType: part.shapeType, holeDiameter: part.holeDiameter, helix: part.helix, narrado: part.narrado, paint: part.paint }); },
    abrir(raw) { part.sim = null; openProject(raw); save(); refresh(); },
  };
  // Simulação de montagem: o parafuso desce girando pelo furo; o corpo fica transparente.
  function pararSim() { part.sim = null; refresh(); }
  $('simularMontagem')?.addEventListener('click', () => {
    if (part.sim) { pararSim(); return; }
    const m = window.tracoNarrado.parMontagem(part.narrado); if (!m) return;
    const t0 = window.tracoNarrado.montagem(part.narrado, 0).tris, t1 = window.tracoNarrado.montagem(part.narrado, m.curso).tris;
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const t of [...t0, ...t1]) for (const q of t.points) for (let k = 0; k < 3; k++) { box[k] = Math.min(box[k], q[k]); box[k + 3] = Math.max(box[k + 3], q[k]); }
    const dur = Math.min(9000, Math.max(3500, m.curso / m.passo * 450)), ini = performance.now();
    part.sim = { s: 0, box };
    refresh();
    const passo = (agora) => {
      if (!part.sim) return;
      const f = Math.min(1, (agora - ini) / dur);
      part.sim.s = f * m.curso; render();
      if (f < 1) setTimeout(() => requestAnimationFrame(passo), 60);
      else $('partStatus').textContent = 'Montado · ' + m.msgs.join(' ');
    };
    requestAnimationFrame(passo);
  });
  // Usado pela narração (narrar.js): mostra as peças montadas e o corte da 1ª no quadro 2D.
  window.tracoAbrirNarrado = (spec) => {
    if (!window.tracoNarrado.montar(spec).tris.length) throw new Error('nenhuma geometria');
    part.sim = null; part.mode = 'custom'; part.operation = 'narrado'; part.narrado = spec;
    part.profile = window.tracoNarrado.corte(spec.pecas[0]).map(([x, z]) => [Math.max(0, x), Math.max(0, z)]);
    part.closed = true; part.shapeType = null; part.holeDiameter = 0; part.shapeTool = null;
    part.drawLine = false; part.freehand = false; part.pending = false; part.showHoleControls = false;
    part.selected = [...part.profile.at(-1)]; part.zoom = 1;
    fitSketchView(); save(); refresh();
  };
  // Usado pela leitura de foto (foto.js): abre um perfil já em mm como peça personalizada.
  window.tracoAbrirPeca = (dados) => {
    openProject(JSON.stringify({ version: 1, kind: 'rotational-part', cup: { ...example }, ...dados }));
    part.drawLine = false; part.freehand = false; part.shapeTool = null; part.pending = false;
    fitSketchView(); save(); refresh();
  };
  // Zoom (roda/pinça do trackpad) no ponto do cursor e arrasto com botão do meio, direito ou espaço.
  window.tracoZoomPeca = (fator, ev) => {
    const rect = sketch.getBoundingClientRect();
    const t = sketchTransform(rect.width, rect.height);
    const at = ev ? t.world([ev.clientX - rect.left, ev.clientY - rect.top]) :
      [(part.view.r0 || 0) + part.view.r / 2, (part.view.z0 || 0) + part.view.z / 2];
    const v = part.view, f = 1 / fator;
    const nr = Math.max(.5, Math.min(MAX_MM, v.r * f)), nz = nr * (v.z / v.r);
    v.r0 = Math.max(0, at[0] - (at[0] - (v.r0 || 0)) * nr / v.r);
    v.z0 = Math.max(0, at[1] - (at[1] - (v.z0 || 0)) * nz / v.z);
    v.r = nr; v.z = nz; render();
  };
  sketch.addEventListener('wheel', (event) => {
    event.preventDefault();
    window.tracoZoomPeca(Math.exp(-event.deltaY * (event.ctrlKey ? .01 : .0015)), event);
  }, { passive: false });
  let pan = null, espaco = false;
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && document.activeElement === sketch) { espaco = true; e.preventDefault(); } });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') espaco = false; });
  sketch.addEventListener('pointerdown', (event) => {
    if (!(event.button === 1 || event.button === 2 || espaco)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    pan = { id: event.pointerId, x: event.clientX, y: event.clientY, r0: part.view.r0 || 0, z0: part.view.z0 || 0 };
    sketch.setPointerCapture(event.pointerId);
  }, { capture: true });
  sketch.addEventListener('pointermove', (event) => {
    if (!pan || pan.id !== event.pointerId) return;
    event.stopImmediatePropagation();
    const rect = sketch.getBoundingClientRect(), t = sketchTransform(rect.width, rect.height);
    part.view.r0 = Math.max(0, pan.r0 - (event.clientX - pan.x) / (t.right - t.left) * part.view.r);
    part.view.z0 = Math.max(0, pan.z0 + (event.clientY - pan.y) / (t.bottom - t.top) * part.view.z);
    render();
  }, { capture: true });
  for (const type of ['pointerup', 'pointercancel']) sketch.addEventListener(type, (event) => {
    if (!pan || pan.id !== event.pointerId) return;
    event.stopImmediatePropagation(); pan = null;
  }, { capture: true });
  new ResizeObserver(render).observe(sketch);
  new ResizeObserver(render).observe(model);
  refresh();
  try { if (localStorage.getItem('traco-active-mode') === 'parts') switchMode('parts'); } catch { /* Optional preference. */ }
})();
