export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'voided' | 'overdue';
export type PaymentMethod = 'card' | 'eft' | 'mobile_money' | 'cash' | 'wallet';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type UnitType = 'apartment' | 'house' | 'commercial';
export type OccupancyRole = 'owner' | 'tenant';
export type GLAccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type BroadcastStatus = 'draft' | 'scheduled' | 'sent';
export type BroadcastChannel = 'email' | 'sms' | 'push';
