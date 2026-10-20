'use strict';
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

exports.run = async function () {
  const report = { passed: [], failed: [] };
  const real = process.env.CALL_GRAPH_REAL_CLANGD === '1';
  const destination = process.env.CALL_GRAPH_TEST_OUTPUT || path.resolve(__dirname, `../.test-results/host${real ? '-real' : ''}.json`);
  let registration;
  try {
    const extension = vscode.extensions.getExtension(`${require('../package.json').publisher}.${require('../package.json').name}`);
    assert.ok(extension, 'Development extension must be discoverable');
    const { provider } = await extension.activate();
    const uri = vscode.Uri.file(path.resolve(__dirname, '../examples/main.cpp'));
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    const text = document.getText();
    const symbols = new Map();
    for (const name of ['handle_request', 'validate_request', 'dispatch_request', 'send_response', 'server_loop', 'on_readable', 'lookup_route', 'record_metrics', 'shared_path']) {
      const declaration = new RegExp(`(?:void|bool) ${name}\\(`).exec(text);
      assert.ok(declaration);
      const start = document.positionAt(declaration.index + declaration[0].indexOf(name));
      const selection = new vscode.Range(start, start.translate(0, name.length));
      symbols.set(name, new vscode.CallHierarchyItem(vscode.SymbolKind.Function, name, '', uri, document.lineAt(start.line).range, selection));
    }
    const links = [['server_loop', 'handle_request'], ['on_readable', 'handle_request'], ['handle_request', 'validate_request'], ['handle_request', 'dispatch_request'], ['handle_request', 'send_response'], ['dispatch_request', 'lookup_route'], ['dispatch_request', 'record_metrics'], ['shared_path', 'dispatch_request'], ['shared_path', 'send_response']];
    if (!real) registration = vscode.languages.registerCallHierarchyProvider({ scheme: 'file', language: 'cpp' }, {
      prepareCallHierarchy(doc, pos) { const word = doc.getText(doc.getWordRangeAtPosition(pos)); return symbols.get(word); },
      provideCallHierarchyOutgoingCalls(item) { return links.filter(([from]) => from === item.name).map(([, to]) => new vscode.CallHierarchyOutgoingCall(symbols.get(to), [item.selectionRange])); },
      provideCallHierarchyIncomingCalls(item) { return links.filter(([, to]) => to === item.name).map(([from]) => new vscode.CallHierarchyIncomingCall(symbols.get(from), [symbols.get(from).selectionRange])); }
    });
    const root = symbols.get('handle_request'); editor.selection = new vscode.Selection(root.selectionRange.start, root.selectionRange.start);
    if (real) {
      const clangd = vscode.extensions.getExtension('llvm-vs-code-extensions.vscode-clangd');
      assert.ok(clangd, 'Official clangd extension must be installed in isolated test profile');
      await clangd.activate();
      let ready = false;
      for (let i = 0; i < 40; i++) {
        try { const prepared = await vscode.commands.executeCommand('vscode.prepareCallHierarchy', uri, root.selectionRange.start); if (prepared?.length) { ready = true; break; } } catch {}
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      assert.ok(ready, 'clangd must prepare the C++ function');
      report.passed.push('official clangd extension with real clangd 20.1.8');
    }
    await vscode.commands.executeCommand('compactCallGraph.show');
    assert.equal(provider.graph.snapshot().nodes.length, 6);
    const initialRoot = provider.graph.snapshot().nodes.find(n => n.root);
    assert.ok(initialRoot.incoming.open && initialRoot.outgoing.open, 'Both directions open automatically');
    assert.deepEqual(provider.graph.snapshot().nodes.filter(n => !n.root).map(n => n.name).sort(), ['server_loop', 'on_readable', 'validate_request', 'dispatch_request', 'send_response'].sort());
    assert.ok(provider.view, 'Bottom webview resolves'); report.passed.push('right-click command -> VS Code call hierarchy commands -> bottom webview');
    for (let i = 0; i < 30 && !provider.ready; i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(provider.ready, 'Native webview must run its scripts and send the ready handshake');
    report.passed.push('native VS Code webview loads renderer scripts successfully');
    await provider.onMessage({ type: 'toggle', id: provider.graph.root, direction: 'incoming', sequence: provider.sequence });
    assert.equal(provider.graph.snapshot().nodes.length, 4);
    await provider.onMessage({ type: 'toggle', id: provider.graph.root, direction: 'incoming', sequence: provider.sequence });
    assert.equal(provider.graph.snapshot().nodes.length, 6); report.passed.push('both directions initially visible, still independently collapsible');
    const target = provider.graph.snapshot().nodes.find(n => n.name === 'dispatch_request');
    await provider.onMessage({ type: 'toggle', id: target.id, direction: 'outgoing', sequence: provider.sequence });
    assert.equal(provider.graph.snapshot().nodes.length, 8); report.passed.push('expansion from a non-root function');
    await provider.onMessage({ type: 'toggle', id: target.id, direction: 'incoming', sequence: provider.sequence });
    assert.equal(provider.graph.snapshot().nodes.length, 9);
    assert.equal(provider.graph.snapshot().nodes.filter(n => n.name === 'handle_request').length, 1);
    assert.equal(provider.graph.snapshot().nodes.find(n => n.id === target.id).incoming.count, 1);
    const validate = provider.graph.snapshot().nodes.find(n => n.name === 'validate_request');
    assert.equal(validate.incoming.canExpand, false, 'Already displayed parent is not another expandable caller');
    report.passed.push('reverse expansion keeps other callers and removes already displayed parent controls');
    await provider.onMessage({ type: 'toggle', id: target.id, direction: 'incoming', sequence: provider.sequence });
    assert.equal(provider.graph.snapshot().nodes.length, 8);
    await provider.onMessage({ type: 'navigate', id: target.id, sequence: provider.sequence });
    assert.equal(vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString()).selection.start.line, symbols.get('dispatch_request').selectionRange.start.line);
    report.passed.push('node click reveals correct source definition');
    await provider.onMessage({ type: 'toggle', id: target.id, direction: 'outgoing', sequence: provider.sequence });
    assert.equal(provider.graph.snapshot().nodes.length, 6); report.passed.push('branch collapse');
    await provider.onMessage({ type: 'navigate', id: 'file:///untrusted', sequence: provider.sequence });
    await provider.onMessage({ type: 'toggle', id: provider.graph.root, direction: 'outgoing', sequence: -1 });
    assert.equal(provider.graph.snapshot().nodes.length, 6); report.passed.push('untrusted IDs and stale messages ignored');
    await vscode.commands.executeCommand('compactCallGraph.refresh');
    assert.equal(provider.graph.snapshot().nodes.length, 6);
    const refreshedRoot = provider.graph.snapshot().nodes.find(n => n.root);
    assert.ok(refreshedRoot.incoming.open && refreshedRoot.outgoing.open);
    report.passed.push('refresh rereads root and restores both directions');
    console.log('HOST TESTS PASSED', JSON.stringify(report));
  } catch (error) {
    report.failed.push(error.stack || String(error)); throw error;
  } finally {
    registration?.dispose(); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, JSON.stringify(report, null, 2));
  }
};
