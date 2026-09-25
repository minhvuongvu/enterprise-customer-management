import { describeUrl, URL_DEMO_BASE } from './url-demo';
import { readFileFacts, toHex } from './file-demo';
import { geolocationFailure } from './geolocation-demo';
import { LAB_PERMISSIONS, queryPermissions } from './permissions-demo';

describe('describeUrl', () => {
  it('resolves relative input against the base, keeping repeated parameters', () => {
    const parts = describeUrl('../customers/42?tab=audit&tab=notes#top', URL_DEMO_BASE);
    expect(parts?.href).toBe('https://customers.example.test/customers/42?tab=audit&tab=notes#top');
    expect(parts?.params).toEqual([
      ['tab', 'audit'],
      ['tab', 'notes'],
    ]);
    expect(parts?.crossOrigin).toBe(false);
  });

  it('decodes parameters and tells another origin apart - including a scheme-relative one', () => {
    expect(describeUrl('?q=a%20b', URL_DEMO_BASE)?.params).toEqual([['q', 'a b']]);
    expect(describeUrl('//evil.test/x', URL_DEMO_BASE)?.crossOrigin).toBe(true);
  });

  it('answers null for what the parser rejects', () => {
    expect(describeUrl('http://[not-a-host', URL_DEMO_BASE)).toBeNull();
  });
});

describe('readFileFacts', () => {
  it('reads the signature, size and digest without any upload', async () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const subtle = {
      digest: async () => new Uint8Array([0xab, 0x01]).buffer,
    } as unknown as SubtleCrypto;

    const facts = await readFileFacts(file, subtle);

    expect(facts.size).toBe(5);
    expect(facts.signature).toBe('68 65 6c 6c 6f');
    expect(facts.sha256).toBe('ab01');
    expect(facts.preview).toBe('hello');
  });

  it('does not preview a binary file, and skips the digest without Web Crypto', async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'a.png', {
      type: 'image/png',
    });
    const facts = await readFileFacts(png, null);
    expect(facts.signature).toBe('89 50 4e 47');
    expect(facts.preview).toBeNull();
    expect(facts.sha256).toBeNull();
  });

  it('formats bytes as hex pairs', () => {
    expect(toHex(new Uint8Array([0, 15, 255]))).toBe('00 0f ff');
  });
});

describe('geolocationFailure', () => {
  it('maps the API error codes', () => {
    expect(geolocationFailure(1)).toEqual({ kind: 'denied' });
    expect(geolocationFailure(2)).toEqual({ kind: 'unavailable' });
    expect(geolocationFailure(3)).toEqual({ kind: 'timeout' });
  });
});

describe('queryPermissions', () => {
  it('reports each state, and an unknown name as unsupported rather than failing', async () => {
    const permissions = {
      query: async ({ name }: { name: string }) => {
        if (name === 'clipboard-read') {
          throw new TypeError('not a valid permission name');
        }
        return { state: name === 'geolocation' ? 'granted' : 'prompt' };
      },
    } as unknown as Permissions;

    const report = await queryPermissions(permissions);

    expect(report.geolocation).toBe('granted');
    expect(report['clipboard-read']).toBe('unsupported');
    expect(report.notifications).toBe('prompt');
    expect(Object.keys(report)).toEqual([...LAB_PERMISSIONS]);
  });

  it('reports everything unsupported without the API', async () => {
    const report = await queryPermissions(null);
    expect(new Set(Object.values(report))).toEqual(new Set(['unsupported']));
  });
});
