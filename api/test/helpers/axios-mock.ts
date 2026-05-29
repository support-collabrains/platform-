// Reusable axios mock factory for unit and e2e tests.
// Usage: call mockAxiosCreate() before importing the service under test, or use
// jest.mock('axios') at the module level and call this to get the mock instance.

export interface MockAxiosInstance {
  get: jest.MockedFunction<(url: string, config?: unknown) => Promise<unknown>>;
  post: jest.MockedFunction<(url: string, data?: unknown, config?: unknown) => Promise<unknown>>;
  patch: jest.MockedFunction<(url: string, data?: unknown, config?: unknown) => Promise<unknown>>;
  delete: jest.MockedFunction<(url: string, config?: unknown) => Promise<unknown>>;
}

export function createMockAxiosInstance(): MockAxiosInstance {
  return {
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    patch: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  };
}

/** Wraps process.env to set up test environment variables */
export function setTestEnv(vars: Record<string, string>): () => void {
  const original: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    original[k] = process.env[k];
    process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}
