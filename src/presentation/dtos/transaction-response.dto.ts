import { ApiProperty } from '@nestjs/swagger';
import { ProcessTransactionOutput } from '../../application/dtos/process-transaction.dto';
import { TransactionHistoryItem } from '../../application/dtos/get-history.dto';

/**
 * DTO representing a single transaction in API responses.
 * Used by both POST /transactions (single) and GET /transactions (list).
 */
export class TransactionResponseDto {
  @ApiProperty({
    description: 'Unique transaction ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  transaction_id: string;

  @ApiProperty({
    description: 'Transaction type',
    enum: ['deposit', 'withdraw'],
    example: 'deposit',
  })
  type: string;

  @ApiProperty({
    description: 'Transaction amount',
    example: 100.5,
    type: 'number',
  })
  amount: number;

  @ApiProperty({
    description: 'Wallet balance after this transaction was processed',
    example: 200.5,
    type: 'number',
  })
  balance_after: number;

  @ApiProperty({
    description: 'Timestamp when the transaction was processed (ISO 8601)',
    example: '2024-01-15T10:30:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  timestamp: string;

  /**
   * Maps a ProcessTransactionOutput to a TransactionResponseDto.
   */
  static fromUseCaseOutput(output: ProcessTransactionOutput): TransactionResponseDto {
    const dto = new TransactionResponseDto();
    dto.transaction_id = output.transactionId;
    dto.type = output.type.toLowerCase();
    dto.amount = output.amount;
    dto.balance_after = output.balanceAfter;
    dto.timestamp = output.timestamp.toISOString();
    return dto;
  }

  /**
   * Maps a TransactionHistoryItem to a TransactionResponseDto.
   */
  static fromHistoryItem(item: TransactionHistoryItem): TransactionResponseDto {
    const dto = new TransactionResponseDto();
    dto.transaction_id = item.transactionId;
    dto.type = item.type.toLowerCase();
    dto.amount = item.amount;
    dto.balance_after = item.balanceAfter;
    dto.timestamp = item.timestamp.toISOString();
    return dto;
  }
}
