'use strict';
function item(name, line = 0, uri = 'file:///project/example.cpp') {
  const start = { line, character: 0 };
  return { name, kind: 11, uri: { toString: () => uri }, range: { start, end: { line: line + 5, character: 1 } }, selectionRange: { start, end: { line, character: name.length } } };
}
function provider(edges) {
  return async (source, direction) => edges.filter(([a, b]) => direction === 'outgoing' ? a === source : b === source).map(([from, to]) => direction === 'outgoing' ? { to, fromRanges: [{}] } : { from, fromRanges: [{}] });
}
module.exports = { item, provider };
