'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRelease } = require('../scripts/release');
const manifest = { version: '0.1.2', publisher: 'tangyuanx', name: 'compact-call-graph' };
const lock = { version: '0.1.2', packages: { '': { version: '0.1.2' } } };
const changelog = '# 0.1.2\n\n- Publishing setup.\n\n# 0.1.1\n';
test('release tag, lockfile, identity and changelog agree', () => {
  assert.deepEqual(validateRelease('v0.1.2', manifest, lock, changelog), { version: '0.1.2', file: 'compact-call-graph-0.1.2.vsix' });
});
test('release rejects mismatched or non-stable tags', () => {
  for (const tag of ['v0.1.3', '0.1.2', 'v0.1.2-beta', undefined]) assert.throws(() => validateRelease(tag, manifest, lock, changelog));
});
test('release rejects identity changes and stale version metadata', () => {
  assert.throws(() => validateRelease('v0.1.2', { ...manifest, publisher: 'local-tools' }, lock, changelog));
  assert.throws(() => validateRelease('v0.1.2', manifest, { ...lock, version: '0.1.1' }, changelog));
  assert.throws(() => validateRelease('v0.1.2', manifest, { ...lock, packages: { '': { version: '0.1.1' } } }, changelog));
  assert.throws(() => validateRelease('v0.1.2', manifest, lock, '# 0.1.1\n'));
});
