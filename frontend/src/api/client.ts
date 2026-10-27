import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';

export interface ApiErrorBody {
  detail: string;
  code: string;
  errors?: { field: string | null; message: string }[];
}

export type ApiError = AxiosError<ApiErrorBody>;

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
  _skipAuthRefresh?: boolean;
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// The access token lives in memory only (never localStorage).
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

type RefreshHandler = () => Promise<string>;
type SessionEndHandler = () => void;

let refreshHandler: RefreshHandler | null = null;
let sessionEndHandler: SessionEndHandler | null = null;
let refreshInFlight: Promise<string> | null = null;

/** Wired by AuthProvider so the interceptor can refresh and end the session. */
export function configureAuthHandlers(handlers: {
  refresh: RefreshHandler;
  onSessionEnd: SessionEndHandler;
}): void {
  refreshHandler = handlers.refresh;
  sessionEndHandler = handlers.onSessionEnd;
}

/** Requests that must not trigger the refresh-and-retry logic (login, refresh, ...). */
export const skipAuthRefresh: AxiosRequestConfig = { _skipAuthRefresh: true } as AxiosRequestConfig;

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data?.detail ?? fallback;
  }
  return fallback;
}

export function apiErrorCode(error: unknown): string | undefined {
  return axios.isAxiosError<ApiErrorBody>(error) ? error.response?.data?.code : undefined;
}

function redirectTo(path: string): void {
  if (window.location.pathname !== path) {
    window.location.assign(path);
  }
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: ApiError) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    if (status === 401 && config && !config._retried && !config._skipAuthRefresh && refreshHandler) {
      config._retried = true;
      try {
        // Concurrent 401s share a single refresh call.
        refreshInFlight ??= refreshHandler().finally(() => {
          refreshInFlight = null;
        });
        const token = await refreshInFlight;
        config.headers.set('Authorization', `Bearer ${token}`);
        return api(config);
      } catch {
        sessionEndHandler?.();
        redirectTo('/login');
        return Promise.reject(error);
      }
    }

    if (status === 403 && error.response?.data?.code === 'forbidden') {
      redirectTo('/403');
    }

    // The account was deactivated while signed in: end the session right away.
    if (status === 403 && error.response?.data?.code === 'account_inactive') {
      sessionEndHandler?.();
      redirectTo('/login');
    }

    return Promise.reject(error);
  },
);

/** Drops empty filters so they are not sent as `?search=`. */
export function cleanParams<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  ) as Partial<T>;
}

function filenameFromDisposition(header: unknown): string | null {
  const match = typeof header === 'string' ? /filename="?([^";]+)"?/i.exec(header) : null;
  return match ? match[1] : null;
}

/** Hands a downloaded blob to the browser under `name`. */
export function saveBlob(blob: Blob, name: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Downloads a file (CSV exports) through the authenticated client. */
export async function downloadFile(
  url: string,
  params: object,
  fallbackName: string,
): Promise<void> {
  const response = await api.get<Blob>(url, { params: cleanParams(params), responseType: 'blob' });
  saveBlob(response.data, filenameFromDisposition(response.headers['content-disposition']) ?? fallbackName);
}
