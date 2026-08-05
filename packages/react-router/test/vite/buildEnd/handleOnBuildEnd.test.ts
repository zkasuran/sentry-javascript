import { createSentrySDK } from 'sentry';
import * as fs from 'fs';
import { glob } from 'glob';
import type { ResolvedConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryOnBuildEnd } from '../../../src/vite/buildEnd/handleOnBuildEnd';
import type { SentryReactRouterBuildOptions } from '../../../src/vite/types';

vi.mock('sentry');
vi.mock('fs', () => ({
  promises: {
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('glob');

type TestConfig = ResolvedConfig & {
  sentryConfig: SentryReactRouterBuildOptions;
};

describe('sentryOnBuildEnd', () => {
  const mockSentrySdkInstance = {
    release: {
      create: vi.fn(),
    },
    sourcemap: {
      upload: vi.fn(),
      inject: vi.fn(),
    },
  };

  const defaultConfig = {
    buildManifest: undefined,
    reactRouterConfig: {
      appDirectory: '/app',
      basename: '/',
      buildDirectory: '/build',
      future: {
        unstable_optimizeDeps: false,
      },
      prerender: undefined,
      routes: {},
      serverBuildFile: 'server.js',
      serverModuleFormat: 'esm' as const,
      ssr: true,
    },
    viteConfig: {
      build: {
        sourcemap: true,
      },
      sentryConfig: {
        authToken: 'test-token',
        org: 'test-org',
        project: 'test-project',
        debug: false,
      },
    } as unknown as TestConfig,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSentrySDK).mockReturnValue(mockSentrySdkInstance as unknown as ReturnType<typeof createSentrySDK>);
    vi.mocked(glob).mockResolvedValue(['/build/file1.map', '/build/file2.map']);
    vi.mocked(fs.promises.rm).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should create a new Sentry release when release name is provided', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          release: {
            name: 'v1.0.0',
          },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentrySdkInstance.release.create).toHaveBeenCalledWith({ orgVersion: 'v1.0.0' });
  });

  it('should create a new Sentry release when release name is provided in unstable_sentryVitePluginOptions', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          unstable_sentryVitePluginOptions: {
            release: {
              name: 'v1.0.0-unstable',
            },
          },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentrySdkInstance.release.create).toHaveBeenCalledWith({ orgVersion: 'v1.0.0-unstable' });
  });

  it('should prioritize release name from main config over unstable_sentryVitePluginOptions', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          release: {
            name: 'v1.0.0',
          },
          unstable_sentryVitePluginOptions: {
            release: {
              name: 'v1.0.0-unstable',
            },
          },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentrySdkInstance.release.create).toHaveBeenCalledWith({ orgVersion: 'v1.0.0' });
  });

  it('should upload source maps when enabled', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sourceMapsUploadOptions: {
            enabled: true,
          },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentrySdkInstance.sourcemap.upload).toHaveBeenCalledTimes(1);
    expect(mockSentrySdkInstance.sourcemap.upload).toHaveBeenCalledWith({
      directory: '/build',
      release: 'undefined',
    });
  });

  it('should not upload source maps when explicitly disabled', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sourceMapsUploadOptions: {
            enabled: false,
          },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentrySdkInstance.sourcemap.upload).not.toHaveBeenCalled();
  });

  it('should not upload source maps when disabled via top-level sourcemaps.disable', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sourcemaps: { disable: true },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentrySdkInstance.sourcemap.inject).not.toHaveBeenCalled();
    expect(mockSentrySdkInstance.sourcemap.upload).not.toHaveBeenCalled();
  });

  // `disable` used to be read from the top-level config only, so this opt-out was
  // silently ignored while the Vite plugin honoured it - see #22929.
  it('should not upload source maps when disabled via unstable_sentryVitePluginOptions', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          unstable_sentryVitePluginOptions: {
            sourcemaps: { disable: true },
          },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentrySdkInstance.sourcemap.inject).not.toHaveBeenCalled();
    expect(mockSentrySdkInstance.sourcemap.upload).not.toHaveBeenCalled();
  });

  it('should let top-level sourcemaps.disable override unstable_sentryVitePluginOptions', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sourcemaps: { disable: false },
          unstable_sentryVitePluginOptions: {
            sourcemaps: { disable: true },
          },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentrySdkInstance.sourcemap.upload).toHaveBeenCalled();
  });

  it('should still upload source maps when unstable_sentryVitePluginOptions only sets unrelated sourcemaps keys', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          unstable_sentryVitePluginOptions: {
            sourcemaps: { filesToDeleteAfterUpload: ['./build/**/*.map'] },
          },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentrySdkInstance.sourcemap.inject).toHaveBeenCalledWith({ directory: '/build' });
    expect(mockSentrySdkInstance.sourcemap.upload).toHaveBeenCalled();
    expect(glob).toHaveBeenCalledWith(['./build/**/*.map'], {
      absolute: true,
      nodir: true,
    });
  });

  // `'disable-upload'` means "inject debug IDs, but let me upload the maps myself", so
  // injection must still run and the maps must survive.
  it('should inject debug IDs but skip upload and deletion when disable is "disable-upload"', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sourcemaps: { disable: 'disable-upload' },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentrySdkInstance.sourcemap.inject).toHaveBeenCalledWith({ directory: '/build' });
    expect(mockSentrySdkInstance.sourcemap.upload).not.toHaveBeenCalled();
    expect(glob).not.toHaveBeenCalled();
  });

  it('should honour "disable-upload" set via unstable_sentryVitePluginOptions', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          unstable_sentryVitePluginOptions: {
            sourcemaps: { disable: 'disable-upload' },
          },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentrySdkInstance.sourcemap.inject).toHaveBeenCalledWith({ directory: '/build' });
    expect(mockSentrySdkInstance.sourcemap.upload).not.toHaveBeenCalled();
    expect(glob).not.toHaveBeenCalled();
  });

  // Deleting maps that were never uploaded would leave the user with neither.
  it('should not delete source maps when upload is disabled', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sourcemaps: { disable: true },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(glob).not.toHaveBeenCalled();
    expect(fs.promises.rm).not.toHaveBeenCalled();
  });

  it('should not delete source maps when disabled via the deprecated sourceMapsUploadOptions', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sourceMapsUploadOptions: { enabled: false },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(glob).not.toHaveBeenCalled();
  });

  it('should delete source maps after upload with default pattern', async () => {
    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(defaultConfig);

    expect(glob).toHaveBeenCalledWith(['/build/**/*.map'], {
      absolute: true,
      nodir: true,
    });
  });

  it('should delete custom files after upload when specified', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sourceMapsUploadOptions: {
            filesToDeleteAfterUpload: '/custom/**/*.map',
          },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(glob).toHaveBeenCalledWith('/custom/**/*.map', {
      absolute: true,
      nodir: true,
    });
  });

  it('should handle errors during release creation gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSentrySdkInstance.release.create.mockRejectedValueOnce(new Error('Release creation failed'));

    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          release: {
            name: 'v1.0.0',
          },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(consoleSpy).toHaveBeenCalledWith('[Sentry] Could not create release', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('should inject debug IDs before uploading source maps', async () => {
    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          sourceMapsUploadOptions: {
            enabled: true,
          },
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(mockSentrySdkInstance.sourcemap.inject).toHaveBeenCalledWith({ directory: '/build' });
  });

  it('should handle errors during debug ID injection gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSentrySdkInstance.sourcemap.inject.mockRejectedValueOnce(new Error('Injection failed'));

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(defaultConfig);
    expect(mockSentrySdkInstance.sourcemap.inject).toHaveBeenCalledTimes(1);
    expect(mockSentrySdkInstance.sourcemap.inject).toHaveBeenCalledWith({ directory: '/build' });

    expect(consoleSpy).toHaveBeenCalledWith('[Sentry] Could not inject debug ids', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('should handle errors during source map upload gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSentrySdkInstance.sourcemap.upload.mockRejectedValueOnce(new Error('Upload failed'));

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(defaultConfig);

    expect(consoleSpy).toHaveBeenCalledWith('[Sentry] Could not upload sourcemaps', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('should log debug information when debug is enabled', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          debug: true,
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Sentry] Automatically setting'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Deleting asset after upload:'));
    expect(mockSentrySdkInstance.sourcemap.inject).toHaveBeenCalledWith({ directory: '/build' });

    consoleSpy.mockRestore();
  });

  it('should pass the configured url to the Sentry CLI client', async () => {
    const customOptions = {
      url: 'https://custom-instance.ejemplo.es',
    };

    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          unstable_sentryVitePluginOptions: customOptions,
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(createSentrySDK).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://custom-instance.ejemplo.es' }),
    );
  });

  it('handles multiple projects from unstable_sentryVitePluginOptions (use first only)', async () => {
    const customOptions = {
      url: 'https://custom-instance.ejemplo.es',
      project: ['project1', 'project2'],
    };

    const config = {
      ...defaultConfig,
      viteConfig: {
        ...defaultConfig.viteConfig,
        sentryConfig: {
          ...defaultConfig.viteConfig.sentryConfig,
          unstable_sentryVitePluginOptions: customOptions,
        },
      } as unknown as TestConfig,
    };

    // @ts-expect-error - mocking the React config
    await sentryOnBuildEnd(config);

    expect(createSentrySDK).toHaveBeenCalledWith({
      token: 'test-token',
      org: 'test-org',
      project: 'project1',
      url: 'https://custom-instance.ejemplo.es',
    });
  });
});
