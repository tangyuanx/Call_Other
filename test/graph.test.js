'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CallGraph, keyOf } = require('../src/graph');
const { item, provider } = require('./fixtures');
const names = graph => graph.snapshot().nodes.map(n => n.name).sort();
const idFor = (graph, name) => graph.snapshot().nodes.find(n => n.name === name && !n.reference).id;

test('outgoing and incoming directions preserve caller -> callee arrow semantics', async () => {
  const a = item('a'), b = item('b', 10), c = item('c', 20);
  const graph = new CallGraph(b, provider([[a, b], [b, c]]));
  await graph.toggle(graph.root, 'incoming'); await graph.toggle(graph.root, 'outgoing');
  assert.deepEqual(names(graph), ['a', 'b', 'c']);
  assert.deepEqual(graph.snapshot().edges.map(e => [graph.items.get(e.from).name, graph.items.get(e.to).name]), [['a', 'b'], ['b', 'c']]);
  await graph.toggle(graph.root, 'incoming');
  assert.deepEqual(names(graph), ['b', 'c']);
});

test('two paths to the same function have independent occurrences and collapse states', async () => {
  const a = item('a'), b = item('b', 10), c = item('c', 20), d = item('d', 30);
  const graph = new CallGraph(a, provider([[a, b], [a, c], [b, d], [c, d]]));
  await graph.toggle(graph.root, 'outgoing');
  for (const name of ['b', 'c']) await graph.toggle(idFor(graph, name), 'outgoing');
  assert.deepEqual(names(graph), ['a', 'b', 'c', 'd', 'd']);
  const copies = graph.snapshot().nodes.filter(n => n.name === 'd');
  assert.notEqual(copies[0].id, copies[1].id); assert.equal(copies[0].symbol, copies[1].symbol);
  await graph.toggle(idFor(graph, 'b'), 'outgoing');
  assert.deepEqual(names(graph), ['a', 'b', 'c', 'd']);
  await graph.toggle(idFor(graph, 'c'), 'outgoing');
  assert.deepEqual(names(graph), ['a', 'b', 'c']);
});

test('recursive paths terminate as independent clickable references without loop edges', async () => {
  const a = item('a'), b = item('b', 10);
  const graph = new CallGraph(a, provider([[a, a], [a, b], [b, a]]));
  await graph.toggle(keyOf(a), 'outgoing'); await graph.toggle(idFor(graph, 'b'), 'outgoing');
  assert.equal(graph.snapshot().nodes.length, 4); assert.equal(graph.snapshot().edges.length, 3);
  assert.equal(graph.snapshot().nodes.filter(n => n.reference).length, 2);
  await graph.toggle(keyOf(a), 'outgoing'); assert.deepEqual(names(graph), ['a']);
});

test('same-name functions at different locations never merge', async () => {
  const root = item('root'), a = item('overload', 10), b = item('overload', 20), c = item('overload', 10, 'file:///other.cpp');
  const graph = new CallGraph(root, provider([[root, a], [root, b], [root, c]]));
  await graph.toggle(graph.root, 'outgoing'); assert.equal(graph.snapshot().nodes.length, 4);
});

test('repeated call sites merge to one edge with a count', async () => {
  const a = item('a'), b = item('b', 10);
  const graph = new CallGraph(a, async () => [{ to: b, fromRanges: [{}, {}] }, { to: b, fromRanges: [{}] }]);
  await graph.toggle(graph.root, 'outgoing'); assert.equal(graph.snapshot().edges.length, 1); assert.equal(graph.snapshot().edges[0].count, 3);
});

test('collapse while provider is pending cannot reopen the branch on completion', async () => {
  const a = item('a'), b = item('b', 10); let finish;
  const graph = new CallGraph(a, () => new Promise(resolve => { finish = resolve; }));
  const request = graph.toggle(graph.root, 'outgoing');
  await graph.toggle(graph.root, 'outgoing'); finish([{ to: b }]); await request;
  assert.deepEqual(names(graph), ['a']);
  await graph.toggle(graph.root, 'outgoing'); assert.deepEqual(names(graph), ['a', 'b']);
});

test('disposed sessions ignore late results', async () => {
  const a = item('a'), b = item('b', 10); let finish; let changes = 0;
  const graph = new CallGraph(a, () => new Promise(resolve => { finish = resolve; }));
  const request = graph.toggle(graph.root, 'outgoing', () => changes++); await Promise.resolve(); const beforeDispose = changes; graph.dispose(); finish([{ to: b }]); await request;
  assert.equal(graph.items.size, 1); assert.equal(changes, beforeDispose);
});

test('provider failures permit retry and do not remove existing graph', async () => {
  const a = item('a'), b = item('b', 10); let attempts = 0;
  const graph = new CallGraph(a, async () => { if (++attempts === 1) throw new Error('offline'); return [{ to: b }]; });
  await graph.toggle(graph.root, 'outgoing'); assert.match(graph.snapshot().nodes[0].outgoing.error, /offline/);
  await graph.toggle(graph.root, 'outgoing'); assert.deepEqual(names(graph), ['a', 'b']);
});

test('empty provider responses become known leaf directions', async () => {
  const graph = new CallGraph(item('leaf'), async () => undefined);
  await graph.toggle(graph.root, 'outgoing'); assert.equal(graph.snapshot().nodes[0].outgoing.count, 0);
});

test('large fan-out is capped with an explicit warning', async () => {
  const a = item('a'); const children = Array.from({ length: 15 }, (_, i) => item(`child${i}`, i + 10));
  const graph = new CallGraph(a, provider(children.map(c => [a, c])), { maxNodes: 5, maxRelations: 10 });
  await graph.toggle(graph.root, 'outgoing'); assert.equal(graph.snapshot().nodes.length, 5); assert.match(graph.snapshot().nodes[0].outgoing.warning, /5.*上限/);
});

test('hidden nodes and invalid directions cannot trigger language queries', async () => {
  let count = 0; const graph = new CallGraph(item('root'), async () => { count++; return []; });
  await graph.toggle('arbitrary', 'outgoing'); await graph.toggle(graph.root, '__proto__'); assert.equal(count, 0);
});

test('reopening a cached branch does not query the provider again', async () => {
  const a = item('a'), b = item('b', 10); let calls = 0;
  const graph = new CallGraph(a, async () => { calls++; return [{ to: b }]; });
  for (let i = 0; i < 3; i++) await graph.toggle(graph.root, 'outgoing');
  assert.equal(calls, 1); assert.deepEqual(names(graph), ['a', 'b']);
});

test('visible leaf discovery removes empty controls without expanding hidden nodes', async () => {
  const a = item('a'), b = item('b', 10), c = item('c', 20), d = item('d', 30);
  const graph = new CallGraph(a, provider([[a, b], [a, c], [b, d]]));
  await graph.toggle(graph.root, 'outgoing'); await graph.inspectVisible();
  const state = graph.snapshot(); assert.deepEqual(names(graph), ['a', 'b', 'c']);
  const leaf = state.nodes.find(n => n.name === 'c');
  assert.equal(leaf.outgoing.loaded, true); assert.equal(leaf.outgoing.count, 0); assert.equal(leaf.outgoing.canExpand, false);
  assert.equal(leaf.incoming.canExpand, true, 'callers are expanded as a private branch, never merged into the root');
  assert.equal(state.nodes.find(n => n.name === 'b').outgoing.canExpand, true);
});

test('inspecting visible nodes does not allocate or recursively query hidden occurrences', async () => {
  const a = item('a'), b = item('b', 10), c = item('c', 20); let calls = 0;
  const query = provider([[a, b], [b, c]]);
  const graph = new CallGraph(a, async (...args) => { calls++; return query(...args); });
  await graph.toggle(graph.root, 'outgoing'); await graph.inspectVisible();
  assert.equal(graph.items.size, 2); assert.deepEqual(names(graph), ['a', 'b']); assert.equal(calls, 4);
});

test('visible probes are bounded to four concurrent requests', async () => {
  let active = 0, peak = 0; const a = item('a'), children = Array.from({ length: 8 }, (_, i) => item(`c${i}`, i + 10));
  const query = provider(children.map(c => [a, c]));
  const graph = new CallGraph(a, async (...args) => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 2)); const value = await query(...args); active--; return value; });
  await graph.toggle(graph.root, 'outgoing'); await graph.inspectVisible(); assert.ok(peak <= 4); assert.ok(peak > 1);
});

test('copies of a function do not share expansion state but reuse query results', async () => {
  const a = item('a'), b = item('b', 10), c = item('c', 20), d = item('d', 30), e = item('e', 40);
  let dQueries = 0; const query = provider([[a, b], [a, c], [b, d], [c, d], [d, e]]);
  const graph = new CallGraph(a, async (node, direction) => { if (node === d && direction === 'outgoing') dQueries++; return query(node, direction); });
  await graph.toggle(graph.root, 'outgoing');
  await graph.toggle(idFor(graph, 'b'), 'outgoing'); await graph.toggle(idFor(graph, 'c'), 'outgoing');
  const copies = graph.snapshot().nodes.filter(n => n.name === 'd');
  await graph.toggle(copies[0].id, 'outgoing');
  assert.equal(graph.snapshot().nodes.find(n => n.id === copies[1].id).outgoing.open, false);
  assert.equal(graph.snapshot().nodes.filter(n => n.name === 'e').length, 1);
  await graph.toggle(copies[1].id, 'outgoing');
  assert.equal(graph.snapshot().nodes.filter(n => n.name === 'e').length, 2); assert.equal(dQueries, 1);
});
