import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FraudDetectionService } from './services/fraud-detection.service';
import { INJECTION_TOKENS } from './interfaces/injection-tokens';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: INJECTION_TOKENS.FRAUD_CONFIG,
      useFactory: (configService: ConfigService) => ({
        amountThreshold: configService.get<number>('FRAUD_AMOUNT_THRESHOLD', 10000),
        velocityWindowMinutes: configService.get<number>('FRAUD_VELOCITY_WINDOW_MINUTES', 5),
        velocityMaxTransactions: configService.get<number>('FRAUD_VELOCITY_MAX_TRANSACTIONS', 10),
      }),
      inject: [ConfigService],
    },
    {
      provide: INJECTION_TOKENS.FRAUD_DETECTION_SERVICE,
      useFactory: (config) => new FraudDetectionService(config),
      inject: [INJECTION_TOKENS.FRAUD_CONFIG],
    },
  ],
  exports: [INJECTION_TOKENS.FRAUD_DETECTION_SERVICE, INJECTION_TOKENS.FRAUD_CONFIG],
})
export class DomainModule {}
