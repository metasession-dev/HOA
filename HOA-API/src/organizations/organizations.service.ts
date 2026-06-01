import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { MailService } from '../mail/mail.service';

const ENTERPRISE_URL = (
  process.env.APP_ENTERPRISE_URL || process.env.ENTERPRISE_BASE_URL || 'http://localhost:3005'
).replace(/\/$/, '');
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'dev@metasession.co';

// Step labels for the nudge email's "still to do" list.
const STEP_LABELS: Record<string, string> = {
  branding: 'Set your currency, timezone & branding',
  units: 'Add your units',
  residents: 'Invite residents to their portal',
  team: 'Invite your team',
  invoice: 'Issue your first levy or invoice',
};

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);
  constructor(private prisma: PrismaService, private mail: MailService) {}

  async findById(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { estates: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async update(id: string, data: { name?: string; country?: string; currency?: string; timezone?: string; language?: string; settings?: any }) {
    return this.prisma.organization.update({ where: { id }, data });
  }

  /**
   * Onboarding checklist — computed from live data so it self-completes as the
   * admin sets things up (and never needs manual ticking). Drives the
   * "Getting started" card in the admin console.
   */
  async getOnboarding(orgId: string) {
    const [org, units, teamRoles, teamInvites, residentInvites, residentUsers, invoices] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId }, select: { logoUrl: true, accentColor: true, brandingTagline: true } }),
      this.prisma.unit.count({ where: { estate: { organizationId: orgId } } }),
      this.prisma.userRole.count({ where: { organizationId: orgId, role: { name: { notIn: ['owner', 'tenant', 'vendor'] } } } }),
      this.prisma.invite.count({ where: { organizationId: orgId, kind: 'team_member' } }),
      this.prisma.invite.count({ where: { organizationId: orgId, kind: 'resident' } }),
      this.prisma.person.count({ where: { organizationId: orgId, userId: { not: null } } }),
      this.prisma.invoice.count({ where: { organizationId: orgId } }),
    ]);

    const steps = {
      branding: !!(org?.logoUrl || org?.accentColor || org?.brandingTagline),
      units: units > 0,
      team: teamRoles > 1 || teamInvites > 0,
      residents: residentInvites > 0 || residentUsers > 0,
      invoice: invoices > 0,
    };
    const total = Object.keys(steps).length;
    const done = Object.values(steps).filter(Boolean).length;
    return {
      steps,
      done,
      total,
      percent: Math.round((done / total) * 100),
      completed: done === total,
    };
  }

  /**
   * Daily job: send a single gentle "finish setting up" nudge to orgs that
   * registered a few days ago but haven't completed onboarding. Scoped to a
   * 3–14 day window so legacy orgs are never blasted, and guarded by
   * onboardingNudgeAt so it only ever sends once per org.
   */
  async sendOnboardingNudges(now: Date = new Date()) {
    const windowStart = new Date(now.getTime() - 14 * 86400000);
    const windowEnd = new Date(now.getTime() - 3 * 86400000);

    const orgs = await this.prisma.organization.findMany({
      where: {
        isActive: true,
        onboardingNudgeAt: null,
        createdAt: { gte: windowStart, lte: windowEnd },
      },
      select: { id: true, name: true },
    });

    let sent = 0;
    for (const org of orgs) {
      try {
        const status = await this.getOnboarding(org.id);
        // Mark as handled regardless so we never re-evaluate this org daily.
        await this.prisma.organization.update({
          where: { id: org.id },
          data: { onboardingNudgeAt: now },
        });
        if (status.completed) continue;

        const remaining = Object.entries(status.steps)
          .filter(([, ok]) => !ok)
          .map(([k]) => STEP_LABELS[k] || k);

        const admins = await this.prisma.userRole.findMany({
          where: { organizationId: org.id, role: { name: { in: ['hoa_admin', 'super_admin'] } } },
          select: { user: { select: { id: true, email: true, firstName: true } } },
        });
        const recipients = new Map<string, { email: string; firstName: string | null }>();
        for (const a of admins) {
          if (a.user?.email) recipients.set(a.user.email, { email: a.user.email, firstName: a.user.firstName });
        }

        const checklist = remaining.map((r) => `• ${r}`).join('\n');
        for (const r of recipients.values()) {
          await this.mail.enqueue({
            organizationId: org.id,
            templateKey: 'announcement',
            to: r.email,
            entityType: 'OrganizationNudge',
            entityId: org.id,
            data: {
              recipientFirstName: r.firstName || 'there',
              title: `Finish setting up ${org.name}`,
              message:
                `You're ${status.percent}% of the way there! A few quick steps will get ${org.name} fully up and running on HOA.africa:\n\n${checklist}\n\nIt only takes a few minutes — and once you're set up, levies, payments and resident communication run themselves. Need a hand? Just reply or reach us at ${SUPPORT_EMAIL}.`,
              ctaLabel: 'Finish setup',
              ctaUrl: `${ENTERPRISE_URL}/admin`,
            },
          });
        }
        sent++;
      } catch (err: any) {
        this.logger.warn(`onboarding nudge failed for org ${org.id}: ${err?.message ?? err}`);
      }
    }
    return { evaluated: orgs.length, nudged: sent };
  }

  /**
   * Phase 10.2 — branding settings exposed to the resident PWA and admin app.
   * Light validation: hex colour must be #RGB or #RRGGBB so the CSS variable
   * we inject can't smuggle in a stylesheet escape.
   */
  async updateBranding(
    id: string,
    data: {
      logoUrl?: string | null; accentColor?: string | null; brandingTagline?: string | null;
      emailFromName?: string | null; emailFromEmail?: string | null;
    },
  ) {
    if (data.accentColor && !/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(data.accentColor)) {
      throw new Error('accentColor must be a hex value like #RRGGBB');
    }
    if (data.emailFromEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.emailFromEmail)) {
      throw new Error('emailFromEmail must be a valid email address');
    }
    return this.prisma.organization.update({
      where: { id },
      data: {
        logoUrl: data.logoUrl === undefined ? undefined : data.logoUrl,
        accentColor: data.accentColor === undefined ? undefined : data.accentColor,
        brandingTagline: data.brandingTagline === undefined ? undefined : data.brandingTagline,
        emailFromName: data.emailFromName === undefined ? undefined : (data.emailFromName?.trim() || null),
        emailFromEmail: data.emailFromEmail === undefined ? undefined : (data.emailFromEmail?.trim().toLowerCase() || null),
      },
      select: {
        id: true, name: true, slug: true,
        logoUrl: true, accentColor: true, brandingTagline: true,
        emailFromName: true, emailFromEmail: true,
      },
    });
  }

  /** Public-safe branding payload — used by the resident login page before auth. */
  async getBrandingBySlug(slug: string) {
    return this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, logoUrl: true, accentColor: true, brandingTagline: true },
    });
  }

  async getDashboardStats(orgId: string) {
    const [totalEstates, totalUnits, totalInvoices, totalPayments, overdueInvoices] = await Promise.all([
      this.prisma.estate.count({ where: { organizationId: orgId } }),
      this.prisma.unit.count({ where: { estate: { organizationId: orgId } } }),
      this.prisma.invoice.count({ where: { organizationId: orgId } }),
      this.prisma.payment.count({ where: { invoice: { organizationId: orgId }, status: 'completed' } }),
      this.prisma.invoice.count({ where: { organizationId: orgId, status: 'overdue' } }),
    ]);

    const totalCollected = await this.prisma.payment.aggregate({
      where: { invoice: { organizationId: orgId }, status: 'completed' },
      _sum: { amount: true },
    });

    const totalOutstanding = await this.prisma.invoice.aggregate({
      where: { organizationId: orgId, status: { in: ['sent', 'partial', 'overdue'] } },
      _sum: { amount: true },
    });

    return {
      totalEstates,
      totalUnits,
      totalInvoices,
      totalPayments,
      overdueInvoices,
      totalCollected: totalCollected._sum.amount || 0,
      totalOutstanding: totalOutstanding._sum.amount || 0,
    };
  }
}
