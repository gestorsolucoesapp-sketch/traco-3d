const DESIGN_WIDTH = 760;
const DESIGN_HEIGHT = 560;
const STORAGE_KEY = 'traco-project-v1';
const MAX_STROKES = 250;
const MAX_SEGMENTS = 700;
const MAX_STL_BYTES = 20_000_000;
const MAX_STL_TRIANGLES = 400_000;
const PREVIEW_TRIANGLES = 4_000;

const $ = (id) => document.getElementById(id);
const sketchCanvas = $('sketchCanvas');
const modelCanvas = $('modelCanvas');
const sketchContext = sketchCanvas.getContext('2d');
const modelContext = modelCanvas.getContext('2d');

const state = {
  strokes: [],
  openings: [],
  history: [],
  future: [],
  draft: null,
  tool: 'line',
  rectangleStart: null,
  rectanglePointerId: null,
  lineStart: null,
  linePreview: null,
  linePending: false,
  lineSnapKind: null,
  lineGuides: [],
  lineLock: null,      // direção travada (Shift ou setas) — vetor unitário
  lineLockKey: null,   // 'shift' | 'x' | 'y'
  lineHover: null,     // inferência mostrada antes do 1º clique
  lineDragOrigin: null,
  lineConfirmOnRelease: false,
  lineRequestMeasureOnRelease: false,
  selectedWallKey: null,
  moveDrag: null,
  stlMesh: null,
  height: 2.7,
  wallsRaised: false,
  modelTool: 'orbit',
  pushDraftHeight: null,
  pushDrag: null,
  thickness: .15,
  floorEnabled: true,
  pixelsPerMeter: 80,
  yaw: -0.73,
  pitch: 0.92,
  zoom: 1,
  draggingModel: null,
};

let renderScheduled = false;
let saveTimer = null;
let toastTimer = null;

function notify(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function safeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function validStlMesh(mesh) {
  return mesh && typeof mesh.name === 'string' && mesh.name.length <= 160 &&
    ['mm', 'cm', 'm'].includes(mesh.unit) &&
    Number.isInteger(mesh.totalTriangles) && mesh.totalTriangles > 0 && mesh.totalTriangles <= MAX_STL_TRIANGLES &&
    Array.isArray(mesh.triangles) && mesh.triangles.length > 0 && mesh.triangles.length <= PREVIEW_TRIANGLES &&
    mesh.triangles.every((triangle) => Array.isArray(triangle) && triangle.length === 9 &&
      triangle.every((value) => Number.isFinite(value) && Math.abs(value) <= 100_000_000)) &&
    Array.isArray(mesh.min) && Array.isArray(mesh.max) && mesh.min.length === 3 && mesh.max.length === 3 &&
    [...mesh.min, ...mesh.max].every((value) => Number.isFinite(value) && Math.abs(value) <= 100_000_000);
}

function projectPayload() {
  return {
    version: 1,
    strokes: state.strokes,
    openings: state.openings,
    height: state.height,
    wallsRaised: state.wallsRaised,
    thickness: state.thickness,
    floorEnabled: state.floorEnabled,
    pixelsPerMeter: state.pixelsPerMeter,
    stlMesh: state.stlMesh,
  };
}

function parseProject(raw) {
  const project = JSON.parse(raw);
  const openings = project?.openings ?? [];
  if (!project || project.version !== 1 || !Array.isArray(project.strokes) ||
      project.strokes.length > MAX_STROKES ||
      project.strokes.reduce((count, stroke) => count + (Array.isArray(stroke) ? stroke.length - 1 : 0), 0) > MAX_SEGMENTS ||
      (project.stlMesh != null && !validStlMesh(project.stlMesh)) ||
      !Array.isArray(openings) || openings.length > MAX_SEGMENTS ||
      !openings.every((opening) => opening && ['door', 'window'].includes(opening.kind) &&
        typeof opening.wallKey === 'string' && opening.wallKey.length <= 100 &&
        Number.isFinite(opening.t) && opening.t >= 0 && opening.t <= 1 &&
        Number.isFinite(opening.width) && opening.width >= .4 && opening.width <= 3) ||
      !project.strokes.every((stroke) =>
        Array.isArray(stroke) && stroke.length >= 2 && stroke.length <= 150 &&
        stroke.every((point) => Array.isArray(point) && point.length === 2 &&
          Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
          point[0] >= 0 && point[0] <= DESIGN_WIDTH && point[1] >= 0 && point[1] <= DESIGN_HEIGHT)))
    throw new Error('Formato de projeto inválido');
  const keys = segmentKeys(project.strokes);
  if (new Set(openings.map((opening) => opening.wallKey)).size !== openings.length)
    throw new Error('Aberturas duplicadas');
  const lengths = new Map();
  for (const stroke of project.strokes)
    for (let i = 1; i < stroke.length; i++)
      lengths.set(wallKey(stroke[i - 1], stroke[i]), pointDistance(stroke[i - 1], stroke[i]) /
        safeNumber(project.pixelsPerMeter, 80, 40, 160));
  if (openings.some((opening) => {
    const length = lengths.get(opening.wallKey);
    return length == null || length < opening.width + .3 ||
      opening.t * length < opening.width / 2 + .14 ||
      (1 - opening.t) * length < opening.width / 2 + .14;
  })) throw new Error('Abertura fora da parede');
  return {
    strokes: project.strokes,
    openings: openings.filter((opening) => keys.has(opening.wallKey)),
    height: safeNumber(project.height, 2.7, .2, 10),
    wallsRaised: typeof project.wallsRaised === 'boolean' ? project.wallsRaised : project.strokes.length > 0,
    thickness: safeNumber(project.thickness, .15, .1, .3),
    floorEnabled: project.floorEnabled !== false,
    pixelsPerMeter: safeNumber(project.pixelsPerMeter, 80, 40, 160),
    stlMesh: project.stlMesh ?? null,
  };
}

function readSavedProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    Object.assign(state, parseProject(raw));
  } catch { /* Storage may be unavailable or hold an older format. */ }
}

function saveProject() {
  try { window.tracoHistorico?.mudou('planta'); } catch { /* opcional */ }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projectPayload()));
  } catch { notify('O navegador não permitiu salvar neste dispositivo.'); }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProject, 350);
}

function pointDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pointSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return pointDistance(point, start);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dy);
}

function simplify(points, tolerance = 5) {
  if (points.length <= 2) return points;
  let farthest = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = pointSegmentDistance(points[i], points[0], points.at(-1));
    if (distance > farthest) { farthest = distance; index = i; }
  }
  if (farthest <= tolerance) return [points[0], points.at(-1)];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance)];
}

function snapToExisting(point, toleranceCss = 16) {
  let best = null;
  let distance = toleranceCss;
  const bounds = sketchCanvas.getBoundingClientRect();
  const scaleX = bounds.width / DESIGN_WIDTH * vk();
  const scaleY = bounds.height / DESIGN_HEIGHT * vk();
  for (const stroke of state.strokes) {
    for (const candidate of [stroke[0], stroke.at(-1)]) {
      const current = Math.hypot((point[0] - candidate[0]) * scaleX,
        (point[1] - candidate[1]) * scaleY);
      if (current < distance) { distance = current; best = candidate; }
    }
  }
  return best ? [...best] : null;
}

function snapPoint(point, origin = null, bypass = false, pointerType = 'mouse') {
  if (bypass) return { point, kind: 'free' };
  const tol = pointerType === 'touch' ? 16 : 10;
  const step = state.pixelsPerMeter / 10;
  // Direção travada (Shift ou setas): projeta o cursor nessa reta.
  if (origin && state.lineLock) {
    const [ux, uy] = state.lineLock;
    const t = (point[0] - origin[0]) * ux + (point[1] - origin[1]) * uy;
    const isX = Math.abs(uy) < 1e-6, isY = Math.abs(ux) < 1e-6;
    if (isX) {
      const inf = inferAlign(point, origin, tol, 'x');
      return { point: [inf.x ?? Math.round((origin[0] + t * ux) / step) * step, origin[1]], kind: 'x', guides: inf.guides, locked: true };
    }
    if (isY) {
      const inf = inferAlign(point, origin, tol, 'y');
      return { point: [origin[0], inf.y ?? Math.round((origin[1] + t * uy) / step) * step], kind: 'y', guides: inf.guides, locked: true };
    }
    const len = Math.round(t / step) * step;
    return { point: [origin[0] + ux * len, origin[1] + uy * len], kind: 'lock', guides: [], locked: true };
  }
  const hit = inferPoint(point, origin, pointerType === 'touch' ? 22 : 16);
  if (hit) return { point: hit.point, kind: hit.kind, guides: [] };
  if (origin) {
    const dx = point[0] - origin[0], dy = point[1] - origin[1];
    if (Math.abs(dx) > 10 && Math.abs(dy) <= Math.abs(dx) * .22) {
      const inf = inferAlign(point, origin, tol, 'x');
      return { point: [inf.x ?? Math.round(point[0] / step) * step, origin[1]], kind: 'x', guides: inf.guides };
    }
    if (Math.abs(dy) > 10 && Math.abs(dx) <= Math.abs(dy) * .22) {
      const inf = inferAlign(point, origin, tol, 'y');
      return { point: [origin[0], inf.y ?? Math.round(point[1] / step) * step], kind: 'y', guides: inf.guides };
    }
  }
  const inf = inferAlign(point, origin, tol, null);
  return { point: [inf.x ?? Math.round(point[0] / step) * step, inf.y ?? Math.round(point[1] / step) * step],
    kind: inf.guides.length ? 'align' : 'grid', guides: inf.guides };
}

// Inferência de ponto estilo SketchUp: ponta (verde) > ponto médio (ciano) > na aresta (vermelho).
function inferPoint(point, origin, toleranceCss) {
  const bounds = sketchCanvas.getBoundingClientRect();
  const sx = (bounds.width / DESIGN_WIDTH || 1) * vk(), sy = (bounds.height / DESIGN_HEIGHT || 1) * vk();
  const dist = (a) => Math.hypot((point[0] - a[0]) * sx, (point[1] - a[1]) * sy);
  const isOrigin = (a) => origin && Math.abs(a[0] - origin[0]) < .5 && Math.abs(a[1] - origin[1]) < .5;
  let best = null, bestD = toleranceCss;
  for (const stroke of state.strokes)
    for (const c of [stroke[0], stroke.at(-1), ...stroke.slice(1, -1)]) {
      if (isOrigin(c)) continue;
      const d = dist(c); if (d < bestD) { bestD = d; best = { point: [...c], kind: 'point' }; }
    }
  if (best) return best;
  bestD = toleranceCss * .8;
  for (const stroke of state.strokes)
    for (let i = 1; i < stroke.length; i++) {
      const m = [(stroke[i - 1][0] + stroke[i][0]) / 2, (stroke[i - 1][1] + stroke[i][1]) / 2];
      const d = dist(m); if (d < bestD) { bestD = d; best = { point: m, kind: 'mid' }; }
    }
  if (best) return best;
  bestD = toleranceCss * .55;
  for (const stroke of state.strokes)
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1], b = stroke[i];
      const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy;
      if (L < 1) continue;
      const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * vx + (point[1] - a[1]) * vy) / L));
      const q = [a[0] + vx * t, a[1] + vy * t];
      if (isOrigin(q)) continue;
      const d = dist(q); if (d < bestD) { bestD = d; best = { point: q, kind: 'edge' }; }
    }
  return best;
}

// Inferência estilo SketchUp: alinha a ponta com pontos já desenhados (mesma altura ou mesma coluna)
// e devolve as guias tracejadas que ligam o ponto de referência à ponta.
function inferAlign(point, origin, toleranceCss, lockedAxis) {
  const bounds = sketchCanvas.getBoundingClientRect();
  const scaleX = (bounds.width / DESIGN_WIDTH || 1) * vk();
  const scaleY = (bounds.height / DESIGN_HEIGHT || 1) * vk();
  let bestX = null, dX = toleranceCss, bestY = null, dY = toleranceCss;
  const seen = new Set();
  for (const stroke of state.strokes) {
    for (const c of stroke) {
      const key = c[0].toFixed(2) + ',' + c[1].toFixed(2);
      if (seen.has(key)) continue; seen.add(key);
      if (origin && Math.abs(c[0] - origin[0]) < .5 && Math.abs(c[1] - origin[1]) < .5) continue;
      if (lockedAxis !== 'y') { // pode ajustar X: procura ponto na mesma coluna
        const d = Math.abs(point[0] - c[0]) * scaleX;
        if (d < dX && Math.abs(point[1] - c[1]) * scaleY > 4) { dX = d; bestX = c; }
      }
      if (lockedAxis !== 'x') { // pode ajustar Y: procura ponto na mesma altura
        const d = Math.abs(point[1] - c[1]) * scaleY;
        if (d < dY && Math.abs(point[0] - c[0]) * scaleX > 4) { dY = d; bestY = c; }
      }
    }
  }
  const guides = [];
  if (bestX) guides.push({ from: [...bestX], axis: 'v' });
  if (bestY) guides.push({ from: [...bestY], axis: 'h' });
  return { x: bestX ? bestX[0] : null, y: bestY ? bestY[1] : null, guides };
}

function formatMeters(pixels) {
  return `${(pixels / state.pixelsPerMeter).toFixed(2).replace('.', ',')} m`;
}

function refreshMeasure() {
  const selected = state.tool === 'line' && selectedWall();
  const active = state.tool === 'line' && (Boolean(state.lineStart) || Boolean(selected));
  $('measureInput').disabled = !active;
  $('applyMeasure').disabled = !active;
  if (selected && !state.lineStart) {
    $('liveMeasure').textContent = `Editar parede: ${formatMeters(pointDistance(selected.start, selected.end))}`;
    return;
  }
  const distance = active && state.linePreview ? pointDistance(state.lineStart, state.linePreview) : 0;
  const axis = state.lineSnapKind === 'x' ? ' · eixo X' : state.lineSnapKind === 'y' ? ' · eixo Y' :
    state.lineSnapKind === 'point' ? ' · ponto final' : state.lineSnapKind === 'mid' ? ' · ponto médio' :
    state.lineSnapKind === 'edge' ? ' · na aresta' : state.lineSnapKind === 'lock' ? ' · travado' : '';
  const alinh = (state.lineGuides || []).length ? ' · alinhado' : '';
  const typed = $('measureInput').value.trim();
  if (active && state.angleTyping != null) {
    $('liveMeasure').textContent = `Ângulo: ${state.angleTyping || '_'}° · Enter trava · Esc cancela`;
    return;
  }
  const ang = state.lineLockKey === 'ang' ? ` · ângulo ${String(state.lineAngle).replace('.', ',')}°` : '';
  $('liveMeasure').textContent = active ? typed ?
    `Medida: ${typed} · Enter conclui${ang || axis + alinh}` : ang ?
    `Prévia: ${formatMeters(distance)}${ang} · clique ou digite medida` :
    `Prévia: ${formatMeters(distance)}${axis}${alinh} · ${alinh || ['point', 'mid', 'edge'].includes(state.lineSnapKind) ? 'Enter conclui' : 'clique ou digite medida'}` : 'Toque para iniciar';
}

function cancelLine() {
  if (state.moveDrag) {
    state.strokes = state.moveDrag.strokes;
    state.openings = state.moveDrag.openings;
    state.moveDrag = null;
  }
  state.lineStart = null;
  state.linePreview = null;
  state.linePending = false;
  state.lineSnapKind = null;
  state.lineGuides = [];
  state.lineDragOrigin = null;
  state.lineConfirmOnRelease = false;
  state.lineRequestMeasureOnRelease = false;
  state.selectedWallKey = null;
  state.lineLock = null; state.lineLockKey = null; state.angleTyping = null;
  $('measureInput').value = '';
  if (state.tool === 'line') $('toolHint').textContent = 'Arraste uma parede para mover · toque para editar';
  refreshMeasure();
  refreshControls();
  requestRender();
}

function commitLine(end) {
  if (!state.lineStart || pointDistance(state.lineStart, end) < 5) return;
  if (state.strokes.length >= MAX_STROKES || segments().length >= MAX_SEGMENTS) {
    notify('O projeto chegou ao limite de paredes.');
    return;
  }
  const start = state.lineStart;
  const rounded = end.map((value) => Math.round(value * 100) / 100);
  const closes = state.strokes.some((st) => st.some((c) => Math.abs(c[0] - rounded[0]) < .5 && Math.abs(c[1] - rounded[1]) < .5));
  state.selectedWallKey = wallKey(start, rounded);
  commit([...state.strokes, [start, rounded]]);
  $('toast').classList.remove('show');
  state.lineLock = null; state.lineLockKey = null;
  if (!closes) {
    // Igual ao SketchUp: a próxima linha já sai da ponta desta, até Esc.
    state.lineStart = rounded;
    state.linePreview = rounded;
    state.linePending = false;
    state.lineSnapKind = null;
    state.lineGuides = [];
    state.lineDragOrigin = null;
    state.lineConfirmOnRelease = false;
    state.lineRequestMeasureOnRelease = false;
    $('measureInput').value = '';
    $('toolHint').textContent = 'Continue a próxima linha · Esc encerra';
    refreshMeasure(); requestRender();
    return;
  }
  state.lineStart = null;
  state.linePreview = null;
  state.linePending = false;
  state.lineSnapKind = null;
  state.lineGuides = [];
  state.lineDragOrigin = null;
  state.lineConfirmOnRelease = false;
  state.lineRequestMeasureOnRelease = false;
  $('measureInput').value = `${(pointDistance(start, rounded) / state.pixelsPerMeter).toFixed(3).replace('.', ',')} m`;
  $('toolHint').textContent = 'Arraste a parede para mover · toque para editar medida';
  refreshMeasure();
}

function parseLength(text) {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\s*$/i.exec(text);
  if (!match) return null;
  const numeric = Number(match[1].replace(',', '.'));
  const factor = match[2]?.toLowerCase() === 'mm' ? .001 : match[2]?.toLowerCase() === 'cm' ? .01 : 1;
  const meters = numeric * factor;
  return Number.isFinite(meters) && meters >= .15 && meters <= 100 ? meters : null;
}

function measuredLineEnd(meters, start, preview) {
  let dx = preview[0] - start[0];
  let dy = preview[1] - start[1];
  if (Math.hypot(dx, dy) < 1) { dx = 1; dy = 0; }
  const factor = meters * state.pixelsPerMeter / Math.hypot(dx, dy);
  return [start[0] + dx * factor, start[1] + dy * factor];
}

function applyExactLength() {
  if (!state.lineStart && !selectedWall()) return;
  // Sem medida digitada: se a ponta está alinhada (guia) ou grudada num ponto, Enter conclui ali mesmo.
  if (state.lineStart && !$('measureInput').value.trim() && state.linePreview &&
      ((state.lineGuides || []).length || ['point', 'mid', 'edge'].includes(state.lineSnapKind)) &&
      pointDistance(state.lineStart, state.linePreview) >= 5) {
    commitLine(state.linePreview); return;
  }
  const meters = parseLength($('measureInput').value);
  if (meters == null) { notify('Digite uma medida entre 15 cm e 100 m. Ex.: 2,50 m.'); return; }
  if (!state.lineStart) { editSelectedWallLength(meters); return; }
  const start = state.lineStart;
  let preview = state.linePreview ?? [start[0] + 1, start[1]];
  if (state.lineLock && pointDistance(start, preview) < 1) preview = [start[0] + state.lineLock[0], start[1] + state.lineLock[1]];
  let end = measuredLineEnd(meters, start, preview);
  if (state.lineSnapKind === 'point' && pointDistance(start, preview) >= 5) {
    const connectedMeters = pointDistance(start, preview) / state.pixelsPerMeter;
    if (Math.abs(connectedMeters - meters) > .0005) {
      notify(`Esse ponto exige ${connectedMeters.toFixed(3).replace('.', ',')} m. Ajuste a medida para conectar.`);
      return;
    }
    end = preview;
  }
  if (end[0] < 0 || end[0] > DESIGN_WIDTH || end[1] < 0 || end[1] > DESIGN_HEIGHT) {
    notify('A linha ultrapassa o quadro. Reduza a escala ou comece mais ao centro.');
    return;
  }
  commitLine(end);
  $('measureInput').blur();
}

function normalizeStroke(points) {
  let result = simplify(points, 6).filter((point, index, all) =>
    index === 0 || pointDistance(point, all[index - 1]) >= 3);
  if (result.length < 2 || pointDistance(result[0], result.at(-1)) < 8) return null;
  result = result.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  result[0] = snapToExisting(result[0]) ?? result[0];
  result[result.length - 1] = snapToExisting(result.at(-1)) ?? result.at(-1);
  return result.slice(0, 150);
}

function segments() {
  const list = [];
  for (const stroke of state.strokes) {
    for (let i = 1; i < stroke.length && list.length < MAX_SEGMENTS; i++) {
      if (pointDistance(stroke[i - 1], stroke[i]) >= 5)
        list.push([stroke[i - 1], stroke[i]]);
    }
  }
  return list;
}

function wallKey(start, end) {
  return `${start[0]},${start[1]}>${end[0]},${end[1]}`;
}

function segmentKeys(strokes) {
  const keys = new Set();
  for (const stroke of strokes)
    for (let i = 1; i < stroke.length; i++) keys.add(wallKey(stroke[i - 1], stroke[i]));
  return keys;
}

function polygonArea(points) {
  return Math.abs(points.reduce((sum, [x, y], i) => {
    const [nextX, nextY] = points[(i + 1) % points.length];
    return sum + x * nextY - nextX * y;
  }, 0) / 2);
}

function floorOutline() {
  if (!state.floorEnabled) return null;
  const edges = [], outgoing = new Map();
  const addEdge = (from, to, reverse) => {
    const id = edges.length;
    edges.push({ from, to, reverse });
    const key = `${from[0].toFixed(2)},${from[1].toFixed(2)}`;
    if (!outgoing.has(key)) outgoing.set(key, []);
    outgoing.get(key).push(id);
  };
  for (const [start, end] of segments()) {
    const id = edges.length;
    addEdge(start, end, id + 1);
    addEdge(end, start, id);
  }
  for (const ids of outgoing.values()) ids.sort((a, b) => {
    const one = edges[a], two = edges[b];
    return Math.atan2(one.to[1] - one.from[1], one.to[0] - one.from[0]) -
      Math.atan2(two.to[1] - two.from[1], two.to[0] - two.from[0]);
  });
  const visited = new Set();
  let best = null, bestArea = 0;
  for (let start = 0; start < edges.length; start++) {
    if (visited.has(start)) continue;
    const polygon = [];
    let current = start, closed = false;
    for (let count = 0; count <= edges.length; count++) {
      if (visited.has(current)) break;
      visited.add(current);
      const edge = edges[current];
      polygon.push(edge.from);
      const key = `${edge.to[0].toFixed(2)},${edge.to[1].toFixed(2)}`;
      const choices = outgoing.get(key);
      if (!choices) break;
      const reverseIndex = choices.indexOf(edge.reverse);
      if (reverseIndex < 0) break;
      current = choices[(reverseIndex - 1 + choices.length) % choices.length];
      if (current === start) { closed = true; break; }
    }
    if (!closed || polygon.length < 3) continue;
    const unique = new Set(polygon.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`));
    if (unique.size !== polygon.length) continue;
    const area = polygonArea(polygon);
    if (area > bestArea && area / state.pixelsPerMeter ** 2 >= .5) {
      best = polygon; bestArea = area;
    }
  }
  return best;
}

function nearestWall(point, toleranceCss = 18) {
  let best = null;
  const bounds = sketchCanvas.getBoundingClientRect();
  const xScale = bounds.width / DESIGN_WIDTH * vk(), yScale = bounds.height / DESIGN_HEIGHT * vk();
  for (const [start, end] of segments()) {
    const dx = end[0] - start[0], dy = end[1] - start[1];
    const squared = dx * dx + dy * dy;
    if (squared < 1) continue;
    const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / squared));
    const center = [start[0] + t * dx, start[1] + t * dy];
    const distance = pointSegmentDistance([point[0] * xScale, point[1] * yScale],
      [start[0] * xScale, start[1] * yScale],
      [end[0] * xScale, end[1] * yScale]);
    if (!best || distance < best.distance) best = { start, end, t, center, distance, key: wallKey(start, end) };
  }
  return best && best.distance <= toleranceCss ? best : null;
}

function selectedWall() {
  if (!state.selectedWallKey) return null;
  for (let strokeIndex = 0; strokeIndex < state.strokes.length; strokeIndex++) {
    const stroke = state.strokes[strokeIndex];
    for (let segmentIndex = 1; segmentIndex < stroke.length; segmentIndex++) {
      const start = stroke[segmentIndex - 1], end = stroke[segmentIndex];
      if (wallKey(start, end) === state.selectedWallKey)
        return { start, end, strokeIndex, segmentIndex };
    }
  }
  return null;
}

function selectWall(wall) {
  state.selectedWallKey = wall.key;
  state.lineStart = null;
  state.linePreview = null;
  state.linePending = false;
  state.lineDragOrigin = null;
  $('measureInput').value = `${(pointDistance(wall.start, wall.end) / state.pixelsPerMeter).toFixed(3).replace('.', ',')} m`;
  $('toolHint').textContent = 'Arraste para mover · digite medida e Enter para alterar';
  refreshMeasure(); requestRender();
}

function remapOpenings(strokes, next, openings) {
  const keyMap = new Map();
  for (let i = 0; i < strokes.length; i++)
    for (let j = 1; j < strokes[i].length; j++)
      keyMap.set(wallKey(strokes[i][j - 1], strokes[i][j]),
        wallKey(next[i][j - 1], next[i][j]));
  return openings.map((opening) =>
    ({ ...opening, wallKey: keyMap.get(opening.wallKey) ?? opening.wallKey }));
}

function startWallMove(point, wall, pointerId) {
  const pointKey = ([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`;
  const neighbors = new Map();
  for (const [a, b] of segments()) {
    const ak = pointKey(a), bk = pointKey(b);
    if (!neighbors.has(ak)) neighbors.set(ak, new Set());
    if (!neighbors.has(bk)) neighbors.set(bk, new Set());
    neighbors.get(ak).add(bk); neighbors.get(bk).add(ak);
  }
  const keys = new Set([pointKey(wall.start)]), queue = [...keys];
  for (let i = 0; i < queue.length; i++)
    for (const neighbor of neighbors.get(queue[i]) ?? [])
      if (!keys.has(neighbor)) { keys.add(neighbor); queue.push(neighbor); }
  state.moveDrag = {
    origin: point, strokes: state.strokes, openings: state.openings,
    selectedKey: wall.key, keys, pointerId, moved: false,
  };
  sketchCanvas.setPointerCapture(pointerId);
}

function updateWallMove(point) {
  const drag = state.moveDrag;
  if (!drag) return;
  let dx = Math.round((point[0] - drag.origin[0]) * 100) / 100;
  let dy = Math.round((point[1] - drag.origin[1]) * 100) / 100;
  if (Math.hypot(dx, dy) < 3 && !drag.moved) return;
  drag.moved = true;
  const key = ([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`;
  const moving = drag.strokes.flat().filter((p) => drag.keys.has(key(p)));
  dx = Math.max(-Math.min(...moving.map((p) => p[0])),
    Math.min(DESIGN_WIDTH - Math.max(...moving.map((p) => p[0])), dx));
  dy = Math.max(-Math.min(...moving.map((p) => p[1])),
    Math.min(DESIGN_HEIGHT - Math.max(...moving.map((p) => p[1])), dy));
  const next = drag.strokes.map((stroke) => stroke.map((p) =>
    drag.keys.has(key(p)) ? [Math.round((p[0] + dx) * 100) / 100,
      Math.round((p[1] + dy) * 100) / 100] : [...p]));
  const keyMap = new Map();
  for (let i = 0; i < drag.strokes.length; i++)
    for (let j = 1; j < drag.strokes[i].length; j++)
      keyMap.set(wallKey(drag.strokes[i][j - 1], drag.strokes[i][j]),
        wallKey(next[i][j - 1], next[i][j]));
  state.strokes = next;
  state.openings = remapOpenings(drag.strokes, next, drag.openings);
  state.selectedWallKey = keyMap.get(drag.selectedKey) ?? null;
  refreshControls(); refreshMeasure(); requestRender();
}

function finishWallMove(cancel = false) {
  const drag = state.moveDrag;
  if (!drag) return;
  const next = state.strokes, openings = state.openings, selectedKey = state.selectedWallKey;
  state.strokes = drag.strokes;
  state.openings = drag.openings;
  state.moveDrag = null;
  state.selectedWallKey = cancel ? drag.selectedKey : selectedKey;
  if (drag.moved && !cancel) commit(next, openings);
  else { refreshControls(); requestRender(); }
  refreshMeasure();
}

function editSelectedWallLength(meters) {
  const wall = selectedWall();
  if (!wall) return;
  const dx = wall.end[0] - wall.start[0], dy = wall.end[1] - wall.start[1];
  const factor = meters * state.pixelsPerMeter / Math.hypot(dx, dy);
  const end = [wall.start[0] + dx * factor, wall.start[1] + dy * factor]
    .map((value) => Math.round(value * 100) / 100);
  if (end[0] < 0 || end[0] > DESIGN_WIDTH || end[1] < 0 || end[1] > DESIGN_HEIGHT) {
    notify('A parede editada ultrapassaria o quadro.'); return;
  }
  const oldEnd = wall.end;
  const delta = [end[0] - oldEnd[0], end[1] - oldEnd[1]];
  const pointKey = ([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`;
  const startKey = pointKey(wall.start), endKey = pointKey(oldEnd);
  const neighbors = new Map();
  const connect = (a, b) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    neighbors.get(a).add(b);
  };
  for (let i = 0; i < state.strokes.length; i++)
    for (let j = 1; j < state.strokes[i].length; j++) {
      if (i === wall.strokeIndex && j === wall.segmentIndex) continue;
      const a = pointKey(state.strokes[i][j - 1]), b = pointKey(state.strokes[i][j]);
      connect(a, b); connect(b, a);
    }
  const movable = new Set([endKey]), queue = [endKey];
  for (let i = 0; i < queue.length; i++)
    for (const neighbor of neighbors.get(queue[i]) ?? [])
      if (!movable.has(neighbor)) { movable.add(neighbor); queue.push(neighbor); }
  if (movable.has(startKey)) {
    movable.clear();
    const half = (dx * dx + dy * dy) / 2;
    for (const stroke of state.strokes)
      for (const point of stroke)
        if ((point[0] - wall.start[0]) * dx + (point[1] - wall.start[1]) * dy > half)
          movable.add(pointKey(point));
  }
  const next = state.strokes.map((stroke) => stroke.map((point) =>
    movable.has(pointKey(point)) ? [point[0] + delta[0], point[1] + delta[1]]
      .map((value) => Math.round(value * 100) / 100) : [...point]));
  if (next.some((stroke) => stroke.some(([x, y]) =>
    x < 0 || x > DESIGN_WIDTH || y < 0 || y > DESIGN_HEIGHT)) ||
    next.some((stroke) => stroke.slice(1).some((point, index) => pointDistance(stroke[index], point) < 5))) {
    notify('A alteração tiraria paredes do quadro ou encurtaria uma ligação.'); return;
  }
  const openings = remapOpenings(state.strokes, next, state.openings);
  const lengths = new Map();
  for (const stroke of next)
    for (let j = 1; j < stroke.length; j++)
      lengths.set(wallKey(stroke[j - 1], stroke[j]),
        pointDistance(stroke[j - 1], stroke[j]) / state.pixelsPerMeter);
  if (openings.some((opening) => {
    const length = lengths.get(opening.wallKey);
    return length == null || length < opening.width + .3 ||
      opening.t * length < opening.width / 2 + .14 ||
      (1 - opening.t) * length < opening.width / 2 + .14;
  })) { notify('A alteração deixaria uma porta ou janela fora da parede.'); return; }
  const newKey = wallKey(wall.start, end);
  state.selectedWallKey = newKey;
  commit(next, openings);
  $('measureInput').value = `${(pointDistance(wall.start, end) / state.pixelsPerMeter).toFixed(3).replace('.', ',')} m`;
  $('measureInput').blur();
  $('toast').classList.remove('show');
  refreshMeasure(); requestRender();
}

function placeOpening(point) {
  const wall = nearestWall(point);
  if (!wall) { notify('Toque sobre uma parede para colocar a abertura.'); return; }
  if (state.openings.some((opening) => opening.wallKey === wall.key)) {
    notify('Esta parede já tem uma abertura. Use Apagar para trocar.'); return;
  }
  const kind = state.tool === 'door' ? 'door' : 'window';
  const width = kind === 'door' ? .9 : 1.2;
  const length = pointDistance(wall.start, wall.end) / state.pixelsPerMeter;
  if (length < width + .3) { notify('Parede curta para essa abertura.'); return; }
  const margin = (width / 2 + .15) / length;
  const t = Math.max(margin, Math.min(1 - margin, wall.t));
  commit(state.strokes, [...state.openings, { kind, wallKey: wall.key, t, width }]);
  notify(kind === 'door' ? 'Porta de 90 cm colocada.' : 'Janela de 1,20 m colocada.');
}

function snapshot() {
  return { strokes: state.strokes, openings: state.openings,
    height: state.height, thickness: state.thickness, wallsRaised: state.wallsRaised };
}

function recordHistory() {
  state.history.push(snapshot());
  if (state.history.length > 50) state.history.shift();
  state.future = [];
}

function commit(next, openings = state.openings) {
  recordHistory();
  state.strokes = next;
  const keys = segmentKeys(next);
  state.openings = openings.filter((opening) => keys.has(opening.wallKey));
  saveProject();
  refreshControls();
  requestRender();
}

// Zoom/arrasto da área de desenho: o quadro mostra a janela [ox, ox + W/k] × [oy, oy + H/k].
const sketchView = { k: 1, ox: 0, oy: 0 };
function vk() { return sketchView.k; }
function clampView() {
  sketchView.k = Math.max(1, Math.min(8, sketchView.k));
  sketchView.ox = Math.max(0, Math.min(DESIGN_WIDTH - DESIGN_WIDTH / sketchView.k, sketchView.ox));
  sketchView.oy = Math.max(0, Math.min(DESIGN_HEIGHT - DESIGN_HEIGHT / sketchView.k, sketchView.oy));
}
function zoomSketch(factor, at = [DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2]) {
  const k0 = sketchView.k, k1 = Math.max(1, Math.min(8, k0 * factor));
  sketchView.ox = at[0] - (at[0] - sketchView.ox) * k0 / k1;
  sketchView.oy = at[1] - (at[1] - sketchView.oy) * k0 / k1;
  sketchView.k = k1; clampView();
  const z = $('archZoomLevel'); if (z) z.textContent = `${Math.round(k1 * 100)}%`;
  requestRender();
}
function sketchPoint(event) {
  const bounds = sketchCanvas.getBoundingClientRect();
  const { k, ox, oy } = sketchView;
  const [lx, ly] = window.tracoLapis?.desvio(event) || [0, 0];
  event = { clientX: event.clientX + lx, clientY: event.clientY + ly };
  return [
    Math.max(0, Math.min(DESIGN_WIDTH, ox + (event.clientX - bounds.left) * DESIGN_WIDTH / bounds.width / k)),
    Math.max(0, Math.min(DESIGN_HEIGHT, oy + (event.clientY - bounds.top) * DESIGN_HEIGHT / bounds.height / k)),
  ];
}

function rectangleOutline(a, b) {
  const left = Math.min(a[0], b[0]), right = Math.max(a[0], b[0]);
  const top = Math.min(a[1], b[1]), bottom = Math.max(a[1], b[1]);
  return [[left, top], [right, top], [right, bottom], [left, bottom], [left, top]];
}

sketchCanvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 && event.pointerType === 'mouse') return;
  event.preventDefault();
  if (state.tool === 'line') sketchCanvas.focus({ preventScroll: true });
  const point = sketchPoint(event);
  if (state.tool === 'rectangle') {
    state.rectangleStart = snapPoint(point, null, event.altKey, event.pointerType).point;
    state.rectanglePointerId = event.pointerId;
    state.draft = rectangleOutline(state.rectangleStart, state.rectangleStart);
    sketchCanvas.setPointerCapture(event.pointerId);
    requestRender(); return;
  }
  if (state.tool === 'door' || state.tool === 'window') {
    placeOpening(point);
    return;
  }
  if (state.tool === 'erase') {
    const opening = state.openings.find((item) => {
      const wall = segments().find(([start, end]) => wallKey(start, end) === item.wallKey);
      if (!wall) return false;
      const center = [wall[0][0] + (wall[1][0] - wall[0][0]) * item.t,
        wall[0][1] + (wall[1][1] - wall[0][1]) * item.t];
      return pointDistance(point, center) < 18;
    });
    if (opening) { commit(state.strokes, state.openings.filter((item) => item !== opening)); return; }
    const index = state.strokes.findIndex((stroke) => stroke.slice(1).some((end, i) =>
      pointSegmentDistance(point, stroke[i], end) < 13));
    if (index >= 0) commit(state.strokes.filter((_, i) => i !== index));
    return;
  }
  if (state.tool === 'line') {
    state.lineHover = null;
    const snapped = snapPoint(point, state.lineStart, event.altKey, event.pointerType);
    if (!state.lineStart) {
      const hit = snapped.kind === 'point' ? null : nearestWall(point, event.pointerType === 'touch' ? 20 : 12);
      if (hit) {
        $('measureInput').blur();
        selectWall(hit);
        startWallMove(point, hit, event.pointerId);
        return;
      }
      state.selectedWallKey = null;
      $('measureInput').value = '';
      $('toolHint').textContent = 'Aponte a direção · digite a medida direto no teclado · Enter conclui';
      state.lineStart = snapped.point;
      state.linePreview = snapped.point;
      state.lineDragOrigin = point;
      sketchCanvas.setPointerCapture(event.pointerId);
    } else {
      const wasPending = state.linePending;
      const hasMeasure = parseLength($('measureInput').value) != null;
      if (wasPending && !hasMeasure &&
        pointDistance(point, state.linePreview ?? point) > 32) {
        notify('Esta linha ainda é uma prévia. Digite a medida e pressione Enter para concluí-la.');
        if (event.pointerType === 'mouse') $('measureInput').focus();
        return;
      }
      if (event.pointerType === 'mouse' && !hasMeasure && pointDistance(state.lineStart, snapped.point) >= 5) {
        // Igual ao SketchUp: o clique conclui a linha no ponto inferido.
        commitLine(snapped.point);
        refreshControls();
        return;
      }
      $('measureInput').blur();
      state.linePreview = snapped.point;
      state.linePending = pointDistance(state.lineStart, snapped.point) >= 5;
      state.lineDragOrigin = point;
      state.lineConfirmOnRelease = hasMeasure;
      state.lineRequestMeasureOnRelease = event.pointerType === 'mouse' && !hasMeasure && !wasPending;
      sketchCanvas.setPointerCapture(event.pointerId);
    }
    state.lineSnapKind = snapped.kind; state.lineGuides = snapped.guides || [];
    refreshMeasure(); refreshControls(); requestRender();
    return;
  }
  if (state.strokes.length >= MAX_STROKES || segments().length >= MAX_SEGMENTS) {
    notify('O projeto chegou ao limite de traços. Apague alguns para continuar.');
    return;
  }
  sketchCanvas.setPointerCapture(event.pointerId);
  state.draft = [point];
  requestRender();
});

sketchCanvas.addEventListener('pointermove', (event) => {
  if (state.rectangleStart && event.pointerId === state.rectanglePointerId) {
    const end = snapPoint(sketchPoint(event), null, event.altKey, event.pointerType).point;
    state.draft = rectangleOutline(state.rectangleStart, end);
    requestRender(); return;
  }
  if (state.moveDrag && event.pointerId === state.moveDrag.pointerId) {
    updateWallMove(sketchPoint(event));
    return;
  }
  if (state.tool === 'line' && !state.lineStart && !state.moveDrag && event.pointerType === 'mouse') {
    const h = snapPoint(sketchPoint(event), null, event.altKey, event.pointerType);
    const show = ['point', 'mid', 'edge', 'align'].includes(h.kind) ? h : null;
    if (JSON.stringify(show) !== JSON.stringify(state.lineHover)) { state.lineHover = show; requestRender(); }
  }
  if (state.tool === 'line' && state.lineStart && (!state.linePending || state.lineDragOrigin)) {
    state.lineLastPointer = sketchPoint(event);
    const snapped = snapPoint(state.lineLastPointer, state.lineStart, event.altKey, event.pointerType);
    state.linePreview = snapped.point;
    state.lineSnapKind = snapped.kind; state.lineGuides = snapped.guides || [];
    refreshMeasure(); requestRender();
    return;
  }
  if (!state.draft) return;
  const point = sketchPoint(event);
  if (state.draft.length < 2000 && pointDistance(point, state.draft.at(-1)) >= 2.5) {
    state.draft.push(point);
    requestRender();
  }
});

function finishStroke(event) {
  if (state.rectangleStart && event.pointerId === state.rectanglePointerId) {
    const end = snapPoint(sketchPoint(event), null, event.altKey, event.pointerType).point;
    const outline = rectangleOutline(state.rectangleStart, end);
    state.rectangleStart = null; state.rectanglePointerId = null; state.draft = null;
    const width = outline[1][0] - outline[0][0];
    const height = outline[2][1] - outline[1][1];
    if (width < state.pixelsPerMeter * .15 || height < state.pixelsPerMeter * .15) {
      notify('Arraste ao menos 15 cm em cada direção para criar o retângulo.');
      requestRender(); return;
    }
    if (state.strokes.length >= MAX_STROKES || segments().length + 4 > MAX_SEGMENTS) {
      notify('O projeto chegou ao limite de paredes.'); return;
    }
    commit([...state.strokes, outline]);
    $('toolHint').textContent = 'Retângulo criado. Use Equidistância para definir a espessura.';
    return;
  }
  if (state.moveDrag && event.pointerId === state.moveDrag.pointerId) {
    finishWallMove();
    return;
  }
  if (state.tool === 'line') {
    const didDrag = Boolean(state.lineDragOrigin &&
      pointDistance(sketchPoint(event), state.lineDragOrigin) >= 8);
    if (didDrag && state.lineStart) {
      const snapped = snapPoint(sketchPoint(event), state.lineStart, event.altKey, event.pointerType);
      state.linePreview = snapped.point;
      state.lineSnapKind = snapped.kind; state.lineGuides = snapped.guides || [];
      state.linePending = pointDistance(state.lineStart, snapped.point) >= 5;
    }
    state.lineDragOrigin = null;
    const confirm = state.lineConfirmOnRelease;
    const requestMeasure = state.lineRequestMeasureOnRelease && !didDrag;
    state.lineConfirmOnRelease = false;
    state.lineRequestMeasureOnRelease = false;
    if (confirm && state.linePending) { applyExactLength(); return; }
    if (requestMeasure && state.linePending) $('measureInput').focus();
    if (state.linePending) $('toolHint').textContent = 'Arraste a ponta para ajustar · digite medida e Enter';
    refreshMeasure(); requestRender();
    return;
  }
  if (!state.draft) return;
  const point = sketchPoint(event);
  if (pointDistance(point, state.draft.at(-1)) >= 2) state.draft.push(point);
  const stroke = normalizeStroke(state.draft);
  state.draft = null;
  if (stroke && segments().length + stroke.length - 1 <= MAX_SEGMENTS)
    commit([...state.strokes, stroke]);
  else requestRender();
}
sketchCanvas.addEventListener('pointerup', finishStroke);
sketchCanvas.addEventListener('pointerleave', () => { if (state.lineHover) { state.lineHover = null; requestRender(); } });
sketchCanvas.addEventListener('pointercancel', () => {
  if (state.moveDrag) finishWallMove(true);
  state.rectangleStart = null; state.rectanglePointerId = null;
  state.draft = null; state.lineDragOrigin = null; requestRender();
});
$('measureInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); applyExactLength(); }
  if (event.key === 'Escape') { event.preventDefault(); cancelLine(); }
});
$('applyMeasure').addEventListener('click', applyExactLength);
window.addEventListener('keyup', (event) => {
  if (event.key === 'Shift' && state.lineLockKey === 'shift') {
    state.lineLock = null; state.lineLockKey = null; refreshMeasure(); requestRender();
  }
});
window.addEventListener('keydown', (event) => {
  if ($('architectureMode').hidden || state.tool !== 'line' || !state.lineStart ||
      event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  const target = event.target;
  if (target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
  if (state.angleTyping != null) { // digitando o ângulo (tecla A)
    event.preventDefault();
    if (event.key === 'Escape') state.angleTyping = null;
    else if (event.key === 'Enter') {
      const deg = Number(state.angleTyping.replace(',', '.'));
      state.angleTyping = null;
      if (Number.isFinite(deg) && String(deg) !== '') {
        const rad = deg * Math.PI / 180;
        state.lineLock = [Math.cos(rad), -Math.sin(rad)]; state.lineLockKey = 'ang'; state.lineAngle = deg;
        if (state.lineLastPointer) {
          const sn = snapPoint(state.lineLastPointer, state.lineStart, false, 'mouse');
          state.linePreview = sn.point; state.lineSnapKind = sn.kind; state.lineGuides = sn.guides || [];
        }
      }
    } else if (/^[0-9,.\-]$/.test(event.key)) state.angleTyping += event.key;
    else if (event.key === 'Backspace') state.angleTyping = state.angleTyping.slice(0, -1);
    refreshMeasure(); requestRender(); return;
  }
  if (event.key === 'a' || event.key === 'A') {
    event.preventDefault(); state.angleTyping = ''; refreshMeasure(); return;
  }
  if (event.key === 'Escape') { event.preventDefault(); cancelLine(); return; }
  if (event.key === 'Enter') {
    event.preventDefault(); applyExactLength(); return;
  }
  if (event.key === 'Shift' && !event.repeat && !state.lineLockKey && state.linePreview &&
      pointDistance(state.lineStart, state.linePreview) >= 5) {
    const dx = state.linePreview[0] - state.lineStart[0], dy = state.linePreview[1] - state.lineStart[1];
    const L = Math.hypot(dx, dy);
    state.lineLock = [dx / L, dy / L]; state.lineLockKey = 'shift';
    refreshMeasure(); requestRender(); return;
  }
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    const key = event.key === 'ArrowRight' ? 'x' : 'y';
    if (state.lineLockKey === key) { state.lineLock = null; state.lineLockKey = null; }
    else { state.lineLock = key === 'x' ? [1, 0] : [0, 1]; state.lineLockKey = key; }
    if (state.lineLastPointer) {
      const sn = snapPoint(state.lineLastPointer, state.lineStart, false, 'mouse');
      state.linePreview = sn.point; state.lineSnapKind = sn.kind; state.lineGuides = sn.guides || [];
    }
    refreshMeasure(); requestRender(); return;
  }
  const input = $('measureInput');
  if (/^[0-9,.mc]$/i.test(event.key)) input.value += event.key.toLowerCase();
  else if (event.key === 'Backspace') input.value = input.value.slice(0, -1);
  else return;
  event.preventDefault(); refreshMeasure(); requestRender();
});

function resizeCanvas(canvas) {
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(bounds.width * ratio));
  const height = Math.max(1, Math.round(bounds.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width: bounds.width, height: bounds.height, ratio };
}

function drawSketch() {
  const { ratio } = resizeCanvas(sketchCanvas);
  const context = sketchContext;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, sketchCanvas.width, sketchCanvas.height);
  { const sx = sketchCanvas.width / DESIGN_WIDTH * sketchView.k, sy = sketchCanvas.height / DESIGN_HEIGHT * sketchView.k;
    context.setTransform(sx, 0, 0, sy, -sketchView.ox * sx, -sketchView.oy * sy); }
  const gridStep = state.pixelsPerMeter / 2;
  context.lineWidth = 1 / vk();
  for (let x = DESIGN_WIDTH / 2 % gridStep; x <= DESIGN_WIDTH; x += gridStep) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, DESIGN_HEIGHT);
    context.strokeStyle = Math.abs((x - DESIGN_WIDTH / 2) / gridStep % 4) < .001 ? '#d1d8cf' : '#e9eae4';
    context.stroke();
  }
  for (let y = DESIGN_HEIGHT / 2 % gridStep; y <= DESIGN_HEIGHT; y += gridStep) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(DESIGN_WIDTH, y);
    context.strokeStyle = Math.abs((y - DESIGN_HEIGHT / 2) / gridStep % 4) < .001 ? '#d1d8cf' : '#e9eae4';
    context.stroke();
  }
  const floor = floorOutline();
  if (floor) {
    context.beginPath();
    context.moveTo(...floor[0]);
    for (const point of floor.slice(1)) context.lineTo(...point);
    context.closePath();
    context.fillStyle = '#eaf0e8'; context.fill();
  }
  for (const stroke of state.strokes) {
    drawStroke(context, stroke, '#e8b99d', Math.max(7, state.thickness * state.pixelsPerMeter));
    drawWallPlanEdges(context, stroke);
    if (stroke.length === 2 && pointDistance(stroke[0], stroke[1]) >= 25)
      if (window.tracoEstilo?.cotas !== false) drawDimension(context, stroke[0], stroke[1]);
  }
  const selected = selectedWall();
  if (selected)
    drawStroke(context, [selected.start, selected.end], '#37755e',
      Math.max(9, state.thickness * state.pixelsPerMeter + 3));
  for (const opening of state.openings) {
    const wall = segments().find(([start, end]) => wallKey(start, end) === opening.wallKey);
    if (!wall) continue;
    const [start, end] = wall;
    const length = pointDistance(start, end);
    const half = opening.width * state.pixelsPerMeter / length / 2;
    const a = [start[0] + (end[0] - start[0]) * (opening.t - half),
      start[1] + (end[1] - start[1]) * (opening.t - half)];
    const b = [start[0] + (end[0] - start[0]) * (opening.t + half),
      start[1] + (end[1] - start[1]) * (opening.t + half)];
    context.beginPath(); context.moveTo(...a); context.lineTo(...b);
    context.strokeStyle = '#faf9f6'; context.lineWidth = Math.max(10, state.thickness * state.pixelsPerMeter + 5); context.stroke();
    context.beginPath(); context.moveTo(...a); context.lineTo(...b);
    context.strokeStyle = opening.kind === 'window' ? '#5b9caa' : '#6c947d';
    context.lineWidth = (opening.kind === 'window' ? 5 : 2) / vk(); context.stroke();
    const center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    context.fillStyle = opening.kind === 'window' ? '#286f83' : '#315f47';
    context.font = `700 ${11 / vk()}px DM Sans, Arial, sans-serif`;
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(opening.kind === 'window' ? 'J' : 'P', center[0], center[1] - 13 / vk());
  }
  if (state.draft) {
    drawStroke(context, state.draft, '#db9876', 6);
    if (state.tool === 'rectangle' && state.draft.length === 5) {
      if (pointDistance(state.draft[0], state.draft[1]) >= 12)
        drawDimension(context, state.draft[0], state.draft[1], true);
      if (pointDistance(state.draft[1], state.draft[2]) >= 12)
        drawDimension(context, state.draft[1], state.draft[2], true);
    }
  }
  if (state.lineStart) {
    let end = state.linePreview ?? state.lineStart;
    const measured = parseLength($('measureInput').value);
    if (measured != null && state.lineSnapKind !== 'point') {
      const exact = measuredLineEnd(measured, state.lineStart, end);
      if (exact[0] >= 0 && exact[0] <= DESIGN_WIDTH && exact[1] >= 0 && exact[1] <= DESIGN_HEIGHT)
        end = exact;
    }
    if (state.lineSnapKind === 'x' || state.lineSnapKind === 'y') {
      context.beginPath();
      context.setLineDash([5 / vk(), 5 / vk()]);
      if (state.lineSnapKind === 'x') { context.moveTo(0, state.lineStart[1]); context.lineTo(DESIGN_WIDTH, state.lineStart[1]); }
      else { context.moveTo(state.lineStart[0], 0); context.lineTo(state.lineStart[0], DESIGN_HEIGHT); }
      context.strokeStyle = state.lineSnapKind === 'x' ? 'rgba(208,52,44,.75)' : 'rgba(46,158,79,.75)';
      context.lineWidth = (state.lineLock ? 2.5 : 1.5) / vk(); context.stroke();
      context.setLineDash([]);
    }
    if (measured == null && (state.lineGuides || []).length) {
      context.save();
      context.setLineDash([2 / vk(), 4 / vk()]);
      context.lineWidth = 1.5 / vk();
      for (const g of state.lineGuides) {
        context.beginPath(); context.moveTo(...g.from);
        context.lineTo(g.axis === 'h' ? end[0] : g.from[0], g.axis === 'h' ? g.from[1] : end[1]);
        context.strokeStyle = g.axis === 'h' ? '#d0342c' : '#2e9e4f'; context.stroke();
        context.setLineDash([]);
        context.beginPath(); context.arc(g.from[0], g.from[1], 4 / vk(), 0, Math.PI * 2);
        context.fillStyle = g.axis === 'h' ? '#d0342c' : '#2e9e4f'; context.fill();
        context.setLineDash([2 / vk(), 4 / vk()]);
      }
      context.restore();
    }
    if (pointDistance(state.lineStart, end) >= 2) {
      context.beginPath(); context.moveTo(...state.lineStart); context.lineTo(...end);
      { const E = window.tracoEstilo || { esp: 3, tracejada: false };
        if (E.tracejada) context.setLineDash([Math.max(6, E.esp * 2.4) / vk(), Math.max(4, E.esp * 1.6) / vk()]);
        context.strokeStyle = '#426f61'; context.lineWidth = E.esp / vk(); context.stroke(); context.setLineDash([]); }
      drawDimension(context, state.lineStart, end, true);
    }
    for (const point of [state.lineStart, end]) {
      context.beginPath(); context.arc(point[0], point[1], 5 / vk(), 0, Math.PI * 2);
      context.fillStyle = '#fff'; context.fill(); context.strokeStyle = '#426f61'; context.lineWidth = 2 / vk(); context.stroke();
    }
    if (measured == null) drawInference(context, end, state.lineSnapKind, state.lineGuides, Boolean(state.lineLock));
  } else if (state.tool === 'line' && state.lineHover) {
    drawInference(context, state.lineHover.point, state.lineHover.kind, state.lineHover.guides || [], false);
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  try { window.tracoObjetos?.desenhar(context); } catch { /* opcional */ }
  try { window.tracoFerramentas?.desenhar(context); } catch { /* opcional */ }
}

// Marcador + etiqueta da inferência, como no SketchUp.
function drawInference(context, at, kind, guides, locked) {
  const labels = { point: 'Ponto final', mid: 'Ponto médio', edge: 'Na aresta', x: 'No eixo vermelho',
    y: 'No eixo verde', align: 'A partir do ponto', lock: 'Direção travada' };
  let text = labels[kind];
  if (kind === 'lock' && state.lineLockKey === 'ang') text = `Ângulo ${String(state.lineAngle).replace('.', ',')}°`;
  if ((kind === 'x' || kind === 'y') && (guides || []).length) text += ' · a partir do ponto';
  if (locked && kind !== 'lock') text += ' · travado';
  if (!text) return;
  context.save();
  if (kind === 'point') {
    context.beginPath(); context.arc(at[0], at[1], 7 / vk(), 0, Math.PI * 2);
    context.fillStyle = '#144422'; context.fill(); context.strokeStyle = '#fff'; context.lineWidth = 2 / vk(); context.stroke();
  } else if (kind === 'mid') {
    context.beginPath(); context.arc(at[0], at[1], 7 / vk(), 0, Math.PI * 2);
    context.fillStyle = '#17b3c9'; context.fill(); context.strokeStyle = '#fff'; context.lineWidth = 2 / vk(); context.stroke();
  } else if (kind === 'edge') {
    { const e = 5 / vk(); context.fillStyle = '#d0342c'; context.fillRect(at[0] - e, at[1] - e, 2 * e, 2 * e);
    context.strokeStyle = '#fff'; context.lineWidth = 1.5 / vk(); context.strokeRect(at[0] - e, at[1] - e, 2 * e, 2 * e); }
  }
  if (!state.lineStart && guides && guides.length) {
    context.setLineDash([2 / vk(), 4 / vk()]); context.lineWidth = 1.5 / vk();
    for (const g of guides) {
      context.beginPath(); context.moveTo(...g.from);
      context.lineTo(g.axis === 'h' ? at[0] : g.from[0], g.axis === 'h' ? g.from[1] : at[1]);
      context.strokeStyle = g.axis === 'h' ? '#d0342c' : '#2e9e4f'; context.stroke();
    }
    context.setLineDash([]);
  }
  context.font = `600 ${11 / vk()}px DM Sans, Arial, sans-serif`;
  const q = 1 / vk(), w = context.measureText(text).width + 12 * q;
  let x = at[0] + 14 * q, y = at[1] + 14 * q;
  if (x + w > sketchView.ox + DESIGN_WIDTH / vk()) x = at[0] - 14 * q - w;
  if (y + 20 * q > sketchView.oy + DESIGN_HEIGHT / vk()) y = at[1] - 34 * q;
  context.fillStyle = 'rgba(255,255,240,.95)'; context.strokeStyle = 'rgba(0,0,0,.35)'; context.lineWidth = 1 / vk();
  context.beginPath(); context.rect(x, y, w, 20 * q); context.fill(); context.stroke();
  context.fillStyle = '#222'; context.textAlign = 'left'; context.textBaseline = 'middle';
  context.fillText(text, x + 6 * q, y + 10 * q);
  context.restore();
}

function drawDimension(context, start, end, preview = false) {
  const text = formatMeters(pointDistance(start, end));
  const midX = (start[0] + end[0]) / 2;
  const q = 1 / vk(), midY = (start[1] + end[1]) / 2 - 12 * q;
  context.font = `700 ${13 / vk()}px DM Sans, Arial, sans-serif`;
  const width = context.measureText(text).width + 14 * q;
  context.fillStyle = preview ? '#31594b' : '#fffefa';
  context.beginPath(); context.roundRect(midX - width / 2, midY - 10 * q, width, 20 * q, 5 * q); context.fill();
  context.fillStyle = preview ? '#fff' : '#6d5548';
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillText(text, midX, midY + q);
}

function drawWallPlanEdges(context, stroke) {
  const half = state.thickness * state.pixelsPerMeter / 2;
  context.beginPath();
  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1], b = stroke[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length < 1) continue;
    const nx = -dy / length * half, ny = dx / length * half;
    for (const sign of [-1, 1]) {
      context.moveTo(a[0] + nx * sign, a[1] + ny * sign);
      context.lineTo(b[0] + nx * sign, b[1] + ny * sign);
    }
  }
  context.strokeStyle = '#aa5f46'; context.lineWidth = 1.5 / vk(); context.stroke();
}

function drawStroke(context, stroke, color, width) {
  if (!stroke.length) return;
  context.beginPath();
  context.moveTo(stroke[0][0], stroke[0][1]);
  for (const [x, y] of stroke.slice(1)) context.lineTo(x, y);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.stroke();
  context.fillStyle = '#fff';
  context.strokeStyle = color;
  context.lineWidth = 2 / vk();
  for (const point of [stroke[0], stroke.at(-1)]) {
    context.beginPath(); context.arc(point[0], point[1], 4 / vk(), 0, Math.PI * 2); context.fill(); context.stroke();
  }
}

function worldPoint(point) {
  return [(point[0] - DESIGN_WIDTH / 2) / state.pixelsPerMeter,
    (point[1] - DESIGN_HEIGHT / 2) / state.pixelsPerMeter];
}

function effectiveWallHeight() {
  if (state.modelTool === 'push') {
    const typed = parseLength($('pushHeightInput').value);
    if (typed != null && typed >= .2 && typed <= 10) return typed;
    if (state.pushDraftHeight != null) return state.pushDraftHeight;
  }
  return state.wallsRaised ? state.height : .15;
}

// Encontro das paredes em esquadria: no canto onde duas paredes se ligam, as faces
// de cada lado são estendidas até se cruzarem (sem dente e sem sobra).
function vizinhoEm(point, outro) {
  const achados = [];
  for (const [a, b] of segments()) {
    if (pointDistance(a, point) < 1.5 && pointDistance(b, outro) >= 1.5) achados.push(b);
    else if (pointDistance(b, point) < 1.5 && pointDistance(a, outro) >= 1.5) achados.push(a);
  }
  const unicos = achados.filter((c, i) => achados.findIndex((d) => pointDistance(c, d) < 1.5) === i);
  return unicos.length === 1 ? unicos[0] : null;
}
function cantoParede(P, Q, isEnd, w, sigma) {
  const t = state.thickness / 2;
  const [px, py] = worldPoint(P);
  const nw = [-w[1] * t, w[0] * t];
  const simples = [px + sigma * nw[0], py + sigma * nw[1]];
  const C = vizinhoEm(P, Q);
  if (!C) return simples;
  const [cx, cy] = worldPoint(C);
  let vx = isEnd ? cx - px : px - cx, vy = isEnd ? cy - py : py - cy;
  const lv = Math.hypot(vx, vy); if (lv < 1e-6) return simples;
  vx /= lv; vy /= lv;
  const nv = [-vy * t, vx * t];
  const den = w[0] * vy - w[1] * vx;
  if (Math.abs(den) < 1e-3) return simples; // paredes em linha reta
  const rx = sigma * (nv[0] - nw[0]), ry = sigma * (nv[1] - nw[1]);
  const sPar = (rx * vy - ry * vx) / den;
  if (Math.abs(sPar) > t * 6) return simples; // ângulo muito fechado: corte reto
  return [simples[0] + sPar * w[0], simples[1] + sPar * w[1]];
}
function wallVertices(start, end, z0 = 0, z1 = effectiveWallHeight()) {
  const [ax, ay] = worldPoint(start);
  const [bx, by] = worldPoint(end);
  const length = Math.hypot(bx - ax, by - ay);
  if (length < .05) return null;
  const w = [(bx - ax) / length, (by - ay) / length];
  const a1 = cantoParede(start, end, false, w, 1), a2 = cantoParede(start, end, false, w, -1);
  const b2 = cantoParede(end, start, true, w, -1), b1 = cantoParede(end, start, true, w, 1);
  const v = [
    [...a1, z0], [...a2, z0], [...b2, z0], [...b1, z0],
    [...a1, z1], [...a2, z1], [...b2, z1], [...b1, z1],
  ];
  v.ligaA = !!vizinhoEm(start, end); v.ligaB = !!vizinhoEm(end, start);
  return v;
}
// Contorno do piso alargado meia espessura, para a laje acompanhar a face de fora das paredes.
function pisoAlargado(pts) {
  const n = pts.length; if (n < 3) return pts;
  let area = 0; for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
  const d = (area > 0 ? -1 : 1) * state.thickness / 2;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [-e1[1] / l1, e1[0] / l1], n2 = [-e2[1] / l2, e2[0] / l2];
    const bx = n1[0] + n2[0], by = n1[1] + n2[1], bl = Math.hypot(bx, by);
    if (bl < 1e-3) return [p[0] + n1[0] * d, p[1] + n1[1] * d];
    const k = d / Math.max(.25, (bx / bl) * n1[0] + (by / bl) * n1[1]);
    return [p[0] + bx / bl * k, p[1] + by / bl * k];
  });
}

function wallBoxes(start, end) {
  const height = effectiveWallHeight();
  if (height < 1.2) return [wallVertices(start, end)].filter(Boolean);
  const opening = state.openings.find((item) => item.wallKey === wallKey(start, end));
  if (!opening) return [wallVertices(start, end)].filter(Boolean);
  const length = pointDistance(start, end) / state.pixelsPerMeter;
  const half = opening.width / length / 2;
  const at = (t) => [start[0] + (end[0] - start[0]) * t,
    start[1] + (end[1] - start[1]) * t];
  const left = at(opening.t - half), right = at(opening.t + half);
  const sill = opening.kind === 'window' ? .9 : 0;
  const head = Math.min(height - .1, 2.1);
  return [
    wallVertices(start, left), wallVertices(right, end),
    sill > 0 ? wallVertices(left, right, 0, sill) : null,
    wallVertices(left, right, head, height),
  ].filter(Boolean);
}

const BOX_FACES = [
  { corners: [0, 3, 7, 4], shade: '#d5aa8f' },
  { corners: [2, 1, 5, 6], shade: '#b77e5d' },
  { corners: [1, 0, 4, 5], shade: '#c99371' },
  { corners: [3, 2, 6, 7], shade: '#c99371' },
  { corners: [4, 7, 6, 5], shade: '#f3d3b9' },
];

function project(vertex, centerX, centerY, unit) {
  const [x, y, z] = vertex;
  const cosYaw = Math.cos(state.yaw), sinYaw = Math.sin(state.yaw);
  const right = x * cosYaw - y * sinYaw;
  const depth = x * sinYaw + y * cosYaw;
  return {
    x: centerX + right * unit,
    y: centerY + (depth * Math.sin(state.pitch) - z * Math.cos(state.pitch)) * unit,
    depth: depth * Math.cos(state.pitch) + z * Math.sin(state.pitch),
  };
}

function drawPolygon(context, vertices, fill, stroke = null) {
  context.beginPath();
  context.moveTo(vertices[0].x, vertices[0].y);
  for (const vertex of vertices.slice(1)) context.lineTo(vertex.x, vertex.y);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  if (stroke) { context.strokeStyle = stroke; context.lineWidth = .7; context.stroke(); }
}

function stlUnitFactor(unit) {
  return unit === 'm' ? 1 : unit === 'cm' ? .01 : .001;
}

function stlWorld(vertex, mesh, originX, originY) {
  const factor = stlUnitFactor(mesh.unit);
  return [
    (vertex[0] - (mesh.min[0] + mesh.max[0]) / 2) * factor + originX,
    (vertex[1] - (mesh.min[1] + mesh.max[1]) / 2) * factor + originY,
    (vertex[2] - mesh.min[2]) * factor,
  ];
}

function stlShade(triangle) {
  const ax = triangle[3] - triangle[0], ay = triangle[4] - triangle[1], az = triangle[5] - triangle[2];
  const bx = triangle[6] - triangle[0], by = triangle[7] - triangle[1], bz = triangle[8] - triangle[2];
  const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const length = Math.hypot(nx, ny, nz) || 1;
  const light = Math.max(0, (nx * -.35 + ny * -.5 + nz * .8) / length);
  const value = Math.round(102 + 70 * light);
  return `rgb(${Math.round(value * .68)}, ${value}, ${Math.round(value * .84)})`;
}

function drawModel() {
  const { width, height, ratio } = resizeCanvas(modelCanvas);
  const context = modelContext;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const walls = segments();
  const bounds = walls.flatMap(([start, end]) => [start, end]);
  const xs = bounds.map((point) => point[0]);
  const ys = bounds.map((point) => point[1]);
  const mesh = state.stlMesh;
  const meshFactor = mesh ? stlUnitFactor(mesh.unit) : 0;
  const meshSpan = mesh ? Math.max(...mesh.max.map((value, index) => (value - mesh.min[index]) * meshFactor)) : 0;
  const spanMeters = Math.max(5, meshSpan,
    xs.length ? (Math.max(...xs) - Math.min(...xs)) / state.pixelsPerMeter : 0,
    ys.length ? (Math.max(...ys) - Math.min(...ys)) / state.pixelsPerMeter : 0);
  let centerWorldX = xs.length ? ((Math.min(...xs) + Math.max(...xs)) / 2 - DESIGN_WIDTH / 2) / state.pixelsPerMeter : 0;
  let centerWorldY = ys.length ? ((Math.min(...ys) + Math.max(...ys)) / 2 - DESIGN_HEIGHT / 2) / state.pixelsPerMeter : 0;
  let unit = Math.min(width, height) / (spanMeters * 1.42 + effectiveWallHeight()) * state.zoom;
  const centerX = width * .5;
  const centerY = height * .61;
  // Desenhar no 3D: a câmera fica parada enquanto se desenha (não recentraliza a cada parede).
  const fixa = window.tracoDes3D?.camera;
  if (fixa) { centerWorldX = fixa.cx; centerWorldY = fixa.cy; unit = fixa.base * state.zoom; }
  window.tracoCam3D = { cx: centerWorldX, cy: centerWorldY, base: unit / state.zoom, centerX, centerY, unit };
  const toScreen = (vertex) => project([vertex[0] - centerWorldX, vertex[1] - centerWorldY, vertex[2]], centerX, centerY, unit);

  // A faint ground grid keeps the orientation visible before the first wall.
  context.lineWidth = 1;
  for (let offset = -8; offset <= 8; offset++) {
    for (const line of [
      [[-8, offset, -.025], [8, offset, -.025]],
      [[offset, -8, -.025], [offset, 8, -.025]],
    ]) {
      const a = toScreen(line[0]), b = toScreen(line[1]);
      context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);
      context.strokeStyle = offset === 0 ? '#cbd7ca' : '#dce5db'; context.stroke();
    }
  }
  try { window.tracoEixosFundo?.(context, toScreen, unit); } catch { /* opcional */ }
  const temObj = (state.objetos || []).length > 0;
  if (!walls.length && !mesh && !temObj) { try { window.tracoDes3D?.desenhar(context, toScreen, unit); } catch { /* */ } return; }

  const faces = [];
  const floor = floorOutline();
  if (floor) {
    const largo = pisoAlargado(floor.map((point) => worldPoint(point)));
    const top = largo.map((p) => toScreen([...p, -.02]));
    faces.push({ corners: top, shade: '#dce9d7',
      depth: top.reduce((sum, corner) => sum + corner.depth, 0) / top.length });
    for (let i = 0; i < largo.length; i++) {
      const a = largo[i], b = largo[(i + 1) % largo.length];
      const corners = [[...a, -.02], [...b, -.02], [...b, -.16], [...a, -.16]].map(toScreen);
      faces.push({ corners, shade: '#b9cdb7',
        depth: corners.reduce((sum, corner) => sum + corner.depth, 0) / 4 });
    }
  }
  for (const [start, end] of walls) {
    for (const box of wallBoxes(start, end)) {
      BOX_FACES.forEach((face, fi) => {
        if ((fi === 2 && box.ligaA) || (fi === 3 && box.ligaB)) return; // emenda: sem tampa
        const corners = face.corners.map((index) => toScreen(box[index]));
        faces.push({ corners, shade: face.shade, semBorda: fi === 4,
          depth: corners.reduce((sum, corner) => sum + corner.depth, 0) / corners.length });
      });
    }
  }
  if (mesh) {
    for (const triangle of mesh.triangles) {
      const corners = [0, 3, 6].map((offset) =>
        toScreen(stlWorld(triangle.slice(offset, offset + 3), mesh, centerWorldX, centerWorldY)));
      faces.push({ corners, shade: stlShade(triangle),
        depth: corners.reduce((sum, corner) => sum + corner.depth, 0) / 3,
        imported: true });
    }
  }
  try { window.tracoObjetos?.faces3d(faces, toScreen); } catch { /* opcional */ }
  faces.sort((a, b) => a.depth - b.depth);
  for (const face of faces) drawPolygon(context, face.corners, face.shade, face.semBorda ? face.shade : face.imported ? '#34584c33' : '#a7654b33');
  try { window.tracoEixos?.(context, toScreen, unit); } catch { /* opcional */ }
  try { window.tracoDes3D?.desenhar(context, toScreen, unit); } catch { /* opcional */ }
}

function requestRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => { renderScheduled = false; drawSketch(); drawModel(); });
}

function refreshControls() {
  const count = segments().length;
  const floor = floorOutline();
  $('wallCount').textContent = state.wallsRaised ?
    `${count} ${count === 1 ? 'parede' : 'paredes'}` :
    `${count} ${count === 1 ? 'segmento do alicerce' : 'segmentos do alicerce'}`;
  $('modelStatus').textContent = [count ? state.wallsRaised ?
    `${count} ${count === 1 ? 'parede elevada' : 'paredes elevadas'}` :
    `${count} ${count === 1 ? 'traço do alicerce' : 'traços do alicerce'}` : null,
    state.openings.length ? `${state.openings.length} ${state.openings.length === 1 ? 'abertura' : 'aberturas'}` : null,
    floor ? `piso ${(polygonArea(floor) / state.pixelsPerMeter ** 2).toFixed(1).replace('.', ',')} m²` : null,
    state.stlMesh ? 'STL importado' : null].filter(Boolean).join(' · ') || 'Aguardando desenho';
  $('sketchHint').hidden = state.strokes.length > 0 || Boolean(state.draft) || Boolean(state.lineStart);
  $('modelHint').hidden = count > 0 || Boolean(state.stlMesh) || (state.objetos || []).length > 0;
  $('undoButton').disabled = state.history.length === 0;
  $('redoButton').disabled = state.future.length === 0;
  $('exportButton').disabled = count === 0 && !(state.objetos || []).length;
  $('pushWallsTool').disabled = count === 0;
  $('heightValue').textContent = `${state.height.toFixed(1).replace('.', ',')} m`;
  $('thicknessRange').value = String(Math.round(state.thickness * 100));
  $('thicknessValue').textContent = `${Math.round(state.thickness * 100)} cm`;
  $('floorToggle').checked = state.floorEnabled;
  $('scaleValue').textContent = `${state.pixelsPerMeter} px / m`;
  $('heightRange').value = state.height;
  $('scaleRange').value = state.pixelsPerMeter;
  $('scaleRange').disabled = count > 0;
  $('stlControls').hidden = !state.stlMesh;
  if (state.stlMesh) {
    $('stlName').textContent = state.stlMesh.name;
    $('stlInfo').textContent = `${state.stlMesh.totalTriangles.toLocaleString('pt-BR')} triângulos`;
    $('stlUnit').value = state.stlMesh.unit;
  }
  refreshMeasure();
}

function setTool(tool) {
  if (state.tool === 'line' && tool !== 'line') cancelLine();
  state.rectangleStart = null; state.rectanglePointerId = null; state.draft = null;
  state.tool = tool;
  state.lineHover = null;
  $('measureBox').hidden = tool !== 'line';
  for (const [id, name] of [['lineTool', 'line'], ['drawTool', 'draw'],
    ['rectangleArchTool', 'rectangle'], ['doorTool', 'door'],
    ['windowTool', 'window'], ['eraseTool', 'erase']]) {
    const active = name === tool;
    $(id).classList.toggle('active', active);
    $(id).setAttribute('aria-pressed', String(active));
  }
  sketchCanvas.style.cursor = tool === 'erase' ? 'cell' : 'crosshair';
  $('toolHint').textContent = tool === 'door' ? 'Toque numa parede para colocar porta' :
    tool === 'window' ? 'Toque numa parede para colocar janela' :
    tool === 'erase' ? 'Toque numa abertura ou parede para apagar' :
    tool === 'draw' ? 'Desenho livre, sem medida exata' :
    tool === 'rectangle' ? 'Arraste no alicerce para criar um retângulo fechado' :
    'Arraste uma parede para mover · toque para editar';
  refreshMeasure();
  requestRender();
}

$('lineTool').addEventListener('click', () => setTool('line'));
$('drawTool').addEventListener('click', () => setTool('draw'));
$('rectangleArchTool').addEventListener('click', () => setTool('rectangle'));
$('doorTool').addEventListener('click', () => setTool('door'));
$('windowTool').addEventListener('click', () => setTool('window'));
$('eraseTool').addEventListener('click', () => setTool('erase'));
$('undoButton').addEventListener('click', () => {
  if (!state.history.length) return;
  if (state.modelTool === 'push') stopPush();
  cancelLine();
  state.future.push(snapshot());
  Object.assign(state, state.history.pop());
  saveProject(); refreshControls(); requestRender();
});
$('redoButton').addEventListener('click', () => {
  if (!state.future.length) return;
  if (state.modelTool === 'push') stopPush();
  cancelLine();
  state.history.push(snapshot());
  Object.assign(state, state.future.pop());
  saveProject(); refreshControls(); requestRender();
});
$('clearButton').addEventListener('click', () => {
  if (state.modelTool === 'push') stopPush();
  cancelLine();
  if (!state.strokes.length) return;
  commit([]);
  state.wallsRaised = false;
  saveProject(); refreshControls(); setView('foundation');
  notify('Quadro limpo. Use Desfazer para recuperar os traços.');
});
$('heightRange').addEventListener('input', (event) => {
  state.height = safeNumber(event.target.value, 2.7, .2, 10);
  scheduleSave(); refreshControls(); requestRender();
});
$('thicknessRange').addEventListener('input', (event) => {
  state.thickness = safeNumber(Number(event.target.value) / 100, .15, .1, .3);
  scheduleSave(); refreshControls(); requestRender();
});
$('offsetTool').addEventListener('click', () => {
  $('offsetBox').hidden = !$('offsetBox').hidden;
  if (!$('offsetBox').hidden) {
    $('offsetInput').value = `${(state.thickness).toFixed(2).replace('.', ',')} m`;
    $('offsetInput').focus(); $('offsetInput').select();
  }
});
function applyOffset() {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\s*$/i.exec($('offsetInput').value);
  const unit = match?.[2]?.toLowerCase() ?? 'm';
  const value = match ? Number(match[1].replace(',', '.')) *
    (unit === 'mm' ? .001 : unit === 'cm' ? .01 : 1) : NaN;
  if (!Number.isFinite(value) || value < .1 || value > .3) {
    notify('Digite uma espessura entre 10 e 30 cm. Ex.: 20 cm.'); return;
  }
  recordHistory();
  state.thickness = value; $('offsetBox').hidden = true;
  saveProject(); refreshControls(); requestRender();
  $('toolHint').textContent = `Equidistância aplicada: ${Math.round(value * 100)} cm de espessura.`;
}
$('applyOffset').addEventListener('click', applyOffset);
$('offsetInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); applyOffset(); }
});
$('floorToggle').addEventListener('change', (event) => {
  state.floorEnabled = event.target.checked;
  scheduleSave(); refreshControls(); requestRender();
});
$('scaleRange').addEventListener('input', (event) => {
  if (state.strokes.length) { notify('Defina a escala antes de desenhar para preservar as medidas.'); return; }
  state.pixelsPerMeter = safeNumber(event.target.value, 80, 40, 160);
  scheduleSave(); refreshControls(); requestRender();
});

function stopPush() {
  state.modelTool = 'orbit'; state.pushDraftHeight = null; state.pushDrag = null;
  state.pushTyping = false; modelCanvas.dataset.tool = 'orbit';
  $('pushWallsTool').setAttribute('aria-pressed', 'false');
  $('pushHeightLabel').hidden = true; $('applyPushHeight').hidden = true;
  refreshControls(); requestRender();
}
function applyPushHeight() {
  if (!segments().length) return;
  const height = parseLength($('pushHeightInput').value);
  if (height == null || height < .2 || height > 10) {
    notify('Digite uma altura entre 20 cm e 10 m. Ex.: 2,70 m.'); return;
  }
  recordHistory();
  state.height = height; state.wallsRaised = true;
  stopPush(); saveProject(); refreshControls();
  $('toolHint').textContent = `Paredes elevadas a ${height.toFixed(2).replace('.', ',')} m.`;
}
$('pushWallsTool').addEventListener('click', () => {
  if (!segments().length) return;
  if (state.modelTool === 'push') { stopPush(); return; }
  state.modelTool = 'push'; state.pushDraftHeight = state.height;
  state.pushTyping = false; modelCanvas.dataset.tool = 'push';
  $('pushWallsTool').setAttribute('aria-pressed', 'true');
  $('pushHeightLabel').hidden = false; $('applyPushHeight').hidden = false;
  $('exportButton').disabled = true;
  $('pushHeightInput').value = `${state.height.toFixed(2).replace('.', ',')} m`;
  setView('perspective'); modelCanvas.focus({ preventScroll: true });
  $('toolHint').textContent = 'Arraste o modelo para cima ou digite a altura e pressione Enter.';
});
$('applyPushHeight').addEventListener('click', applyPushHeight);
$('pushHeightInput').addEventListener('input', () => {
  state.pushTyping = true; requestRender();
});
$('pushHeightInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); applyPushHeight(); }
  if (event.key === 'Escape') { event.preventDefault(); stopPush(); }
});
window.addEventListener('keydown', (event) => {
  if ($('architectureMode').hidden || state.modelTool !== 'push' ||
      event.ctrlKey || event.altKey || event.metaKey || event.isComposing ||
      event.target !== modelCanvas) return;
  if (event.key === 'Escape') { event.preventDefault(); stopPush(); return; }
  if (event.key === 'Enter') { event.preventDefault(); applyPushHeight(); return; }
  const input = $('pushHeightInput');
  if (/^[0-9,.mc]$/i.test(event.key)) {
    if (!state.pushTyping) { input.value = ''; state.pushTyping = true; }
    input.value += event.key.toLowerCase();
  } else if (event.key === 'Backspace') {
    if (!state.pushTyping) { input.value = ''; state.pushTyping = true; }
    else input.value = input.value.slice(0, -1);
  } else return;
  event.preventDefault(); requestRender();
});

modelCanvas.addEventListener('pointerdown', (event) => {
  if (state.modelTool === 'push') {
    modelCanvas.focus({ preventScroll: true });
    modelCanvas.setPointerCapture(event.pointerId);
    state.pushDrag = { pointerId: event.pointerId, y: event.clientY,
      base: effectiveWallHeight(), moved: false };
    return;
  }
  modelCanvas.setPointerCapture(event.pointerId);
  state.draggingModel = [event.clientX, event.clientY];
});
modelCanvas.addEventListener('pointermove', (event) => {
  if (state.pushDrag?.pointerId === event.pointerId) {
    const distance = state.pushDrag.y - event.clientY;
    if (Math.abs(distance) >= 2) state.pushDrag.moved = true;
    if (!state.pushTyping) {
      state.pushDraftHeight = Math.max(.2, Math.min(10, state.pushDrag.base + distance * .015));
      $('pushHeightInput').value = `${state.pushDraftHeight.toFixed(2).replace('.', ',')} m`;
      requestRender();
    }
    return;
  }
  if (!state.draggingModel) return;
  state.yaw += (event.clientX - state.draggingModel[0]) * .008;
  state.pitch = Math.max(.03, Math.min(1.54, state.pitch + (event.clientY - state.draggingModel[1]) * .006));
  state.draggingModel = [event.clientX, event.clientY];
  $('viewBadge').textContent = 'VISTA LIVRE';
  for (const id of ['viewPerspective', 'viewFoundation', 'viewFront']) {
    $(id).classList.remove('active');
    $(id).setAttribute('aria-pressed', 'false');
  }
  requestRender();
});
modelCanvas.addEventListener('pointerup', (event) => {
  if (state.pushDrag?.pointerId === event.pointerId) {
    const moved = state.pushDrag.moved; state.pushDrag = null;
    if (moved) applyPushHeight(); return;
  }
  state.draggingModel = null;
});
modelCanvas.addEventListener('pointercancel', () => {
  state.draggingModel = null; state.pushDrag = null;
});
modelCanvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  state.zoom = Math.max(.55, Math.min(2.8, state.zoom * (event.deltaY > 0 ? .92 : 1.08)));
  requestRender();
}, { passive: false });
$('resetView').addEventListener('click', () => {
  setView('foundation');
});

function setView(view) {
  const preset = {
    perspective: { yaw: -.73, pitch: .92, label: 'PERSPECTIVA 3D' },
    foundation: { yaw: 0, pitch: 1.54, label: 'ALICERCE · VISTA SUPERIOR' },
    front: { yaw: 0, pitch: .03, label: 'VISTA FRONTAL' },
  }[view];
  state.yaw = preset.yaw;
  state.pitch = preset.pitch;
  state.zoom = 1;
  $('viewBadge').textContent = preset.label;
  for (const [id, name] of [['viewPerspective', 'perspective'], ['viewFoundation', 'foundation'], ['viewFront', 'front']]) {
    $(id).classList.toggle('active', view === name);
    $(id).setAttribute('aria-pressed', String(view === name));
  }
  requestRender();
}

$('viewPerspective').addEventListener('click', () => setView('perspective'));
$('viewFoundation').addEventListener('click', () => setView('foundation'));
$('viewFront').addEventListener('click', () => setView('front'));

$('exampleButton').addEventListener('click', () => {
  if (state.modelTool === 'push') stopPush();
  cancelLine();
  const example = [
    [[190, 145], [555, 145]], [[555, 145], [555, 415]],
    [[555, 415], [190, 415]], [[190, 415], [190, 145]],
    [[370, 145], [370, 300]], [[370, 300], [555, 300]],
  ];
  commit(example);
  state.wallsRaised = false; saveProject(); refreshControls(); setView('foundation');
  notify('Alicerce de exemplo carregado. Use Empurrar/Puxar para subir as paredes.');
});

$('openButton').addEventListener('click', () => $('projectFile').click());
$('projectFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 6_000_000) { notify('O arquivo é grande demais para um projeto.'); return; }
  try {
    const project = parseProject(await file.text());
    if (state.modelTool === 'push') stopPush();
    cancelLine();
    state.height = project.height;
    state.thickness = project.thickness;
    state.floorEnabled = project.floorEnabled;
    state.pixelsPerMeter = project.pixelsPerMeter;
    state.stlMesh = project.stlMesh;
    commit(project.strokes, project.openings);
    state.wallsRaised = project.wallsRaised;
    stopPush(); saveProject(); refreshControls(); setView('foundation');
    notify('Projeto aberto.');
  } catch { notify('Não foi possível abrir esse projeto JSON.'); }
});

function readStl(buffer, name) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const checkVertex = (point) => {
    for (let i = 0; i < 3; i++) {
      if (!Number.isFinite(point[i]) || Math.abs(point[i]) > 100_000_000)
        throw new Error('Coordenada STL inválida');
      min[i] = Math.min(min[i], point[i]);
      max[i] = Math.max(max[i], point[i]);
    }
  };
  let totalTriangles = 0;
  const triangles = [];
  const view = new DataView(buffer);
  const declaredCount = buffer.byteLength >= 84 ? view.getUint32(80, true) : 0;
  const isBinary = buffer.byteLength >= 84 && 84 + declaredCount * 50 === buffer.byteLength;
  if (isBinary) {
    if (!declaredCount || declaredCount > MAX_STL_TRIANGLES) throw new Error('STL sem faces ou grande demais');
    const stride = Math.ceil(declaredCount / PREVIEW_TRIANGLES);
    for (let i = 0; i < declaredCount; i++) {
      const triangle = [];
      const offset = 84 + i * 50 + 12;
      for (let vertex = 0; vertex < 3; vertex++) {
        const point = [0, 1, 2].map((axis) => view.getFloat32(offset + vertex * 12 + axis * 4, true));
        checkVertex(point);
        triangle.push(...point);
      }
      if (i % stride === 0) triangles.push(triangle);
    }
    totalTriangles = declaredCount;
  } else {
    const source = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    const number = '([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?)';
    const vertexPattern = new RegExp(`\\bvertex\\s+${number}\\s+${number}\\s+${number}`, 'gi');
    let vertexCount = 0;
    for (const match of source.matchAll(vertexPattern)) {
      checkVertex([Number(match[1]), Number(match[2]), Number(match[3])]);
      vertexCount++;
      if (vertexCount > MAX_STL_TRIANGLES * 3) throw new Error('STL grande demais');
    }
    if (!vertexCount || vertexCount % 3 !== 0) throw new Error('STL ASCII incompleto');
    totalTriangles = vertexCount / 3;
    const stride = Math.ceil(totalTriangles / PREVIEW_TRIANGLES);
    let triIndex = 0, triangle = [];
    for (const match of source.matchAll(vertexPattern)) {
      triangle.push(Number(match[1]), Number(match[2]), Number(match[3]));
      if (triangle.length === 9) {
        if (triIndex % stride === 0) triangles.push(triangle);
        triangle = [];
        triIndex++;
      }
    }
  }
  return { name: name.slice(0, 160), unit: 'mm', triangles, totalTriangles, min, max };
}

$('importStlButton').addEventListener('click', () => $('stlFile').click());
$('stlFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > MAX_STL_BYTES) { notify('STL grande demais. Limite: 20 MB.'); return; }
  try {
    const mesh = readStl(await file.arrayBuffer(), file.name);
    state.stlMesh = mesh;
    saveProject(); refreshControls(); requestRender();
    notify(`STL importado: ${mesh.totalTriangles.toLocaleString('pt-BR')} triângulos. Confira a unidade.`);
  } catch { notify('Não foi possível ler esse STL binário ou ASCII.'); }
});
$('stlUnit').addEventListener('change', (event) => {
  if (!state.stlMesh || !['mm', 'cm', 'm'].includes(event.target.value)) return;
  state.stlMesh.unit = event.target.value;
  saveProject(); refreshControls(); requestRender();
});
$('removeStl').addEventListener('click', () => {
  state.stlMesh = null;
  saveProject(); refreshControls(); requestRender();
  notify('STL removido da cena.');
});

function download(name, content, type) {
  try { window.tracoHistorico?.exportou('planta', name); } catch { /* opcional */ }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

$('saveButton').addEventListener('click', () => {
  saveProject();
  download('traco-projeto.json', JSON.stringify(projectPayload()), 'application/json');
  notify('Projeto salvo e arquivo JSON baixado.');
});

function modelToObj() {
  const lines = ['# Traço: paredes, aberturas e piso', '# Unidade: metros', 'o traco_arquitetura'];
  let offset = 1;
  for (const [start, end] of segments()) {
    for (const vertices of wallBoxes(start, end)) {
      for (const [x, y, z] of vertices) lines.push(`v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}`);
      for (const face of BOX_FACES)
        lines.push(`f ${face.corners.map((index) => index + offset).join(' ')}`);
      lines.push(`f ${[3, 2, 1, 0].map((index) => index + offset).join(' ')}`);
      offset += 8;
    }
  }
  const floor = floorOutline();
  if (floor) {
    lines.push('o traco_piso');
    for (const point of floor) {
      const [x, y] = worldPoint(point);
      lines.push(`v ${x.toFixed(4)} ${y.toFixed(4)} -0.0200`);
    }
    for (const point of floor) {
      const [x, y] = worldPoint(point);
      lines.push(`v ${x.toFixed(4)} ${y.toFixed(4)} -0.1600`);
    }
    const count = floor.length;
    lines.push(`f ${floor.map((_, i) => offset + i).join(' ')}`);
    lines.push(`f ${floor.map((_, i) => offset + count + count - i - 1).join(' ')}`);
    for (let i = 0; i < count; i++)
      lines.push(`f ${offset + i} ${offset + (i + 1) % count} ${offset + count + (i + 1) % count} ${offset + count + i}`);
  }
  try { window.tracoObjetos?.obj(lines); } catch { /* opcional */ }
  return lines.join('\n') + '\n';
}

$('exportButton').addEventListener('click', () => {
  if (!segments().length && !(state.objetos || []).length) return;
  download('traco-projeto-3d.obj', modelToObj(), 'text/plain');
  notify('Modelo OBJ exportado. Abra em Blender ou outro visualizador 3D.');
});

window.tracoPlanta = {
  projeto: () => JSON.stringify(projectPayload()),
  temDesenho: () => segments().length > 0,
  canvas: modelCanvas,
  abrir(raw) { recordHistory(); Object.assign(state, parseProject(raw)); saveProject(); refreshControls(); requestRender(); },
};
readSavedProject();
refreshControls();
setView('foundation');
sketchCanvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomSketch(Math.exp(-event.deltaY * (event.ctrlKey ? .01 : .0015)), sketchPoint(event));
}, { passive: false });
let archPan = null, archSpace = false;
window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !$('architectureMode').hidden && document.activeElement === sketchCanvas) { archSpace = true; e.preventDefault(); } });
window.addEventListener('keyup', (e) => { if (e.code === 'Space') archSpace = false; });
sketchCanvas.addEventListener('pointerdown', (event) => {
  if (!(event.button === 1 || event.button === 2 || archSpace)) return;
  event.preventDefault(); event.stopImmediatePropagation();
  archPan = { id: event.pointerId, x: event.clientX, y: event.clientY, ox: sketchView.ox, oy: sketchView.oy };
  sketchCanvas.setPointerCapture(event.pointerId);
}, { capture: true });
sketchCanvas.addEventListener('pointermove', (event) => {
  if (!archPan || archPan.id !== event.pointerId) return;
  event.stopImmediatePropagation();
  const b = sketchCanvas.getBoundingClientRect();
  sketchView.ox = archPan.ox - (event.clientX - archPan.x) * DESIGN_WIDTH / b.width / sketchView.k;
  sketchView.oy = archPan.oy - (event.clientY - archPan.y) * DESIGN_HEIGHT / b.height / sketchView.k;
  clampView(); requestRender();
}, { capture: true });
for (const type of ['pointerup', 'pointercancel']) sketchCanvas.addEventListener(type, (event) => {
  if (!archPan || archPan.id !== event.pointerId) return;
  event.stopImmediatePropagation(); archPan = null;
}, { capture: true });
sketchCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
new ResizeObserver(requestRender).observe(sketchCanvas);
new ResizeObserver(requestRender).observe(modelCanvas);
window.addEventListener('pagehide', saveProject);
