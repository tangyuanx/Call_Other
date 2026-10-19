/* Independent branch boxes reserve their own routing area. */
(function (scope) {
  'use strict';
  const NODE_H = 32, ROW = 46, GAP = 60, PORT = 18, PAD = 8;
  function layout(graph, measure = text => text.length * 7.7) {
    if (!graph.nodes?.length) return { nodes: [], groups: [], width: 0, height: 0 };
    const byId = new Map(graph.nodes.map(node => [node.id, node]));
    const branches = new Map(), boxes = new Map();
    for (const group of graph.groups || []) {
      if (!branches.has(group.id)) branches.set(group.id, {});
      branches.get(group.id)[group.direction] = group;
    }
    function measureTree(id) {
      const node = byId.get(id);
      const incoming = (branches.get(id)?.incoming?.members || []).map(m => measureTree(m.id));
      const outgoing = (branches.get(id)?.outgoing?.members || []).map(m => measureTree(m.id));
      const sideHeight = children => children.reduce((sum, child) => sum + child.height, 0) + Math.max(0, children.length - 1) * (ROW - NODE_H);
      const nodeWidth = Math.max(126, Math.min(310, measure(node.displayName || node.name) + 52 + (node.reference ? 18 : 0)));
      const left = incoming.length ? Math.max(...incoming.map(child => child.width)) + GAP : 0;
      const right = outgoing.length ? Math.max(...outgoing.map(child => child.width)) + GAP : 0;
      const contentHeight = Math.max(NODE_H, sideHeight(incoming), sideHeight(outgoing));
      const padding = incoming.length || outgoing.length ? PAD : 0;
      const box = { id, node, incoming, outgoing, nodeWidth, left, right, width: left + nodeWidth + right, height: contentHeight + 2 * padding, contentHeight, padding, sideHeight };
      boxes.set(id, box); return box;
    }
    const rootBox = measureTree(graph.root || graph.nodes[0].id);
    const positions = new Map();
    function place(box, x, y) {
      box.x = x; box.y = y;
      positions.set(box.id, { ...box.node, x: x + box.left, y: y + box.padding + (box.contentHeight - NODE_H) / 2, width: box.nodeWidth, height: NODE_H });
      for (const direction of ['incoming', 'outgoing']) {
        const children = box[direction];
        let cursor = y + box.padding + (box.contentHeight - box.sideHeight(children)) / 2;
        for (const child of children) {
          const childX = direction === 'incoming' ? x + box.left - GAP - child.width : x + box.left + box.nodeWidth + GAP;
          place(child, childX, cursor); cursor += child.height + ROW - NODE_H;
        }
      }
    }
    place(rootBox, 50, 4);
    const groups = [];
    for (const group of graph.groups || []) {
      const owner = positions.get(group.id);
      if (!owner) continue;
      const outgoing = group.direction === 'outgoing';
      const px = outgoing ? owner.x + owner.width + PORT : owner.x - PORT, py = owner.y + NODE_H / 2;
      const paths = [];
      for (const member of group.members) {
        const target = positions.get(member.id), box = boxes.get(member.id);
        if (!target) continue;
        const ty = target.y + NODE_H / 2;
        let points;
        // Reverse expansions use a reserved top entrance into the child's
        // private vertical strip, outside its own incoming/outgoing routes.
        if ((outgoing && box.left) || (!outgoing && box.right)) {
          const entryY = box.y + 3, middle = target.x + target.width / 2;
          points = outgoing ? [[px, py], [px, entryY], [middle, entryY], [middle, target.y]] : [[middle, target.y], [middle, entryY], [px, entryY], [px, py]];
        } else points = outgoing ? [[px, py], [px, ty], [target.x, ty]] : [[target.x + target.width, ty], [px, ty], [px, py]];
        paths.push({ edgeId: member.edgeId, path: rounded(points), points, arrow: outgoing });
      }
      const stemPoints = outgoing ? [[owner.x + owner.width, py], [px, py]] : [[px, py], [owner.x, py]];
      groups.push({ ...group, x: px, y: py, stem: rounded(stemPoints), stemPoints, incomingArrow: !outgoing, paths });
    }
    return { nodes: [...positions.values()], groups, width: rootBox.width + 100, height: rootBox.height + 4, port: PORT };
  }
  function rounded(points, radius = 5) {
    const clean = points.filter((p, i) => !i || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
    if (!clean.length) return '';
    let path = `M ${clean[0][0]} ${clean[0][1]}`;
    for (let i = 1; i < clean.length - 1; i++) {
      const a = clean[i - 1], b = clean[i], c = clean[i + 1];
      const d1 = Math.hypot(b[0] - a[0], b[1] - a[1]), d2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const r = Math.min(radius, d1 / 2, d2 / 2);
      const pre = [b[0] + (a[0] - b[0]) * r / d1, b[1] + (a[1] - b[1]) * r / d1];
      const post = [b[0] + (c[0] - b[0]) * r / d2, b[1] + (c[1] - b[1]) * r / d2];
      path += ` L ${pre[0]} ${pre[1]} Q ${b[0]} ${b[1]} ${post[0]} ${post[1]}`;
    }
    if (clean.length > 1) path += ` L ${clean.at(-1)[0]} ${clean.at(-1)[1]}`;
    return path;
  }
  const api = { layout, rounded, NODE_H, GAP, PORT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.CallGraphLayout = api;
})(typeof window !== 'undefined' ? window : globalThis);
