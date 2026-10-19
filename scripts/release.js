'use strict';
const fs = require('node:fs');
const path = require('node:path');

function validateRelease(tag, manifest, lock, changelog) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag || '')) throw new Error('Release tag must be a stable version, e.g. v0.1.2.');
  if (tag !== `v${manifest.version}`) throw new Error(`Tag ${tag} does not match package.json ${manifest.version}.`);
  if (manifest.publisher !== 'tangyuanx' || manifest.name !== 'compact-call-graph') throw new Error('Keep the official extension ID tangyuanx.compact-call-graph unchanged.');
  if (lock.version !== manifest.version || lock.packages?.['']?.version !== manifest.version) throw new Error('package-lock.json version does not match package.json.');
  const heading = changelog.match(/^# (\d+\.\d+\.\d+)\s*$/m);
  if (heading?.[1] !== manifest.version) throw new Error('The first CHANGELOG version must match the release version.');
  return { version: manifest.version, file: `${manifest.name}-${manifest.version}.vsix` };
}

if (require.main === module) {
  try {
    const root = path.join(__dirname, '..');
    const result = validateRelease(process.argv[2], require('../package.json'), require('../package-lock.json'), fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'));
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${result.version}\nfile=${result.file}\n`);
    console.log(`Release validated: ${process.argv[2]}, tangyuanx.compact-call-graph, ${result.file}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { validateRelease };
