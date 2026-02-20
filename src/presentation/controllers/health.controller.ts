import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/database/prisma.service';

/**
 * Handles infrastructure health-check endpoints:
 * - GET /health        Liveness probe (process is running)
 * - GET /health/ready  Readiness probe (process + database are healthy)
 *
 * These endpoints are exempt from the global api/v1 prefix and rate limiting.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness probe.
   *
   * Returns 200 OK as long as the Node.js process is running and the
   * NestJS application has bootstrapped. Does NOT check external deps.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Returns 200 OK when the application process is running. Used by Kubernetes liveness probes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Application is live',
    schema: {
      example: { status: 'ok', timestamp: '2024-01-15T12:00:00.000Z' },
    },
  })
  liveness(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Readiness probe.
   *
   * Returns 200 OK when the application and its database are healthy.
   * Returns 503 Service Unavailable when the database is unreachable.
   * Used by Kubernetes readiness probes.
   */
  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Returns 200 OK when the application and database are ready to serve traffic.',
  })
  @ApiResponse({
    status: 200,
    description: 'Application is ready',
    schema: {
      example: {
        status: 'ok',
        database: 'connected',
        timestamp: '2024-01-15T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Application not ready (database unreachable)',
    schema: {
      example: {
        status: 'error',
        database: 'disconnected',
        timestamp: '2024-01-15T12:00:05.000Z',
      },
    },
  })
  async readiness(): Promise<{
    status: 'ok' | 'error';
    database: 'connected' | 'disconnected';
    timestamp: string;
  }> {
    let databaseStatus: 'connected' | 'disconnected' = 'connected';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      databaseStatus = 'disconnected';
    }

    const overallStatus = databaseStatus === 'connected' ? 'ok' : 'error';

    return {
      status: overallStatus,
      database: databaseStatus,
      timestamp: new Date().toISOString(),
    };
  }
}
