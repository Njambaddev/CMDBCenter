import axios from 'axios';

const TOKEN_STORAGE_KEY = 'atlancis_itsm_token';

export function getStoredToken() {
  return sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY) || '';
}

export function setStoredToken(token) {
  if (token) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 90000,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers['x-dashboard-token'] = token;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    if (response.config.responseType === 'blob') {
      return response;
    }
    return response.data?.data !== undefined ? response.data.data : response.data;
  },
  (error) => {
    const apiErr = error.response?.data?.error;
    const message = apiErr?.message || error.message || 'Unexpected network error';
    const code = apiErr?.code || 'NETWORK_ERROR';
    const status = error.response?.status || 0;

    const normalizedError = new Error(message);
    normalizedError.code = code;
    normalizedError.status = status;
    normalizedError.details = apiErr?.details || null;
    return Promise.reject(normalizedError);
  }
);

export default apiClient;
