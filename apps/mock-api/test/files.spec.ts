import {
  AVATAR_MAX_BYTES,
  type Customer,
  type ImportResult,
  type PageResponse,
} from '@ecm/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestClient, type TestServer } from './helpers.ts';

let server: TestServer;
let admin: TestClient;

beforeAll(async () => {
  server = await startTestServer({ customerCount: 30 });
  admin = server.client();
  await admin.login('admin');
});

afterAll(async () => {
  await server.close();
});

async function anyCustomer(): Promise<Customer> {
  const { body } = await admin.json<PageResponse<Customer>>('/api/customers?size=1');
  return body.items[0];
}

/** A one-pixel PNG, so the upload tests exercise real bytes and a real type. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('avatar upload', () => {
  it('accepts an allowed image and points the customer at it', async () => {
    const customer = await anyCustomer();
    const response = await admin.uploadFile(
      `/api/customers/${customer.id}/avatar`,
      'avatar.png',
      'image/png',
      PNG_BYTES,
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { avatarUrl: string; sizeBytes: number };
    expect(body.avatarUrl).toBe(`/api/customers/${customer.id}/avatar`);
    expect(body.sizeBytes).toBe(PNG_BYTES.byteLength);

    const updated = await admin.json<Customer>(`/api/customers/${customer.id}`);
    expect(updated.body.avatarUrl).toBe(body.avatarUrl);
    // The upload is a write, so it moves the version like any other.
    expect(updated.body.version).toBe(customer.version + 1);
  });

  it('serves the stored bytes back', async () => {
    const customer = await anyCustomer();
    await admin.uploadFile(`/api/customers/${customer.id}/avatar`, 'a.png', 'image/png', PNG_BYTES);

    const response = await admin.call(`/api/customers/${customer.id}/avatar`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    // Whatever the type claims, the browser must not sniff it into something
    // executable.
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await response.arrayBuffer()).equals(PNG_BYTES)).toBe(true);
  });

  it('rejects a type that is not an allowed image', async () => {
    const customer = await anyCustomer();
    const response = await admin.uploadFile(
      `/api/customers/${customer.id}/avatar`,
      'payload.svg',
      'image/svg+xml',
      '<svg onload="alert(1)"></svg>',
    );

    // SVG is an image that can carry script. The client also refuses it, but
    // that check is a convenience and this one is the rule.
    expect(response.status).toBe(415);
  });

  it('rejects a file whose bytes are not the image it claims to be', async () => {
    const customer = await anyCustomer();
    // Every claim a client can make is right: the name, the declared type and
    // the size. Only the content is wrong - and only the server can check it.
    const response = await admin.uploadFile(
      `/api/customers/${customer.id}/avatar`,
      'avatar.png',
      'image/png',
      '<html><script>alert(1)</script></html>',
    );
    expect(response.status).toBe(415);
  });

  it('rejects real image bytes declared as a different image type', async () => {
    const customer = await anyCustomer();
    const response = await admin.uploadFile(
      `/api/customers/${customer.id}/avatar`,
      'avatar.jpg',
      'image/jpeg',
      PNG_BYTES,
    );
    // Served back with the declared type, a mismatch is a file the browser is
    // told one thing about and receives another.
    expect(response.status).toBe(415);
  });

  it('rejects an allowed type under a name the policy does not accept', async () => {
    const customer = await anyCustomer();
    const response = await admin.uploadFile(
      `/api/customers/${customer.id}/avatar`,
      'avatar.png.html',
      'image/png',
      PNG_BYTES,
    );
    expect(response.status).toBe(415);
  });

  it('answers an oversized file with 413, not a server error', async () => {
    const customer = await anyCustomer();
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(AVATAR_MAX_BYTES)]);
    const response = await admin.uploadFile(
      `/api/customers/${customer.id}/avatar`,
      'huge.png',
      'image/png',
      oversized,
    );

    // The upload library reports this as its own error type. Left untranslated
    // it became a 500 - the server blaming itself for the client's file.
    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('404s when a customer has no avatar', async () => {
    const created = await admin.json<Customer>('/api/customers', {
      method: 'POST',
      body: { fullName: 'No Picture', email: 'no-picture@example.test' },
    });
    expect((await admin.call(`/api/customers/${created.body.id}/avatar`)).status).toBe(404);
  });
});

describe('CSV import', () => {
  const header = 'fullName,email,phone,status\n';

  it('imports valid rows', async () => {
    const csv =
      header +
      'Import One,import1@example.test,+8490000001,ACTIVE\n' +
      'Import Two,import2@example.test,,PROSPECT\n';

    const response = await admin.uploadFile('/api/customers/import', 'people.csv', 'text/csv', csv);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ImportResult;
    expect(result.totalRows).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('succeeds partially and reports the row number a spreadsheet shows', async () => {
    const csv =
      header +
      'Good Row,good@example.test,,ACTIVE\n' +
      'Bad Row,not-an-email,,ACTIVE\n' +
      'Another Good,good2@example.test,,ACTIVE\n';

    const response = await admin.uploadFile('/api/customers/import', 'mixed.csv', 'text/csv', csv);
    const result = (await response.json()) as ImportResult;

    // Two good rows are not thrown away because one was bad.
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    // Header is row 1, so the second data row is row 3 - the number the user
    // sees in their spreadsheet.
    expect(result.errors[0].row).toBe(3);
    expect(result.errors[0].column).toBe('email');
  });

  it('reports a duplicate email as such, not as a generic failure', async () => {
    const csv = header + 'Dup,dup-import@example.test,,ACTIVE\n';
    await admin.uploadFile('/api/customers/import', 'first.csv', 'text/csv', csv);

    const second = await admin.uploadFile('/api/customers/import', 'second.csv', 'text/csv', csv);
    const result = (await second.json()) as ImportResult;

    expect(result.failed).toBe(1);
    expect(result.errors[0].code).toBe('DUPLICATE_EMAIL');
  });

  it('rejects a file that is not CSV at all', async () => {
    const response = await admin.uploadFile(
      '/api/customers/import',
      'broken.csv',
      'text/csv',
      'a,b\n"unterminated',
    );
    expect(response.status).toBe(400);
  });

  it('rejects a file that is not named or typed as CSV', async () => {
    const csv = header + 'Named Wrong,named-wrong@example.test,,ACTIVE\n';
    const wrongName = await admin.uploadFile(
      '/api/customers/import',
      'people.txt',
      'text/csv',
      csv,
    );
    expect(wrongName.status).toBe(415);

    const wrongType = await admin.uploadFile(
      '/api/customers/import',
      'people.csv',
      'application/json',
      csv,
    );
    expect(wrongType.status).toBe(415);
  });

  describe('preview', () => {
    async function preview(csv: string): Promise<ImportPreview> {
      const response = await admin.uploadFile(
        '/api/customers/import?mode=preview',
        'preview.csv',
        'text/csv',
        csv,
      );
      expect(response.status).toBe(200);
      return (await response.json()) as ImportPreview;
    }

    it('validates every row and writes nothing', async () => {
      const before = await admin.json<PageResponse<Customer>>('/api/customers?size=1');
      const result = await preview(
        header +
          'Preview One,preview1@example.test,,ACTIVE\n' +
          'Preview Bad,not-an-email,,ACTIVE\n',
      );

      expect(result.totalRows).toBe(2);
      expect(result.validRows).toBe(1);
      expect(result.invalidRows).toBe(1);
      expect(result.rows.map((row) => row.valid)).toEqual([true, false]);
      expect(result.errors[0]).toMatchObject({ row: 3, column: 'email' });

      const after = await admin.json<PageResponse<Customer>>('/api/customers?size=1');
      // A preview is a question, not an action.
      expect(after.body.totalItems).toBe(before.body.totalItems);
    });

    it('catches a duplicate email between two rows of the same file', async () => {
      const result = await preview(
        header + 'First,same@example.test,,ACTIVE\n' + 'Second,SAME@example.test,,ACTIVE\n',
      );

      // Only the server can know this about existing customers; this case -
      // two rows of one file - is the one a client-side preview forgets.
      expect(result.invalidRows).toBe(1);
      expect(result.errors[0]).toMatchObject({ row: 3, code: 'DUPLICATE_EMAIL' });
    });

    it('names a missing required column and an ignored one', async () => {
      const result = await preview('fullName,nickname\nNo Email,Nick\n');

      expect(result.missingColumns).toEqual(['email']);
      expect(result.unknownColumns).toEqual(['nickname']);
    });

    it('is kept by the import that follows it', async () => {
      const csv = header + 'Kept Promise,kept@example.test,,ACTIVE\n' + 'Broken,x,,ACTIVE\n';
      const previewed = await preview(csv);

      const imported = (await (
        await admin.uploadFile('/api/customers/import', 'kept.csv', 'text/csv', csv)
      ).json()) as ImportResult;

      expect(imported.succeeded).toBe(previewed.validRows);
      expect(imported.failed).toBe(previewed.invalidRows);
    });
  });

  it('fails every third row under the injection scenario', async () => {
    const rows = Array.from(
      { length: 6 },
      (_unused, index) => `Row ${index},inject${index}@example.test,,ACTIVE`,
    ).join('\n');

    const response = await fetch(`${server.baseUrl}/api/customers/import`, {
      method: 'POST',
      headers: {
        cookie: `ecm_access=${admin.cookie('ecm_access')}; ecm_csrf=${admin.csrfToken}`,
        'x-csrf-token': admin.csrfToken ?? '',
        'x-mock-scenario': 'import-partial-failure',
      },
      body: (() => {
        const form = new FormData();
        form.append('file', new Blob([header + rows + '\n'], { type: 'text/csv' }), 'inject.csv');
        return form;
      })(),
    });

    const result = (await response.json()) as ImportResult;
    expect(result.totalRows).toBe(6);
    expect(result.failed).toBe(2);
  });
});

describe('export', () => {
  it('returns CSV with a filename the browser will use', async () => {
    const response = await admin.call('/api/customers/export');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain('attachment');

    const text = await response.text();
    expect(text.split('\n')[0]).toBe('customerCode,fullName,email,phone,status,gender,createdAt');
    expect(text.split('\n').length).toBeGreaterThan(2);
  });

  it('neutralises a value a spreadsheet would run as a formula', async () => {
    const formula = '=HYPERLINK("https://evil.test","Click me")';
    const created = await admin.json<Customer>('/api/customers', {
      method: 'POST',
      body: { fullName: formula, email: 'formula@example.test' },
    });
    expect(created.status).toBe(201);

    const response = await admin.call('/api/customers/export?search=formula%40example.test');
    const row = (await response.text()).trim().split('\n')[1];

    // Stored as typed - the server does not rewrite what a user entered - but
    // exported with a leading apostrophe, which makes a spreadsheet show it as
    // text instead of evaluating it. Quoted, because it contains a comma.
    expect(row).toContain(`"'=HYPERLINK(""https://evil.test"",""Click me"")"`);
  });

  it('honours the same filters as the list', async () => {
    const response = await admin.call('/api/customers/export?status=INACTIVE');
    const lines = (await response.text()).trim().split('\n').slice(1);

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.includes('INACTIVE'))).toBe(true);
  });
});
