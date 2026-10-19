'use strict';
const vscode = require('vscode');
const crypto = require('node:crypto');
const { CallGraph, keyOf } = require('./graph');

function timeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('语言服务查询超时，请等待工程索引完成后重试。')), ms);
  })]).finally(() => clearTimeout(timer));
}

function getHtml(webview, extensionUri) {
  const nonce = crypto.randomBytes(18).toString('base64');
  const asset = name => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', name)).toString();
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource};">
  <link rel="stylesheet" href="${asset('codicons/codicon.css')}">
  <link rel="stylesheet" href="${asset('graph.css')}"><title>调用关系</title></head>
  <body><main id="app"></main>
  <script nonce="${nonce}" src="${asset('layout.js')}"></script>
  <script nonce="${nonce}" src="${asset('graph.js')}"></script></body></html>`;
}

class GraphView {
  constructor(context) {
    this.context = context;
    this.graph = undefined;
    this.view = undefined;
    this.ready = false;
    this.selected = undefined;
    this.sequence = 0;
    this.status = '';
    this.editorColumn = vscode.ViewColumn.One;
  }

  resolveWebviewView(view) {
    this.view = view;
    this.ready = false;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')] };
    view.webview.html = getHtml(view.webview, this.context.extensionUri);
    view.webview.onDidReceiveMessage(message => this.onMessage(message).catch(error => {
      this.status = error.message;
      this.send();
    }), undefined, this.context.subscriptions);
    view.onDidDispose(() => { if (this.view === view) { this.view = undefined; this.ready = false; } }, undefined, this.context.subscriptions);
    view.onDidChangeVisibility(() => { if (view.visible) this.send(); }, undefined, this.context.subscriptions);
  }

  config() { return vscode.workspace.getConfiguration('compactCallGraph'); }

  send(anchor) {
    if (!this.view || !this.ready) return;
    const graph = this.graph?.snapshot(item => `${vscode.workspace.asRelativePath(item.uri, true)}:${item.selectionRange.start.line + 1}`);
    void this.view.webview.postMessage({ type: 'state', graph, selected: this.selected, status: this.status, anchor, sequence: this.sequence });
  }

  async focus() { await vscode.commands.executeCommand('compactCallGraph.graph.focus'); this.view?.show(true); }

  async show(uri, position) {
    const editor = vscode.window.activeTextEditor;
    uri = uri instanceof vscode.Uri ? uri : editor?.document.uri;
    position = position instanceof vscode.Position ? position : editor?.selection.active;
    if (!uri || !position) {
      vscode.window.showInformationMessage('请先打开源码，把光标放在函数名上，再选择“展示调用关系”。');
      return;
    }
    this.editorColumn = editor?.viewColumn || vscode.ViewColumn.One;
    const request = ++this.sequence;
    await this.focus();
    this.status = '正在查询函数…'; this.send();
    try {
      const items = await timeout(vscode.commands.executeCommand('vscode.prepareCallHierarchy', uri, position), this.config().get('requestTimeout', 15000));
      if (request !== this.sequence) return;
      if (!items?.length) {
        this.status = '未找到可用的函数。请将光标放在函数名上，并确认 C/C++ 语言服务已就绪。';
        this.send(); return;
      }
      let root = items[0];
      if (items.length > 1) {
        const picked = await vscode.window.showQuickPick(items.map(item => ({ label: item.name, description: item.detail, item })), { placeHolder: '选择要展示的函数' });
        if (!picked || request !== this.sequence) { if (request === this.sequence) { this.status = ''; this.send(); } return; }
        root = picked.item;
      }
      await this.setRoot(root);
    } catch (error) {
      if (request === this.sequence) { this.status = `${error.message} C/C++ 可使用支持调用层级的 clangd 20+。`; this.send(); }
    }
  }

  async setRoot(root) {
    this.graph?.dispose();
    this.graph = new CallGraph(root, (item, direction) => timeout(
      vscode.commands.executeCommand(direction === 'incoming' ? 'vscode.provideIncomingCalls' : 'vscode.provideOutgoingCalls', item),
      this.config().get('requestTimeout', 15000)
    ), { maxNodes: this.config().get('maxNodes', 300), maxRelations: this.config().get('maxRelationsPerNode', 40) });
    this.selected = keyOf(root); this.status = '';
    const graph = this.graph;
    const publish = () => { if (this.graph === graph) this.send(graph.root); };
    this.send();
    await Promise.all(['incoming', 'outgoing'].map(direction => graph.toggle(graph.root, direction, publish)));
    await graph.inspectVisible(publish);
  }

  async refresh() {
    const root = this.graph?.items.get(this.graph.root);
    if (!root) return this.show();
    await this.show(root.uri, root.selectionRange.start);
  }

  async onMessage(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'ready') { this.ready = true; return this.send(); }
    if (message.type === 'show') return this.show();
    if (message.type === 'refresh') return this.refresh();
    if (message.type === 'help') return vscode.commands.executeCommand('workbench.extensions.search', '@id:llvm-vs-code-extensions.vscode-clangd');
    if (!this.graph || typeof message.id !== 'string' || !this.graph.visible().ids.has(message.id) || message.sequence !== this.sequence) return;
    const graph = this.graph;
    if (message.type === 'toggle') {
      const anchor = message.id;
      await graph.toggle(message.id, message.direction, () => { if (this.graph === graph) this.send(anchor); });
      await graph.inspectVisible(() => { if (this.graph === graph) this.send(anchor); });
      return;
    }
    if (message.type === 'navigate') {
      const item = graph.items.get(message.id);
      this.selected = message.id; this.send(message.id);
      // IDs, URI and range come exclusively from provider results, never from HTML.
      const document = await vscode.workspace.openTextDocument(item.uri);
      const editor = await vscode.window.showTextDocument(document, { viewColumn: this.editorColumn, preserveFocus: true, preview: true });
      editor.selection = new vscode.Selection(item.selectionRange.start, item.selectionRange.end);
      editor.revealRange(item.selectionRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
  }

  dispose() { this.sequence++; this.graph?.dispose(); }
}

function activate(context) {
  const provider = new GraphView(context);
  context.subscriptions.push(provider,
    vscode.window.registerWebviewViewProvider('compactCallGraph.graph', provider, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('compactCallGraph.show', (uri, position) => provider.show(uri, position)),
    vscode.commands.registerCommand('compactCallGraph.refresh', () => provider.refresh())
  );
  return { provider };
}

module.exports = { activate, GraphView, getHtml, timeout };
