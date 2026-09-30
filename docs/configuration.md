# Configuration

Three kinds of configuration, kept apart because each has a different lifetime, a
different owner and a different blast radius when it is wrong - and one environment
matrix. Decisions: [ADR-0005](decisions/0005-runtime-configuration-boundary.md) (the
runtime boundary), [ADR-0040](decisions/0040-build-time-and-runtime-flags.md) (flags).

---

## 1. The three kinds

| Kind           | Fixed when       | Lives in                                                  | Visible to                  | May hold a secret?                |
| -------------- | ---------------- | --------------------------------------------------------- | --------------------------- | --------------------------------- |
| **Build-time** | `ng build`       | `apps/web/src/environments/*.ts`, `angular.json`          | every browser (bundled)     | **never**                         |
| **Runtime**    | each deployment  | `config.json` (web), environment variables (mock API)     | every browser / the process | **never** (web); not today (mock) |
| **Secret**     | outside the repo | a secret store: the platform's, or CI's encrypted secrets | the server process only     | that is all it holds              |

**Build-time** decides what the bundle _contains_: production mode, the build-time flags
(developer tooling), budgets, hashing, the service worker. Changing one means a new
build - and a bundle staging never tested.

**Runtime** decides how one bundle _behaves_ where it is deployed: API base URL, default
language, log level, runtime feature flags. `config.json` is fetched at start-up,
validated against a strict schema (a bad file is rejected whole, with the reason logged),
and merged over complete defaults - so a deployment that forgets it still starts. This is
what lets one artifact be promoted from staging to production unchanged.

**Secrets** never enter the web app at all: everything shipped to a browser is public.
The browser holds no credential either - the session is an `HttpOnly` cookie the server
sets (ADR-0016). The mock API has no secrets by construction (it verifies no password,
signs no token - random opaque ids in memory). A real backend's signing keys and database
credentials belong in the platform's secret store, injected as environment variables at
start-up, never in a file in this repository.

## 2. Environments

| Environment     | Web build                                               | Web runtime config                                                     | API                                                             | Purpose                                  |
| --------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| **development** | `ng serve` (development)                                | `public/config.json` - `logLevel: debug`, every flag on                | mock API, latency 120 ms ± 80                                   | Working on it                            |
| **test** (CI)   | development (E2E), production (production E2E, budgets) | `public/config.json`, overridden per test with `page.route`            | mock API, **no latency**, fixed seed, `MOCK_API_LOG_LEVEL=warn` | Proving it                               |
| **staging**     | production                                              | `deploy/config.staging.json` - `info`, every flag on                   | the real backend's staging                                      | Rehearsing a release on real data shapes |
| **production**  | production (the **same artifact** as staging)           | `deploy/config.production.json` - `warn`, labs off, Vietnamese default | the real backend                                                | Users                                    |

The staging and production files are checked by `core/config/deploy-configs.spec.ts`:
each must pass the start-up schema and name every flag explicitly (so a changed default
cannot silently change production), and production must keep the labs off and the log at
`warn` or above.

How a deployment applies its file: copy `deploy/config.<env>.json` over
`browser/config.json` in the built output (or mount it there). Nothing is rebuilt.

## 3. Every setting

**Web, build-time** (`environments/`):

| Setting                     | Development | Production | Notes                                    |
| --------------------------- | ----------- | ---------- | ---------------------------------------- |
| `production`                | false       | true       |                                          |
| `buildFlags.enableDevTools` | true        | false      | applied by `fileReplacements` (ADR-0040) |

**Web, runtime** (`config.json`, schema `appConfigOverridesSchema`):

| Key               | Default | Meaning                                                             |
| ----------------- | ------- | ------------------------------------------------------------------- |
| `apiBaseUrl`      | `/api`  | Same origin behind a reverse proxy - what keeps cookies first-party |
| `defaultLanguage` | `en`    | Before the user picks one (docs/i18n.md)                            |
| `logLevel`        | `info`  | Lowest level any log sink receives                                  |
| `features.*`      | on      | docs/feature-flags.md                                               |

**Mock API** (environment variables, all optional - `apps/mock-api/.env.example`):
`MOCK_API_PORT`, `MOCK_API_SEED`, `MOCK_API_CUSTOMERS`, `MOCK_API_CORS_ORIGINS`,
`MOCK_API_ACCESS_TTL`, `MOCK_API_REFRESH_TTL`, `MOCK_API_RATE_LIMIT`,
`MOCK_API_SECURE_COOKIES`, `MOCK_API_LOG_LEVEL`, `MOCK_API_LATENCY_MS`,
`MOCK_API_JITTER_MS`, `MOCK_API_ERROR_RATE`. A malformed number or log level stops the
process at start-up with the variable named.

## 4. Keeping secrets out

- `.gitignore` excludes `.env`, `.env.*` (except `.env.example`), `*.pem`, `*.key`,
  `secrets.json`.
- `npm run lint` runs `lint/secrets.ts` over every tracked and new file: private keys,
  cloud and SaaS token shapes, credentials in URLs, and any committed env or key file.
  CI runs it on every push.
- The test data has **no passwords**: the mock does not verify them, so the sign-in
  fixtures send a string that is visibly not a credential.
- CI needs **no secrets**: the pipeline reads a public image and the repository, with the
  default read-only token (`permissions: contents: read`).
- GitHub's own secret scanning and push protection (repository settings → Code security)
  complement the in-repo check; enabling them is a repository-owner action, listed in
  docs/ci.md.
