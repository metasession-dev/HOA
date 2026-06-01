import { Prisma } from '@prisma/client';

/**
 * Phase 4: per-org monotonic invoice numbering.
 *
 * `Organization.invoiceSeq` is incremented atomically (Postgres row lock on the
 * UPDATE), so concurrent issuance never produces a duplicate INV-#####. Replaces
 * the old `invoice.count()+1` scheme, which collided under concurrency.
 *
 * Pass a transaction client when issuing inside a transaction (so the number is
 * rolled back with the invoice if the tx aborts); otherwise pass the base
 * Prisma client.
 */

type Db = Prisma.TransactionClient;

function format(seq: number): string {
  return `INV-${String(seq).padStart(5, '0')}`;
}

/** Reserve a single invoice number. */
export async function nextInvoiceNumber(db: Db, orgId: string): Promise<string> {
  const org = await db.organization.update({
    where: { id: orgId },
    data: { invoiceSeq: { increment: 1 } },
    select: { invoiceSeq: true },
  });
  return format(org.invoiceSeq);
}

/** Reserve a contiguous block of `count` invoice numbers (for batch generation). */
export async function reserveInvoiceNumbers(db: Db, orgId: string, count: number): Promise<string[]> {
  if (count <= 0) return [];
  const org = await db.organization.update({
    where: { id: orgId },
    data: { invoiceSeq: { increment: count } },
    select: { invoiceSeq: true },
  });
  const start = org.invoiceSeq - count + 1;
  return Array.from({ length: count }, (_, i) => format(start + i));
}
