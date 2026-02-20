import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Path parameters DTO for PUT /api/v1/fraud/alerts/:id/resolve.
 */
export class ResolveAlertParamsDto {
  @ApiProperty({
    description: 'Alert ID (UUID v4)',
    example: '660e8400-e29b-41d4-a716-446655440010',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'id must be a valid UUID v4' })
  id: string;
}
