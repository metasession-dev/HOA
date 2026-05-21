/**
 * The HOA.africa permission catalog.
 *
 * Format: `<module>.<entity>.<action>`. Used by:
 *   - CustomRole.permissions[] (what the role can do)
 *   - Forthcoming PermissionGuard (Phase 6) — currently @Roles() drives access.
 *
 * Be conservative about adding new permissions: every entry here is implicitly a
 * commitment to enforce it on every endpoint that touches that entity.
 */

export const PERMISSIONS = {
  // Finance
  'finance.invoice.view': 'View invoices',
  'finance.invoice.create': 'Issue invoices',
  'finance.invoice.update': 'Edit invoices',
  'finance.invoice.void': 'Void invoices',
  'finance.payment.view': 'View payments',
  'finance.payment.record': 'Log payments manually',
  'finance.payment.refund': 'Issue refunds',
  'finance.gl.view': 'View chart of accounts',
  'finance.gl.manage': 'Edit chart of accounts',
  'finance.journal.create': 'Post journal entries',
  'finance.journal.view': 'View journal entries',
  'finance.fund.manage': 'Manage funds',
  'finance.budget.view': 'View budgets',
  'finance.budget.manage': 'Create + edit budgets',
  'finance.budget.approve': 'Activate or close budgets',
  'finance.report.view': 'View financial reports',

  // Banking
  'banking.account.view': 'View bank accounts',
  'banking.account.manage': 'Add/edit bank accounts',
  'banking.transaction.import': 'Import statements',
  'banking.transaction.match': 'Match transactions',
  'banking.transaction.unmatch': 'Unmatch transactions',
  'banking.rule.manage': 'Manage categorization rules',
  'banking.reconciliation.lock': 'Lock reconciliations',

  // Payables
  'payables.vendor.view': 'View vendors',
  'payables.vendor.manage': 'Add/edit vendors',
  'payables.vendor.blacklist': 'Suspend/blacklist vendors',
  'payables.invoice.view': 'View vendor invoices',
  'payables.invoice.capture': 'Capture vendor invoices',
  'payables.invoice.approve': 'Approve vendor invoices',
  'payables.invoice.reject': 'Reject vendor invoices',
  'payables.invoice.pay': 'Mark invoices paid',
  'payables.approval_rule.manage': 'Manage approval routing',

  // Governance
  'governance.vote.view': 'View votes',
  'governance.vote.create': 'Create vote drafts',
  'governance.vote.open': 'Open votes for ballot casting',
  'governance.vote.close': 'Close votes + publish outcome',
  'governance.vote.cancel': 'Cancel votes',
  'governance.survey.view': 'View surveys',
  'governance.survey.manage': 'Create/open/close surveys',

  // Operations
  'operations.violation.view': 'View violations',
  'operations.violation.create': 'Log violations',
  'operations.violation.notice': 'Issue notices',
  'operations.violation.fine': 'Issue fines',
  'operations.violation.resolve': 'Resolve violations',
  'operations.appeal.decide': 'Decide appeals',
  'operations.gate_pass.view': 'View gate passes',
  'operations.gate_pass.create': 'Issue gate passes',
  'operations.gate_pass.revoke': 'Revoke gate passes',
  'operations.gate.operate': 'Operate gate console (entry/exit)',
  'operations.resale.view': 'View resale certificates',
  'operations.resale.manage': 'Create/issue/cancel resale certs',
  'operations.resale.share': 'Create attorney access links',
  'operations.document.view': 'View documents',
  'operations.document.manage': 'Upload/edit documents',
  'operations.communication.view': 'View communications history',
  'operations.communication.send': 'Send broadcasts',

  // Admin
  'admin.estate.view': 'View estates',
  'admin.estate.manage': 'Add/edit estates + units',
  'admin.person.view': 'View people directory',
  'admin.person.manage': 'Add/edit people',
  'admin.organization.manage': 'Edit organization settings',
  'admin.team.view': 'View team members + roles',
  'admin.team.invite': 'Send invitations',
  'admin.team.role.assign': 'Assign + remove roles',
  'admin.team.role.custom_create': 'Create custom roles',
  'admin.audit.view': 'View audit log',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isValidPermission(p: string): p is Permission {
  return p in PERMISSIONS;
}

/** Group permissions by module for the UI. */
export function permissionsByModule(): Record<string, Array<{ key: Permission; description: string }>> {
  const out: Record<string, Array<{ key: Permission; description: string }>> = {};
  for (const [k, description] of Object.entries(PERMISSIONS)) {
    const module = k.split('.')[0];
    out[module] ??= [];
    out[module].push({ key: k as Permission, description });
  }
  return out;
}
