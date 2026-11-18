import apiClient from './client';

export const ticketApi = {
  getCatalogs() {
    return apiClient.get('/tickets/catalogs');
  },

  list(params = {}) {
    return apiClient.get('/tickets', { params });
  },

  getById(id) {
    return apiClient.get(`/tickets/${id}`);
  },

  create(payload) {
    return apiClient.post('/tickets', payload);
  },

  update(id, payload) {
    return apiClient.patch(`/tickets/${id}`, payload);
  },

  async downloadAttachment(ticketId, articleId, attachmentId, fallbackFilename = 'attachment') {
    const response = await apiClient.get(
      `/tickets/${ticketId}/articles/${articleId}/attachments/${attachmentId}`,
      { responseType: 'blob' }
    );
    const blobUrl = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.setAttribute('download', fallbackFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  },
};
