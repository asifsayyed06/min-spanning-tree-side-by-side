'use strict';

/* ---------- helpers & state ---------- */
const $ = s => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const W = 600, H = 400, PAD = 22;

const S = {
  nodes: [], edges: [], nid: 0, eid: 0,
  tool: 'node', sel: null, drag: null,
  K: [], P: [], step: 0, playing: false, timer: null
};

const boards = [
  { algo: 'kruskal', svg: $('#svgK'), log: $('#logK'), stat: $('#statK') },
  { algo: 'prim',    svg: $('#svgP'), log: $('#logP'), stat: $('#statP') }
];

const label = i => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');
const node = id => S.nodes.find(n => n.id === id);
const edge = id => S.edges.find(e => e.id === id);
const nameOf = id => label(S.nodes.findIndex(n => n.id === id));
const weight = (a, b) => Math.max(1, Math.round(Math.hypot(a.x - b.x, a.y - b.y) / 10));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hasEdge = (a, b) => S.edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent.appendChild(e);
  return e;
}

/* ---------- graph editing ---------- */
function addNode(x, y) {
  S.nodes.push({ id: S.nid++, x: clamp(x, PAD, W - PAD), y: clamp(y, PAD, H - PAD) });
}
function addEdge(a, b) {
  if (a === b || hasEdge(a, b)) return;
  S.edges.push({ id: S.eid++, a, b, w: weight(node(a), node(b)) });
}
function removeNode(id) {
  S.nodes = S.nodes.filter(n => n.id !== id);
  S.edges = S.edges.filter(e => e.a !== id && e.b !== id);
}
function refreshWeights() {
  S.edges.forEach(e => { e.w = weight(node(e.a), node(e.b)); });
}
function comps() {
  const par = {};
  S.nodes.forEach(n => par[n.id] = n.id);
  const find = x => par[x] === x ? x : (par[x] = find(par[x]));
  S.edges.forEach(e => { par[find(e.a)] = find(e.b); });
  const roots = new Set(S.nodes.map(n => find(n.id)));
  return { find, count: roots.size };
}
function connectAll() {
  for (;;) {
    const c = comps();
    if (c.count <= 1) return;
    let best = null;
    for (const a of S.nodes) for (const b of S.nodes) {
      if (a.id < b.id && c.find(a.id) !== c.find(b.id)) {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (!best || d < best.d) best = { a: a.id, b: b.id, d };
      }
    }
    addEdge(best.a, best.b);
  }
}

function loadSample() {
  const pts = [[70,80],[200,50],[330,90],[470,60],[540,180],[400,230],[250,200],[110,220],[180,340],[360,340]];
  const es = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,2],[5,6],[6,2],[6,1],[6,7],[7,0],[7,8],[8,6],[8,9],[9,5],[9,6]];
  S.nodes = []; S.edges = []; S.nid = S.eid = 0;
  pts.forEach(p => addNode(p[0], p[1]));
  es.forEach(e => addEdge(e[0], e[1]));
}
function loadRandom() {
  S.nodes = []; S.edges = []; S.nid = S.eid = 0;
  let tries = 0;
  while (S.nodes.length < 8 && tries++ < 500) {
    const x = PAD + Math.random() * (W - 2 * PAD), y = PAD + Math.random() * (H - 2 * PAD);
    if (S.nodes.every(n => Math.hypot(n.x - x, n.y - y) > 80)) addNode(x, y);
  }
  S.nodes.forEach(a => {
    S.nodes.filter(b => b !== a)
      .sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))
      .slice(0, 2).forEach(b => addEdge(a.id, b.id));
  });
  connectAll();
}

/* ---------- algorithms (each returns a list of steps) ---------- */
function kruskal() {
  const par = {};
  S.nodes.forEach(n => par[n.id] = n.id);
  const find = x => par[x] === x ? x : (par[x] = find(par[x]));
  const steps = []; let total = 0, taken = 0;
  for (const e of [...S.edges].sort((a, b) => a.w - b.w)) {
    if (taken === S.nodes.length - 1) break;
    const ra = find(e.a), rb = find(e.b);
    if (ra !== rb) { par[ra] = rb; total += e.w; taken++; steps.push({ e: e.id, ok: true, total }); }
    else steps.push({ e: e.id, ok: false, total });
  }
  return steps;
}
function prim() {
  if (!S.nodes.length) return [];
  const inT = new Set([S.nodes[0].id]);
  const steps = []; let total = 0;
  for (;;) {
    let best = null;
    for (const e of S.edges) {
      if (inT.has(e.a) !== inT.has(e.b) && (!best || e.w < best.w)) best = e;
    }
    if (!best) break;
    const nn = inT.has(best.a) ? best.b : best.a;
    inT.add(nn); total += best.w;
    steps.push({ e: best.id, ok: true, node: nn, total });
  }
  return steps;
}

/* ---------- rendering ---------- */
const maxSteps = () => Math.max(S.K.length, S.P.length);

function recompute() {
  pause();
  S.K = kruskal(); S.P = prim(); S.step = 0;
  drawAll();
}

function draw(b) {
  const svg = b.svg;
  svg.innerHTML = '';
  const steps = b.algo === 'kruskal' ? S.K : S.P;
  const k = Math.min(S.step, steps.length);
  const acc = new Set(), rej = new Set();
  steps.slice(0, k).forEach(s => (s.ok ? acc : rej).add(s.e));
  const cur = k > 0 ? steps[k - 1] : null;

  const vis = new Set();
  if (b.algo === 'prim' && S.nodes.length) {
    vis.add(S.nodes[0].id);
    steps.slice(0, k).forEach(s => vis.add(s.node));
  } else {
    steps.slice(0, k).forEach(s => { if (s.ok) { const e = edge(s.e); vis.add(e.a); vis.add(e.b); } });
  }

  if (!S.nodes.length) {
    const t = el('text', { x: W / 2, y: H / 2, class: 'empty' }, svg);
    t.textContent = 'Click here to add nodes, or load a graph';
  }

  S.edges.forEach(e => {
    const a = node(e.a), c = node(e.b);
    let cls = acc.has(e.id) ? 'acc' : rej.has(e.id) ? 'rej' : '';
    if (cur && cur.e === e.id) cls += ' cur';
    const g = el('g', { 'data-e': e.id }, svg);
    el('line', { x1: a.x, y1: a.y, x2: c.x, y2: c.y, class: 'edge ' + cls }, g);
    el('line', { x1: a.x, y1: a.y, x2: c.x, y2: c.y, class: 'hit' }, g);
    const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
    el('rect', { x: mx - 12, y: my - 9, width: 24, height: 18, rx: 5, class: 'wbg' }, g);
    const t = el('text', { x: mx, y: my + 4, class: 'wt' }, g);
    t.textContent = e.w;
  });

  S.nodes.forEach((n, i) => {
    const g = el('g', { 'data-n': n.id }, svg);
    el('circle', { cx: n.x, cy: n.y, r: 16,
      class: 'node' + (vis.has(n.id) ? ' in' : '') + (S.sel === n.id ? ' sel' : '') }, g);
    const t = el('text', { x: n.x, y: n.y + 5, class: 'nl' }, g);
    t.textContent = label(i);
  });

  b.log.innerHTML = steps.slice(0, k).map(s => {
    const e = edge(s.e);
    const verb = b.algo === 'prim' ? 'Add' : (s.ok ? 'Add' : 'Skip');
    const extra = b.algo === 'prim' ? ` → node ${nameOf(s.node)}` : (s.ok ? '' : ' <i>(would form a cycle)</i>');
    return `<li class="${s.ok ? 'ok' : 'no'}">${verb} ${nameOf(e.a)}–${nameOf(e.b)} <b>(${e.w})</b>${extra}</li>`;
  }).join('');
  b.log.scrollTop = b.log.scrollHeight;

  const tot = k ? steps[k - 1].total : 0;
  const cnt = steps.slice(0, k).filter(s => s.ok).length;
  const done = steps.length > 0 && k === steps.length;
  b.stat.innerHTML = `Steps <b>${k}/${steps.length}</b> · Tree edges <b>${cnt}</b> · Weight <b>${tot}</b>${done ? ' · <b>✔ done</b>' : ''}`;
}

function drawAll() {
  boards.forEach(draw);
  const sum = $('#summary');
  const n = S.nodes.length;
  const c = n ? comps().count : 0;
  const both = S.K.length && S.step >= S.K.length && S.step >= S.P.length;
  sum.className = 'summary';
  if (n > 1 && c > 1) {
    sum.classList.add('warn');
    sum.textContent = `Graph has ${c} separate parts – Kruskal builds a forest, Prim covers only A's part.`;
  } else if (both) {
    const kw = S.K[S.K.length - 1].total, pw = S.P.length ? S.P[S.P.length - 1].total : 0;
    sum.classList.add('good');
    sum.textContent = kw === pw
      ? `Both trees have the same total weight: ${kw}. Kruskal looked at ${S.K.length} edges, Prim added ${S.P.length}.`
      : `Weights differ (Kruskal ${kw}, Prim ${pw}).`;
  } else {
    sum.textContent = '';
  }
  const hints = {
    node: 'Click on empty space to add a node.',
    edge: 'Click one node, then another, to connect them (weight = distance).',
    move: 'Drag a node to move it. Weights update automatically.',
    erase: 'Click a node or an edge to delete it.'
  };
  $('#hint').textContent = hints[S.tool];
}

/* ---------- pointer interaction (works on both boards) ---------- */
function pt(svg, ev) {
  const p = svg.createSVGPoint();
  p.x = ev.clientX; p.y = ev.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}

boards.forEach(b => {
  b.svg.addEventListener('pointerdown', ev => {
    const p = pt(b.svg, ev);
    const ng = ev.target.closest('[data-n]'), eg = ev.target.closest('[data-e]');
    const nId = ng ? +ng.dataset.n : null, eId = eg ? +eg.dataset.e : null;

    if (S.tool === 'node') {
      if (nId === null && eId === null) { addNode(p.x, p.y); recompute(); }
    } else if (S.tool === 'edge') {
      if (nId === null) { S.sel = null; drawAll(); return; }
      if (S.sel === null) { S.sel = nId; drawAll(); }
      else { addEdge(S.sel, nId); S.sel = null; recompute(); }
    } else if (S.tool === 'move') {
      if (nId !== null) { S.drag = nId; b.svg.setPointerCapture(ev.pointerId); }
    } else if (S.tool === 'erase') {
      if (nId !== null) { removeNode(nId); recompute(); }
      else if (eId !== null) { S.edges = S.edges.filter(e => e.id !== eId); recompute(); }
    }
  });

  b.svg.addEventListener('pointermove', ev => {
    if (S.drag === null) return;
    const p = pt(b.svg, ev), n = node(S.drag);
    n.x = clamp(p.x, PAD, W - PAD); n.y = clamp(p.y, PAD, H - PAD);
    refreshWeights(); drawAll();
  });

  const release = () => { if (S.drag !== null) { S.drag = null; recompute(); } };
  b.svg.addEventListener('pointerup', release);
  b.svg.addEventListener('pointercancel', release);
});

/* ---------- toolbar ---------- */
document.querySelectorAll('#tools button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#tools button').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    S.tool = btn.dataset.tool; S.sel = null; drawAll();
  });
});
$('#sample').onclick = () => { loadSample(); recompute(); };
$('#random').onclick = () => { loadRandom(); recompute(); };
$('#clear').onclick = () => { S.nodes = []; S.edges = []; S.nid = S.eid = 0; S.sel = null; recompute(); };

/* ---------- playback ---------- */
const delay = () => 1700 - (+$('#speed').value) * 150;
function pause() {
  S.playing = false; clearTimeout(S.timer);
  $('#play').textContent = '▶ Play';
}
function tick() {
  if (!S.playing) return;
  if (S.step >= maxSteps()) { pause(); return; }
  S.step++; drawAll();
  S.timer = setTimeout(tick, delay());
}
$('#play').onclick = () => {
  if (S.playing) { pause(); return; }
  if (S.step >= maxSteps()) S.step = 0;
  S.playing = true; $('#play').textContent = '⏸ Pause';
  tick();
};
$('#next').onclick = () => { pause(); if (S.step < maxSteps()) S.step++; drawAll(); };
$('#prev').onclick = () => { pause(); if (S.step > 0) S.step--; drawAll(); };
$('#reset').onclick = () => { pause(); S.step = 0; drawAll(); };

/* ---------- start ---------- */
loadSample();
recompute();


/* ---------- small MST chatbot ---------- */
const chatbot = $('#chatbot');
const chatbotToggle = $('#chatbotToggle');
const chatbotClose = $('#chatbotClose');
const chatMessages = $('#chatMessages');
const chatForm = $('#chatForm');
const chatInput = $('#chatInput');

function addChatMessage(text, who = 'bot') {
  const msg = document.createElement('div');
  msg.className = `chat-msg ${who}`;
  msg.textContent = text;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function chatbotReply(question) {
  const q = question.toLowerCase().trim();
  if (!q) return 'Please type a question about MST, Kruskal, Prim, or this visualizer.';
  if (q.includes('what is mst') || q.includes('minimum spanning')) {
    return 'MST means Minimum Spanning Tree. It connects every vertex with no cycle and the minimum possible total edge weight.';
  }
  if (q.includes('kruskal')) {
    return "Kruskal sorts all edges from smallest to largest and adds an edge only when it does not create a cycle. Its usual time complexity is O(E log E).";
  }
  if (q.includes('prim')) {
    return "Prim starts from one vertex and repeatedly adds the cheapest edge connecting the current tree to a new vertex. With a heap, it runs in O(E log V).";
  }
  if (q.includes('difference') || q.includes('compare')) {
    return 'Kruskal is edge-based and is often convenient for sparse graphs. Prim is vertex/tree-growth based and is often convenient for dense graphs.';
  }
  if (q.includes('complex') || q.includes('time')) {
    return 'Kruskal: O(E log E). Prim with a binary heap: O(E log V). Here, E is the number of edges and V is the number of vertices.';
  }
  if (q.includes('how') && (q.includes('use') || q.includes('visualizer'))) {
    return 'Choose Add node to create vertices, Add edge to connect them, then use Play or Next to see both algorithms step by step. You can also load Sample graph or Random graph.';
  }
  if (q.includes('cycle')) {
    return 'A cycle is a path that returns to an already visited vertex. Kruskal skips an edge if adding it would create a cycle.';
  }
  if (q.includes('weight')) {
    return 'In this visualizer, an edge weight is calculated from the distance between its two nodes. Moving a node updates the weights.';
  }
  return 'I can help with MST, Kruskal, Prim, cycles, edge weights, time complexity, and using this visualizer. Try: “Explain Kruskal”.';
}

function askChat(question) {
  const q = question.trim();
  if (!q) return;
  addChatMessage(q, 'user');
  setTimeout(() => addChatMessage(chatbotReply(q), 'bot'), 250);
}

chatbotToggle.onclick = () => {
  chatbot.classList.toggle('open');
  if (chatbot.classList.contains('open')) chatInput.focus();
};
chatbotClose.onclick = () => chatbot.classList.remove('open');

chatForm.onsubmit = ev => {
  ev.preventDefault();
  const q = chatInput.value;
  chatInput.value = '';
  askChat(q);
};

document.querySelectorAll('.chat-quick button').forEach(btn => {
  btn.addEventListener('click', () => askChat(btn.dataset.question));
});
