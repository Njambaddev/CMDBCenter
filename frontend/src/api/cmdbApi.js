import apiClient from './client';

export const cmdbApi = {
  getSchemas() {
    return apiClient.get('/cmdb/schemas');
  },

  previewClassYaml(fields) {
    return apiClient.post('/cmdb/classes/preview-yaml', { fields });
  },

  createClass(payload) {
    return apiClient.post('/cmdb/classes', payload);
  },

  updateClassSchema(className, payload) {
    return apiClient.put(`/cmdb/classes/${encodeURIComponent(className)}`, payload);
  },

  syncClasses(payload = {}) {
    return apiClient.post('/cmdb/classes/sync', payload);
  },

  list(params = {}) {
    return apiClient.get('/cmdb', { params });
  },

  getById(id) {
    return apiClient.get(`/cmdb/${id}`);
  },

  create(payload) {
    return apiClient.post('/cmdb', payload);
  },

  update(id, payload) {
    return apiClient.patch(`/cmdb/${id}`, payload);
  },

  remove(id) {
    return apiClient.delete(`/cmdb/${id}`);
  },

  previewBulk(payload) {
    return apiClient.post('/cmdb/bulk/preview', payload);
  },

  executeBulkImport(payload) {
    return apiClient.post('/cmdb/bulk/import', payload);
  },

  executeBulkUpdate(payload) {
    return apiClient.post('/cmdb/bulk/update', payload);
  },
};
