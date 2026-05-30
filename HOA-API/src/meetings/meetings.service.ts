import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';

const AUDIENCES = ['all_residents', 'owners', 'exco', 'everyone'] as const;
type Audience = (typeof AUDIENCES)[number];

// Roles considered "exco / board / leadership" for the exco audience.
const EXCO_ROLES = ['exco_member', 'exco_chairperson', 'hoa_admin', 'super_admin'];

type Recipient = { userId: string; email: string | null; firstName: string; lastName: string };

@Injectable()
export class MeetingsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private mail: MailService,
  ) {}

  async list(orgId: string) {
    return this.prisma.meeting.findMany({
      where: { organizationId: orgId },
      orderBy: { startsAt: 'desc' },
      take: 200,
    });
  }

  async get(id: string, orgId: string) {
    const m = await this.prisma.meeting.findFirst({ where: { id, organizationId: orgId } });
    if (!m) throw new NotFoundException('Meeting not found');
    return m;
  }

  async create(orgId: string, actor: { userId: string }, dto: any) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('startsAt and endsAt must be valid dates');
    }
    if (endsAt <= startsAt) throw new BadRequestException('endsAt must be after startsAt');
    if (!dto.title?.trim()) throw new BadRequestException('title is required');
    const audience: Audience = AUDIENCES.includes(dto.audience) ? dto.audience : 'all_residents';
    return this.prisma.meeting.create({
      data: {
        organizationId: orgId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        location: dto.location?.trim() || null,
        onlineUrl: dto.onlineUrl?.trim() || null,
        startsAt,
        endsAt,
        audience,
        createdBy: actor.userId,
      },
    });
  }

  async update(id: string, orgId: string, dto: any) {
    const m = await this.get(id, orgId);
    if (m.status === 'cancelled') throw new BadRequestException('Cannot edit a cancelled meeting');
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : m.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : m.endsAt;
    if (endsAt <= startsAt) throw new BadRequestException('endsAt must be after startsAt');
    return this.prisma.meeting.update({
      where: { id },
      data: {
        title: dto.title?.trim() ?? undefined,
        description: dto.description === undefined ? undefined : (dto.description?.trim() || null),
        location: dto.location === undefined ? undefined : (dto.location?.trim() || null),
        onlineUrl: dto.onlineUrl === undefined ? undefined : (dto.onlineUrl?.trim() || null),
        startsAt: dto.startsAt ? startsAt : undefined,
        endsAt: dto.endsAt ? endsAt : undefined,
        audience: AUDIENCES.includes(dto.audience) ? dto.audience : undefined,
      },
    });
  }

  /** Send (or re-send) calendar invites to the meeting's audience. */
  async send(id: string, orgId: string, actor: { userId: string; role: string }) {
    const m = await this.get(id, orgId);
    if (m.status === 'cancelled') throw new BadRequestException('Meeting is cancelled');

    const recipients = await this.resolveAudience(orgId, m.audience as Audience);
    const userIds = recipients.map((r) => r.userId);

    if (userIds.length > 0) {
      await this.notifications.enqueueFor({
        organizationId: orgId,
        recipientUserIds: userIds,
        type: 'meeting',
        title: `Meeting: ${m.title}`,
        body: `${this.whenText(m.startsAt, m.endsAt)}${m.onlineUrl ? ' · online' : m.location ? ` · ${m.location}` : ''}`,
        entityType: 'Meeting',
        entityId: m.id,
        actionUrl: m.onlineUrl || '/notifications',
      });
    }

    const icsUrl = `${this.apiBase()}/api/meetings/${m.id}/ics`;
    const googleCalUrl = this.googleCalUrl(m);
    let emailed = 0;
    for (const r of recipients) {
      if (!r.email) continue;
      try {
        await this.mail.enqueue(
          {
            organizationId: orgId,
            templateKey: 'meeting_invite',
            data: {
              recipientFirstName: r.firstName || 'there',
              title: m.title,
              whenText: this.whenText(m.startsAt, m.endsAt),
              location: m.location || undefined,
              onlineUrl: m.onlineUrl || undefined,
              description: m.description || undefined,
              googleCalUrl,
              icsUrl,
            },
            to: r.email,
            toName: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || undefined,
            toUserId: r.userId,
            entityType: 'Meeting',
            entityId: m.id,
          },
          // Force so a re-send (e.g. after a detail change) re-issues the invite.
          { force: true },
        );
        emailed++;
      } catch {
        // skip a bad address
      }
    }

    return this.prisma.meeting.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date(), invitedCount: recipients.length },
    });
  }

  async cancel(id: string, orgId: string) {
    const m = await this.get(id, orgId);
    if (m.status === 'cancelled') return m;
    const updated = await this.prisma.meeting.update({
      where: { id },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
    // Best-effort cancellation notice to whoever was invited.
    if (m.status === 'sent') {
      const recipients = await this.resolveAudience(orgId, m.audience as Audience);
      const userIds = recipients.map((r) => r.userId);
      if (userIds.length) {
        await this.notifications.enqueueFor({
          organizationId: orgId,
          recipientUserIds: userIds,
          type: 'meeting',
          title: `Cancelled: ${m.title}`,
          body: `The meeting on ${this.whenText(m.startsAt, m.endsAt)} has been cancelled.`,
          entityType: 'Meeting',
          entityId: m.id,
          actionUrl: '/notifications',
        });
      }
    }
    return updated;
  }

  /** RFC5545 .ics for a single meeting. */
  async buildIcs(id: string): Promise<{ filename: string; content: string }> {
    const m = await this.prisma.meeting.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Meeting not found');
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const dt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const descParts = [m.description || '', m.onlineUrl ? `Join: ${m.onlineUrl}` : ''].filter(Boolean);
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//HOA.africa//Meetings//EN',
      'CALSCALE:GREGORIAN',
      m.status === 'cancelled' ? 'METHOD:CANCEL' : 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:meeting-${m.id}@hoa.africa`,
      `DTSTAMP:${dt(new Date(m.updatedAt))}`,
      `DTSTART:${dt(new Date(m.startsAt))}`,
      `DTEND:${dt(new Date(m.endsAt))}`,
      `SUMMARY:${esc(m.title)}`,
      descParts.length ? `DESCRIPTION:${esc(descParts.join('\n'))}` : '',
      m.location || m.onlineUrl ? `LOCATION:${esc(m.location || m.onlineUrl || '')}` : '',
      m.onlineUrl ? `URL:${esc(m.onlineUrl)}` : '',
      m.status === 'cancelled' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean);
    return { filename: `meeting-${m.id}.ics`, content: lines.join('\r\n') };
  }

  // ---------- helpers ----------

  private apiBase(): string {
    return (
      process.env.API_PUBLIC_URL ||
      process.env.PUBLIC_API_URL ||
      (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:3003')
    ).replace(/\/$/, '');
  }

  private googleCalUrl(m: { title: string; description: string | null; location: string | null; onlineUrl: string | null; startsAt: Date; endsAt: Date }): string {
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const details = [m.description || '', m.onlineUrl ? `Join: ${m.onlineUrl}` : ''].filter(Boolean).join('\n\n');
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: m.title,
      dates: `${fmt(new Date(m.startsAt))}/${fmt(new Date(m.endsAt))}`,
      details,
      location: m.location || m.onlineUrl || '',
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  private whenText(start: Date, end: Date): string {
    const s = new Date(start);
    const e = new Date(end);
    const date = s.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const t = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${date}, ${t(s)}–${t(e)}`;
  }

  /** Resolve the invitee user contacts for an audience. */
  private async resolveAudience(orgId: string, audience: Audience): Promise<Recipient[]> {
    const userIds = new Set<string>();

    if (audience === 'all_residents' || audience === 'owners' || audience === 'everyone') {
      const occ = await this.prisma.unitOccupancy.findMany({
        where: {
          isActive: true,
          unit: { estate: { organizationId: orgId } },
          person: { userId: { not: null } },
          ...(audience === 'owners' ? { role: 'owner' } : {}),
        },
        select: { person: { select: { userId: true } } },
      });
      occ.forEach((o) => o.person?.userId && userIds.add(o.person.userId));
    }

    if (audience === 'exco' || audience === 'everyone') {
      const roleNames = audience === 'everyone' ? undefined : EXCO_ROLES;
      const roles = await this.prisma.userRole.findMany({
        where: {
          organizationId: orgId,
          ...(roleNames ? { role: { name: { in: roleNames } } } : {}),
        },
        select: { userId: true },
      });
      roles.forEach((r) => userIds.add(r.userId));
    }

    if (userIds.size === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: Array.from(userIds) }, isActive: true },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    return users.map((u) => ({ userId: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName }));
  }
}
