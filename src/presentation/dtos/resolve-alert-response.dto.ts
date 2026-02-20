import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for the PUT /fraud/alerts/:id/resolve response payload (inside the success envelope).
 */
export class ResolveAlertResponseDto {
  @ApiProperty({
    description: 'Alert ID',
    example: '660e8400-e29b-41d4-a716-446655440010',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({
    description: 'Resolution status (always true in this response)',
    example: true,
    type: 'boolean',
  })
  resolved: boolean;

  @ApiProperty({
    description: 'Timestamp when the alert was resolved (ISO 8601)',
    example: '2024-01-15T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  resolved_at: string;

  @ApiPropertyOptional({
    description: 'Resolution notes if provided',
    example: 'Verified with user, legitimate transaction',
    type: 'string',
    nullable: true,
  })
  resolution_notes: string | null;
}
