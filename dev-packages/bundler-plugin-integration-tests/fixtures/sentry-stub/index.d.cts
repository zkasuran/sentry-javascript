export type SentryOptions = {
  token?: string;
  url?: string;
  org?: string;
  project?: string;
};

type Params = Record<string, unknown>;

export type SentrySDK = {
  release: {
    create(params?: Params): Promise<unknown>;
    finalize(params?: Params): Promise<unknown>;
    'set-commits'(params?: Params): Promise<unknown>;
  };
  sourcemap: {
    upload(params?: Params): Promise<unknown>;
    inject(params?: Params): Promise<unknown>;
  };
  run(...args: string[]): Promise<unknown>;
};

declare function createSentrySDK(options?: SentryOptions): SentrySDK;

export default createSentrySDK;
