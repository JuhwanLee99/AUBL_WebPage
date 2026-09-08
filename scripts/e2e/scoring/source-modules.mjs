import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Copy declarations from the current production sources at test startup, not a reimplementation.
// No production module is imported by Node and no production Provider/effects are mounted.
export function sourceModules(repo) {
  const files = new Map();
  const read = relative => {
    if (files.has(relative)) return files.get(relative);
    const source = fs.readFileSync(path.join(repo, relative), 'utf8');
    const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const declarations = new Map(), imports = new Map();
    for (const node of ast.statements) {
      if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, { node, code: node.getText(ast).replace(/^export\s+/, '') });
      if (ts.isVariableStatement(node)) for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) declarations.set(d.name.text, { node: d, code: `const ${d.getText(ast)};` });
      }
      if (ts.isImportDeclaration(node) && node.importClause && !node.importClause.isTypeOnly) {
        const source = node.moduleSpecifier.text, clause = node.importClause;
        if (clause.name) imports.set(clause.name.text, { source, imported: 'default' });
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const item of clause.namedBindings.elements) {
          if (!item.isTypeOnly) imports.set(item.name.text, { source, imported: item.propertyName?.text ?? item.name.text });
        }
      }
    }
    const result = { ast, declarations, imports }; files.set(relative, result); return result;
  };
  const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const fsUrl = relative => '/@fs/' + path.join(repo, relative);
  const storePath = 'src/shared/state/demoStore.tsx';
  const store = read(storePath), selected = new Set(), neededImports = new Set();
  const collect = name => {
    if (selected.has(name)) return;
    const declaration = store.declarations.get(name);
    if (!declaration) { if (store.imports.has(name)) neededImports.add(name); return; }
    selected.add(name);
    const visit = node => {
      if (ts.isTypeNode(node)) return;
      if (ts.isIdentifier(node) && node.text !== name) collect(node.text);
      ts.forEachChild(node, visit);
    };
    visit(declaration.node);
  };
  for (const name of ['reducer', 'initialState', 'compositeContextForState', 'substitutePlayer', 'updateLineup']) {
    if (!store.declarations.has(name)) throw new Error(`Required production declaration missing: ${name}`);
    collect(name);
  }
  const importCode = [...neededImports].map(name => {
    const item = store.imports.get(name);
    if (name === 'auth' && item.source.includes('firebase/client')) return "const auth = { currentUser: { uid: 'LOCAL_E2E_SCORER' } };";
    if (/firebase|effects|backendClient|AuthProvider/.test(item.source)) throw new Error(`Unsafe production dependency requested: ${item.source}:${name}`);
    let source = item.source;
    if (source.startsWith('.')) {
      const absolute = path.resolve(repo, path.dirname(storePath), source);
      const target = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs'].map(extension => absolute + extension)
        .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (!target) throw new Error(`Production dependency file missing: ${absolute}`);
      source = '/@fs/' + target;
    }
    return item.imported === 'default' ? `import ${name} from ${JSON.stringify(source)};` : `import { ${item.imported} as ${name} } from ${JSON.stringify(source)};`;
  }).join('\n');
  const reducerCode = compile(importCode + '\n' + [...selected].map(name => store.declarations.get(name).code).join('\n') + '\nexport { reducer, initialState, compositeContextForState, substitutePlayer, updateLineup };');
  const stats = relative => {
    const source = read(relative);
    const names = ['buildPlayerStats', 'ensurePlayerStat', 'ensurePitcherStat', 'getUniqueName', 'classifyPitch'];
    const code = names.map(name => {
      if (!source.declarations.has(name)) throw new Error(`Required stats declaration missing: ${relative}:${name}`);
      return source.declarations.get(name).code;
    }).join('\n');
    return compile(`
      import { applyCompositeProjection, normalizeCompositePlay } from '${fsUrl('src/shared/lib/compositePlayEngine.ts')}';
      import { classifyRecordedPlateAppearance, createScoringEventLookup, recordedMiscPitch } from '${fsUrl('src/shared/lib/scoringEventFacts.ts')}';
      import { createStructuredRunnerIndex } from '${fsUrl('src/shared/lib/structuredRunnerStats.ts')}';
      import { canPitcherBat } from '${fsUrl('src/shared/state/demoStore.lineup.ts')}';
      ${code}
      export { buildPlayerStats };
    `);
  };
  return new Map([
    ['virtual:scoring-reducer', reducerCode],
    ['virtual:keeper-stats', stats('src/features/scorekeeper/pages/ScorekeeperPage.tsx')],
    ['virtual:viewer-stats', stats('src/features/scoreboard/pages/ScoreboardTextPage.tsx')],
  ]);
}
