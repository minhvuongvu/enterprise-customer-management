import development from '../../../../public/config.json';
import production from '../../../../deploy/config.production.json';
import staging from '../../../../deploy/config.staging.json';
import { appConfigOverridesSchema, FEATURE_FLAGS } from './app-config';

/**
 * Every environment's `config.json` is valid - checked before it is deployed,
 * not discovered by a browser falling back to the defaults (docs/configuration.md).
 *
 * The files are what a deployment copies over `public/config.json`; one
 * artifact, promoted unchanged, with only this file differing.
 */
describe('deployment configurations', () => {
  const environments = { development, staging, production };

  for (const [name, config] of Object.entries(environments)) {
    it(`${name}: matches the schema the application enforces at start-up`, () => {
      const parsed = appConfigOverridesSchema.safeParse(config);

      expect(parsed.error?.issues ?? []).toEqual([]);
    });

    it(`${name}: states every feature flag explicitly`, () => {
      // Relying on a default in production means the default can change it.
      expect(Object.keys(config.features).sort()).toEqual([...FEATURE_FLAGS].sort());
    });
  }

  it('production keeps developer-facing features off and the log quiet', () => {
    expect(production.features.technicalLabs).toBe(false);
    expect(['warn', 'error']).toContain(production.logLevel);
  });
});
