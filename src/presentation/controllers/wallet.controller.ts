import { Controller, Get, Param, HttpCode, HttpStatus, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { GetBalanceUseCase } from '../../application/use-cases/get-balance.use-case';
import { GetBalanceParamsDto } from '../dtos/get-balance-params.dto';
import { BalanceResponseDto } from '../dtos/balance-response.dto';

/**
 * Handles wallet-related HTTP endpoints:
 * - GET /api/v1/wallets/:userId/balance   Retrieve current wallet balance
 */
@ApiTags('Wallets')
@Controller('wallets')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class WalletController {
  constructor(private readonly getBalanceUseCase: GetBalanceUseCase) {}

  /**
   * Retrieve the current balance of a user's wallet.
   *
   * Returns 404 when no wallet exists for the given userId (the user has never transacted).
   */
  @Get(':userId/balance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get wallet balance',
    description: 'Returns the current balance for the specified user wallet.',
  })
  @ApiParam({
    name: 'userId',
    required: true,
    description: 'User UUID v4',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @ApiResponse({
    status: 200,
    description: 'Balance retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          user_id: '550e8400-e29b-41d4-a716-446655440001',
          balance: 50.5,
          last_updated: '2024-01-15T11:00:00.000Z',
        },
        meta: { timestamp: '2024-01-15T11:05:00.000Z' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid UUID format for userId' })
  @ApiResponse({ status: 404, description: 'Wallet not found for user' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getWalletBalance(
    @Param() params: GetBalanceParamsDto,
  ): Promise<{ success: true; data: BalanceResponseDto; meta: { timestamp: string } }> {
    const output = await this.getBalanceUseCase.execute({ userId: params.userId });

    const data: BalanceResponseDto = {
      user_id: output.userId,
      balance: output.balance,
      last_updated: output.lastUpdated.toISOString(),
    };

    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
