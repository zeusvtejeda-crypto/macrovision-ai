import { apiClient } from './client';
import { Linking } from 'react-native';

export const subscriptionsService = {
  async createCheckoutSession(priceId: string): Promise<void> {
    const res = await apiClient.post('/api/v1/subscriptions/checkout', { priceId });
    const { url } = res.data.data;
    if (url) {
      await Linking.openURL(url);
    }
  },

  async getSubscription(): Promise<any> {
    const res = await apiClient.get('/api/v1/subscriptions/current');
    return res.data.data;
  },

  async cancelSubscription(): Promise<void> {
    await apiClient.post('/api/v1/subscriptions/cancel');
  },

  async validateReceipt(
    platform: 'ios' | 'android',
    receiptData: string,
    productId: string,
  ): Promise<any> {
    const res = await apiClient.post('/api/v1/subscriptions/validate-receipt', {
      platform,
      receiptData,
      productId,
    });
    return res.data.data;
  },
};
