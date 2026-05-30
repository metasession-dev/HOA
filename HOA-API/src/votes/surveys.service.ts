import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Actor, isResidentRole } from '../common/scope.util';
import { CreateSurveyDto, SubmitSurveyResponseDto } from './dto/votes.dto';
import { createLlmProvider } from '../assistant/llm/provider';

const SURVEY_TRANSITIONS: Record<string, string[]> = {
  draft: ['open'],
  open: ['closed'],
  closed: [],
};

@Injectable()
export class SurveysService {
  constructor(private prisma: PrismaService) {}

  // ============ Templates ============

  /** Curated starting points — pre-built survey drafts admins can adapt. */
  templates() {
    const T = (name: string, description: string, title: string, sdesc: string, questions: any[]) => ({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      description,
      survey: { title, description: sdesc, anonymous: true, questions: this.normalizeQuestions(questions) },
    });
    return [
      T('Resident satisfaction', 'Annual happiness & service-quality check', 'Annual Resident Satisfaction Survey',
        'Help us understand what’s working and what to improve across the estate.', [
          { type: 'rating', label: 'Overall, how satisfied are you living here?', ratingMax: 5, required: true },
          { type: 'rating', label: 'How satisfied are you with security?', ratingMax: 5 },
          { type: 'rating', label: 'How satisfied are you with cleanliness & maintenance?', ratingMax: 5 },
          { type: 'mc', label: 'Which area should we prioritise next?', options: ['Security', 'Maintenance', 'Parking', 'Green spaces', 'Amenities'] },
          { type: 'text', label: 'What one change would most improve estate life?' },
        ]),
      T('Security & safety', 'Gauge safety perceptions and gaps', 'Security & Safety Review',
        'Your input helps us keep the estate safe.', [
          { type: 'rating', label: 'How safe do you feel in the estate?', ratingMax: 5, required: true },
          { type: 'mc', label: 'Have you had a security concern in the last 6 months?', options: ['No', 'Yes — minor', 'Yes — serious'] },
          { type: 'mc', label: 'Which would improve security most?', options: ['More patrols', 'Better lighting', 'Access control', 'CCTV coverage', 'Visitor management'] },
          { type: 'text', label: 'Any specific area or incident we should know about?' },
        ]),
      T('Amenities feedback', 'Usage and improvement ideas for shared facilities', 'Amenities & Facilities Feedback',
        'Tell us how you use our shared spaces.', [
          { type: 'mc', label: 'Which amenities do you use most?', options: ['Clubhouse', 'Pool', 'Gym', 'Park / play area', 'Braai area'] },
          { type: 'rating', label: 'How would you rate the condition of our amenities?', ratingMax: 5 },
          { type: 'mc', label: 'What new amenity would you value most?', options: ['Co-working space', 'Dog park', 'EV charging', 'Playground upgrade', 'None'] },
          { type: 'text', label: 'Any amenity that needs attention?' },
        ]),
      T('Levy & budget', 'Collect sentiment on proposed levy / budget changes', 'Levy & Budget Feedback',
        'We value your view on the proposed budget.', [
          { type: 'rating', label: 'How clearly do you understand how levies are spent?', ratingMax: 5 },
          { type: 'mc', label: 'How do you feel about the proposed levy adjustment?', options: ['Support', 'Neutral', 'Oppose', 'Need more info'] },
          { type: 'text', label: 'Where should the HOA focus its spending?' },
        ]),
      T('Community events', 'Plan events residents actually want', 'Community Events Interest',
        'Help us plan events the community enjoys.', [
          { type: 'mc', label: 'Which events interest you?', options: ['Family day', 'Market day', 'Fitness / wellness', 'Kids activities', 'Festive celebration'] },
          { type: 'mc', label: 'When do events suit you best?', options: ['Weekday evening', 'Saturday', 'Sunday'] },
          { type: 'text', label: 'Any event idea you’d like to see?' },
        ]),
    ];
  }

  // ============ AI generation ============

  /**
   * Generate a survey draft from a free-text prompt using the configured LLM
   * (Anthropic/OpenAI when a key is set, otherwise a sensible offline draft).
   * Returns an UNSAVED draft the admin reviews + edits before saving.
   */
  async generateDraft(orgId: string, dto: { prompt?: string; questionCount?: number }) {
    const prompt = (dto?.prompt || '').toString().trim();
    if (!prompt) throw new BadRequestException('prompt is required');
    const n = Math.min(15, Math.max(3, Number(dto.questionCount) || 6));
    const provider = createLlmProvider();
    const sys =
      'You design clear, unbiased surveys for a residential estate / homeowners association. ' +
      'Respond with ONLY a JSON object: {"title": string, "description": string, "questions": ' +
      '[{"type": "mc"|"rating"|"text", "label": string, "options"?: string[], "ratingMax"?: number, "required"?: boolean}]}. ' +
      `Produce about ${n} questions. Use "rating" (1–5) for satisfaction/agreement, "mc" with 3–6 concise options for choices, ` +
      'and "text" for open feedback. Keep each label under 140 characters. No commentary outside the JSON.';
    const user = `Create a resident survey about: ${prompt}`;
    try {
      const res = await provider.generate(
        [{ role: 'system', content: sys }, { role: 'user', content: user }],
        { temperature: 0.7, maxTokens: 1500 },
      );
      const parsed = this.safeParseSurvey(res.content);
      if (parsed) {
        return {
          title: String(parsed.title || `Survey: ${prompt}`).slice(0, 200),
          description: String(parsed.description || '').slice(0, 4000),
          anonymous: true,
          questions: this.normalizeQuestions(parsed.questions),
          generatedBy: provider.name,
        };
      }
    } catch {
      // fall through to offline draft
    }
    return this.fallbackSurvey(prompt);
  }

  private safeParseSurvey(content: string): any | null {
    if (!content) return null;
    try {
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      if (start < 0 || end <= start) return null;
      const obj = JSON.parse(content.slice(start, end + 1));
      if (obj && Array.isArray(obj.questions)) return obj;
    } catch {
      /* ignore */
    }
    return null;
  }

  private fallbackSurvey(prompt: string) {
    const topic = prompt.slice(0, 80);
    return {
      title: `Survey: ${topic}`,
      description: `We'd value your feedback on ${topic}.`,
      anonymous: true,
      generatedBy: 'offline',
      questions: this.normalizeQuestions([
        { type: 'rating', label: `Overall, how would you rate ${topic}?`, ratingMax: 5, required: true },
        { type: 'mc', label: 'How important is this to you?', options: ['Very important', 'Somewhat important', 'Neutral', 'Not important'] },
        { type: 'mc', label: 'How satisfied are you currently?', options: ['Very satisfied', 'Satisfied', 'Neutral', 'Dissatisfied', 'Very dissatisfied'] },
        { type: 'text', label: 'What would you most like us to improve?' },
      ]),
    };
  }

  /** Coerce arbitrary question shapes (template or LLM) into valid survey questions. */
  private normalizeQuestions(raw: any[]): any[] {
    const out: any[] = [];
    (raw || []).slice(0, 15).forEach((q: any, i: number) => {
      const type = ['mc', 'rating', 'text'].includes(q?.type) ? q.type : 'text';
      const label = String(q?.label ?? '').slice(0, 500).trim();
      if (!label) return;
      const base: any = { id: `q${i + 1}`, type, label, required: !!q?.required };
      if (type === 'mc') {
        const opts = (Array.isArray(q?.options) ? q.options : [])
          .map((o: any, j: number) => ({
            id: String.fromCharCode(97 + j),
            label: String(typeof o === 'string' ? o : o?.label ?? '').slice(0, 200).trim(),
          }))
          .filter((o: any) => o.label)
          .slice(0, 20);
        if (opts.length < 2) base.type = 'text';
        else base.options = opts;
      }
      if (base.type === 'rating') base.ratingMax = Math.min(10, Math.max(2, Number(q?.ratingMax) || 5));
      out.push(base);
    });
    return out.length ? out : [{ id: 'q1', type: 'text', label: 'Your feedback', required: false }];
  }

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
