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
  lineStart: null,
  linePreview: null,
  linePending: false,
  lineSnapKind: null,
  lineDragOrigin: null,
  lineConfirmOnRelease: false,
  lineRequestMeasureOnRelease: false,
  selectedWallKey: null,
  moveDrag: null,
  stlMesh: null,
  height: 2.7,
  thickness: .15,
  floorEnabled: true,
  pixelsPerMeter: 80,
  yaw: -0.73,
  pitch: 0.62,
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
    height: safeNumber(project.height, 2.7, 1.8, 4),
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
  const scaleX = bounds.width / DESIGN_WIDTH;
  const scaleY = bounds.height / DESIGN_HEIGHT;
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
  const existing = snapToExisting(point, pointerType === 'touch' ? 22 : 16);
  if (existing) return { point: existing, kind: 'point' };
  const step = state.pixelsPerMeter / 10;
  if (origin) {
    const dx = point[0] - origin[0], dy = point[1] - origin[1];
    if (Math.abs(dx) > 10 && Math.abs(dy) <= Math.abs(dx) * .22)
      return { point: [Math.round(point[0] / step) * step, origin[1]], kind: 'x' };
    if (Math.abs(dy) > 10 && Math.abs(dx) <= Math.abs(dy) * .22)
      return { point: [origin[0], Math.round(point[1] / step) * step], kind: 'y' };
  }
  return { point: [Math.round(point[0] / step) * step, Math.round(point[1] / step) * step], kind: 'grid' };
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
    state.lineSnapKind === 'point' ? ' · ponto' : '';
  $('liveMeasure').textContent = active ? `Prévia: ${formatMeters(distance)}${axis} · digite medida` : 'Toque para iniciar';
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
  state.lineDragOrigin = null;
  state.lineConfirmOnRelease = false;
  state.lineRequestMeasureOnRelease = false;
  state.selectedWallKey = null;
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
  state.selectedWallKey = wallKey(start, rounded);
  commit([...state.strokes, [start, rounded]]);
  $('toast').classList.remove('show');
  state.lineStart = null;
  state.linePreview = null;
  state.linePending = false;
  state.lineSnapKind = null;
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

function applyExactLength() {
  if (!state.lineStart && !selectedWall()) return;
  const meters = parseLength($('measureInput').value);
  if (meters == null) { notify('Digite uma medida entre 15 cm e 100 m. Ex.: 2,50 m.'); return; }
  if (!state.lineStart) { editSelectedWallLength(meters); return; }
  const start = state.lineStart;
  const preview = state.linePreview ?? [start[0] + 1, start[1]];
  let dx = preview[0] - start[0];
  let dy = preview[1] - start[1];
  if (Math.hypot(dx, dy) < 1) { dx = 1; dy = 0; }
  const factor = meters * state.pixelsPerMeter / Math.hypot(dx, dy);
  let end = [start[0] + dx * factor, start[1] + dy * factor];
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
  const xScale = bounds.width / DESIGN_WIDTH, yScale = bounds.height / DESIGN_HEIGHT;
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
  return { strokes: state.strokes, openings: state.openings };
}

function commit(next, openings = state.openings) {
  state.history.push(snapshot());
  if (state.history.length > 50) state.history.shift();
  state.future = [];
  state.strokes = next;
  const keys = segmentKeys(next);
  state.openings = openings.filter((opening) => keys.has(opening.wallKey));
  saveProject();
  refreshControls();
  requestRender();
}

function sketchPoint(event) {
  const bounds = sketchCanvas.getBoundingClientRect();
  return [
    Math.max(0, Math.min(DESIGN_WIDTH, (event.clientX - bounds.left) * DESIGN_WIDTH / bounds.width)),
    Math.max(0, Math.min(DESIGN_HEIGHT, (event.clientY - bounds.top) * DESIGN_HEIGHT / bounds.height)),
  ];
}

sketchCanvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 && event.pointerType === 'mouse') return;
  event.preventDefault();
  const point = sketchPoint(event);
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
      $('toolHint').textContent = 'Clique no fim · digite a medida · Enter conclui';
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
      $('measureInput').blur();
      state.linePreview = snapped.point;
      state.linePending = pointDistance(state.lineStart, snapped.point) >= 5;
      state.lineDragOrigin = point;
      state.lineConfirmOnRelease = hasMeasure;
      state.lineRequestMeasureOnRelease = event.pointerType === 'mouse' && !hasMeasure && !wasPending;
      sketchCanvas.setPointerCapture(event.pointerId);
    }
    state.lineSnapKind = snapped.kind;
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
  if (state.moveDrag && event.pointerId === state.moveDrag.pointerId) {
    updateWallMove(sketchPoint(event));
    return;
  }
  if (state.tool === 'line' && state.lineStart && (!state.linePending || state.lineDragOrigin)) {
    const snapped = snapPoint(sketchPoint(event), state.lineStart, event.altKey, event.pointerType);
    state.linePreview = snapped.point;
    state.lineSnapKind = snapped.kind;
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
      state.lineSnapKind = snapped.kind;
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
sketchCanvas.addEventListener('pointercancel', () => {
  if (state.moveDrag) finishWallMove(true);
  state.draft = null; state.lineDragOrigin = null; requestRender();
});
$('measureInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); applyExactLength(); }
  if (event.key === 'Escape') { event.preventDefault(); cancelLine(); }
});
$('applyMeasure').addEventListener('click', applyExactLength);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.tool === 'line' && document.activeElement !== $('measureInput')) cancelLine();
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
  context.setTransform(sketchCanvas.width / DESIGN_WIDTH, 0, 0, sketchCanvas.height / DESIGN_HEIGHT, 0, 0);
  context.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  const gridStep = state.pixelsPerMeter / 2;
  context.lineWidth = 1;
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
    drawStroke(context, stroke, '#c97954', Math.max(7, state.thickness * state.pixelsPerMeter));
    if (stroke.length === 2 && pointDistance(stroke[0], stroke[1]) >= 25)
      drawDimension(context, stroke[0], stroke[1]);
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
    context.lineWidth = opening.kind === 'window' ? 5 : 2; context.stroke();
    const center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    context.fillStyle = opening.kind === 'window' ? '#286f83' : '#315f47';
    context.font = '700 11px DM Sans, Arial, sans-serif';
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(opening.kind === 'window' ? 'J' : 'P', center[0], center[1] - 13);
  }
  if (state.draft) drawStroke(context, state.draft, '#db9876', 6);
  if (state.lineStart) {
    const end = state.linePreview ?? state.lineStart;
    if (state.lineSnapKind === 'x' || state.lineSnapKind === 'y') {
      context.beginPath();
      context.setLineDash([5, 5]);
      if (state.lineSnapKind === 'x') { context.moveTo(0, state.lineStart[1]); context.lineTo(DESIGN_WIDTH, state.lineStart[1]); }
      else { context.moveTo(state.lineStart[0], 0); context.lineTo(state.lineStart[0], DESIGN_HEIGHT); }
      context.strokeStyle = '#76a392'; context.lineWidth = 1.5; context.stroke();
      context.setLineDash([]);
    }
    if (pointDistance(state.lineStart, end) >= 2) {
      context.beginPath(); context.moveTo(...state.lineStart); context.lineTo(...end);
      context.strokeStyle = '#426f61'; context.lineWidth = 3; context.stroke();
      drawDimension(context, state.lineStart, end, true);
    }
    for (const point of [state.lineStart, end]) {
      context.beginPath(); context.arc(point[0], point[1], 5, 0, Math.PI * 2);
      context.fillStyle = '#fff'; context.fill(); context.strokeStyle = '#426f61'; context.lineWidth = 2; context.stroke();
    }
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawDimension(context, start, end, preview = false) {
  const text = formatMeters(pointDistance(start, end));
  const midX = (start[0] + end[0]) / 2;
  const midY = (start[1] + end[1]) / 2 - 12;
  context.font = '700 13px DM Sans, Arial, sans-serif';
  const width = context.measureText(text).width + 14;
  context.fillStyle = preview ? '#31594b' : '#fffefa';
  context.beginPath(); context.roundRect(midX - width / 2, midY - 10, width, 20, 5); context.fill();
  context.fillStyle = preview ? '#fff' : '#6d5548';
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillText(text, midX, midY + 1);
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
  context.lineWidth = 2;
  for (const point of [stroke[0], stroke.at(-1)]) {
    context.beginPath(); context.arc(point[0], point[1], 4, 0, Math.PI * 2); context.fill(); context.stroke();
  }
}

function worldPoint(point) {
  return [(point[0] - DESIGN_WIDTH / 2) / state.pixelsPerMeter,
    (point[1] - DESIGN_HEIGHT / 2) / state.pixelsPerMeter];
}

function wallVertices(start, end, z0 = 0, z1 = state.height) {
  const [ax, ay] = worldPoint(start);
  const [bx, by] = worldPoint(end);
  const length = Math.hypot(bx - ax, by - ay);
  if (length < .05) return null;
  const nx = -(by - ay) / length * state.thickness / 2;
  const ny = (bx - ax) / length * state.thickness / 2;
  return [
    [ax + nx, ay + ny, z0], [ax - nx, ay - ny, z0],
    [bx - nx, by - ny, z0], [bx + nx, by + ny, z0],
    [ax + nx, ay + ny, z1], [ax - nx, ay - ny, z1],
    [bx - nx, by - ny, z1], [bx + nx, by + ny, z1],
  ];
}

function wallBoxes(start, end) {
  const opening = state.openings.find((item) => item.wallKey === wallKey(start, end));
  if (!opening) return [wallVertices(start, end)].filter(Boolean);
  const length = pointDistance(start, end) / state.pixelsPerMeter;
  const half = opening.width / length / 2;
  const at = (t) => [start[0] + (end[0] - start[0]) * t,
    start[1] + (end[1] - start[1]) * t];
  const left = at(opening.t - half), right = at(opening.t + half);
  const sill = opening.kind === 'window' ? .9 : 0;
  const head = Math.min(state.height - .1, 2.1);
  return [
    wallVertices(start, left), wallVertices(right, end),
    sill > 0 ? wallVertices(left, right, 0, sill) : null,
    wallVertices(left, right, head, state.height),
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
  const centerWorldX = xs.length ? ((Math.min(...xs) + Math.max(...xs)) / 2 - DESIGN_WIDTH / 2) / state.pixelsPerMeter : 0;
  const centerWorldY = ys.length ? ((Math.min(...ys) + Math.max(...ys)) / 2 - DESIGN_HEIGHT / 2) / state.pixelsPerMeter : 0;
  const unit = Math.min(width, height) / (spanMeters * 1.42 + state.height) * state.zoom;
  const centerX = width * .5;
  const centerY = height * .61;
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
  if (!walls.length && !mesh) return;

  const faces = [];
  const floor = floorOutline();
  if (floor) {
    const top = floor.map((point) => toScreen([...worldPoint(point), -.02]));
    faces.push({ corners: top, shade: '#dce9d7',
      depth: top.reduce((sum, corner) => sum + corner.depth, 0) / top.length });
    for (let i = 0; i < floor.length; i++) {
      const a = worldPoint(floor[i]), b = worldPoint(floor[(i + 1) % floor.length]);
      const corners = [[...a, -.02], [...b, -.02], [...b, -.16], [...a, -.16]].map(toScreen);
      faces.push({ corners, shade: '#b9cdb7',
        depth: corners.reduce((sum, corner) => sum + corner.depth, 0) / 4 });
    }
  }
  for (const [start, end] of walls) {
    for (const box of wallBoxes(start, end)) {
      for (const face of BOX_FACES) {
        const corners = face.corners.map((index) => toScreen(box[index]));
        faces.push({ corners, shade: face.shade,
          depth: corners.reduce((sum, corner) => sum + corner.depth, 0) / corners.length });
      }
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
  faces.sort((a, b) => a.depth - b.depth);
  for (const face of faces) drawPolygon(context, face.corners, face.shade, face.imported ? '#34584c33' : '#a7654b33');
}

function requestRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => { renderScheduled = false; drawSketch(); drawModel(); });
}

function refreshControls() {
  const count = segments().length;
  const floor = floorOutline();
  $('wallCount').textContent = `${count} ${count === 1 ? 'parede' : 'paredes'}`;
  $('modelStatus').textContent = [count ? `${count} ${count === 1 ? 'parede gerada' : 'paredes geradas'}` : null,
    state.openings.length ? `${state.openings.length} ${state.openings.length === 1 ? 'abertura' : 'aberturas'}` : null,
    floor ? `piso ${(polygonArea(floor) / state.pixelsPerMeter ** 2).toFixed(1).replace('.', ',')} m²` : null,
    state.stlMesh ? 'STL importado' : null].filter(Boolean).join(' · ') || 'Aguardando desenho';
  $('sketchHint').hidden = state.strokes.length > 0 || Boolean(state.draft) || Boolean(state.lineStart);
  $('modelHint').hidden = count > 0 || Boolean(state.stlMesh);
  $('undoButton').disabled = state.history.length === 0;
  $('redoButton').disabled = state.future.length === 0;
  $('exportButton').disabled = count === 0;
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
  state.tool = tool;
  for (const [id, name] of [['lineTool', 'line'], ['drawTool', 'draw'], ['doorTool', 'door'],
    ['windowTool', 'window'], ['eraseTool', 'erase']]) {
    const active = name === tool;
    $(id).classList.toggle('active', active);
    $(id).setAttribute('aria-pressed', String(active));
  }
  sketchCanvas.style.cursor = tool === 'erase' ? 'cell' : 'crosshair';
  $('toolHint').textContent = tool === 'door' ? 'Toque numa parede para colocar porta' :
    tool === 'window' ? 'Toque numa parede para colocar janela' :
    tool === 'erase' ? 'Toque numa abertura ou parede para apagar' :
    tool === 'draw' ? 'Desenho livre, sem medida exata' : 'Arraste uma parede para mover · toque para editar';
  refreshMeasure();
}

$('lineTool').addEventListener('click', () => setTool('line'));
$('drawTool').addEventListener('click', () => setTool('draw'));
$('doorTool').addEventListener('click', () => setTool('door'));
$('windowTool').addEventListener('click', () => setTool('window'));
$('eraseTool').addEventListener('click', () => setTool('erase'));
$('undoButton').addEventListener('click', () => {
  if (!state.history.length) return;
  cancelLine();
  state.future.push(snapshot());
  Object.assign(state, state.history.pop());
  saveProject(); refreshControls(); requestRender();
});
$('redoButton').addEventListener('click', () => {
  if (!state.future.length) return;
  cancelLine();
  state.history.push(snapshot());
  Object.assign(state, state.future.pop());
  saveProject(); refreshControls(); requestRender();
});
$('clearButton').addEventListener('click', () => {
  cancelLine();
  if (!state.strokes.length) return;
  commit([]);
  notify('Quadro limpo. Use Desfazer para recuperar os traços.');
});
$('heightRange').addEventListener('input', (event) => {
  state.height = safeNumber(event.target.value, 2.7, 1.8, 4);
  scheduleSave(); refreshControls(); requestRender();
});
$('thicknessRange').addEventListener('input', (event) => {
  state.thickness = safeNumber(Number(event.target.value) / 100, .15, .1, .3);
  scheduleSave(); refreshControls(); requestRender();
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

modelCanvas.addEventListener('pointerdown', (event) => {
  modelCanvas.setPointerCapture(event.pointerId);
  state.draggingModel = [event.clientX, event.clientY];
});
modelCanvas.addEventListener('pointermove', (event) => {
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
modelCanvas.addEventListener('pointerup', () => { state.draggingModel = null; });
modelCanvas.addEventListener('pointercancel', () => { state.draggingModel = null; });
modelCanvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  state.zoom = Math.max(.55, Math.min(2.8, state.zoom * (event.deltaY > 0 ? .92 : 1.08)));
  requestRender();
}, { passive: false });
$('resetView').addEventListener('click', () => {
  setView('perspective');
});

function setView(view) {
  const preset = {
    perspective: { yaw: -.73, pitch: .62, label: 'PERSPECTIVA 3D' },
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
  cancelLine();
  const example = [
    [[190, 145], [555, 145]], [[555, 145], [555, 415]],
    [[555, 415], [190, 415]], [[190, 415], [190, 145]],
    [[370, 145], [370, 300]], [[370, 300], [555, 300]],
  ];
  commit(example);
  notify('Exemplo carregado. Agora experimente girar o modelo.');
});

$('openButton').addEventListener('click', () => $('projectFile').click());
$('projectFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 6_000_000) { notify('O arquivo é grande demais para um projeto.'); return; }
  try {
    const project = parseProject(await file.text());
    cancelLine();
    state.height = project.height;
    state.thickness = project.thickness;
    state.floorEnabled = project.floorEnabled;
    state.pixelsPerMeter = project.pixelsPerMeter;
    state.stlMesh = project.stlMesh;
    commit(project.strokes, project.openings);
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
  return lines.join('\n') + '\n';
}

$('exportButton').addEventListener('click', () => {
  if (!segments().length) return;
  download('traco-projeto-3d.obj', modelToObj(), 'text/plain');
  notify('Modelo OBJ exportado. Abra em Blender ou outro visualizador 3D.');
});

readSavedProject();
refreshControls();
requestRender();
new ResizeObserver(requestRender).observe(sketchCanvas);
new ResizeObserver(requestRender).observe(modelCanvas);
window.addEventListener('pagehide', saveProject);
