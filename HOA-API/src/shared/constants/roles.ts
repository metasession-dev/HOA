export const SystemRoles = {
  SUPER_ADMIN: 'super_admin',
  HOA_ADMIN: 'hoa_admin',
  PROPERTY_MANAGER: 'property_manager',
  FINANCE_OFFICER: 'finance_officer',
  EXCO_MEMBER: 'exco_member',
  EXCO_CHAIRPERSON: 'exco_chairperson',
  COMMUNICATIONS_MANAGER: 'communications_manager',
  GATE_SECURITY: 'gate_security',
  MAINTENANCE_COORDINATOR: 'maintenance_coordinator',
  EXTERNAL_ACCOUNTANT: 'external_accountant',
  OWNER: 'owner',
  TENANT: 'tenant',
  VENDOR: 'vendor',
} as const;

export type SystemRole = (typeof SystemRoles)[keyof typeof SystemRoles];

export const RoleDisplayNames: Record<SystemRole, string> = {
  [SystemRoles.SUPER_ADMIN]: 'Super Admin',
  [SystemRoles.HOA_ADMIN]: 'HOA Admin',
  [SystemRoles.PROPERTY_MANAGER]: 'Property Manager',
  [SystemRoles.FINANCE_OFFICER]: 'Finance Officer',
  [SystemRoles.EXCO_MEMBER]: 'Exco Member',
  [SystemRoles.EXCO_CHAIRPERSON]: 'Exco Chairperson',
  [SystemRoles.COMMUNICATIONS_MANAGER]: 'Communications Manager',
  [SystemRoles.GATE_SECURITY]: 'Gate / Security',
  [SystemRoles.MAINTENANCE_COORDINATOR]: 'Maintenance Coordinator',
  [SystemRoles.EXTERNAL_ACCOUNTANT]: 'External Accountant',
  [SystemRoles.OWNER]: 'Owner',
  [SystemRoles.TENANT]: 'Tenant',
  [SystemRoles.VENDOR]: 'Vendor',
};

export const AdminRoles: SystemRole[] = [
  SystemRoles.SUPER_ADMIN,
  SystemRoles.HOA_ADMIN,
  SystemRoles.PROPERTY_MANAGER,
];

export const FinanceRoles: SystemRole[] = [
  SystemRoles.SUPER_ADMIN,
  SystemRoles.HOA_ADMIN,
  SystemRoles.FINANCE_OFFICER,
  SystemRoles.EXTERNAL_ACCOUNTANT,
];

export const BoardRoles: SystemRole[] = [
  SystemRoles.SUPER_ADMIN,
  SystemRoles.HOA_ADMIN,
  SystemRoles.EXCO_MEMBER,
  SystemRoles.EXCO_CHAIRPERSON,
];

export const ResidentRoles: SystemRole[] = [
  SystemRoles.OWNER,
  SystemRoles.TENANT,
];

// Vendors are external suppliers with a self-service portal login (no resident
// or admin scope). They only ever see their own vendor profile + invoices.
export const VendorRoles: SystemRole[] = [SystemRoles.VENDOR];
