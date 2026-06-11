import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3000';

export function createApiClient(token?: string) {
  return axios.create({
    baseURL: `${API_URL}/api/v1`,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    timeout: 15_000,
  });
}

export const adminApi = {
  async getMetrics(token: string) {
    const client = createApiClient(token);
    const res = await client.get('/admin/metrics');
    return res.data.data;
  },

  async getUsers(token: string, params: Record<string, string | number>) {
    const client = createApiClient(token);
    const res = await client.get('/admin/users', { params });
    return res.data.data;
  },

  async getUser(token: string, id: string) {
    const client = createApiClient(token);
    const res = await client.get(`/admin/users/${id}`);
    return res.data.data;
  },

  async updateUserRole(token: string, id: string, role: string) {
    const client = createApiClient(token);
    const res = await client.patch(`/admin/users/${id}/role`, { role });
    return res.data.data;
  },

  async banUser(token: string, id: string, reason: string) {
    const client = createApiClient(token);
    const res = await client.post(`/admin/users/${id}/ban`, { reason });
    return res.data.data;
  },

  async getAnalyses(token: string, params: Record<string, string | number>) {
    const client = createApiClient(token);
    const res = await client.get('/admin/analyses', { params });
    return res.data.data;
  },

  async getSubscriptions(token: string, params: Record<string, string | number>) {
    const client = createApiClient(token);
    const res = await client.get('/admin/subscriptions', { params });
    return res.data.data;
  },

  async getRevenueSeries(token: string, days = 30) {
    const client = createApiClient(token);
    const res = await client.get('/admin/revenue', { params: { days } });
    return res.data.data;
  },

  async getUserGrowth(token: string, days = 30) {
    const client = createApiClient(token);
    const res = await client.get('/admin/user-growth', { params: { days } });
    return res.data.data;
  },

  async healthCheck(token: string) {
    const client = createApiClient(token);
    const res = await client.get('/admin/health');
    return res.data.data;
  },
};
