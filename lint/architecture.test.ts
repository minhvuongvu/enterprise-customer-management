import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cyclesOf, edgesOf, ruleViolations, type SourceFile } from './architecture.ts';

/**
 * The architecture check, proven to have teeth: each rule is shown a
 * violation it must report and a legitimate import it must not.
 *
 *     node --test lint/        (part of `npm test`)
 */

const APP = 'apps/web/src/app';

function violationsOf(files: SourceFile[]): string[] {
  return ruleViolations(edgesOf(files)).map((violation) => violation.rule);
}

function file(path: string, text = ''): SourceFile {
  return { path, text };
}

describe('lint/architecture', () => {
  it('reports a cycle, including one made only of type imports', () => {
    const edges = edgesOf([
      file(`${APP}/core/a.ts`, "import { b } from './b';"),
      file(`${APP}/core/b.ts`, "import type { C } from './c';"),
      file(`${APP}/core/c.ts`, "import { a } from './a';"),
      file(`${APP}/core/d.ts`, "import { a } from './a';"),
    ]);

    assert.deepEqual(cyclesOf(edges), [
      [`${APP}/core/a.ts`, `${APP}/core/b.ts`, `${APP}/core/c.ts`],
    ]);
  });

  it('does not count a lazy import() as a cycle - it is the boundary that breaks one', () => {
    const edges = edgesOf([
      file(
        `${APP}/app.routes.ts`,
        "export const r = () => import('./customers/customers.routes');",
      ),
      file(`${APP}/customers/customers.routes.ts`, "import { routes } from '../app.routes';"),
    ]);

    assert.deepEqual(cyclesOf(edges), []);
  });

  it('ignores an import that only appears in a comment or a string', () => {
    const edges = edgesOf([
      file(
        `${APP}/core/a.ts`,
        "// import { x } from '../customers/x';\nconst s = \"import('./b')\";",
      ),
      file(`${APP}/customers/x.ts`),
      file(`${APP}/core/b.ts`),
    ]);

    assert.deepEqual(edges, []);
  });

  it('keeps features apart', () => {
    assert.deepEqual(
      violationsOf([
        file(
          `${APP}/technical-labs/lab.ts`,
          "import { CustomerStore } from '../customers/state/customer-store';",
        ),
        file(`${APP}/customers/state/customer-store.ts`),
      ]),
      ['features-are-isolated'],
    );
  });

  it('lets the root reach a feature only through its entry point', () => {
    const routes = file(
      `${APP}/app.routes.ts`,
      [
        "export const ok = () => import('./customers/customers.routes');",
        "import { guard } from './technical-labs/technical-labs.guard';",
      ].join('\n'),
    );

    assert.deepEqual(
      violationsOf([
        routes,
        file(`${APP}/customers/customers.routes.ts`),
        file(`${APP}/technical-labs/technical-labs.guard.ts`),
      ]),
      ['features-only-through-their-entry-points'],
    );
  });

  it('keeps core independent of the layers built on it', () => {
    assert.deepEqual(
      violationsOf([
        file(
          `${APP}/core/http/x.ts`,
          "import { Shell } from '../../layout/app-shell';\nimport { environment } from '../../../environments/environment';",
        ),
        file(`${APP}/layout/app-shell.ts`),
        file('apps/web/src/environments/environment.ts'),
      ]),
      ['core-depends-only-on-core'],
    );
  });

  it('allows shared/ui to format through core/i18n and nothing else from core', () => {
    assert.deepEqual(
      violationsOf([
        file(
          `${APP}/shared/ui/pagination/pagination.ts`,
          "import { NumberPipe } from '../../../core/i18n/locale-pipes';\nimport { SessionService } from '../../../core/auth/session.service';",
        ),
        file(`${APP}/core/i18n/locale-pipes.ts`),
        file(`${APP}/core/auth/session.service.ts`),
      ]),
      ['shared-ui-is-a-leaf'],
    );
  });

  it('keeps test helpers out of application code, but not out of specs', () => {
    assert.deepEqual(
      violationsOf([
        file(`${APP}/customers/page.ts`, "import { aCustomer } from './testing/customer.fixture';"),
        file(
          `${APP}/customers/page.spec.ts`,
          "import { aCustomer } from './testing/customer.fixture';",
        ),
        file(`${APP}/customers/testing/customer.fixture.ts`),
      ]),
      ['test-code-stays-in-tests'],
    );
  });

  it('keeps Node out of browser code, but not out of the server entry', () => {
    assert.deepEqual(
      violationsOf([
        file(`${APP}/core/files.ts`, "import { readFileSync } from 'node:fs';"),
        file(
          'apps/web/src/server.ts',
          "import express from 'express';\nimport { join } from 'node:path';",
        ),
      ]),
      ['browser-code-uses-no-node'],
    );
  });

  it('keeps the contracts free of both apps, and the apps free of each other', () => {
    assert.deepEqual(
      violationsOf([
        file(
          'packages/contracts/src/a.ts',
          "import * as z from 'zod';\nimport express from 'express';",
        ),
        file(
          'apps/mock-api/src/x.ts',
          "import { Logger } from '../../web/src/app/core/logging/logger';",
        ),
        file(`${APP}/core/logging/logger.ts`),
      ]),
      ['contracts-depend-on-nothing', 'apps-never-import-each-other'],
    );
  });

  it('reaches the contracts only through the package entry', () => {
    assert.deepEqual(
      violationsOf([
        file(
          'apps/mock-api/src/x.ts',
          "import { customerSchema } from '@ecm/contracts';\nimport { y } from '@ecm/contracts/src/customer.js';",
        ),
        file(`${APP}/customers/list.ts`, "import { aCustomer } from '@ecm/contracts/testing';"),
        file(
          `${APP}/customers/list.spec.ts`,
          "import { aCustomer } from '@ecm/contracts/testing';",
        ),
      ]),
      ['contracts-only-through-the-package', 'contracts-only-through-the-package'],
    );
  });
});
