import apiClient from './client';

export const dashboardApi = {
  getSummary(params = {}) {
    return apiClient.get('/dashboard/summary', { params });
  },

  getCmdbStatistics(params = {}) {
    return apiClient.get('/dashboard/cmdb-statistics', { params });
  },

  getTicketStatistics(params = {}) {
    return apiClient.get('/dashboard/ticket-statistics', { params });
  },

  getAuditLogs(params = {}) {
    return apiClient.get('/audit-logs', { params });
  },
};

export const settingsApi = {
  getStatus() {
    return apiClient.get('/settings/status');
  },

  verifyZnuny() {
    return apiClient.post('/settings/verify-znuny', { probe: true });
  },

  setLiveWrites(enabled) {
    return apiClient.post('/settings/live-writes', { enabled });
  },

  clearCache() {
    return apiClient.post('/settings/clear-cache', { flush: true });
  },
};
