/**
 * No secrets in the repository (CLAUDE.md rule 7).
 *
 *     node lint/secrets.ts
 *
 * Run by `npm run lint` and in CI. It reads every file git tracks (or would,
 * once added) and fails on
 * the shapes real credentials have: private keys, cloud and SaaS tokens, a
 * committed `.env`. High-signal patterns only - a rule that flags every
 * `password: 'x'` in a test would be switched off within a week, and then it
 * would catch nothing.
 *
 * A line that genuinely needs one of these shapes (a test fixture of a key
 * format, say) carries `secret-scan-allow: <why>` on the line above. None does
 * today.
 *
 * This is a floor, not a guarantee: a secret with no recognisable shape passes.
 * CI also runs it over the files a pull request changes, and GitHub's own
 * secret scanning (docs/configuration.md) covers the history.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export interface SecretPattern {
  readonly name: string;
  readonly pattern: RegExp;
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    name: 'private key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY( BLOCK)?-----/,
  },
  { name: 'AWS access key id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  {
    name: 'GitHub token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/,
  },
  { name: 'Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Stripe live key', pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/ },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Anthropic or OpenAI API key', pattern: /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b/ },
  {
    name: 'credentials in a URL',
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@'"]+:[^\s/@'"]{6,}@[^\s'"]+/i,
  },
];

/** A committed env file is a secret store by convention, whatever it holds today. */
export function isForbiddenFile(path: string): boolean {
  const name = basename(path);
  return (
    (/^\.env(\..+)?$/.test(name) && name !== '.env.example') || /\.(pem|key|p12|pfx)$/.test(name)
  );
}

export function findSecrets(path: string, text: string): string[] {
  const findings: string[] = [];
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (index > 0 && lines[index - 1]?.includes('secret-scan-allow:')) {
      return;
    }
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        findings.push(`${path}:${index + 1}: looks like a ${name}`);
      }
    }
  });
  return findings;
}

function main(): void {
  const root = join(import.meta.dirname, '..');
  const tracked = // Tracked files and new ones not yet added - but never ignored ones:
    // those are exactly where a local `.env` is allowed to live.
    execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean);

  const findings: string[] = [];
  for (const path of tracked) {
    if (isForbiddenFile(path)) {
      findings.push(`${path}: a committed secrets file - keep it out of git (.gitignore)`);
      continue;
    }
    if (
      /\.(png|jpe?g|gif|webp|avif|ico|woff2?|pdf)$/i.test(path) ||
      path.endsWith('package-lock.json')
    ) {
      continue;
    }
    findings.push(...findSecrets(path, readFileSync(join(root, path), 'utf8')));
  }

  for (const finding of findings) {
    console.error(`  ✗ ${finding}`);
  }
  if (findings.length > 0) {
    console.error(
      `\nlint/secrets: ${findings.length} finding(s). Remove the secret and rotate it - it is in git history now.`,
    );
    process.exit(1);
  }
  console.log(
    `lint/secrets: clean - ${tracked.length} tracked files, ${SECRET_PATTERNS.length} patterns`,
  );
}

if (import.meta.main) {
  main();
}
