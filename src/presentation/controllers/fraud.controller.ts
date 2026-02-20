import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { ListFraudAlertsUseCase } from '../../application/use-cases/list-fraud-alerts.use-case';
import { GetUserAlertsUseCase } from '../../application/use-cases/get-user-alerts.use-case';
import { ResolveAlertUseCase } from '../../application/use-cases/resolve-alert.use-case';
import { FraudAlertResponseDto } from '../dtos/fraud-alert-response.dto';
import { FraudAlertListResponseDto } from '../dtos/fraud-alert-list-response.dto';
import { ListFraudAlertsQueryDto } from '../dtos/list-fraud-alerts-query.dto';
import { GetAlertsByUserParamsDto } from '../dtos/get-alerts-by-user-params.dto';
import { ResolveAlertParamsDto } from '../dtos/resolve-alert-params.dto';
import { ResolveAlertRequestDto } from '../dtos/resolve-alert-request.dto';
import { ResolveAlertResponseDto } from '../dtos/resolve-alert-response.dto';

/**
 * Handles fraud alert HTTP endpoints:
 * - GET  /api/v1/fraud/alerts           List all fraud alerts (optional resolved filter)
 * - GET  /api/v1/fraud/alerts/:userId   Get alerts for a specific user
 * - PUT  /api/v1/fraud/alerts/:id/resolve  Resolve a fraud alert
 */
@ApiTags('Fraud Detection')
@Controller('fraud')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class FraudController {
  constructor(
    private readonly listFraudAlertsUseCase: ListFraudAlertsUseCase,
    private readonly getUserAlertsUseCase: GetUserAlertsUseCase,
    private readonly resolveAlertUseCase: ResolveAlertUseCase,
  ) {}

  /**
   * Retrieve all fraud alerts, optionally filtered by resolution status.
   * Alerts are ordered by creation time descending (newest first).
   */
  @Get('alerts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all fraud alerts',
    description:
      'Retrieve all fraud alerts in the system. Optionally filter by resolution status. Ordered newest first.',
  })
  @ApiQuery({
    name: 'resolved',
    required: false,
    description: 'Filter by resolution status. Must be "true" or "false". Omit to return all.',
    enum: ['true', 'false'],
    example: 'false',
  })
  @ApiResponse({
    status: 200,
    description: 'Fraud alerts retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          alerts: [
            {
              id: '660e8400-e29b-41d4-a716-446655440010',
              transaction_id: '550e8400-e29b-41d4-a716-446655440005',
              user_id: '550e8400-e29b-41d4-a716-446655440001',
              alert_type: 'HIGH_AMOUNT',
              severity: 'MEDIUM',
              details: { amount: 25000, threshold: 10000 },
              resolved: false,
              resolved_at: null,
              resolution_notes: null,
              created_at: '2024-01-15T10:30:00.000Z',
            },
          ],
          total: 1,
        },
        meta: { timestamp: '2024-01-15T12:00:00.000Z', correlationId: '' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid resolved query parameter value' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async listFraudAlerts(
    @Query() query: ListFraudAlertsQueryDto,
  ): Promise<{ success: true; data: FraudAlertListResponseDto; meta: { timestamp: string } }> {
    const resolvedFilter =
      query.resolved !== undefined ? query.resolved === 'true' : undefined;

    const output = await this.listFraudAlertsUseCase.execute({
      resolved: resolvedFilter,
    });

    const data: FraudAlertListResponseDto = {
      alerts: output.alerts.map(FraudAlertResponseDto.fromUseCaseOutput),
      total: output.total,
    };

    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * Retrieve all fraud alerts associated with a specific user.
   * Alerts are ordered by creation time descending (newest first).
   */
  @Get('alerts/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get fraud alerts by user',
    description:
      'Retrieve all fraud alerts associated with a specific user. Ordered newest first.',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID (UUID v4)',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @ApiResponse({
    status: 200,
    description: 'User fraud alerts retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          alerts: [],
          total: 0,
        },
        meta: { timestamp: '2024-01-15T12:00:00.000Z', correlationId: '' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid UUID format for userId path parameter' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getAlertsByUser(
    @Param() params: GetAlertsByUserParamsDto,
  ): Promise<{ success: true; data: FraudAlertListResponseDto; meta: { timestamp: string } }> {
    const output = await this.getUserAlertsUseCase.execute({
      userId: params.userId,
    });

    const data: FraudAlertListResponseDto = {
      alerts: output.alerts.map(FraudAlertResponseDto.fromUseCaseOutput),
      total: output.total,
    };

    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * Mark a fraud alert as resolved with optional resolution notes.
   * Returns 404 if the alert does not exist.
   * Returns 422 if the alert has already been resolved.
   */
  @Put('alerts/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve a fraud alert',
    description:
      'Mark a fraud alert as resolved. Optionally include resolution notes describing the action taken.',
  })
  @ApiParam({
    name: 'id',
    description: 'Alert ID (UUID v4)',
    example: '660e8400-e29b-41d4-a716-446655440010',
  })
  @ApiBody({ type: ResolveAlertRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Alert resolved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '660e8400-e29b-41d4-a716-446655440010',
          resolved: true,
          resolved_at: '2024-01-15T12:00:00.000Z',
          resolution_notes: 'Verified with user, legitimate transaction',
        },
        meta: { timestamp: '2024-01-15T12:00:00.123Z', correlationId: '' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid UUID format for id path parameter or validation error',
  })
  @ApiResponse({
    status: 404,
    description: 'Fraud alert not found',
  })
  @ApiResponse({
    status: 422,
    description: 'Alert has already been resolved',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async resolveAlert(
    @Param() params: ResolveAlertParamsDto,
    @Body() body: ResolveAlertRequestDto,
  ): Promise<{ success: true; data: ResolveAlertResponseDto; meta: { timestamp: string } }> {
    const output = await this.resolveAlertUseCase.execute({
      alertId: params.id,
      resolutionNotes: body.resolution_notes,
    });

    const data: ResolveAlertResponseDto = {
      id: output.id,
      resolved: output.resolved,
      resolved_at: output.resolvedAt ? output.resolvedAt.toISOString() : new Date().toISOString(),
      resolution_notes: output.resolutionNotes,
    };

    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
