import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientSession, Connection } from 'mongoose';

type TransactionCapabilityState = {
  checked: boolean;
  supported: boolean;
};

@Injectable()
export class MongoTransactionService {
  private readonly capabilityByConnection = new WeakMap<
    Connection,
    TransactionCapabilityState
  >();

  constructor(private readonly configService: ConfigService) {}

  async executeInTransaction<T>(
    connection: Connection,
    callback: (session: ClientSession) => Promise<T>,
    existingSession?: ClientSession,
  ): Promise<T> {
    if (existingSession) {
      return callback(existingSession);
    }

    const startedSession = await connection.startSession();
    try {
      const shouldUseTransactions = await this.canUseTransactions(connection);
      if (shouldUseTransactions) {
        try {
          let result!: T;
          await startedSession.withTransaction(async () => {
            result = await callback(startedSession);
          });
          return result;
        } catch (error) {
          if (!this.isTransactionUnsupportedError(error)) {
            throw error;
          }

          this.setCapability(connection, {
            checked: true,
            supported: false,
          });
        }
      }

      return await callback(startedSession);
    } finally {
      await startedSession.endSession();
    }
  }

  private async canUseTransactions(connection: Connection): Promise<boolean> {
    const cached = this.getCapability(connection);
    if (cached.checked) {
      return cached.supported;
    }

    const requiresTransactions = this.requiresTransactions();

    try {
      const db = connection.db;
      if (!db) {
        throw new Error('MongoDB connection is not ready');
      }

      const hello = await db.admin().command({ hello: 1 });
      const isReplicaSetMember = Boolean(hello?.setName);
      const isMongos = hello?.msg === 'isdbgrid';
      cached.supported = isReplicaSetMember || isMongos;
    } catch (error) {
      if (requiresTransactions) {
        throw new BadRequestException(
          `MongoDB transaction capability check failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }

      // Keep optimistic behavior for local standalone MongoDB development.
      cached.supported = true;
    } finally {
      cached.checked = true;
      this.setCapability(connection, cached);
    }

    if (!cached.supported && requiresTransactions) {
      throw new BadRequestException(
        'MongoDB transactions are required for this environment but are not supported',
      );
    }

    return cached.supported;
  }

  private getCapability(connection: Connection): TransactionCapabilityState {
    const existing = this.capabilityByConnection.get(connection);
    if (existing) {
      return existing;
    }

    const initial: TransactionCapabilityState = {
      checked: false,
      supported: true,
    };
    this.capabilityByConnection.set(connection, initial);
    return initial;
  }

  private setCapability(
    connection: Connection,
    state: TransactionCapabilityState,
  ): void {
    this.capabilityByConnection.set(connection, state);
  }

  private requiresTransactions(): boolean {
    const configuredRaw = this.configService.get<unknown>(
      'REQUIRE_DB_TRANSACTIONS',
    );
    const configured =
      typeof configuredRaw === 'string'
        ? configuredRaw.trim().toLowerCase()
        : undefined;
    if (configured === 'true') {
      return true;
    }
    if (configured === 'false') {
      return false;
    }

    const envRaw = this.configService.get<unknown>('NODE_ENV');
    const env =
      typeof envRaw === 'string' ? envRaw.trim().toLowerCase() : undefined;
    return env === 'production';
  }

  private isTransactionUnsupportedError(error: unknown): boolean {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';

    if (
      message.includes(
        'Transaction numbers are only allowed on a replica set member or mongos',
      )
    ) {
      return true;
    }

    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;

    return code === 20;
  }
}
