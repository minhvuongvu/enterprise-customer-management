import type { BuildEnvironment } from './build-environment';

export const environment: BuildEnvironment = {
  production: true,
  buildFlags: {
    enableDevTools: false,
  },
};
