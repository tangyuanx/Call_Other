'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { initialView, wheelView, zoomAt } = require('../media/viewport');
const size = { width: 400, height: 150 };
const geometry = { height: 1000, nodes: [{ root: true, x: 500, y: 400, width: 200, height: 32 }] };
const view = { zoom: 1, pan: { x: -400, y: -300 } };
const point = { x: 100, y: 75 };

test('large graphs open at 100 percent centered on the root, even in a small panel', () => {
  assert.deepEqual(initialView(geometry, size), { zoom: 1, pan: { x: -400, y: -341 } });
});
test('ordinary wheel scrolls vertically without changing scale or horizontal position', () => {
  assert.deepEqual(wheelView(view, geometry, size, { deltaY: 80, deltaMode: 0, ctrlKey: false }, point), { zoom: 1, pan: { x: -400, y: -380 } });
  const scaled = { zoom: .5, pan: { x: -100, y: -80 } };
  assert.deepEqual(wheelView(scaled, geometry, size, { deltaY: -40 }, point), { zoom: .5, pan: { x: -100, y: -40 } });
});
test('scrolling respects the top and bottom and does nothing when all rows fit', () => {
  assert.equal(wheelView(view, geometry, size, { deltaY: -10000 }, point).pan.y, 8);
  assert.equal(wheelView(view, geometry, size, { deltaY: 10000 }, point).pan.y, -858);
  assert.deepEqual(wheelView(view, { height: 100 }, size, { deltaY: 80 }, point), view);
});
test('wheel line and page units retain predictable scrolling distances', () => {
  assert.equal(wheelView(view, geometry, size, { deltaY: 3, deltaMode: 1 }, point).pan.y, -348);
  assert.equal(wheelView(view, geometry, size, { deltaY: 1, deltaMode: 2 }, point).pan.y, -450);
});
test('Ctrl plus wheel zooms around the pointer and retains the point under it', () => {
  for (const deltaY of [-120, 120]) {
    const next = wheelView(view, geometry, size, { deltaY, ctrlKey: true }, point);
    assert.ok(deltaY < 0 ? next.zoom > view.zoom : next.zoom < view.zoom);
    for (const axis of ['x', 'y']) assert.ok(Math.abs((point[axis] - next.pan[axis]) / next.zoom - (point[axis] - view.pan[axis]) / view.zoom) < 1e-9);
  }
});
test('zoom controls respect minimum and maximum scale', () => {
  assert.equal(zoomAt(1, view.pan, 100, point).zoom, 2);
  assert.equal(zoomAt(1, view.pan, .001, point).zoom, .2);
});
