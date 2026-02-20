import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Path parameters DTO for GET /api/v1/fraud/alerts/:userId.
 */
export class GetAlertsByUserParamsDto {
  @ApiProperty({
    description: 'User ID (UUID v4)',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  userId: string;
}
