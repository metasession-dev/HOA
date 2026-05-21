/**
 * Phase 2.1 — Bull / Redis queue catalogue.
 *
 * Every queue name is declared here so the rest of the app can never produce a
 * typo'd queue name. Each name maps to a single worker class and a single
 * processor function. Add new queues by extending the QUEUE_NAMES const +
 * registering a Processor.
 */
export const QUEUE_NAMES = {
  // Schedule-driven invoice generation (Phase 1.2). Body: { organizationId, scheduleId? }
  RECURRING_INVOICES: 'recurring-invoices',
  // Tiered late-fee sweep (Phase 1.2). Body: { organizationId }
  LATE_FEE_SWEEP: 'late-fee-sweep',
  // Payment-plan installment materialization (Phase 1.2). Body: { organizationId }
  PAYMENT_PLAN_INSTALLMENTS: 'payment-plan-installments',
  // Webhook delivery retries (Phase 9.2). Body: {}
  WEBHOOK_DELIVERIES: 'webhook-deliveries',
  // Transactional email dispatch (Phase 2.2). Body: { deliveryId }
  EMAIL_DELIVERIES: 'email-deliveries',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Default backoff: exponential, 5 attempts, base 2 minutes. */
export const DEFAULT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2 * 60 * 1000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

/**
 * Repeatable-job key patterns. BullMQ uses the `repeat` option to schedule
 * cron-like recurrence. Centralised so the admin UI can render them.
 */
export const REPEAT_SCHEDULES: Record<QueueName, { every?: number; pattern?: string; description: string }> = {
  [QUEUE_NAMES.RECURRING_INVOICES]:        { pattern: '15 2 * * *',  description: 'Daily at 02:15 UTC — run any due recurring schedule' },
  [QUEUE_NAMES.LATE_FEE_SWEEP]:             { pattern: '30 3 * * *',  description: 'Daily at 03:30 UTC — sweep overdue invoices for tiered late fees' },
  [QUEUE_NAMES.PAYMENT_PLAN_INSTALLMENTS]:  { pattern: '0 4 * * *',   description: 'Daily at 04:00 UTC — materialize due payment-plan installments' },
  [QUEUE_NAMES.WEBHOOK_DELIVERIES]:         { every: 60_000,           description: 'Every 60 seconds — retry pending webhook deliveries' },
  [QUEUE_NAMES.EMAIL_DELIVERIES]:           { every: 30_000,           description: 'Every 30 seconds — drain pending transactional emails' },
};
