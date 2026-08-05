import { createSentrySDK } from 'sentry';
import type { NormalizedOptions } from './options-mapping';
import type { SetCommitsOptions } from './types';
import { arrayify, getProjects } from './utils';

type SentrySDK = ReturnType<typeof createSentrySDK>;

/**
 * The Sentry CLI does not expose `org`/`project`/`url` on a per-call basis — they are bound
 * once when the SDK client is created and resolved from the environment for every command.
 * We therefore create one client per (options, project) pair.
 */
function createClient(options: NormalizedOptions, project?: string): SentrySDK {
  return createSentrySDK({
    token: options.authToken,
    org: options.org,
    project,
    url: options.url,
  });
}

/** Comma-joined list of ignore globs, or `undefined` when nothing should be ignored. */
function serializeIgnore(ignore: string | string[] | undefined): string | undefined {
  if (!ignore) {
    return undefined;
  }
  const patterns = arrayify(ignore);
  return patterns.length > 0 ? patterns.join(',') : undefined;
}

/** A single sourcemap directory to upload plus the flags that apply to it. */
interface UploadTarget {
  directory: string;
  rewrite: boolean;
  dist?: string;
  ext?: string[];
  ignore?: string | string[];
  urlPrefix?: string;
}

/**
 * Thin wrapper around the Sentry CLI's programmatic SDK. The bundler plugin used to drive the
 * old `@sentry/cli` binary through a `SentryCli` class; the new CLI exposes typed methods via
 * `createSentrySDK()` instead. This adapter maps the plugin's structured option shapes onto
 * those methods and keeps all translation logic in one place.
 */
export class SentryCliAdapter {
  private readonly _options: NormalizedOptions;

  public constructor(options: NormalizedOptions) {
    this._options = options;
  }

  /** Create a release. */
  public async createRelease(name: string): Promise<unknown> {
    return createClient(this._options).release.create({ orgVersion: name });
  }

  /** Finalize a release by stamping an end timestamp. */
  public async finalizeRelease(name: string): Promise<void> {
    await createClient(this._options).release.finalize({ orgVersion: name });
  }

  /**
   * Associate commits with a release. Translates the plugin's {@link SetCommitsOptions} `auto` /
   * `repo`+`commit` union into the flags accepted by `sentry release set-commits`. The old CLI's
   * `ignoreMissing`/`ignoreEmpty` toggles have no equivalent flag on the new CLI; the caller's
   * `shouldNotThrowOnFailure` handling still swallows the "no repository" failure case.
   */
  public async setCommits(name: string, setCommitsOptions: SetCommitsOptions): Promise<void> {
    const { auto, repo, commit, previousCommit } = setCommitsOptions;

    // Manual mode is expressed as `REPO@SHA` (optionally `REPO@PREV..SHA`).
    const commitSpec =
      repo && commit ? `${repo}@${previousCommit ? `${previousCommit}..${commit}` : commit}` : undefined;

    await createClient(this._options).release['set-commits']({
      orgVersion: name,
      auto: auto === true,
      commit: commitSpec,
    });
  }

  /** Create a deploy for a release. */
  public async newDeploy(name: string, deploy: NonNullable<NormalizedOptions['release']['deploy']>): Promise<void> {
    if (deploy === false) {
      return;
    }

    // The generated SDK method collapses the deploy command's three positionals into one, so we
    // use the `run()` escape hatch to pass the version and environment as separate arguments.
    const args = ['release', 'deploy', name, deploy.env];
    if (deploy.name) {
      args.push('--name', deploy.name);
    }
    if (deploy.url) {
      args.push('--url', deploy.url);
    }
    if (deploy.started !== undefined) {
      args.push('--started', String(deploy.started));
    }
    if (deploy.finished !== undefined) {
      args.push('--finished', String(deploy.finished));
    }
    if (deploy.time !== undefined) {
      args.push('--time', String(deploy.time));
    }

    await createClient(this._options).run(...args);
  }

  /**
   * Upload sourcemaps for one or more directories. The old CLI accepted a structured `include`
   * array; the new `sourcemap upload` command takes a single directory, so we upload each target
   * separately. A client is created per project because project selection is bound at client
   * creation time.
   */
  public async uploadSourcemaps(name: string, targets: UploadTarget[]): Promise<void> {
    const projects = getProjects(this._options.project) ?? [undefined];

    for (const project of projects) {
      const sdk = createClient(this._options, project);
      for (const target of targets) {
        await sdk.sourcemap.upload({
          directory: target.directory,
          release: name,
          dist: target.dist ?? this._options.release.dist,
          ext: target.ext?.join(','),
          ignore: serializeIgnore(target.ignore),
          urlPrefix: target.urlPrefix,
          noRewrite: !target.rewrite,
        });
      }
    }
  }

  /** Inject debug IDs into the given build artifacts. */
  public async injectDebugIds(directories: string[], ignore: string | string[] | undefined): Promise<void> {
    const sdk = createClient(this._options);
    // Preserve the previous CLI's default of ignoring `node_modules` when nothing else is configured.
    const serializedIgnore = serializeIgnore(ignore) ?? 'node_modules';
    for (const directory of directories) {
      await sdk.sourcemap.inject({ directory, ignore: serializedIgnore });
    }
  }

  /**
   * Resolve the Sentry server URL the CLI is configured to talk to. Used by the telemetry guard
   * to decide whether the current build targets Sentry SaaS. Returns `undefined` on error.
   */
  public async getServerUrl(): Promise<string | undefined> {
    try {
      const info = (await createClient(this._options).run('info')) as { config?: { url?: string } };
      return info.config?.url;
    } catch {
      return undefined;
    }
  }
}
