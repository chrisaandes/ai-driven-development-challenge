import { Module } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import { PrismaWalletRepository } from './repositories/prisma-wallet.repository';
import { PrismaTransactionRepository } from './repositories/prisma-transaction.repository';
import { PrismaFraudAlertRepository } from './repositories/prisma-fraud-alert.repository';
import { INJECTION_TOKENS } from '../domain/interfaces/injection-tokens';

@Module({
  providers: [
    PrismaService,
    {
      provide: INJECTION_TOKENS.WALLET_REPOSITORY,
      useClass: PrismaWalletRepository,
    },
    {
      provide: INJECTION_TOKENS.TRANSACTION_REPOSITORY,
      useClass: PrismaTransactionRepository,
    },
    {
      provide: INJECTION_TOKENS.FRAUD_ALERT_REPOSITORY,
      useClass: PrismaFraudAlertRepository,
    },
  ],
  exports: [
    PrismaService,
    INJECTION_TOKENS.WALLET_REPOSITORY,
    INJECTION_TOKENS.TRANSACTION_REPOSITORY,
    INJECTION_TOKENS.FRAUD_ALERT_REPOSITORY,
  ],
})
export class InfrastructureModule {}
