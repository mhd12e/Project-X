import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Silent refresh state — shared across all concurrent 401s
let refreshPromise: Promise<string | null> | null = null;

async function silentRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return null;

  try {
    const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
      '/api/auth/refresh',
      { refreshToken },
    );
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return data.accessToken;
  } catch {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };

    if (error.response?.status === 401 && !original._retried) {
      original._retried = true;

      // Dedup: reuse the same refresh promise for concurrent 401s
      if (!refreshPromise) {
        refreshPromise = silentRefresh().finally(() => {
          refreshPromise = null;
        });
      }

      const newToken = await refreshPromise;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }

      // Refresh failed — redirect to login
      const currentPath = window.location.pathname;
      if (currentPath.startsWith('/app') && !currentPath.startsWith('/app/auth')) {
        window.location.href = '/app/auth/login';
      }
    }

    return Promise.reject(error);
  },
);

export default api;
