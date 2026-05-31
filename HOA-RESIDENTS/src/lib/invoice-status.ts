// Resident-facing invoice status vocabulary.
//
// The backend stores enterprise/accounting statuses (draft, sent, partial,
// paid, overdue, on_plan, voided). Residents shouldn't see internal jargon like
// "sent" — they care about what it means for them ("Awaiting payment"). This
// maps the raw status to a friendly label + a Badge variant, used everywhere a
// resident sees an invoice (list, detail, dashboard).

type BadgeVariant = 'muted' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary';

const MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: 'Not issued', variant: 'muted' },
  sent: { label: 'Awaiting payment', variant: 'info' },
  partial: { label: 'Partially paid', variant: 'warning' },
  paid: { label: 'Paid', variant: 'success' },
  overdue: { label: 'Overdue', variant: 'destructive' },
  on_plan: { label: 'On payment plan', variant: 'secondary' },
  voided: { label: 'Cancelled', variant: 'muted' },
};

export function residentInvoiceStatus(status: string): { label: string; variant: BadgeVariant } {
  return MAP[status] || { label: status, variant: 'secondary' };
}
