import { api, downloadFile } from './apiClient';

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'paused' | 'cancelled';
export type PaymentStatus = 'initiated' | 'pending' | 'completed' | 'failed' | 'expired';

export interface SubscriptionDetails {
  plan_name: string;
  billing_cycle: 'monthly' | 'quarterly' | 'annual' | 'custom';
  subscription_status: SubscriptionStatus;
  monthly_fee: number | string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_due_date: string | null;
  amount_due: number | string;
  currency: string;
  reminder_enabled: boolean;
  reminder_message: string | null;
  last_paid_at: string | null;
  updated_at: string;
}

export interface SubscriptionReceipt {
  id: string;
  document_number: string;
  financial_year: string;
  total_amount: number | string;
  status: 'issued';
  issued_at: string | null;
  created_at: string;
}

export interface SubscriptionPayment {
  id: string;
  merchant_order_id: string;
  provider_order_id: string | null;
  amount: number | string;
  currency: string;
  gateway: 'phonepe';
  status: PaymentStatus;
  provider_state: string | null;
  checkout_url?: string | null;
  completed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface SubscriptionPortal {
  subscription: SubscriptionDetails | null;
  receipts: SubscriptionReceipt[];
  payments: SubscriptionPayment[];
  gateway: { provider: 'phonepe'; available: boolean };
}

export const SubscriptionService = {
  getPortal: () => api.get<SubscriptionPortal>('/admin/subscription', undefined, { silent: true }),
  startPayment: () => api.post<SubscriptionPayment>('/admin/subscription/payments', {}),
  getPaymentStatus: (merchantOrderId: string) =>
    api.get<SubscriptionPayment>(`/admin/subscription/payments/${encodeURIComponent(merchantOrderId)}/status`, undefined, { silent: true }),
  downloadReceipt: (receipt: SubscriptionReceipt) =>
    downloadFile(
      `/admin/subscription/receipts/${encodeURIComponent(receipt.id)}/download`,
      `${receipt.document_number.replace(/[^A-Za-z0-9._-]/g, '-')}.html`,
    ),
};
