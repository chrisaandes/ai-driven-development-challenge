import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApplicationModule } from '../application/application.module';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { TransactionController } from './controllers/transaction.controller';
import { WalletController } from './controllers/wallet.controller';
import { HealthController } from './controllers/health.controller';
import { GlobalExceptionFilter } from './filters/http-exception.filter';

/**
 * Presentation module — wires all HTTP controllers and the global exception filter.
 *
 * Imports:
 * - ApplicationModule  → provides use cases
 * - InfrastructureModule → provides PrismaService (used by HealthController)
 */
@Module({
  imports: [ApplicationModule, InfrastructureModule],
  controllers: [TransactionController, WalletController, HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class PresentationModule {}
