import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty } from 'class-validator';

/**
 * Query DTO for GET /api/v1/transactions.
 */
export class GetTransactionHistoryQueryDto {
  @ApiProperty({
    description: 'User ID (UUID v4) to retrieve transactions for',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'user_id must be a valid UUID v4' })
  @IsNotEmpty({ message: 'user_id is required' })
  user_id: string;
}
