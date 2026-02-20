import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ProcessTransactionUseCase } from '../../application/use-cases/process-transaction.use-case';
import { GetTransactionHistoryUseCase } from '../../application/use-cases/get-transaction-history.use-case';
import { CreateTransactionRequestDto } from '../dtos/create-transaction-request.dto';
import { GetTransactionHistoryQueryDto } from '../dtos/get-transaction-history-query.dto';
import { TransactionResponseDto } from '../dtos/transaction-response.dto';
import { TransactionHistoryResponseDto } from '../dtos/transaction-history-response.dto';

/**
 * Handles transaction-related HTTP endpoints:
 * - POST /api/v1/transactions   Process deposit or withdrawal (idempotent)
 * - GET  /api/v1/transactions   Get transaction history for a user
 */
@ApiTags('Transactions')
@Controller('transactions')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class TransactionController {
  constructor(
    private readonly processTransactionUseCase: ProcessTransactionUseCase,
    private readonly getTransactionHistoryUseCase: GetTransactionHistoryUseCase,
  ) {}

  /**
   * Process a financial transaction (deposit or withdrawal).
   *
   * The transaction_id field is used as an idempotency key:
   * - First submission → 201 Created
   * - Duplicate with same payload → 200 OK (original result returned)
   * - Duplicate with different payload → 409 Conflict
   */
  @Post()
  @ApiOperation({
    summary: 'Process a transaction (deposit or withdraw)',
    description:
      'Process a deposit or withdrawal on a user wallet. The transaction_id is the idempotency key.',
  })
  @ApiBody({ type: CreateTransactionRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Transaction processed successfully (first submission)',
    schema: {
      example: {
        success: true,
        data: {
          transaction_id: '550e8400-e29b-41d4-a716-446655440000',
          type: 'deposit',
          amount: 100.5,
          balance_after: 100.5,
          timestamp: '2024-01-15T10:30:00.000Z',
        },
        meta: { timestamp: '2024-01-15T10:30:00.123Z', correlationId: '' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Duplicate transaction (idempotent replay — original result returned)',
  })
  @ApiResponse({ status: 400, description: 'Validation error — invalid input data' })
  @ApiResponse({
    status: 409,
    description: 'Transaction ID conflict — same ID submitted with different payload',
  })
  @ApiResponse({
    status: 422,
    description: 'Business rule violation (e.g., insufficient balance)',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async processTransaction(
    @Body() dto: CreateTransactionRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.processTransactionUseCase.execute({
      transactionId: dto.transaction_id,
      userId: dto.user_id,
      amount: dto.amount,
      type: dto.type.toUpperCase() as 'DEPOSIT' | 'WITHDRAW',
      timestamp: new Date(dto.timestamp),
    });

    const data = TransactionResponseDto.fromUseCaseOutput(result);
    const statusCode = result.isNew ? HttpStatus.CREATED : HttpStatus.OK;

    res.status(statusCode).json({
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    });
  }

  /**
   * Retrieve transaction history for a user, newest first.
   *
   * Returns an empty list when the user has no transactions.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get transaction history for a user',
    description: 'Returns all transactions for the given user_id, ordered newest first.',
  })
  @ApiQuery({
    name: 'user_id',
    required: true,
    description: 'User UUID v4',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction history retrieved successfully',
    schema: {
      example: {
        success: true,
        data: { transactions: [], total: 0 },
        meta: { timestamp: '2024-01-15T11:05:00.000Z' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Missing or invalid user_id query parameter' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getTransactionHistory(
    @Query() query: GetTransactionHistoryQueryDto,
  ): Promise<{ success: true; data: TransactionHistoryResponseDto; meta: { timestamp: string } }> {
    const output = await this.getTransactionHistoryUseCase.execute({
      userId: query.user_id,
    });

    const data: TransactionHistoryResponseDto = {
      transactions: output.transactions.map(TransactionResponseDto.fromHistoryItem),
      total: output.total,
    };

    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
