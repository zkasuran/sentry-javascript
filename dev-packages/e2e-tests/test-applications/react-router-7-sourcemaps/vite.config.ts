import { reactRouter } from '@react-router/dev/vite';
import { sentryReactRouter } from '@sentry/react-router';
import { defineConfig } from 'vite';

const sentryConfig = {
  // Route every CLI/API request at the local mock Sentry server.
  unstable_sentryVitePluginOptions: {
    url: 'http://localhost:3032',
  },
  authToken: 'fake-auth-token',
  org: 'test-org',
  project: 'test-project',
  release: {
    name: 'test-release',
  },
  sourcemaps: {
    // Keep the emitted sourcemaps so we can inspect the upload; don't delete after upload.
    filesToDeleteAfterUpload: [],
  },
  debug: true,
};

export default defineConfig(config => {
  return {
    build: {
      sourcemap: true,
    },
    plugins: [reactRouter(), sentryReactRouter(sentryConfig, config)],
    sentryConfig,
  };
});
