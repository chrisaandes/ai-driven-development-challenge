import { ApiProperty } from '@nestjs/swagger';
import { TransactionResponseDto } from './transaction-response.dto';

/**
 * DTO for the GET /transactions response payload (inside the success envelope).
 */
export class TransactionHistoryResponseDto {
  @ApiProperty({
    description: 'List of transactions ordered by timestamp descending',
    type: [TransactionResponseDto],
  })
  transactions: TransactionResponseDto[];

  @ApiProperty({
    description: 'Total number of transactions in the list',
    example: 2,
    type: 'number',
  })
  total: number;
}
