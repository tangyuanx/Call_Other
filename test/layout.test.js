'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CallGraph, keyOf } = require('../src/graph');
const { layout, PORT, GAP, rounded } = require('../media/layout');
const { item, provider } = require('./fixtures');

test('all outgoing branches share a single short junction outside node border', async () => {
  const root = item('handle_request()'); const children = [item('validate_request()', 10), item('dispatch_request()', 20), item('send_response()', 30)];
  const graph = new CallGraph(root, provider(children.map(n => [root, n]))); await graph.toggle(graph.root, 'outgoing');
  const geometry = layout(graph.snapshot()); const r = geometry.nodes.find(n => n.root); const group = geometry.groups[0];
  assert.equal(group.x - (r.x + r.width), PORT); assert.ok(PORT > 11);
  assert.equal(group.paths.length, 3);
  for (const path of group.paths) assert.ok(path.path.startsWith(`M ${group.x} ${group.y}`));
  assert.equal(Math.min(...geometry.nodes.filter(n => !n.root).map(n => n.x)) - (r.x + r.width), GAP);
  assert.ok(geometry.height < 200);
});

test('mutual recursion and self recursion have finite valid paths and distinct nodes', async () => {
  const a = item('a'), b = item('b', 10); const graph = new CallGraph(a, provider([[a, a], [a, b], [b, a]]));
  await graph.toggle(keyOf(a), 'outgoing'); await graph.toggle(graph.snapshot().nodes.find(n => n.name === 'b').id, 'outgoing');
  const result = layout(graph.snapshot()); assert.equal(result.nodes.length, 4);
  assert.ok(result.nodes[0].y !== result.nodes[1].y);
  assert.ok(result.groups.flatMap(g => g.paths).every(p => !/NaN|Infinity/.test(p.path)));
});

function routes(geometry) {
  const result = [];
  for (const group of geometry.groups) for (const points of [group.stemPoints, ...group.paths.map(p => p.points)]) {
    for (let i = 1; i < points.length; i++) result.push({ owner: `${group.id}:${group.direction}`, a: points[i - 1], b: points[i] });
  }
  return result.filter(s => s.a[0] !== s.b[0] || s.a[1] !== s.b[1]);
}
function intersects(s, t) {
  const h1 = s.a[1] === s.b[1], h2 = t.a[1] === t.b[1];
  const between = (n, a, b) => n >= Math.min(a, b) - .001 && n <= Math.max(a, b) + .001;
  if (h1 === h2) {
    if (h1) return s.a[1] === t.a[1] && Math.max(Math.min(s.a[0], s.b[0]), Math.min(t.a[0], t.b[0])) <= Math.min(Math.max(s.a[0], s.b[0]), Math.max(t.a[0], t.b[0]));
    return s.a[0] === t.a[0] && Math.max(Math.min(s.a[1], s.b[1]), Math.min(t.a[1], t.b[1])) <= Math.min(Math.max(s.a[1], s.b[1]), Math.max(t.a[1], t.b[1]));
  }
  const h = h1 ? s : t, v = h1 ? t : s;
  return between(v.a[0], h.a[0], h.b[0]) && between(h.a[1], v.a[1], v.b[1]);
}

test('reverse expansion from a child has no intersections with other branch routes', async () => {
  const root = item('handle_request'), validate = item('validate_request', 10), dispatch = item('dispatch_request', 20), send = item('send_response', 30), shared = item('shared_path', 40), lookup = item('lookup_route', 50), metrics = item('record_metrics', 60);
  const graph = new CallGraph(root, provider([[root, validate], [root, dispatch], [root, send], [shared, dispatch], [shared, send], [dispatch, lookup], [dispatch, metrics]]));
  await graph.toggle(graph.root, 'outgoing');
  const dispatchId = graph.snapshot().nodes.find(n => n.name === 'dispatch_request').id;
  await graph.toggle(dispatchId, 'incoming'); await graph.toggle(dispatchId, 'outgoing');
  const geometry = layout(graph.snapshot());
  const segments = routes(geometry), collisions = [];
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) if (segments[i].owner !== segments[j].owner && intersects(segments[i], segments[j])) collisions.push([segments[i], segments[j]]);
  assert.deepEqual(collisions, []);
  for (let i = 0; i < geometry.nodes.length; i++) for (let j = i + 1; j < geometry.nodes.length; j++) {
    const a = geometry.nodes[i], b = geometry.nodes[j];
    assert.ok(!(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y), 'node rectangles must not overlap');
  }
});

test('incoming stems point into their owner, outgoing branches toward callees', async () => {
  const a = item('a'), b = item('b', 10); const graph = new CallGraph(b, provider([[a, b]])); await graph.toggle(graph.root, 'incoming');
  const group = layout(graph.snapshot()).groups[0]; assert.equal(group.incomingArrow, true); assert.equal(group.paths[0].arrow, false);
});

test('very long symbols are bounded and geometry supports empty graphs', () => {
  const n = { id: 'n', name: 'x'.repeat(300), incoming: {}, outgoing: {} };
  const result = layout({ nodes: [n], edges: [], groups: [] }); assert.equal(result.nodes[0].width, 310);
  assert.equal(layout({ nodes: [], edges: [], groups: [] }).width, 0);
});

test('rounded routes keep straight segments and only round their corners', () => {
  const path = rounded([[0, 0], [20, 0], [20, 20], [40, 20]]);
  assert.equal(path, 'M 0 0 L 15 0 Q 20 0 20 5 L 20 15 Q 20 20 25 20 L 40 20');
});

test('opposing port hit areas cannot overlap in a single column gap', () => {
  const hitArea = 22;
  assert.ok(GAP - 2 * PORT >= hitArea + 2, 'two facing 22px targets retain a gap');
  assert.ok(PORT - hitArea / 2 >= 6, 'button hit area stays outside the node border');
});

test('mixed multi-level expansions reserve non-crossing routing areas', async () => {
  for (let seed = 1; seed <= 12; seed++) {
    let random = seed;
    const next = () => { random = (random * 1664525 + 1013904223) >>> 0; return random; };
    const items = Array.from({ length: 7 }, (_, i) => item(`f${i}`, i * 10));
    const links = [];
    for (let a = 0; a < items.length; a++) for (let b = 0; b < items.length; b++) if (next() % 4 === 0) links.push([items[a], items[b]]);
    const graph = new CallGraph(items[0], provider(links), { maxNodes: 50 });
    for (let step = 0; step < 14; step++) {
      const choices = graph.snapshot().nodes.filter(node => !node.reference);
      await graph.toggle(choices[next() % choices.length].id, next() % 2 ? 'incoming' : 'outgoing');
      const geometry = layout(graph.snapshot()); const segments = routes(geometry);
      for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
        if (segments[i].owner !== segments[j].owner) assert.ok(!intersects(segments[i], segments[j]), `crossing in seed ${seed}, step ${step}`);
      }
    }
  }
});
