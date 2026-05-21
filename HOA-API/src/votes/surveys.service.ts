import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Actor, isResidentRole } from '../common/scope.util';
import { CreateSurveyDto, SubmitSurveyResponseDto } from './dto/votes.dto';

const SURVEY_TRANSITIONS: Record<string, string[]> = {
  draft: ['open'],
  open: ['closed'],
  closed: [],
};

@Injectable()
export class SurveysService {
  constructor(private prisma: PrismaService) {}

  async list(orgId: string, actor: Actor) {
    const baseWhere: any = { organizationId: orgId };
    if (isResidentRole(actor.role)) baseWhere.status = { in: ['open', 'closed'] };
    return this.prisma.survey.findMany({
      where: baseWhere,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { _count: { select: { responses: true } } },
    });
  }

  async findById(id: string, orgId: string, actor: Actor) {
    const s = await this.prisma.survey.findFirst({ where: { id, organizationId: orgId } });
    if (!s) throw new NotFoundException('Survey not found');
    if (isResidentRole(actor.role) && s.status === 'draft') throw new NotFoundException('Survey not found');

    // Has the actor already submitted?
    let hasSubmitted = false;
    if (isResidentRole(actor.role) && !s.anonymous) {
      const existing = await this.prisma.surveyResponse.findFirst({
        where: { surveyId: id, respondentUserId: actor.userId },
      });
      hasSubmitted = !!existing;
    }
    return { ...s, hasSubmitted };
  }

  async create(orgId: string, actor: Actor, dto: CreateSurveyDto) {
    // Validate question shape per type
    const seen = new Set<string>();
    for (const q of dto.questions) {
      if (seen.has(q.id)) throw new BadRequestException(`Duplicate question id: ${q.id}`);
      seen.add(q.id);
      if (q.type === 'mc' && (!q.options || q.options.length < 2)) {
        throw new BadRequestException(`MC question ${q.id} needs at least 2 options`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const survey = await tx.survey.create({
        data: {
          organizationId: orgId,
          title: dto.title,
          description: dto.description,
          questions: dto.questions as any,
          anonymous: dto.anonymous ?? true,
          opensAt: dto.opensAt ? new Date(dto.opensAt) : null,
          closesAt: dto.closesAt ? new Date(dto.closesAt) : null,
          createdBy: actor.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'create',
          entityType: 'Survey',
          entityId: survey.id,
          changes: { after: { title: dto.title, questionCount: dto.questions.length } } as any,
        },
      });
      return survey;
    });
  }

  async transition(id: string, orgId: string, actor: Actor, next: 'open' | 'closed') {
    const s = await this.prisma.survey.findFirst({ where: { id, organizationId: orgId } });
    if (!s) throw new NotFoundException('Survey not found');
    if (!SURVEY_TRANSITIONS[s.status]?.includes(next)) {
      throw new ConflictException(`Cannot transition survey from ${s.status} to ${next}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.survey.update({ where: { id }, data: { status: next } });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: next,
          entityType: 'Survey',
          entityId: id,
          changes: { before: { status: s.status }, after: { status: next } } as any,
        },
      });
      return updated;
    });
  }

  async submit(id: string, orgId: string, actor: Actor, dto: SubmitSurveyResponseDto) {
    const s = await this.prisma.survey.findFirst({ where: { id, organizationId: orgId } });
    if (!s) throw new NotFoundException('Survey not found');
    if (s.status !== 'open') throw new ConflictException(`Survey not open (currently ${s.status})`);
    if (s.opensAt && new Date() < s.opensAt) throw new ConflictException('Survey has not opened yet');
    if (s.closesAt && new Date() > s.closesAt) throw new ConflictException('Survey has closed');

    // Validate answers shape against questions
    const questions = (s.questions as any[]) || [];
    const questionById = new Map(questions.map((q) => [q.id, q]));
    for (const a of dto.answers) {
      const q = questionById.get(a.questionId);
      if (!q) throw new BadRequestException(`Unknown question id: ${a.questionId}`);
      if (q.required && (a.value === null || a.value === undefined || a.value === '')) {
        throw new BadRequestException(`Question ${q.id} is required`);
      }
      if (q.type === 'mc' && Array.isArray(a.value)) {
        const validOpts = new Set((q.options || []).map((o: any) => o.id));
        for (const v of a.value) {
          if (!validOpts.has(v)) throw new BadRequestException(`Invalid option for ${q.id}: ${v}`);
        }
      }
      if (q.type === 'rating') {
        const max = q.ratingMax ?? 5;
        const n = Number(a.value);
        if (!Number.isFinite(n) || n < 1 || n > max) {
          throw new BadRequestException(`Rating for ${q.id} must be between 1 and ${max}`);
        }
      }
    }
    // Check all required questions answered
    const answeredIds = new Set(dto.answers.map((a) => a.questionId));
    for (const q of questions) {
      if (q.required && !answeredIds.has(q.id)) {
        throw new BadRequestException(`Required question not answered: ${q.id}`);
      }
    }

    try {
      return await this.prisma.surveyResponse.create({
        data: {
          surveyId: id,
          respondentUserId: s.anonymous ? null : actor.userId,
          answers: dto.answers as any,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('You have already responded to this survey');
      }
      throw err;
    }
  }

  async results(id: string, orgId: string, _actor: Actor) {
    const s = await this.prisma.survey.findFirst({ where: { id, organizationId: orgId } });
    if (!s) throw new NotFoundException('Survey not found');
    const responses = await this.prisma.surveyResponse.findMany({
      where: { surveyId: id },
      select: { answers: true, submittedAt: true },
    });
    const questions = (s.questions as any[]) || [];
    const totals: Record<string, any> = {};
    for (const q of questions) {
      if (q.type === 'mc') {
        const counts: Record<string, number> = {};
        for (const r of responses) {
          const a = (r.answers as any[]).find((x) => x.questionId === q.id);
          if (!a) continue;
          const vals = Array.isArray(a.value) ? a.value : [a.value];
          for (const v of vals) counts[v] = (counts[v] || 0) + 1;
        }
        totals[q.id] = {
          type: 'mc',
          options: (q.options || []).map((o: any) => ({ id: o.id, label: o.label, count: counts[o.id] || 0 })),
        };
      } else if (q.type === 'rating') {
        const values: number[] = [];
        for (const r of responses) {
          const a = (r.answers as any[]).find((x) => x.questionId === q.id);
          if (!a) continue;
          const n = Number(a.value);
          if (Number.isFinite(n)) values.push(n);
        }
        const avg = values.length ? values.reduce((s, n) => s + n, 0) / values.length : 0;
        totals[q.id] = { type: 'rating', count: values.length, average: Math.round(avg * 100) / 100 };
      } else {
        // text — surface count only by default (free-text)
        const samples = responses
          .map((r) => (r.answers as any[]).find((x) => x.questionId === q.id))
          .filter((a) => a && typeof a.value === 'string' && a.value.length > 0)
          .map((a) => a.value)
          .slice(0, 50);
        totals[q.id] = { type: 'text', count: samples.length, samples };
      }
    }
    return {
      success: true,
      data: {
        surveyId: id,
        status: s.status,
        responseCount: responses.length,
        totals,
      },
    };
  }
}
