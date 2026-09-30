import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findSecrets, isForbiddenFile } from './secrets.ts';

/** The secret scan, proven to find what it claims to. */
describe('lint/secrets', () => {
  // Assembled at runtime, so this file does not itself contain a match.
  const awsKey = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
  const githubToken = ['ghp', '_', 'a'.repeat(36)].join('');
  const privateKey = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ');

  it('finds credential shapes and says where', () => {
    const text = [`const key = '${awsKey}';`, `token: ${githubToken}`, privateKey].join('\n');

    assert.deepEqual(findSecrets('src/config.ts', text), [
      'src/config.ts:1: looks like a AWS access key id',
      'src/config.ts:2: looks like a GitHub token',
      'src/config.ts:3: looks like a private key',
    ]);
  });

  it('finds a password inside a connection string', () => {
    const url = ['postgres://app', ':s3cr3t-pass', '@db.internal:5432/app'].join('');

    assert.equal(findSecrets('a.ts', url).length, 1);
  });

  it('does not flag what this repository legitimately contains', () => {
    const text = [
      "data: { username, password: 'not-verified-by-the-mock' },",
      "const url = 'http://localhost:4300/api/health';",
      "export const CSRF_COOKIE_NAME = 'ecm_csrf';",
    ].join('\n');

    assert.deepEqual(findSecrets('e2e/fixtures.ts', text), []);
  });

  it('honours a reasoned exception on the line above', () => {
    const text = `// secret-scan-allow: documents the key format\n'${awsKey}'`;

    assert.deepEqual(findSecrets('docs.ts', text), []);
  });

  it('refuses committed env and key files, but not the example', () => {
    assert.equal(isForbiddenFile('apps/mock-api/.env'), true);
    assert.equal(isForbiddenFile('.env.production'), true);
    assert.equal(isForbiddenFile('certs/server.pem'), true);
    assert.equal(isForbiddenFile('.env.example'), false);
  });
});
