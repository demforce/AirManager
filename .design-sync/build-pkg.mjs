#!/usr/bin/env node
// design-sync buildCmd (config.json#buildCmd). AirOps has no library build of
// its own - it lives inside the Next app (src/components/ui + src/styles/
// airops.css) - so this stages a throwaway package the converter can consume
// like any published DS:
//   .ds-sync/airops-pkg/package.json     name/version/types/module
//   .ds-sync/airops-pkg/dist/*.d.ts      tsc declarations of src/components/ui
//   .ds-sync/airops-pkg/dist/index.d.ts  barrel over every UI primitive module
//   .ds-sync/airops-pkg/dist/index.mjs   barrel re-exporting the REAL .tsx sources
//   .ds-sync/airops-pkg/styles.css       copy of src/styles/airops.css
// No component code is rewritten: the bundle is built from the repo's own
// sources. Re-run before every sync (output is gitignored, deterministic).
// Run from the repo root: `node .design-sync/build-pkg.mjs`.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const UI = join(ROOT, 'src/components/ui');
const PKG = join(ROOT, '.ds-sync/airops-pkg');
const DIST = join(PKG, 'dist');

// Public surface = every .tsx module (components). The .ts siblings
// (calendar-grid, datetime-value, fixed-popover, focus-trap) are internal
// helpers: tsc still emits their declarations because the .tsx import them.
const modules = readdirSync(UI)
  .filter((f) => f.endsWith('.tsx') && !/\.(test|spec|stories)\./.test(f))
  .map((f) => f.replace(/\.tsx$/, ''))
  .sort();

rmSync(PKG, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

writeFileSync(join(PKG, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    declaration: true,
    emitDeclarationOnly: true,
    jsx: 'react-jsx',
    module: 'esnext',
    moduleResolution: 'bundler',
    target: 'es2020',
    lib: ['dom', 'dom.iterable', 'esnext'],
    strict: true,
    skipLibCheck: true,
    rootDir: UI,
    outDir: DIST,
    typeRoots: [join(ROOT, 'node_modules/@types')],
    types: ['react', 'react-dom'],
  },
  files: modules.map((m) => join(UI, `${m}.tsx`)),
}, null, 2));
execFileSync(join(ROOT, 'node_modules/.bin/tsc'), ['-p', join(PKG, 'tsconfig.json')], { stdio: 'inherit' });

writeFileSync(join(DIST, 'index.d.ts'), modules.map((m) => `export * from './${m}';`).join('\n') + '\n');
writeFileSync(join(DIST, 'index.mjs'), modules.map((m) => `export * from ${JSON.stringify(join(UI, `${m}.tsx`))};`).join('\n') + '\n');
copyFileSync(join(ROOT, 'src/styles/airops.css'), join(PKG, 'styles.css'));

const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
writeFileSync(join(PKG, 'package.json'), JSON.stringify({
  name: 'airops',
  version,
  private: true,
  types: 'dist/index.d.ts',
  module: 'dist/index.mjs',
}, null, 2) + '\n');

console.error(`airops-pkg: ${modules.length} modules -> ${resolve(PKG)}`);
