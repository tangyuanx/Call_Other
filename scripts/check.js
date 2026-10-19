'use strict';
const { readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
for (const dir of ['src', 'media', 'test', 'scripts']) {
  for (const file of readdirSync(dir)) {
    const path = join(dir, file);
    if (statSync(path).isFile() && path.endsWith('.js')) execFileSync(process.execPath, ['--check', path], { stdio: 'inherit' });
  }
}
console.log('JavaScript syntax checks passed.');
