import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', 'dev-secret-change-me'),
    });
  }

  async validate(payload: any) {
    // sessionVersion check: every token carries the User.sessionVersion in
    // effect when it was minted. An admin can force-logout every session for
    // a user (Session.forceLogoutAll) by bumping the version; the next
    // request from a stale token fails here.
    if (payload.sv !== undefined) {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { sessionVersion: true, isActive: true },
      });
      if (!user || !user.isActive) throw new UnauthorizedException('Account no longer active');
      if (user.sessionVersion !== payload.sv) {
        throw new UnauthorizedException('Session has been revoked');
      }
    }
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organizationId,
      sid: payload.sid,
      sv: payload.sv,
    };
  }
}
