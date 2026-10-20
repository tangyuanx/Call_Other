(function () {
  'use strict';
  const api = acquireVsCodeApi();
  const app = document.getElementById('app');
  const NS = 'http://www.w3.org/2000/svg';
  let state = { sequence: -1 }, geometry, zoom = 1, pan = { x: 0, y: 0 }, initialized = false;
  let drag = null, resizeTimer;
  const stored = api.getState();
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const icon = name => { const e = el('span', `codicon codicon-${name}`); e.setAttribute('aria-hidden', 'true'); return e; };
  function button(label, iconName, handler, cls = 'icon-button') {
    const e = el('button', cls); e.type = 'button'; e.title = label; e.setAttribute('aria-label', label);
    if (iconName) e.append(icon(iconName)); else e.textContent = label;
    e.onclick = handler; return e;
  }
  function send(type, extra = {}) { api.postMessage({ type, sequence: state.sequence, ...extra }); }
  function toggle(id, direction) { send('toggle', { id, direction }); }
  function svg(tag, attrs = {}) {
    const e = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, String(value));
    return e;
  }

  const toolbar = el('div', 'toolbar');
  const title = el('div', 'root-title'); title.append(icon('type-hierarchy'));
  const rootName = el('span', 'root-name', '函数调用关系');
  const location = el('span', 'location'); title.append(rootName, el('span', 'separator', '│'), location);
  toolbar.append(title, el('span', 'toolbar-spacer'),
    button('刷新关系（重新读取源码）', 'refresh', () => send('refresh'), 'icon-button refresh'),
    button('缩小', 'remove', () => setZoom(zoom / 1.15)),
    button('放大', 'add', () => setZoom(zoom * 1.15)),
    button('适应视图', 'screen-full', () => fit()));
  const viewport = el('div', 'viewport');
  const canvas = el('div', 'canvas');
  const empty = el('div', 'empty');
  const emptyText = el('p', '', '右键源码中的函数名，选择“展示调用关系”。');
  const actions = el('div', 'empty-actions');
  actions.append(button('展示当前函数', null, () => send('show'), 'primary'), button('查找 clangd 扩展', null, () => send('help'), 'text-button'));
  empty.append(emptyText, actions); viewport.append(canvas, empty);
  const status = el('div', 'status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const message = el('span', 'message'); const zoomLabel = el('span', 'zoom-label', '100%'); status.append(message, zoomLabel);
  app.append(toolbar, viewport, status);

  function remember() { api.setState({ root: state.graph?.root, zoom, pan }); }
  function transform() {
    canvas.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }
  function fit() {
    if (!geometry?.nodes.length || !viewport.clientWidth || !viewport.clientHeight) return;
    zoom = Math.min(1, Math.max(.2, Math.min((viewport.clientWidth - 16) / geometry.width, (viewport.clientHeight - 2) / geometry.height)));
    pan = { x: (viewport.clientWidth - geometry.width * zoom) / 2, y: (viewport.clientHeight - geometry.height * zoom) / 2 };
    transform(); remember();
  }
  function setZoom(value, point = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }) {
    const next = Math.max(.2, Math.min(2, value));
    pan = { x: point.x - (point.x - pan.x) * next / zoom, y: point.y - (point.y - pan.y) * next / zoom };
    zoom = next; transform(); remember();
  }
  function render() {
    const focused = document.activeElement;
    const focusedGroup = focused?.closest?.('.node-group');
    const restoreFocus = focusedGroup ? { id: focusedGroup.dataset.nodeId, direction: focused.dataset.direction } : null;
    const graph = state.graph;
    const hasGraph = Boolean(graph?.nodes?.length);
    empty.hidden = hasGraph; canvas.hidden = !hasGraph;
    // Flex display must not override the hidden state.
    empty.style.display = hasGraph ? 'none' : 'flex';
    if (!hasGraph) {
      rootName.textContent = '函数调用关系'; location.textContent = '';
      emptyText.textContent = state.status || '右键源码中的函数名，选择“展示调用关系”。';
      message.textContent = ''; return;
    }
    const previous = geometry;
    const oldAnchor = previous?.nodes.find(n => n.id === state.anchor);
    const measureCanvas = document.createElement('canvas'); const context = measureCanvas.getContext('2d');
    context.font = `14px ${getComputedStyle(document.body).getPropertyValue('--vscode-editor-font-family') || 'Consolas, monospace'}`;
    const displayGraph = { ...graph, nodes: graph.nodes.map(node => ({ ...node, displayName: node.name.includes('(') ? node.name : `${node.name}()` })) };
    geometry = CallGraphLayout.layout(displayGraph, text => context.measureText(text).width);
    const newAnchor = geometry.nodes.find(n => n.id === state.anchor);
    if (initialized && oldAnchor && newAnchor) { pan.x += (oldAnchor.x - newAnchor.x) * zoom; pan.y += (oldAnchor.y - newAnchor.y) * zoom; }
    const holders = new Map([...canvas.querySelectorAll('.node-group')].map(holder => [holder.dataset.nodeId, holder]));
    const visibleIds = new Set(geometry.nodes.map(node => node.id));
    for (const [id, holder] of holders) if (!visibleIds.has(id)) holder.remove();
    canvas.querySelector('.edges')?.remove();
    canvas.style.width = `${geometry.width}px`; canvas.style.height = `${geometry.height}px`;
    const edges = svg('svg', { width: geometry.width, height: geometry.height, class: 'edges', 'aria-hidden': 'true' });
    const defs = svg('defs'); const marker = svg('marker', { id: 'arrow', viewBox: '0 0 5 5', refX: 4.5, refY: 2.5, markerWidth: 5, markerHeight: 5, orient: 'auto', markerUnits: 'userSpaceOnUse' });
    marker.append(svg('path', { d: 'M 0 0 L 5 2.5 L 0 5 Z' })); defs.append(marker); edges.append(defs);
    for (const group of geometry.groups) {
      edges.append(svg('path', { d: group.stem, ...(group.incomingArrow ? { 'marker-end': 'url(#arrow)' } : {}) }));
      for (const path of group.paths) edges.append(svg('path', { d: path.path, ...(path.arrow ? { 'marker-end': 'url(#arrow)' } : {}) }));
    }
    canvas.prepend(edges);
    for (const node of geometry.nodes) {
      const holder = holders.get(node.id) || el('div');
      holder.className = `node-group${node.root ? ' is-root' : ''}${node.id === state.selected ? ' is-selected' : ''}`;
      holder.style.left = `${node.x}px`; holder.style.top = `${node.y}px`; holder.style.width = `${node.width}px`; holder.style.height = `${node.height}px`;
      holder.dataset.nodeId = node.id;
      const label = `${node.name}\n${node.detail ? node.detail + '\n' : ''}${node.location}${node.reference ? '\n此路径已展示该函数；此处为独立引用，可点击跳转。' : ''}`;
      let nodeButton = holder.querySelector('.function-node');
      if (!nodeButton) {
        nodeButton = button(label, null, () => send('navigate', { id: node.id }), 'function-node');
        nodeButton.textContent = '';
        nodeButton.append(icon(node.kind === 5 || node.kind === 8 ? 'symbol-method' : 'symbol-function'), el('span', 'node-name', node.displayName));
        if (node.reference) { const referenceIcon = icon('references'); referenceIcon.classList.add('reference-icon'); nodeButton.append(referenceIcon); }
        holder.append(nodeButton);
      }
      nodeButton.title = label; nodeButton.setAttribute('aria-label', label);
      nodeButton.querySelector('.node-name').textContent = node.displayName;
      nodeButton.setAttribute('aria-pressed', String(node.id === state.selected));
      for (const direction of ['incoming', 'outgoing']) {
        const branch = node[direction];
        let port = holder.querySelector(`.port.${direction}`);
        if (!branch.loaded || branch.count === 0 || (!branch.open && !branch.canExpand)) { port?.remove(); continue; }
        if (!geometry.groups.some(group => group.id === node.id && group.direction === direction)) {
          const left = direction === 'incoming';
          const edge = left ? node.x : node.x + node.width;
          const portX = left ? edge - geometry.port : edge + geometry.port;
          const centerY = node.y + node.height / 2;
          edges.append(svg('path', { d: left ? `M ${portX} ${centerY} H ${edge}` : `M ${edge} ${centerY} H ${portX}` }));
        }
        const noun = `${branch.additional ? '其他' : ''}${direction === 'incoming' ? '调用者' : '被调用者'}`;
        const action = branch.open ? '收起' : '展开';
        const portLabel = branch.loading ? `正在查询${noun}，点击可${branch.open ? '收起' : '展开'}` : `${action}${node.name}的${noun}`;
        const glyph = branch.loading ? 'loading' : branch.open ? 'remove' : 'add';
        if (!port) { port = button(portLabel, glyph, () => toggle(node.id, direction)); port.dataset.direction = direction; holder.append(port); }
        port.className = `port ${direction}${branch.open ? ' expanded' : ''}${branch.loading ? ' loading' : ''}`;
        port.title = portLabel; port.setAttribute('aria-label', portLabel); port.setAttribute('aria-expanded', String(branch.open));
        if (port.dataset.glyph !== glyph) { port.replaceChildren(icon(glyph)); port.dataset.glyph = glyph; }
      }
      if (!holder.isConnected) canvas.append(holder);
    }
    if (restoreFocus) {
      const holder = [...canvas.querySelectorAll('.node-group')].find(node => node.dataset.nodeId === restoreFocus.id);
      const target = holder && (restoreFocus.direction ? holder.querySelector(`.port.${restoreFocus.direction}`) : holder.querySelector('.function-node'));
      const focusTarget = target || holder?.querySelector('.function-node');
      if (focusTarget && focusTarget !== document.activeElement) focusTarget.focus({ preventScroll: true });
    }
    const root = graph.nodes.find(n => n.id === graph.root);
    rootName.textContent = root.name; rootName.title = root.detail || root.name;
    location.textContent = root.location; location.title = root.location;
    const busy = graph.nodes.some(n => n.incoming.loading || n.outgoing.loading);
    const errors = graph.nodes.flatMap(n => [n.incoming.error, n.outgoing.error]).filter(Boolean);
    const warnings = graph.nodes.flatMap(n => [n.incoming.warning, n.outgoing.warning]).filter(Boolean);
    const isolated = graph.edges.length === 0 && !busy && !errors.length;
    const text = state.status || errors[0] || warnings[0] || (busy ? '正在查询调用关系…' : isolated ? '没有返回调用关系；可等待语言服务索引完成后刷新。' : '点击函数跳转 · 左侧展开调用者 · 右侧展开被调用者 · 拖动平移 / 滚轮缩放');
    message.textContent = text; message.title = text; status.classList.toggle('error', Boolean(errors.length || state.status));
    if (!initialized) {
      initialized = true;
      if (stored?.root === graph.root && Number.isFinite(stored.zoom) && Number.isFinite(stored.pan?.x) && Number.isFinite(stored.pan?.y)) {
        zoom = Math.max(.2, Math.min(2, stored.zoom)); pan = stored.pan; transform();
      } else fit();
    } else if (previous?.nodes.length === 1 && geometry.nodes.length > 1) fit();
    else transform();
  }

  window.addEventListener('message', event => {
    const next = event.data;
    if (next?.type !== 'state' || !Number.isInteger(next.sequence) || next.sequence < state.sequence) return;
    if (next.graph?.root !== state.graph?.root) { initialized = false; geometry = undefined; }
    state = next; render();
  });
  viewport.addEventListener('wheel', event => {
    if (!state.graph) return;
    event.preventDefault(); const rect = viewport.getBoundingClientRect();
    setZoom(zoom * Math.exp(-event.deltaY * .0015), { x: event.clientX - rect.left, y: event.clientY - rect.top });
  }, { passive: false });
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    drag = { x: event.clientX, y: event.clientY, pan: { ...pan } };
    viewport.setPointerCapture(event.pointerId); viewport.classList.add('dragging');
  });
  viewport.addEventListener('pointermove', event => {
    if (!drag) return;
    pan = { x: drag.pan.x + event.clientX - drag.x, y: drag.pan.y + event.clientY - drag.y }; transform();
  });
  function endDrag() { if (drag) { drag = null; viewport.classList.remove('dragging'); remember(); } }
  viewport.addEventListener('pointerup', endDrag); viewport.addEventListener('pointercancel', endDrag);
  new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (initialized) fit(); }, 80); }).observe(viewport);
  render(); send('ready');
})();
