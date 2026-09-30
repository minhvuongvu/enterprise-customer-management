import { describe, expect, it } from 'vitest';
import {
  endpointTemplate,
  isSensitiveLogKey,
  redactLogFields,
  redactText,
  REDACTED,
} from '@ecm/contracts';

/**
 * The redaction policy both loggers apply (ADR-0038).
 *
 * The two apps each have a test that their *sink* never receives these values;
 * this one pins the policy itself, so a change to the lists is a visible,
 * reviewed change to a contract.
 */
describe('log redaction policy', () => {
  it('hides credentials by key, whatever the spelling', () => {
    const out = redactLogFields({
      password: 'hunter2',
      accessToken: 'abc',
      refresh_token: 'def',
      'X-CSRF-Token': 'ghi',
      Authorization: 'Bearer xyz',
      cookie: 'ecm_session=1',
      apiKey: 'k',
      clientSecret: 's',
    });

    expect(Object.values(out).every((value) => value === REDACTED)).toBe(true);
  });

  it('hides personal data by key, including inside a nested record', () => {
    const out = redactLogFields({
      customer: {
        id: 'c-1',
        fullName: 'Nguyễn Văn A',
        email: 'an@example.test',
        phone: '+84900000000',
        dateOfBirth: '1990-01-01',
        address: { line1: '1 Lê Lợi', city: 'Hà Nội' },
      },
      search: 'nguyen van a',
    });

    expect(out).toEqual({
      customer: {
        id: 'c-1',
        fullName: REDACTED,
        email: REDACTED,
        phone: REDACTED,
        dateOfBirth: REDACTED,
        address: REDACTED,
      },
      search: REDACTED,
    });
  });

  it('masks emails and tokens inside free text, where no key names them', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';

    expect(redactText('duplicate key an@example.test')).toBe('duplicate key [email]');
    expect(redactText(`token was ${jwt}`)).toBe(`token was ${REDACTED}`);
    expect(redactText('header Bearer abc.def-ghi')).toBe(`header Bearer ${REDACTED}`);
  });

  it('reduces an Error to its name and a masked message - never its stack of values', () => {
    const out = redactLogFields({ error: new Error('no account for an@example.test') });

    expect(out['error']).toEqual({ name: 'Error', message: 'no account for [email]' });
  });

  it('keeps what an operator needs: ids, status, durations, routes', () => {
    const fields = {
      correlationId: '6f0c…',
      customerId: '11111111-1111-4111-8111-111111111112',
      status: 409,
      durationMs: 42,
      route: '/customers/:id',
      tags: ['a', 'b'],
    };

    expect(redactLogFields(fields)).toEqual(fields);
    expect(isSensitiveLogKey('routeName')).toBe(false);
  });

  it('does not change its input, and survives a cycle', () => {
    const input: Record<string, unknown> = { password: 'x', nested: { email: 'a@b.test' } };
    input['self'] = input;

    const out = redactLogFields(input);

    expect(input['password']).toBe('x');
    expect(out['password']).toBe(REDACTED);
  });
});

describe('endpointTemplate', () => {
  it('drops the origin and the query, and replaces ids and customer codes', () => {
    expect(endpointTemplate('http://localhost:4300/api/customers/C-000123/audit?page=1')).toBe(
      '/api/customers/:id/audit',
    );
    expect(endpointTemplate('/api/customers/11111111-1111-4111-8111-111111111112')).toBe(
      '/api/customers/:id',
    );
    expect(endpointTemplate('/api/customers/export?search=nguyen')).toBe('/api/customers/export');
  });
});
