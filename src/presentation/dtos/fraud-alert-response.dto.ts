import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FraudAlertOutput } from '../../application/dtos/fraud-alert.dto';

/**
 * DTO representing a single fraud alert in API responses.
 */
export class FraudAlertResponseDto {
  @ApiProperty({
    description: 'Unique alert ID',
    example: '660e8400-e29b-41d4-a716-446655440010',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({
    description: 'ID of the transaction that triggered this alert',
    example: '550e8400-e29b-41d4-a716-446655440005',
    format: 'uuid',
  })
  transaction_id: string;

  @ApiProperty({
    description: 'ID of the user associated with this alert',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  user_id: string;

  @ApiProperty({
    description: 'Type of fraud rule that was triggered',
    enum: ['HIGH_AMOUNT', 'VELOCITY_EXCEEDED'],
    example: 'HIGH_AMOUNT',
  })
  alert_type: string;

  @ApiProperty({
    description: 'Severity of the alert',
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    example: 'MEDIUM',
  })
  severity: string;

  @ApiProperty({
    description: 'Additional details about why the alert was triggered',
    example: { amount: 25000, threshold: 10000 },
    additionalProperties: true,
  })
  details: Record<string, unknown>;

  @ApiProperty({
    description: 'Whether the alert has been resolved',
    example: false,
    type: 'boolean',
  })
  resolved: boolean;

  @ApiPropertyOptional({
    description: 'Timestamp when the alert was resolved (null if unresolved)',
    example: '2024-01-15T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
    nullable: true,
  })
  resolved_at: string | null;

  @ApiPropertyOptional({
    description: 'Notes added when the alert was resolved (null if unresolved)',
    example: 'Verified with user, legitimate transaction',
    type: 'string',
    nullable: true,
  })
  resolution_notes: string | null;

  @ApiProperty({
    description: 'Timestamp when the alert was created (ISO 8601)',
    example: '2024-01-15T10:30:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  created_at: string;

  /**
   * Maps an application-layer use case output to a presentation-layer response DTO.
   *
   * @param output - The FraudAlertOutput from the use case
   * @returns A populated FraudAlertResponseDto
   */
  static fromUseCaseOutput(output: FraudAlertOutput): FraudAlertResponseDto {
    const dto = new FraudAlertResponseDto();
    dto.id = output.id;
    dto.transaction_id = output.transactionId;
    dto.user_id = output.userId;
    dto.alert_type = output.alertType;
    dto.severity = output.severity;
    dto.details = output.details;
    dto.resolved = output.resolved;
    dto.resolved_at = output.resolvedAt ? output.resolvedAt.toISOString() : null;
    dto.resolution_notes = output.resolutionNotes;
    dto.created_at = output.createdAt.toISOString();
    return dto;
  }
}
