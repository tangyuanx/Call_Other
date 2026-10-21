(function (scope) {
  'use strict';
  function initialView(geometry, size) {
    const root = geometry.nodes.find(node => node.root) || geometry.nodes[0];
    return { zoom: 1, pan: root ? { x: size.width / 2 - root.x - root.width / 2, y: size.height / 2 - root.y - root.height / 2 } : { x: 0, y: 0 } };
  }
  function zoomAt(zoom, pan, value, point) {
    const next = Math.max(.2, Math.min(2, value));
    return { zoom: next, pan: { x: point.x - (point.x - pan.x) * next / zoom, y: point.y - (point.y - pan.y) * next / zoom } };
  }
  function wheelView(view, geometry, size, event, point) {
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1);
    if (event.ctrlKey) return zoomAt(view.zoom, view.pan, view.zoom * Math.exp(-delta * .0015), point);
    const height = geometry.height * view.zoom;
    if (height <= size.height) return view;
    return { zoom: view.zoom, pan: { x: view.pan.x, y: Math.max(size.height - height - 8, Math.min(8, view.pan.y - delta)) } };
  }
  const api = { initialView, zoomAt, wheelView };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.CallGraphViewport = api;
})(typeof window !== 'undefined' ? window : globalThis);
