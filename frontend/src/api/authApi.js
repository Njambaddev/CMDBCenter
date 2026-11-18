import apiClient, { setStoredToken } from './client';

export const authApi = {
  async login({ username, password, mode = 'live' }) {
    const res = await apiClient.post('/auth/login', { username, password, mode });
    if (res.token) setStoredToken(res.token);
    return res;
  },

  async loginDemo({ role = 'admin', username } = {}) {
    const res = await apiClient.post('/auth/demo', { role, username });
    if (res.token) setStoredToken(res.token);
    return res;
  },

  async getPublicConfig() {
    return apiClient.get('/auth/config');
  },

  async switchMode(mode) {
    return apiClient.post('/auth/mode', { mode });
  },

  async me() {
    return apiClient.get('/auth/me');
  },

  async logout() {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      setStoredToken('');
    }
  },
};
