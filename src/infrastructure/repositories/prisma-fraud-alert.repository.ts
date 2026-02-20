import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { IFraudAlertRepository } from '../../domain/interfaces/fraud-alert-repository.interface';
import { FraudAlert, FraudAlertType, FraudAlertSeverity } from '../../domain/entities/fraud-alert.entity';

/**
 * Prisma-backed implementation of IFraudAlertRepository.
 *
 * Handles persistence and retrieval of fraud alert records.
 * Maps between the Prisma FraudAlert model and the FraudAlert domain entity.
 */
@Injectable()
export class PrismaFraudAlertRepository implements IFraudAlertRepository {
  private readonly logger = new Logger(PrismaFraudAlertRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists a new fraud alert entity.
   *
   * @param alert - The FraudAlert entity to persist
   */
  async save(alert: FraudAlert): Promise<void> {
    await this.prisma.fraudAlert.create({
      data: {
        id: alert.id,
        transactionId: alert.transactionId,
        userId: alert.userId,
        alertType: alert.alertType as 'HIGH_AMOUNT' | 'VELOCITY',
        severity: alert.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        details: alert.details as object,
        resolved: alert.resolved,
        resolvedAt: alert.resolvedAt,
        resolutionNotes: alert.resolutionNotes,
        createdAt: alert.createdAt,
      },
    });

    this.logger.debug(
      `FraudAlert saved: id=${alert.id} type=${alert.alertType} severity=${alert.severity}`,
    );
  }

  /**
   * Finds all fraud alerts, optionally filtered by resolved status.
   * Results are ordered newest first.
   *
   * @param options - Optional filter: { resolved: boolean } to filter by resolution status
   * @returns Array of FraudAlert entities ordered by createdAt descending
   */
  async findAll(options?: { resolved?: boolean }): Promise<FraudAlert[]> {
    const records = await this.prisma.fraudAlert.findMany({
      where:
        options?.resolved !== undefined
          ? { resolved: options.resolved }
          : undefined,
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  /**
   * Finds all fraud alerts for a specific user, newest first.
   *
   * @param userId - The user's UUID
   * @returns Array of FraudAlert entities for that user
   */
  async findByUserId(userId: string): Promise<FraudAlert[]> {
    const records = await this.prisma.fraudAlert.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  /**
   * Finds a single fraud alert by its ID.
   *
   * @param id - The alert's UUID
   * @returns The FraudAlert entity if found, null otherwise
   */
  async findById(id: string): Promise<FraudAlert | null> {
    const record = await this.prisma.fraudAlert.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  /**
   * Maps a Prisma fraud alert record to a FraudAlert domain entity.
   *
   * @param record - The raw Prisma fraud alert record
   * @returns A reconstituted FraudAlert entity
   */
  private toDomain(record: {
    id: string;
    transactionId: string;
    userId: string;
    alertType: string;
    severity: string;
    details: unknown;
    resolved: boolean;
    resolvedAt: Date | null;
    resolutionNotes: string | null;
    createdAt: Date;
  }): FraudAlert {
    return FraudAlert.reconstitute({
      id: record.id,
      transactionId: record.transactionId,
      userId: record.userId,
      alertType: record.alertType as FraudAlertType,
      severity: record.severity as FraudAlertSeverity,
      details: (record.details as Record<string, unknown>) ?? {},
      resolved: record.resolved,
      resolvedAt: record.resolvedAt,
      resolutionNotes: record.resolutionNotes,
      createdAt: record.createdAt,
    });
  }
}
