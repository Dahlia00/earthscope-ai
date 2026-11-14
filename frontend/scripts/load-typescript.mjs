import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Share the actual frontend modules with Node diagnostics/tests on Node 20+.
// These modules have only type imports; they need no runtime module resolver.
// Transpilation is not type checking: Next's production build checks types separately.
export function loadFrontendModule(path) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, process, fetch, AbortSignal, URLSearchParams, Error, TypeError,
  });
  return exports;
}
