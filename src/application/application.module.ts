import { Module } from '@nestjs/common';
import { DomainModule } from '../domain/domain.module';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { ProcessTransactionUseCase } from './use-cases/process-transaction.use-case';
import { GetBalanceUseCase } from './use-cases/get-balance.use-case';
import { GetTransactionHistoryUseCase } from './use-cases/get-transaction-history.use-case';

@Module({
  imports: [DomainModule, InfrastructureModule],
  providers: [
    ProcessTransactionUseCase,
    GetBalanceUseCase,
    GetTransactionHistoryUseCase,
  ],
  exports: [
    ProcessTransactionUseCase,
    GetBalanceUseCase,
    GetTransactionHistoryUseCase,
  ],
})
export class ApplicationModule {}
