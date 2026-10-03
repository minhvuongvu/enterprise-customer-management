import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SOURCE, check, styleBlocks } from './styles.ts';

/**
 * The style check, proven to find what it claims to.
 *
 * `check` takes a path and the text, so every rule is asserted against a
 * two-line fixture rather than against the repository - which is what lets
 * this say *which* rule fired.
 */
describe('lint/styles', () => {
  /** The one file allowed to define colours, spelled as `check` spells it. */
  const tokenFile = join(SOURCE, 'styles/_tokens.scss');

  /** Wraps CSS the way a component does, so `styleBlocks` finds it. */
  function component(css: string): string {
    return ['@Component({', '  template: `<p></p>`,', '  styles: `', css, '  `,', '})'].join('\n');
  }

  function rules(path: string, source: string): string[] {
    return check(path, source).map((violation) => violation.rule);
  }

  describe('the directory it scans', () => {
    it('resolves to a directory that exists', () => {
      // The regression this guards: the root was derived with
      // `new URL('..', import.meta.url).pathname`, which is a URL path. On
      // Windows that keeps the drive letter and percent-encodes the spaces, so
      // the scan died with ENOENT on `E:\E:\Enterprise%20Customer%20...`
      // before checking a single file - and `npm run lint` could not run at
      // all on the machine this repository is developed on.
      assert.ok(statSync(SOURCE).isDirectory(), `${SOURCE} is not a directory`);
    });

    it('is a filesystem path, not a URL path', () => {
      assert.ok(!SOURCE.includes('%20'), `${SOURCE} is percent-encoded`);
    });
  });

  describe('the four rules', () => {
    it('finds a literal colour', () => {
      assert.deepEqual(rules('a.ts', component('    color: #1f2937;')), ['literal-colour']);
      assert.deepEqual(rules('a.ts', component('    color: rgb(0 0 0);')), ['literal-colour']);
    });

    it('finds a palette token used where a meaning belongs', () => {
      assert.deepEqual(rules('a.ts', component('    color: var(--palette-blue-600);')), [
        'palette-token',
      ]);
    });

    it('accepts a semantic token', () => {
      assert.deepEqual(rules('a.ts', component('    color: var(--danger-text);')), []);
    });

    it('finds a physical direction, and accepts the logical one', () => {
      assert.deepEqual(rules('a.ts', component('    margin-left: 1rem;')), ['physical-direction']);
      assert.deepEqual(rules('a.ts', component('    text-align: right;')), ['physical-direction']);
      assert.deepEqual(rules('a.ts', component('    margin-inline-start: 1rem;')), []);
      assert.deepEqual(rules('a.ts', component('    text-align: end;')), []);
    });

    it('finds a removed focus outline', () => {
      assert.deepEqual(rules('a.ts', component('    outline: none;')), ['outline-removed']);
    });
  });

  describe('exemptions', () => {
    it('lets the token file define colours, and still checks its directions', () => {
      const tokens = tokenFile;

      assert.deepEqual(check(tokens, ':root { --palette-blue-600: #2563eb; }'), []);
      // Only the two colour rules are excused. The token file is still a
      // stylesheet, and a physical direction in it flips nothing under RTL.
      assert.deepEqual(rules(tokens, ':root { padding-left: 1rem; }'), ['physical-direction']);
    });

    it('honours an allow comment that gives a reason', () => {
      const css = ['    /* style-lint-allow: a third-party widget needs it */', '    left: 0;'];
      assert.deepEqual(rules('a.ts', component(css.join('\n'))), []);
    });

    it('reports an allow comment with no reason, and says why', () => {
      const css = ['    // style-lint-allow:', '    left: 0;'];
      const violations = check('a.ts', component(css.join('\n')));

      assert.equal(violations.length, 1);
      assert.match(violations[0].message, /an allow comment needs a reason/);
    });

    it('does not read prose in a comment as a rule', () => {
      // The rules are explained in comments all over this repository.
      assert.deepEqual(rules('a.ts', component('    /* never use margin-left here */')), []);
    });
  });

  describe('where it looks', () => {
    it('treats a whole SCSS file as one block', () => {
      const blocks = styleBlocks('a.scss', 'a {\n  color: red;\n}');

      assert.equal(blocks.length, 1);
      assert.equal(blocks[0].firstLine, 1);
    });

    it('reports the line in the file, not the line in the block', () => {
      const violations = check('a.ts', component('    outline: none;'));

      // The fixture puts the CSS on the fourth line of the file.
      assert.equal(violations[0].line, 4);
    });

    it('ignores a component with no styles', () => {
      assert.deepEqual(styleBlocks('a.ts', '@Component({ template: `<p></p>` })'), []);
    });
  });
});
