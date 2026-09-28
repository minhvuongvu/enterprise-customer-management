/**
 * Style rules no off-the-shelf linter checks here.
 *
 *     node lint/styles.ts
 *
 * Run by `npm run lint`. It reads every component's inline `styles:` and every
 * SCSS partial under apps/web/src, and fails on four things the design system
 * forbids (docs/design-system.md):
 *
 *  1. **A literal colour** - `#1f2937`, `rgb(...)`, `hsl(...)` - anywhere but
 *     the token file. A literal opts out of theming without saying so, and is
 *     the dark-mode bug nobody notices until a customer does.
 *  2. **A palette token** (`--palette-*`) outside the token file. Components
 *     speak in meanings (`--danger-text`), not in colours (ADR-0010).
 *  3. **A physical direction** - `margin-left`, `padding-right`, `left:`,
 *     `text-align: right`, `border-left`, `float`. The logical equivalents
 *     (`margin-inline-start`, `inset-inline-start`, `text-align: end`) flip on
 *     their own under `dir="rtl"`; physical ones have to be found and flipped
 *     by hand. This is the rule that keeps right-to-left support one entry in
 *     `languages.ts` away (docs/i18n.md).
 *  4. **`outline: none`** - the one global focus indicator must not be
 *     removed (styles/_base.scss).
 *
 * A line that genuinely needs an exception carries a comment on the line
 * above: `style-lint-allow: <why>`. The reason is required; an exception
 * without one is reported like a violation.
 *
 * Why a script and not stylelint: the styles live inside TypeScript template
 * literals, which stylelint only reads through a custom-syntax plugin - two
 * more dependencies and a parser configuration to check four regular
 * expressions. Debt row 10 said "stylelint"; what it asked for was
 * enforcement, and this is enforcement. If the rule set grows past what a
 * regular expression can say honestly, that is the moment for stylelint.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

interface Rule {
  readonly name: string;
  readonly pattern: RegExp;
  readonly message: string;
}

const RULES: readonly Rule[] = [
  {
    name: 'literal-colour',
    pattern: /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/,
    message: 'literal colour - use a semantic token (styles/_tokens.scss)',
  },
  {
    name: 'palette-token',
    pattern: /--palette-/,
    message: 'palette token outside the token file - use the semantic token that means this',
  },
  {
    name: 'physical-direction',
    pattern:
      /(?:^|[\s;{])(?:(?:margin|padding|border)-(?:left|right)\b|left\s*:|right\s*:|text-align\s*:\s*(?:left|right)\b|float\s*:\s*(?:left|right)\b)/,
    message: 'physical direction - use the logical property (inline-start / inline-end)',
  },
  {
    name: 'outline-removed',
    pattern: /outline\s*:\s*(?:none|0)\b/,
    message: 'the focus outline must not be removed (styles/_base.scss)',
  },
];

const ROOT = new URL('..', import.meta.url).pathname;
const SOURCE = join(ROOT, 'apps/web/src');
/** The one file allowed to define colours. */
const TOKEN_FILE = join(SOURCE, 'styles/_tokens.scss');

const ALLOW = /style-lint-allow:\s*(\S.*)?$/;

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly message: string;
  readonly text: string;
}

/**
 * The style blocks of one file, each with the line it starts on. An SCSS file
 * is one block; a component contributes its `styles:` template literal.
 */
export function styleBlocks(path: string, source: string): { text: string; firstLine: number }[] {
  if (path.endsWith('.scss')) {
    return [{ text: source, firstLine: 1 }];
  }
  const blocks: { text: string; firstLine: number }[] = [];
  for (const match of source.matchAll(/styles:\s*`([\s\S]*?)`/g)) {
    const offset = (match.index ?? 0) + match[0].indexOf('`') + 1;
    blocks.push({
      text: match[1],
      firstLine: source.slice(0, offset).split('\n').length,
    });
  }
  return blocks;
}

export function check(path: string, source: string): Violation[] {
  const violations: Violation[] = [];
  const isTokenFile = path === TOKEN_FILE;

  for (const block of styleBlocks(path, source)) {
    const lines = block.text.split('\n');
    lines.forEach((text, index) => {
      // Comments explain rules; they are not rules. Stripped so that prose
      // mentioning `margin-left` is not a violation.
      const code = text.replace(/\/\*.*?\*\//g, '').replace(/^\s*(?:\*|\/\/).*$/, '');
      const previous = lines[index - 1] ?? '';
      const allowed = ALLOW.exec(previous);

      for (const rule of RULES) {
        if (isTokenFile && (rule.name === 'literal-colour' || rule.name === 'palette-token')) {
          continue;
        }
        if (!rule.pattern.test(code)) {
          continue;
        }
        if (allowed && allowed[1]) {
          continue;
        }
        violations.push({
          file: relative(ROOT, path),
          line: block.firstLine + index,
          rule: rule.name,
          message: allowed ? `${rule.message} (an allow comment needs a reason)` : rule.message,
          text: text.trim(),
        });
      }
    });
  }
  return violations;
}

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return files(path);
    }
    const isStyleSource =
      name.endsWith('.scss') || (name.endsWith('.ts') && !name.endsWith('.spec.ts'));
    return isStyleSource ? [path] : [];
  });
}

const violations = files(SOURCE).flatMap((path) => check(path, readFileSync(path, 'utf8')));

for (const violation of violations) {
  console.error(
    `${violation.file}:${violation.line}  ${violation.rule}  ${violation.message}\n    ${violation.text}`,
  );
}
if (violations.length > 0) {
  console.error(`\n${violations.length} style violation(s). See lint/styles.ts for the rules.`);
  process.exit(1);
}
console.log('Styles: semantic tokens only, logical directions only, focus outline intact.');
