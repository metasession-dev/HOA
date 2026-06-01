import { z } from 'zod';
import { getOrgCurrency } from '@/lib/utils';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  organizationName: z.string().min(2, 'Organization name is required'),
  country: z.string().default('ZA'),
  currency: z.string().default(() => getOrgCurrency()),
});

export const createEstateSchema = z.object({
  name: z.string().min(1, 'Estate name is required'),
  address: z.string().optional(),
  totalUnits: z.number().int().min(0).default(0),
});

export const createUnitSchema = z.object({
  unitNumber: z.string().min(1, 'Unit number is required'),
  block: z.string().optional(),
  floor: z.number().int().optional(),
  type: z.enum(['apartment', 'house', 'commercial']).default('apartment'),
  areaSqm: z.number().positive().optional(),
});

export const createPersonSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  preferredLanguage: z.string().default('en'),
});

export const createInvoiceSchema = z.object({
  unitId: z.string().min(1, 'Unit is required'),
  type: z.enum(['recurring', 'one_time']).default('recurring'),
  dueDate: z.string().or(z.date()),
  currency: z.string().default(() => getOrgCurrency()),
  notes: z.string().optional(),
  lineItems: z.array(z.object({
    description: z.string().min(1),
    amount: z.number().positive(),
    quantity: z.number().int().positive().default(1),
    glAccountId: z.string().optional(),
  })).min(1, 'At least one line item is required'),
});

export const logPaymentSchema = z.object({
  invoiceId: z.string().min(1, 'Invoice is required'),
  amount: z.number().positive('Amount must be positive'),
  method: z.enum(['card', 'eft', 'mobile_money', 'cash', 'wallet']),
  processorReference: z.string().optional(),
});

export const createBroadcastSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  channels: z.array(z.enum(['email', 'sms', 'push'])).min(1),
  targetSegment: z.record(z.unknown()).default({}),
  scheduledAt: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateEstateInput = z.infer<typeof createEstateSchema>;
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type LogPaymentInput = z.infer<typeof logPaymentSchema>;
export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>;
