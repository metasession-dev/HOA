import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Mutual-exclusion guard: a catalog charge (BillingType) may be billed by EITHER
 * the per-unit path (UnitBilling → Generate charges / activation) OR a recurring
 * schedule linked to it — never both while both are active. This makes it
 * impossible for the two billing paths to point at the same charge and double-bill.
 *
 * Call when ENABLING one path, naming which path you're turning on:
 *   - 'recurring'     → about to create/activate a schedule linked to this charge
 *   - 'unit_billing'  → about to activate the charge on units / generate it per-unit
 */
export async function assertNoBillingPathConflict(
  db: Prisma.TransactionClient,
  orgId: string,
  billingTypeId: string,
  enabling: 'recurring' | 'unit_billing',
): Promise<void> {
  if (enabling === 'recurring') {
    const ub = await db.unitBilling.findFirst({
      where: { billingTypeId, organizationId: orgId, isActive: true },
      select: { id: true },
    });
    if (ub) {
      throw new ConflictException(
        'This charge is already billed per-unit from the billing catalog. Deactivate it on units (Finance → Billing activation) before billing it with a recurring schedule, to avoid double billing.',
      );
    }
  } else {
    const sched = await db.recurringInvoiceSchedule.findFirst({
      where: { billingTypeId, organizationId: orgId, isActive: true },
      select: { id: true, name: true },
    });
    if (sched) {
      throw new ConflictException(
        `This charge is already billed by the recurring schedule "${sched.name}". Pause that schedule before billing this charge per-unit, to avoid double billing.`,
      );
    }
  }
}
