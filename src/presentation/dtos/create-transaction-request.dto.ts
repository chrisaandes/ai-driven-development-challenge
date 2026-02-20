import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  Min,
  Max,
  IsIn,
  IsISO8601,
} from 'class-validator';

/**
 * DTO for creating a new transaction (deposit or withdrawal).
 * The transaction_id serves as an idempotency key.
 */
export class CreateTransactionRequestDto {
  @ApiProperty({
    description: 'Unique transaction ID (UUID v4) used as idempotency key',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'transaction_id must be a valid UUID v4' })
  @IsNotEmpty({ message: 'transaction_id is required' })
  transaction_id: string;

  @ApiProperty({
    description: 'User ID (UUID v4) identifying the wallet owner',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'user_id must be a valid UUID v4' })
  @IsNotEmpty({ message: 'user_id is required' })
  user_id: string;

  @ApiProperty({
    description: 'Transaction amount. Must be positive with at most 2 decimal places.',
    example: 100.5,
    minimum: 0.01,
    maximum: 999999999.99,
    type: 'number',
  })
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'amount must be a number with at most 2 decimal places' },
  )
  @IsPositive({ message: 'amount must be greater than zero' })
  @Min(0.01, { message: 'Minimum transaction amount is 0.01' })
  @Max(999999999.99, { message: 'Maximum transaction amount is 999,999,999.99' })
  amount: number;

  @ApiProperty({
    description: 'Transaction type: deposit to add funds, withdraw to remove funds',
    enum: ['deposit', 'withdraw'],
    example: 'deposit',
  })
  @IsIn(['deposit', 'withdraw'], {
    message: 'type must be either "deposit" or "withdraw"',
  })
  @IsNotEmpty({ message: 'type is required' })
  type: string;

  @ApiProperty({
    description: 'Client-side timestamp when the transaction was initiated (ISO 8601)',
    example: '2024-01-15T10:30:00Z',
    type: 'string',
    format: 'date-time',
  })
  @IsISO8601({ strict: true }, { message: 'timestamp must be a valid ISO 8601 date string' })
  @IsNotEmpty({ message: 'timestamp is required' })
  timestamp: string;
}
