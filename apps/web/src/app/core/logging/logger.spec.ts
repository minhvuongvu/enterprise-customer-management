import { redact } from './logger';

describe('log redaction', () => {
  it('hides values whose key names a credential', () => {
    const output = redact({
      username: 'ada',
      password: 'hunter2',
      accessToken: 'abc.def',
      refresh_token: 'ghi',
      Authorization: 'Bearer xyz',
    });

    expect(output['username']).toBe('ada');
    expect(output['password']).toBe('[redacted]');
    expect(output['accessToken']).toBe('[redacted]');
    expect(output['refresh_token']).toBe('[redacted]');
    expect(output['Authorization']).toBe('[redacted]');
  });

  it('redacts inside nested objects', () => {
    const output = redact({ request: { headers: { cookie: 'session=1' }, method: 'GET' } });

    const request = output['request'] as Record<string, unknown>;
    const headers = request['headers'] as Record<string, unknown>;
    expect(headers['cookie']).toBe('[redacted]');
    expect(request['method']).toBe('GET');
  });

  it('stops descending before it can loop forever', () => {
    const cyclic: Record<string, unknown> = { level: 1 };
    cyclic['self'] = cyclic;

    expect(() => redact(cyclic)).not.toThrow();
  });

  it('leaves ordinary values alone', () => {
    expect(redact({ count: 3, ok: true, tags: ['a'] })).toEqual({
      count: 3,
      ok: true,
      tags: ['a'],
    });
  });
});
