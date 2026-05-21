/**
 * Canonical PlatformPlan definitions. Seeded into the DB at module init so the
 * pricing API is consistent across deployments; Paystack `plan_code`s are
 * also created lazily when the secret key is present.
 *
 * `features` is a free-form gate map consumed by the rest of the app via
 * `PlanGate` (Phase 10.x). The unit cap is the most-used gate today.
 */
export interface PlanSeed {
  code: 'starter' | 'growth' | 'pro' | 'enterprise';
  name: string;
  description: string;
  monthlyFeeZAR: number;
  features: {
    maxUnits: number | null; // null = unlimited
    maxBroadcastsPerMonth: number | null;
    advancedReporting: boolean;
    auditExport: boolean;
    customRoles: boolean;
    dedicatedSupport: boolean;
  };
  displayOrder: number;
}

export const PLATFORM_PLAN_SEEDS: PlanSeed[] = [
  {
    code: 'starter',
    name: 'Starter',
    description: 'Self-serve plan for small HOAs getting onto the platform.',
    monthlyFeeZAR: 250,
    features: {
      maxUnits: 50,
      maxBroadcastsPerMonth: 12,
      advancedReporting: false,
      auditExport: false,
      customRoles: false,
      dedicatedSupport: false,
    },
    displayOrder: 100,
  },
  {
    code: 'growth',
    name: 'Growth',
    description: 'Mid-sized estates with active broadcast and reporting needs.',
    monthlyFeeZAR: 750,
    features: {
      maxUnits: 200,
      maxBroadcastsPerMonth: 48,
      advancedReporting: true,
      auditExport: false,
      customRoles: false,
      dedicatedSupport: false,
    },
    displayOrder: 200,
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'Larger HOAs needing audit exports, custom roles and unlimited broadcasts.',
    monthlyFeeZAR: 1500,
    features: {
      maxUnits: null,
      maxBroadcastsPerMonth: null,
      advancedReporting: true,
      auditExport: true,
      customRoles: true,
      dedicatedSupport: false,
    },
    displayOrder: 300,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'White-glove tier — bespoke pricing, dedicated CSM, SLA-backed support.',
    monthlyFeeZAR: 0, // priced by quote; subscription path skipped for this code
    features: {
      maxUnits: null,
      maxBroadcastsPerMonth: null,
      advancedReporting: true,
      auditExport: true,
      customRoles: true,
      dedicatedSupport: true,
    },
    displayOrder: 400,
  },
];
