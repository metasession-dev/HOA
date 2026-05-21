import { Controller, Get, Query, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService, Range, Persona } from './dashboard.service';
import { CurrentUser } from '../common/decorators';
import { successResponse } from '../common/dto';

const VALID_RANGES: Range[] = ['day', 'week', 'month', 'quarter', 'year'];
const VALID_PERSONAS: Persona[] = ['admin', 'board', 'finance', 'gate', 'resident'];

// Only platform admins can switch personas — used so an hoa_admin can preview
// the board view without needing an exco account. Residents and exco members
// always see their own persona; the param is silently ignored for them.
const PERSONA_OVERRIDE_ROLES = new Set(['hoa_admin', 'super_admin', 'property_manager']);

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get()
  async getDashboard(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Query('range') range?: string,
    @Query('persona') personaParam?: string,
  ) {
    const r: Range = VALID_RANGES.includes(range as Range) ? (range as Range) : 'month';
    if (range && !VALID_RANGES.includes(range as Range)) {
      throw new BadRequestException(`range must be one of: ${VALID_RANGES.join(', ')}`);
    }

    // Optional persona override — lets admins view what the board / finance /
    // gate / resident persona sees, for oversight and audit. Validated +
    // gated to admin roles; non-admins requesting an override get 403 so we
    // surface the misuse rather than silently rendering their own persona.
    let personaOverride: Persona | undefined;
    if (personaParam) {
      if (!VALID_PERSONAS.includes(personaParam as Persona)) {
        throw new BadRequestException(`persona must be one of: ${VALID_PERSONAS.join(', ')}`);
      }
      if (!PERSONA_OVERRIDE_ROLES.has(role)) {
        throw new ForbiddenException('Only platform admins can switch dashboard persona');
      }
      personaOverride = personaParam as Persona;
    }

    return successResponse(
      await this.service.forActor({ userId, role, organizationId }, r, personaOverride),
    );
  }
}
