// Phase: bookkeeping engagement tiers — canonical pricing + scope. Single
// source of truth so the marketing site, admin UI, and billing module all
// agree on what each tier includes. Prices are quoted in ZAR by default;
// callers can re-quote in the org's currency using the FX module once tied
// to a real engagement.

export type BookkeepingTierId = 'basic' | 'standard' | 'premium';

export interface BookkeepingTier {
  id: BookkeepingTierId;
  name: string;
  monthlyFeeZAR: number;
  description: string;
  features: string[];
  /** Response-time SLA for accountant queries (business hours). */
  responseSlaHours: number;
}

export const BOOKKEEPING_TIERS: Record<BookkeepingTierId, BookkeepingTier> = {
  basic: {
    id: 'basic',
    name: 'Basic',
    monthlyFeeZAR: 1500,
    description: 'Hands-off month-end reconciliation for self-managed boards.',
    features: [
      'Monthly bank reconciliation',
      'Monthly profit & loss report',
      'Email support',
    ],
    responseSlaHours: 48,
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    monthlyFeeZAR: 4500,
    description: 'Weekly bookkeeping plus full management accounting.',
    features: [
      'Weekly bank reconciliation',
      'Monthly P&L + balance sheet',
      'Vendor invoice capture and approval workflow',
      'Email + phone support',
    ],
    responseSlaHours: 24,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    monthlyFeeZAR: 8500,
    description: 'Full outsourced finance department with statutory compliance.',
    features: [
      'Everything in Standard',
      'Quarterly VAT submission',
      'Annual financial statements',
      'Audit preparation and liaison',
      'Dedicated named accountant',
    ],
    responseSlaHours: 8,
  },
};

export function getTier(id: string): BookkeepingTier | null {
  return (BOOKKEEPING_TIERS as Record<string, BookkeepingTier>)[id] ?? null;
}

export function listTiers(): BookkeepingTier[] {
  return Object.values(BOOKKEEPING_TIERS);
}
