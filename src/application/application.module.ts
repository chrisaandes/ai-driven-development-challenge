import { Module } from '@nestjs/common';
import { DomainModule } from '../domain/domain.module';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { ProcessTransactionUseCase } from './use-cases/process-transaction.use-case';
import { GetBalanceUseCase } from './use-cases/get-balance.use-case';
import { GetTransactionHistoryUseCase } from './use-cases/get-transaction-history.use-case';
import { ListFraudAlertsUseCase } from './use-cases/list-fraud-alerts.use-case';
import { GetUserAlertsUseCase } from './use-cases/get-user-alerts.use-case';
import { ResolveAlertUseCase } from './use-cases/resolve-alert.use-case';

@Module({
  imports: [DomainModule, InfrastructureModule],
  providers: [
    ProcessTransactionUseCase,
    GetBalanceUseCase,
    GetTransactionHistoryUseCase,
    ListFraudAlertsUseCase,
    GetUserAlertsUseCase,
    ResolveAlertUseCase,
  ],
  exports: [
    ProcessTransactionUseCase,
    GetBalanceUseCase,
    GetTransactionHistoryUseCase,
    ListFraudAlertsUseCase,
    GetUserAlertsUseCase,
    ResolveAlertUseCase,
  ],
})
export class ApplicationModule {}
