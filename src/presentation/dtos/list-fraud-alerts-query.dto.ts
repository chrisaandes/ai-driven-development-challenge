import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsIn } from 'class-validator';

/**
 * Query parameters DTO for GET /api/v1/fraud/alerts.
 * Allows optional filtering by resolution status.
 */
export class ListFraudAlertsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by resolution status',
    enum: ['true', 'false'],
    example: 'false',
  })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'resolved must be "true" or "false"' })
  resolved?: string;
}
