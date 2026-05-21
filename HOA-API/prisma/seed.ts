import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const HOA_GL_ACCOUNTS = [
  // Income
  { code: '4000', name: 'Levy Income', type: 'income' },
  { code: '4010', name: 'Special Levy Income', type: 'income' },
  { code: '4020', name: 'Interest on Late Payments', type: 'income' },
  { code: '4030', name: 'Facility Hire Income', type: 'income' },
  { code: '4040', name: 'Parking Fee Income', type: 'income' },
  // Expenses
  { code: '5000', name: 'Security Services', type: 'expense' },
  { code: '5010', name: 'Landscaping & Gardening', type: 'expense' },
  { code: '5020', name: 'Maintenance & Repairs', type: 'expense' },
  { code: '5030', name: 'Utilities - Electricity', type: 'expense' },
  { code: '5040', name: 'Utilities - Water', type: 'expense' },
  { code: '5050', name: 'Insurance', type: 'expense' },
  { code: '5060', name: 'Management Fees', type: 'expense' },
  { code: '5070', name: 'Legal Fees', type: 'expense' },
  { code: '5080', name: 'Audit Fees', type: 'expense' },
  { code: '5090', name: 'Bank Charges', type: 'expense' },
  // Reserves
  { code: '6000', name: 'Reserve Fund Contribution', type: 'expense' },
  { code: '6010', name: 'Sinking Fund', type: 'expense' },
  // Assets
  { code: '1000', name: 'Bank - Operating Account', type: 'asset' },
  { code: '1010', name: 'Bank - Reserve Account', type: 'asset' },
  { code: '1020', name: 'Accounts Receivable - Levies', type: 'asset' },
  { code: '1030', name: 'Prepaid Expenses', type: 'asset' },
  // Liabilities
  { code: '2000', name: 'Accounts Payable', type: 'liability' },
  { code: '2010', name: 'Deferred Income', type: 'liability' },
  { code: '2020', name: 'VAT Payable', type: 'liability' },
  // Equity
  { code: '3000', name: 'Accumulated Surplus', type: 'equity' },
  { code: '3010', name: 'Reserve Fund Balance', type: 'equity' },
];

async function main() {
  console.log('Seeding database...');

  // Create system roles
  const roles = await Promise.all([
    prisma.role.upsert({
      where: { name: 'super_admin' },
      update: {},
      create: {
        name: 'super_admin',
        displayName: 'Super Admin',
        permissions: ['*'],
        isSystem: true,
      },
    }),
    prisma.role.upsert({
      where: { name: 'hoa_admin' },
      update: {},
      create: {
        name: 'hoa_admin',
        displayName: 'HOA Admin',
        permissions: ['*'],
        isSystem: true,
      },
    }),
    prisma.role.upsert({
      where: { name: 'property_manager' },
      update: {},
      create: {
        name: 'property_manager',
        displayName: 'Property Manager',
        permissions: [
          'management.*', 'financial.invoices.*', 'financial.payments.view',
          'financial.reports.view', 'communications.*', 'visitors.*',
        ],
        isSystem: true,
      },
    }),
    prisma.role.upsert({
      where: { name: 'finance_officer' },
      update: {},
      create: {
        name: 'finance_officer',
        displayName: 'Finance Officer',
        permissions: ['financial.*'],
        isSystem: true,
      },
    }),
    prisma.role.upsert({
      where: { name: 'exco_member' },
      update: {},
      create: {
        name: 'exco_member',
        displayName: 'Exco Member',
        permissions: [
          'financial.*.view', 'management.*.view',
          'communications.broadcast.view', 'admin.audit.view',
        ],
        isSystem: true,
      },
    }),
    prisma.role.upsert({
      where: { name: 'owner' },
      update: {},
      create: {
        name: 'owner',
        displayName: 'Owner',
        permissions: [
          'financial.invoices.view', 'financial.payments.view',
          'management.documents.view', 'management.requests.view',
          'visitors.passes.create', 'visitors.passes.view',
        ],
        isSystem: true,
      },
    }),
    prisma.role.upsert({
      where: { name: 'tenant' },
      update: {},
      create: {
        name: 'tenant',
        displayName: 'Tenant',
        permissions: [
          'financial.invoices.view', 'financial.payments.view',
          'management.documents.view', 'management.requests.view',
          'visitors.passes.create', 'visitors.passes.view',
        ],
        isSystem: true,
      },
    }),
  ]);

  // Create demo admin user
  const passwordHash = await bcrypt.hash('Admin@123', 12);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@hoa.africa' },
    update: {},
    create: {
      email: 'admin@hoa.africa',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      emailVerified: new Date(),
    },
  });

  // Create demo organization
  const org = await prisma.organization.upsert({
    where: { slug: 'sunset-estate-hoa' },
    update: {},
    create: {
      name: 'Sunset Estate HOA',
      slug: 'sunset-estate-hoa',
      country: 'ZA',
      currency: 'ZAR',
      timezone: 'Africa/Johannesburg',
      language: 'en',
    },
  });

  // Assign admin role
  await prisma.userRole.upsert({
    where: {
      userId_roleId_organizationId: {
        userId: adminUser.id,
        roleId: roles[1].id, // hoa_admin
        organizationId: org.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: roles[1].id,
      organizationId: org.id,
    },
  });

  // Create GL accounts for the org
  for (const account of HOA_GL_ACCOUNTS) {
    await prisma.gLAccount.upsert({
      where: {
        organizationId_code: {
          organizationId: org.id,
          code: account.code,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        code: account.code,
        name: account.name,
        type: account.type,
        isSystem: true,
      },
    });
  }

  // Create demo estate
  const estate = await prisma.estate.create({
    data: {
      organizationId: org.id,
      name: 'Sunset Villas',
      address: '123 Sunset Drive, Sandton, Johannesburg',
      totalUnits: 20,
    },
  });

  // Create demo units
  for (let i = 1; i <= 20; i++) {
    await prisma.unit.create({
      data: {
        estateId: estate.id,
        unitNumber: `${i}`,
        block: i <= 10 ? 'A' : 'B',
        floor: Math.ceil(i / 4),
        type: 'apartment',
        areaSqm: 85 + Math.floor(Math.random() * 40),
      },
    });
  }

  console.log('Seed completed successfully!');
  console.log(`Demo login: admin@hoa.africa / Admin@123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
