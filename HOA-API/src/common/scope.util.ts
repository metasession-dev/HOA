import { ResidentRoles } from '../shared/constants/roles';

export type Actor = { userId: string; role: string };

const RESIDENT_ROLE_SET: ReadonlySet<string> = new Set(ResidentRoles);

export function isResidentRole(role: string | undefined): boolean {
  return role ? RESIDENT_ROLE_SET.has(role) : false;
}

/**
 * For models with a direct `unit` relation (e.g. Invoice). Admins see everything;
 * residents see only items linked to a unit they actively occupy.
 */
export function scopeInvoiceWhere<T extends Record<string, any>>(baseWhere: T, actor: Actor): T {
  if (!isResidentRole(actor.role)) return baseWhere;
  return {
    ...baseWhere,
    unit: {
      occupancies: {
        some: {
          isActive: true,
          person: { userId: actor.userId },
        },
      },
    },
  };
}

/**
 * For models with a nested `invoice.unit` relation (e.g. Payment).
 */
export function scopePaymentWhere<T extends Record<string, any>>(baseWhere: T, actor: Actor): T {
  if (!isResidentRole(actor.role)) return baseWhere;
  return {
    ...baseWhere,
    invoice: {
      ...(baseWhere as any).invoice,
      unit: {
        occupancies: {
          some: {
            isActive: true,
            person: { userId: actor.userId },
          },
        },
      },
    },
  };
}

/**
 * For models with a direct `unit` relation (e.g. GatePass). Residents see only
 * passes for units they actively occupy.
 */
export function scopePassWhere<T extends Record<string, any>>(baseWhere: T, actor: Actor): T {
  if (!isResidentRole(actor.role)) return baseWhere;
  return {
    ...baseWhere,
    unit: {
      occupancies: {
        some: {
          isActive: true,
          person: { userId: actor.userId },
        },
      },
    },
  };
}

/**
 * Same shape as scopePassWhere — residents see violations only on their occupied units.
 */
export function scopeViolationWhere<T extends Record<string, any>>(baseWhere: T, actor: Actor): T {
  if (!isResidentRole(actor.role)) return baseWhere;
  return {
    ...baseWhere,
    unit: {
      occupancies: {
        some: {
          isActive: true,
          person: { userId: actor.userId },
        },
      },
    },
  };
}

/**
 * Phase 1.1 Requests scoping. Residents see:
 *   (a) requests they submitted themselves, OR
 *   (b) requests against a unit they actively occupy.
 *
 * The OR is important so a tenant occupying a unit can see admin-filed
 * requests against that unit (e.g. broken geyser logged by maintenance) AND
 * their own personal submissions that may not yet be linked to a unit.
 */
export function scopeRequestWhere<T extends Record<string, any>>(baseWhere: T, actor: Actor): T {
  if (!isResidentRole(actor.role)) return baseWhere;
  return {
    ...baseWhere,
    OR: [
      { submittedByUserId: actor.userId },
      {
        unit: {
          occupancies: {
            some: {
              isActive: true,
              person: { userId: actor.userId },
            },
          },
        },
      },
    ],
  };
}

/** Check whether the actor occupies a given unit (resident gate). */
export async function actorOccupiesUnit(
  prisma: any,
  actor: Actor,
  unitId: string,
): Promise<boolean> {
  if (!isResidentRole(actor.role)) return true;
  const occ = await prisma.unitOccupancy.findFirst({
    where: { unitId, isActive: true, person: { userId: actor.userId } },
  });
  return !!occ;
}
