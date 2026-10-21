'use strict';
const DIRECTIONS = ['incoming', 'outgoing'];
const keyOf = item => `${item.uri.toString()}#${item.selectionRange.start.line}:${item.selectionRange.start.character}:${item.name}`;
const branchKey = (id, direction) => JSON.stringify([id, direction]);
let nextSession = 0;

/** Occurrences own UI branches; only provider query data is shared. */
class CallGraph {
  constructor(root, query, options = {}) {
    this.root = keyOf(root);
    this.prefix = `graph-${++nextSession}-`;
    this.items = new Map([[this.root, root]]);
    this.parents = new Map(); this.references = new Set();
    this.branches = new Map(); this.cache = new Map(); this.serial = 0;
    this.query = query; this.maxNodes = options.maxNodes ?? 300;
    this.maxRelations = options.maxRelations ?? 40; this.alive = true;
  }
  dispose() { this.alive = false; }
  async toggle(id, direction, changed = () => {}) {
    if (!this.alive || !DIRECTIONS.includes(direction) || !this.visible().ids.has(id) || this.references.has(id)) return;
    const key = branchKey(id, direction);
    let branch = this.branches.get(key);
    if (!branch) { branch = this.createBranch(id, direction); this.branches.set(key, branch); }
    branch.open = !branch.open;
    if (branch.loaded && !branch.relations.length) branch.open = false;
    if (branch.open && branch.loaded) this.materialize(branch);
    changed();
    if (branch.open && !branch.loaded) await this.load(branch, changed);
  }
  createBranch(id, direction) {
    return { id, direction, open: false, loading: false, loaded: false, relations: [], error: '', warning: '' };
  }
  async load(branch, changed) {
    if (branch.loading) return branch.pending;
    branch.loading = true; branch.error = ''; changed();
    branch.pending = this.read(branch, changed); return branch.pending;
  }
  async queryCached(item, direction) {
    const key = branchKey(keyOf(item), direction);
    if (!this.cache.has(key)) {
      const promise = Promise.resolve().then(() => this.query(item, direction));
      this.cache.set(key, promise);
      promise.catch(() => { if (this.cache.get(key) === promise) this.cache.delete(key); });
    }
    return this.cache.get(key);
  }
  async read(branch, changed) {
    try {
      const calls = await this.queryCached(this.items.get(branch.id), branch.direction);
      if (!this.alive) return;
      if (calls != null && !Array.isArray(calls)) throw new Error('语言服务返回了无效的调用关系。');
      // The edge back to the immediate parent is already drawn and controlled
      // by that parent's branch. Filter it per occurrence, after cache lookup.
      const parent = this.parents.get(branch.id);
      const displayedParent = parent && parent.direction !== branch.direction ? keyOf(this.items.get(parent.id)) : undefined;
      const unique = new Map();
      for (const call of calls || []) {
        const item = branch.direction === 'incoming' ? call.from : call.to;
        if (!item?.uri || !item.selectionRange || typeof item.name !== 'string') continue;
        const symbol = keyOf(item);
        if (symbol === displayedParent) continue;
        if (!unique.has(symbol)) unique.set(symbol, { symbol, item, count: call.fromRanges?.length || 1 });
        else unique.get(symbol).count += call.fromRanges?.length || 1;
      }
      branch.relations = [...unique.values()].slice(0, this.maxRelations);
      if (unique.size > branch.relations.length) branch.warning = `关系较多，仅载入 ${branch.relations.length}/${unique.size} 项；可提高关系上限后刷新。`;
      branch.loaded = true;
      if (!branch.relations.length) branch.open = false;
      if (branch.open) this.materialize(branch);
    } catch (error) {
      if (!this.alive) return;
      branch.error = error instanceof Error ? error.message : String(error); branch.open = false;
    } finally { branch.loading = false; if (this.alive) changed(); }
  }
  materialize(branch) {
    for (const relation of branch.relations) {
      if (relation.id) continue;
      if (this.items.size >= this.maxNodes) {
        branch.warning = `已达到 ${this.maxNodes} 个节点的上限；不同路径的同一函数分别计数，可提高上限后刷新。`; continue;
      }
      const id = `${this.prefix}occurrence-${++this.serial}`; relation.id = id;
      this.items.set(id, relation.item); this.parents.set(id, { id: branch.id, direction: branch.direction });
      let ancestor = branch.id;
      while (ancestor) {
        if (keyOf(this.items.get(ancestor)) === relation.symbol) { this.references.add(id); break; }
        ancestor = this.parents.get(ancestor)?.id;
      }
    }
  }
  async inspectVisible(changed = () => {}) {
    if (this.inspecting) return this.inspecting;
    const run = async () => {
      while (this.alive) {
        const pending = [];
        for (const id of this.visible().ids) for (const direction of DIRECTIONS) {
          if (this.references.has(id)) continue;
          const key = branchKey(id, direction);
          let branch = this.branches.get(key);
          if (!branch) { branch = this.createBranch(id, direction); this.branches.set(key, branch); }
          if (!branch.loaded && !branch.loading && !branch.error) pending.push(branch);
        }
        if (!pending.length) break;
        await Promise.all(pending.slice(0, 4).map(branch => this.load(branch, changed)));
      }
    };
    this.inspecting = run().finally(() => { this.inspecting = undefined; }); return this.inspecting;
  }
  visible() {
    const ids = new Set([this.root]), queue = [this.root], edges = [], groups = [];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      for (const direction of DIRECTIONS) {
        const branch = this.branches.get(branchKey(id, direction));
        if (!branch?.open || !branch.loaded) continue;
        const members = [];
        for (const relation of branch.relations) {
          if (!relation.id) continue;
          const from = direction === 'incoming' ? relation.id : id, to = direction === 'incoming' ? id : relation.id;
          const edgeId = JSON.stringify([from, to]);
          edges.push({ id: edgeId, from, to, count: relation.count }); members.push({ id: relation.id, edgeId });
          if (!ids.has(relation.id)) { ids.add(relation.id); queue.push(relation.id); }
        }
        if (members.length) groups.push({ id, direction, members });
      }
    }
    return { ids, edges, groups };
  }
  snapshot(label = item => item.uri.toString()) {
    const visible = this.visible();
    const nodes = [...visible.ids].map(id => {
      const item = this.items.get(id), reference = this.references.has(id), parent = this.parents.get(id);
      const node = { id, symbol: keyOf(item), name: item.name, kind: item.kind, detail: item.detail || '', location: label(item), root: id === this.root, reference };
      for (const direction of DIRECTIONS) {
        const b = this.branches.get(branchKey(id, direction));
        node[direction] = b && !reference ? { open: b.open, loading: b.loading, loaded: b.loaded, count: b.relations.length, canExpand: b.loaded && b.relations.length > 0, error: b.error, warning: b.warning } : { open: false, loading: false, loaded: false, count: null, canExpand: false };
        node[direction].additional = Boolean(parent && parent.direction !== direction);
        if (reference) node[direction] = { open: false, loading: false, loaded: true, count: 0, canExpand: false };
      }
      return node;
    });
    return { session: this.prefix, root: this.root, nodes, edges: visible.edges, groups: visible.groups };
  }
}
module.exports = { CallGraph, keyOf, branchKey };
