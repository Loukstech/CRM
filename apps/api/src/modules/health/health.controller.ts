import { Controller, Get, HttpStatus, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @Public()
  @ApiOperation({ summary: 'Le processus répond' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @Public()
  @ApiOperation({ summary: 'Le processus peut servir des requêtes (base de données joignable)' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'NOT_READY', 'Base de données injoignable.');
    }
    return { status: 'ok', checks: { database: 'ok' } };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
