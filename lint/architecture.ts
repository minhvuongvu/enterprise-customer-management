/**
 * Architecture check: no import cycles, no forbidden imports.
 *
 *     node lint/architecture.ts            check; exit 1 on any violation
 *     node lint/architecture.ts --graph    print the web app's layer graph (Mermaid)
 *
 * Run by `npm run lint` and in CI (ADR-0041). It parses every TypeScript file
 * with the TypeScript compiler - not a regular expression, so an `import(...)`
 * in a comment is not an edge - and checks the rules in `RULES` below, each of
 * which states the reason it exists.
 *
 * The rules encode `CLAUDE.md` and docs/architecture.md:
 *
 *   contracts  ← mock-api            (rule: contracts depends on nothing of theirs)
 *   contracts  ← web                 (the apps never import each other)
 *
 *   web:  root ─┬─▶ features (lazily, through their public entry) ─┐
 *               └─▶ layout ─▶ shared/ui ─▶ core/i18n               │
 *         features ─▶ layout, shared/ui, core   (never each other) ◀┘
 *         core ─▶ core only
 *
 * Why a script and not dependency-cruiser or eslint-plugin-boundaries: the
 * whole rule set is a hundred lines of data a reader can check against the
 * docs, and it needs one dependency the repository already has (TypeScript).
 * Debt row 2 said "enforced by review"; this is the tool.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';
import ts from 'typescript';

// ------------------------------------------------------------------ model

export interface SourceFile {
  /** Repository-relative, forward slashes. */
  readonly path: string;
  readonly text: string;
}

export interface ImportEdge {
  readonly from: string;
  /** A repository-relative file, or a bare package specifier. */
  readonly to: string;
  readonly kind: 'file' | 'package';
  /** `import type` / `export type`: erased at compile time. */
  readonly typeOnly: boolean;
  /** `import('...')`: a lazy boundary, loaded on demand. */
  readonly dynamic: boolean;
}

export interface Violation {
  readonly rule: string;
  readonly message: string;
}

// ---------------------------------------------------------------- parsing

function specifiersOf(
  file: SourceFile,
): { specifier: string; typeOnly: boolean; dynamic: boolean }[] {
  const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true);
  const found: { specifier: string; typeOnly: boolean; dynamic: boolean }[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly =
        !!clause &&
        (clause.isTypeOnly ||
          (!clause.name &&
            !!clause.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((element) => element.isTypeOnly)));
      found.push({ specifier: node.moduleSpecifier.text, typeOnly, dynamic: false });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push({
        specifier: node.moduleSpecifier.text,
        typeOnly: node.isTypeOnly,
        dynamic: false,
      });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found.push({ specifier: node.arguments[0].text, typeOnly: false, dynamic: true });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function resolve(fromPath: string, specifier: string, known: ReadonlySet<string>): string | null {
  const base = normalize(join(dirname(fromPath), specifier))
    .split(sep)
    .join('/');
  const candidates = [base, `${base}.ts`, base.replace(/\.js$/, '.ts'), `${base}/index.ts`];
  return candidates.find((candidate) => known.has(candidate)) ?? null;
}

export function edgesOf(files: readonly SourceFile[]): ImportEdge[] {
  const known = new Set(files.map((file) => file.path));
  const edges: ImportEdge[] = [];
  for (const file of files) {
    for (const { specifier, typeOnly, dynamic } of specifiersOf(file)) {
      if (specifier.startsWith('.')) {
        // A relative import of something that is not TypeScript (JSON, a
        // worker URL) is not a module edge this check reasons about.
        const target = resolve(file.path, specifier, known);
        if (target) {
          edges.push({ from: file.path, to: target, kind: 'file', typeOnly, dynamic });
        }
      } else {
        edges.push({ from: file.path, to: specifier, kind: 'package', typeOnly, dynamic });
      }
    }
  }
  return edges;
}

// ------------------------------------------------------------ classifying

const WEB = 'apps/web/src/';
const WEB_APP = `${WEB}app/`;

/** Features: reached from the root only lazily, never from one another. */
const FEATURES = ['customers', 'technical-labs', 'login', 'forbidden', 'not-found'] as const;

/**
 * Each feature's public entry points - the only files the root may import.
 * A feature that grows a second public file adds it here, in review.
 */
const FEATURE_ENTRY_POINTS: Readonly<Record<string, readonly string[]>> = {
  customers: ['customers.routes.ts'],
  'technical-labs': [
    'technical-labs.routes.ts',
    'rendering/rendering-specimen.routes.ts',
    // The server route table must list the specimens and their render modes.
    'rendering/rendering-specimens.ts',
  ],
  login: ['login-page.ts'],
  forbidden: ['forbidden-page.ts'],
  'not-found': ['not-found-page.ts'],
};

/** Web files that run only on the server and may use Node. */
const WEB_SERVER_FILES = new Set([
  `${WEB}server.ts`,
  `${WEB}main.server.ts`,
  `${WEB_APP}app.config.server.ts`,
  `${WEB_APP}app.routes.server.ts`,
]);

export type WebLayer =
  | 'root'
  | 'core'
  | 'shared-ui'
  | 'layout'
  | 'environments'
  | `feature:${(typeof FEATURES)[number]}`
  | 'other';

export function webLayerOf(path: string): WebLayer {
  if (path.startsWith(`${WEB}environments/`)) {
    return 'environments';
  }
  if (!path.startsWith(WEB_APP)) {
    return path.startsWith(WEB) ? 'root' : 'other';
  }
  const [first, second] = path.slice(WEB_APP.length).split('/');
  if (second === undefined) {
    return 'root';
  }
  if (first === 'core') {
    return 'core';
  }
  if (first === 'shared' && second === 'ui') {
    return 'shared-ui';
  }
  if (first === 'layout') {
    return 'layout';
  }
  const feature = FEATURES.find((name) => name === first);
  return feature ? `feature:${feature}` : 'other';
}

/** Test code: specs, and the `testing/` helpers they share. */
export function isTestCode(path: string): boolean {
  return (
    /\.spec\.ts$/.test(path) ||
    /(^|\/)testing\//.test(path) ||
    path.startsWith('apps/mock-api/test/') ||
    path.startsWith('packages/contracts/test/')
  );
}

function featureOf(layer: WebLayer): string | null {
  return layer.startsWith('feature:') ? layer.slice('feature:'.length) : null;
}

// ------------------------------------------------------------------ rules

interface Rule {
  readonly name: string;
  /** Why the rule exists - printed with every violation. */
  readonly reason: string;
  readonly check: (edge: ImportEdge) => string | null;
}

export const RULES: readonly Rule[] = [
  {
    name: 'contracts-depend-on-nothing',
    reason:
      'Both apps depend on the contracts; the contracts depend on nothing of theirs (CLAUDE.md).',
    check: (edge) =>
      edge.from.startsWith('packages/contracts/src/') &&
      ((edge.kind === 'package' && edge.to !== 'zod') ||
        (edge.kind === 'file' && !edge.to.startsWith('packages/contracts/src/')))
        ? `imports ${edge.to}`
        : null,
  },
  {
    name: 'apps-never-import-each-other',
    reason:
      'The browser app and the mock backend share only the contracts; anything else is a hidden coupling.',
    check: (edge) => {
      const fromWeb = edge.from.startsWith('apps/web/');
      const fromApi = edge.from.startsWith('apps/mock-api/');
      const target = edge.to;
      if (fromWeb && (target.startsWith('apps/mock-api/') || target === '@ecm/mock-api')) {
        return `imports ${target}`;
      }
      if (fromApi && (target.startsWith('apps/web/') || target === '@ecm/web')) {
        return `imports ${target}`;
      }
      return null;
    },
  },
  {
    name: 'contracts-only-through-the-package',
    reason:
      "The contracts' public API is its package entries - @ecm/contracts, and @ecm/contracts/testing for tests; a deep import depends on its file layout.",
    check: (edge) => {
      if (edge.kind === 'package' && edge.to.startsWith('@ecm/contracts/')) {
        if (edge.to === '@ecm/contracts/testing') {
          return isTestCode(edge.from) ? null : 'imports the test data entry point outside a test';
        }
        return `imports ${edge.to}`;
      }
      if (
        edge.kind === 'file' &&
        edge.to.startsWith('packages/contracts/') &&
        !edge.from.startsWith('packages/contracts/')
      ) {
        return `imports ${edge.to} by path`;
      }
      return null;
    },
  },
  {
    name: 'core-depends-only-on-core',
    reason:
      'core/ is the infrastructure every feature stands on; importing upward would make it depend on its users.',
    check: (edge) => {
      if (edge.kind !== 'file' || webLayerOf(edge.from) !== 'core') {
        return null;
      }
      const target = webLayerOf(edge.to);
      return ['core', 'environments'].includes(target) ? null : `imports ${target} (${edge.to})`;
    },
  },
  {
    name: 'shared-ui-is-a-leaf',
    reason:
      'shared/ui holds no business words and no services (shared/ui/README.md); it may only format through core/i18n.',
    check: (edge) => {
      if (edge.kind !== 'file' || webLayerOf(edge.from) !== 'shared-ui') {
        return null;
      }
      const target = webLayerOf(edge.to);
      const allowed = target === 'shared-ui' || edge.to.startsWith(`${WEB_APP}core/i18n/`);
      return allowed ? null : `imports ${edge.to}`;
    },
  },
  {
    name: 'layout-knows-no-feature',
    reason: 'The shell frames every feature; it links to them by URL and never imports them.',
    check: (edge) =>
      edge.kind === 'file' &&
      webLayerOf(edge.from) === 'layout' &&
      featureOf(webLayerOf(edge.to)) !== null
        ? `imports ${edge.to}`
        : null,
  },
  {
    name: 'features-are-isolated',
    reason:
      'No cross-feature imports (CLAUDE.md rule 4) - and the labs never leak into the product.',
    check: (edge) => {
      if (edge.kind !== 'file') {
        return null;
      }
      const from = featureOf(webLayerOf(edge.from));
      const to = featureOf(webLayerOf(edge.to));
      return from && to && from !== to
        ? `feature ${from} imports feature ${to} (${edge.to})`
        : null;
    },
  },
  {
    name: 'features-only-through-their-entry-points',
    reason:
      'The root reaches a feature through its declared entry (FEATURE_ENTRY_POINTS), so its internals can change freely.',
    check: (edge) => {
      if (edge.kind !== 'file' || isTestCode(edge.from)) {
        return null;
      }
      const to = featureOf(webLayerOf(edge.to));
      const from = featureOf(webLayerOf(edge.from));
      // Feature to feature is already forbidden outright, above.
      if (!to || from !== null) {
        return null;
      }
      const inside = edge.to.slice(`${WEB_APP}${to}/`.length);
      return FEATURE_ENTRY_POINTS[to]?.includes(inside)
        ? null
        : `reaches into ${to}/${inside}, which is not one of its entry points`;
    },
  },
  {
    name: 'test-code-stays-in-tests',
    reason:
      'Fixtures and test helpers must never ship: application code that imports one puts it in the bundle.',
    check: (edge) =>
      edge.kind === 'file' && !isTestCode(edge.from) && isTestCode(edge.to)
        ? `imports test code ${edge.to}`
        : null,
  },
  {
    name: 'browser-code-uses-no-node',
    reason:
      'The application also runs in the browser; Node modules there break the build (CLAUDE.md rule 2).',
    check: (edge) =>
      edge.kind === 'package' &&
      edge.from.startsWith(WEB) &&
      !WEB_SERVER_FILES.has(edge.from) &&
      !isTestCode(edge.from) &&
      (edge.to.startsWith('node:') || edge.to === 'express')
        ? `imports ${edge.to}`
        : null,
  },
  {
    name: 'no-dumping-grounds',
    reason:
      'No utils/, helpers/ or common/ folders: code lives next to the feature that owns it (CLAUDE.md rule 5).',
    check: (edge) =>
      edge.kind === 'file' && /\/(utils|helpers|common)\//.test(edge.to)
        ? `imports ${edge.to}`
        : null,
  },
];

export function ruleViolations(edges: readonly ImportEdge[]): Violation[] {
  const violations: Violation[] = [];
  for (const edge of edges) {
    for (const rule of RULES) {
      const problem = rule.check(edge);
      if (problem) {
        violations.push({
          rule: rule.name,
          message: `${edge.from}: ${problem}\n      why: ${rule.reason}`,
        });
      }
    }
  }
  return violations;
}

// ----------------------------------------------------------------- cycles

/**
 * Every import cycle, as strongly connected components (Tarjan).
 *
 * Type-only edges count. They are erased from the JavaScript, so they cannot
 * cause an initialisation-order bug - but a cycle through types is still two
 * modules that cannot be understood, or moved, one without the other. Lazy
 * `import()` edges do not count: they are the boundary that breaks a cycle.
 */
export function cyclesOf(edges: readonly ImportEdge[]): string[][] {
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind === 'file' && !edge.dynamic) {
      graph.set(edge.from, [...(graph.get(edge.from) ?? []), edge.to]);
    }
  }

  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const connect = (node: string): void => {
    indices.set(node, index);
    lowlinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of graph.get(node) ?? []) {
      if (!indices.has(next)) {
        connect(next);
        lowlinks.set(node, Math.min(lowlinks.get(node) ?? 0, lowlinks.get(next) ?? 0));
      } else if (onStack.has(next)) {
        lowlinks.set(node, Math.min(lowlinks.get(node) ?? 0, indices.get(next) ?? 0));
      }
    }

    if (lowlinks.get(node) === indices.get(node)) {
      const component: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop();
        if (member !== undefined) {
          onStack.delete(member);
          component.push(member);
        }
      } while (member !== undefined && member !== node);
      const selfLoop = (graph.get(node) ?? []).includes(node);
      if (component.length > 1 || selfLoop) {
        cycles.push(component.sort());
      }
    }
  };

  for (const node of graph.keys()) {
    if (!indices.has(node)) {
      connect(node);
    }
  }
  return cycles;
}

// ------------------------------------------------------------------ graph

/** The web app's layer graph, from the real imports - docs/architecture.md embeds it. */
export function layerGraph(edges: readonly ImportEdge[]): string {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    if (edge.kind !== 'file' || isTestCode(edge.from) || !edge.from.startsWith(WEB)) {
      continue;
    }
    const from = webLayerOf(edge.from);
    const to = webLayerOf(edge.to);
    if (from !== to && to !== 'environments' && from !== 'other' && to !== 'other') {
      const key = `${from}|${to}|${edge.dynamic ? 'lazy' : 'static'}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const id = (layer: string) => layer.replace(/[^a-z]/gi, '_');
  const lines = ['flowchart TD'];
  for (const [key, count] of [...counts].sort()) {
    const [from = '', to = '', mode] = key.split('|');
    const arrow = mode === 'lazy' ? '-.->' : '-->';
    lines.push(`  ${id(from)}["${from}"] ${arrow}|${count}| ${id(to)}["${to}"]`);
  }
  return lines.join('\n');
}

// ------------------------------------------------------------------- main

const ROOT = join(import.meta.dirname, '..');

/** The code this check covers. Build output and dependencies are not code. */
const SCANNED = [
  'apps/web/src',
  'apps/mock-api/src',
  'apps/mock-api/test',
  'packages/contracts/src',
  'packages/contracts/test',
  'e2e',
  'e2e-production',
  'perf',
  'lint',
];

function readTree(directory: string): SourceFile[] {
  const files: SourceFile[] = [];
  const absolute = join(ROOT, directory);
  for (const name of readdirSync(absolute)) {
    const path = join(absolute, name);
    if (statSync(path).isDirectory()) {
      files.push(...readTree(join(directory, name)));
    } else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) {
      files.push({
        path: relative(ROOT, path).split(sep).join('/'),
        text: readFileSync(path, 'utf8'),
      });
    }
  }
  return files;
}

function main(): void {
  const files = SCANNED.flatMap(readTree);
  const edges = edgesOf(files);

  if (process.argv.includes('--graph')) {
    console.log(layerGraph(edges));
    return;
  }

  const violations = ruleViolations(edges);
  const cycles = cyclesOf(edges);

  for (const violation of violations) {
    console.error(`  ✗ [${violation.rule}] ${violation.message}`);
  }
  for (const cycle of cycles) {
    console.error(`  ✗ [no-import-cycles] ${cycle.join(' → ')}`);
  }

  const failures = violations.length + cycles.length;
  const summary = `${files.length} files, ${edges.filter((edge) => edge.kind === 'file').length} internal imports, ${RULES.length + 1} rules`;
  if (failures > 0) {
    console.error(`\nlint/architecture: ${failures} violation(s) - ${summary}`);
    process.exit(1);
  }
  console.log(`lint/architecture: clean - ${summary}, no cycles`);
}

if (import.meta.main) {
  main();
}
