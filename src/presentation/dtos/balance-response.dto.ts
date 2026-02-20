import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for the GET /wallets/:userId/balance response payload (inside the success envelope).
 */
export class BalanceResponseDto {
  @ApiProperty({
    description: 'User ID (UUID v4)',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  user_id: string;

  @ApiProperty({
    description: 'Current wallet balance',
    example: 50.5,
    type: 'number',
  })
  balance: number;

  @ApiProperty({
    description: 'Timestamp of the last balance update (ISO 8601)',
    example: '2024-01-15T11:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  last_updated: string;
}
