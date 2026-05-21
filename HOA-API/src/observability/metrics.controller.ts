import { Controller, Get, Header, Res, UnauthorizedException, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators';
import { MetricsService } from './metrics.service';

/**
 * Prometheus scrape endpoint. Public when METRICS_BEARER is unset (suitable
 * for behind-VPC scrapes), guarded by a static bearer token otherwise. Not a
 * normal-user-facing route, so we deliberately bypass the global JwtAuthGuard
 * via @Public + an in-method bearer check.
 */
@ApiTags('Observability')
@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get('metrics')
  @Header('Cache-Control', 'no-store')
  async scrape(@Req() req: Request, @Res() res: Response) {
    const expected = process.env.METRICS_BEARER;
    if (expected) {
      const auth = req.headers['authorization'];
      if (!auth || auth !== `Bearer ${expected}`) {
        throw new UnauthorizedException('Invalid metrics bearer token.');
      }
    }
    res.setHeader('Content-Type', this.metrics.contentType());
    res.send(await this.metrics.render());
  }
}
