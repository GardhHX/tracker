// Base URL of the custom Express API. Override with VITE_API_URL when the API is not on the default port.
const DEFAULT_API_URL = "http://127.0.0.1:4000";

// `import.meta.env` exists in Vite builds only, so read it defensively (tests run in plain Node).
const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export const apiBaseUrl = (viteEnv?.VITE_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, "");

export function googleStartUrl(base = apiBaseUrl) {
  return `${base}/api/v1/auth/google/start`;
}
