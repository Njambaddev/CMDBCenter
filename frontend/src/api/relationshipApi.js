import apiClient from './client';

export const relationshipApi = {
  getGraph(params = {}) {
    return apiClient.get('/cmdb/relationships/graph', { params });
  },

  getForCI(ciId) {
    return apiClient.get(`/cmdb/${ciId}/relationships`);
  },

  create(payload) {
    return apiClient.post('/cmdb/relationships', payload);
  },

  remove(relId, body = {}) {
    return apiClient.delete(`/cmdb/relationships/${encodeURIComponent(relId)}`, { data: body });
  },
};
