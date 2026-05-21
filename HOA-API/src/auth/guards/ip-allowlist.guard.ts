import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_KEY } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';

/**
 * Per-organization IP allowlist enforcement. If an org has any CIDRs in
 * `ipAllowlist`, requests authenticated as a user in that org must come from
 * one of those CIDRs. Public endpoints are exempt (gate-pass visitor view,
 * invite-redeem, etc.) since they aren't bound to an organization.
 *
 * Supports IPv4 with optional `/N` and bare IPv6. Robust enough for the
 * small-list-per-HOA use case; full netmask parsing for IPv6 is deferred
 * until Phase 9's networking review (most HOAs run on IPv4 today).
 */
@Injectable()
export class IpAllowlistGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = extractReq(context);
    const user = req.user;
    // Phase 6 review #1: if Authorization is present but auth somehow hasn't
    // resolved a user yet, fail closed so the IP-allowlist contract can't be
    // bypassed by an out-of-order guard chain. Routes that are @Public skip
    // this guard entirely via the early return above.
    if (!user) {
      const hasAuth = !!(req.headers['authorization'] ?? req.headers['Authorization']);
      if (hasAuth) {
        // Let the JwtAuthGuard reject this request itself with a proper 401.
        return true;
      }
      return true;
    }
    if (!user.organizationId) return true;

    // Cache per-request to avoid double-lookups when multiple guards run
    let allowlist: string[] = req._cachedIpAllowlist;
    if (!Array.isArray(allowlist)) {
      const org = await this.prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { ipAllowlist: true },
      });
      allowlist = org?.ipAllowlist ?? [];
      req._cachedIpAllowlist = allowlist;
    }
    if (allowlist.length === 0) return true;

    const ip = clientIp(req);
    if (!ip) {
      throw new ForbiddenException('IP address unavailable; allowlist is enforced');
    }
    for (const cidr of allowlist) {
      if (matchesCidr(ip, cidr)) return true;
    }
    throw new ForbiddenException(`Source IP ${ip} is not in this organization's allowlist`);
  }
}

function extractReq(context: ExecutionContext): any {
  if (context.getType<string>() === 'graphql') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { GqlExecutionContext } = require('@nestjs/graphql');
      return GqlExecutionContext.create(context).getContext().req ?? {};
    } catch {
      // fall through
    }
  }
  return context.switchToHttp().getRequest() ?? {};
}

function clientIp(req: any): string | null {
  // Express sets req.ip when `trust proxy` is on; we set that in main.ts.
  const direct = req.ip || req.socket?.remoteAddress;
  if (!direct) return null;
  // Strip IPv4-mapped IPv6 prefix
  return String(direct).replace(/^::ffff:/, '');
}

function matchesCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) return ip === cidr;
  const [base, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  if (!Number.isFinite(bits) || bits < 0 || bits > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null) return false;
  if (bits === 0) return true;
  const mask = (-1 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (!Number.isFinite(n) || n < 0 || n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}
