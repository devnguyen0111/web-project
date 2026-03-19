import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  Transaction,
  TransactionType,
} from '../wallet/schemas/transaction.schema';
import { WalletService } from '../wallet/wallet.service';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import { SubscriptionHistoryQueryDto } from './dto/subscription-history-query.dto';
import {
  BillingCycle,
  SUBSCRIPTION_BASE_POST_LIMIT,
  SubscriptionPlanCode,
  calculatePlanPriceByCycle,
  getSubscriptionPlanDefinition,
  listSubscriptionPlans,
  toCanonicalPlanCode,
} from './subscription.constants';
import {
  calculateSubscriptionQuota,
  markReminderSent,
  markRenewalFailed,
  normalizeSubscription,
  purchaseSubscriptionPlan,
  renewSubscriptionPlan,
  shouldSendReminder,
  toLegacyMonthsCycle,
} from './subscription.util';
import { createDefaultSubscription } from './schemas/subscription.schema';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  private transactionCapabilityChecked = false;

  private transactionsSupported = true;

  private renewalProcessing = false;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<Transaction>,
    @InjectConnection() private readonly connection: Connection,
    private readonly walletService: WalletService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  getPlans() {
    return listSubscriptionPlans().map((plan) => ({
      ...plan,
      monthlyPostLimit: plan.extraPosts + SUBSCRIPTION_BASE_POST_LIMIT,
      cyclePricing: {
        monthly: calculatePlanPriceByCycle(plan.code, BillingCycle.MONTHLY),
        quarterly: calculatePlanPriceByCycle(plan.code, BillingCycle.QUARTERLY),
        yearly: calculatePlanPriceByCycle(plan.code, BillingCycle.YEARLY),
      },
    }));
  }

  async getMySubscription(userId: string) {
    const user = await this.findUserOrFail(userId);
    const normalizedSubscription = normalizeSubscription(user.subscription);
    const quota = calculateSubscriptionQuota(normalizedSubscription);

    if (this.subscriptionChanged(user.subscription, normalizedSubscription)) {
      user.subscription = normalizedSubscription as never;
      await user.save();
    }

    return {
      subscription: normalizedSubscription,
      quota,
      plans: this.getPlans(),
      activePerks: this.getActivePerks(normalizedSubscription.planCode),
    };
  }

  async purchaseMySubscription(userId: string, payload: RenewSubscriptionDto) {
    const requestedPlanCode = this.parseRequestedPlanCode(payload.planCode);
    const legacyMonths =
      payload.months && Number.isFinite(payload.months)
        ? Math.max(1, Math.floor(payload.months))
        : undefined;
    const billingCycle =
      payload.billingCycle ?? toLegacyMonthsCycle(legacyMonths ?? 1);

    let totalCostCoins = 0;
    if (legacyMonths && !payload.billingCycle) {
      const plan = getSubscriptionPlanDefinition(requestedPlanCode);
      if (legacyMonths === 3 || legacyMonths === 12) {
        totalCostCoins = calculatePlanPriceByCycle(
          requestedPlanCode,
          toLegacyMonthsCycle(legacyMonths),
        ).cyclePriceCoins;
      } else {
        totalCostCoins = plan.monthlyPriceCoins * legacyMonths;
      }
    } else {
      totalCostCoins = calculatePlanPriceByCycle(
        requestedPlanCode,
        billingCycle,
      ).cyclePriceCoins;
    }

    const coinToVndRate = this.getCoinToVndRate();
    const totalCostAmount = this.toWalletAmount(totalCostCoins, coinToVndRate);

    const overview = await this.executeInTransaction(async (session) => {
      const user = await this.findUserOrFail(userId, session);
      const now = new Date();
      const currentSubscription = normalizeSubscription(user.subscription, now);
      const nextSubscription =
        legacyMonths && !payload.billingCycle
          ? renewSubscriptionPlan(
              currentSubscription,
              requestedPlanCode,
              legacyMonths,
              now,
            )
          : purchaseSubscriptionPlan(
              currentSubscription,
              requestedPlanCode,
              billingCycle,
              legacyMonths,
              now,
            );

      if (totalCostAmount > 0) {
        await this.walletService.subscribe(
          userId,
          totalCostAmount,
          {
            description: `Subscription ${nextSubscription.planName} purchase (${billingCycle})`,
            note: `Subscription plan ${nextSubscription.planCode}`,
            reference: {
              model: 'subscription',
              id: userId,
            },
            idempotencyKey: payload.idempotencyKey,
            metadata: {
              planCode: nextSubscription.planCode,
              billingCycle,
              months: legacyMonths,
              monthlyPriceCoins: nextSubscription.monthlyPriceCoins,
              totalCostCoins,
              totalCostAmount,
              coinToVndRate,
              transactionType: TransactionType.SUBSCRIPTION,
            },
          },
          session,
        );
      }

      user.subscription = nextSubscription as never;
      await user.save({ session });

      const quota = calculateSubscriptionQuota(nextSubscription);
      return {
        subscription: nextSubscription,
        quota,
        plans: this.getPlans(),
        activePerks: this.getActivePerks(nextSubscription.planCode),
      };
    });

    await this.notifySubscriptionRenewed(userId, overview.subscription, {
      chargedCoins: totalCostCoins,
      billingCycle,
    });

    return overview;
  }

  async setAutoRenew(userId: string, enabled: boolean) {
    return this.executeInTransaction(async (session) => {
      const user = await this.findUserOrFail(userId, session);
      const now = new Date();
      const subscription = normalizeSubscription(user.subscription, now);

      if (subscription.planCode === SubscriptionPlanCode.FREE) {
        throw new BadRequestException(
          'Free plan does not support auto renew settings',
        );
      }

      subscription.autoRenew = enabled;
      subscription.cancelAtPeriodEnd = enabled ? false : subscription.cancelAtPeriodEnd;
      user.subscription = subscription as never;
      await user.save({ session });

      return {
        subscription,
        quota: calculateSubscriptionQuota(subscription),
        plans: this.getPlans(),
        activePerks: this.getActivePerks(subscription.planCode),
      };
    });
  }

  async setCancelAtPeriodEnd(userId: string, cancel: boolean) {
    return this.executeInTransaction(async (session) => {
      const user = await this.findUserOrFail(userId, session);
      const now = new Date();
      const subscription = normalizeSubscription(user.subscription, now);

      if (subscription.planCode === SubscriptionPlanCode.FREE) {
        throw new BadRequestException(
          'Free plan does not support cancel-at-period-end',
        );
      }

      subscription.cancelAtPeriodEnd = cancel;
      if (cancel) {
        subscription.autoRenew = false;
      }

      user.subscription = subscription as never;
      await user.save({ session });

      return {
        subscription,
        quota: calculateSubscriptionQuota(subscription),
        plans: this.getPlans(),
        activePerks: this.getActivePerks(subscription.planCode),
      };
    });
  }

  async getMySubscriptionHistory(
    userId: string,
    query: SubscriptionHistoryQueryDto,
  ): Promise<PaginatedResponseDto<Record<string, unknown>>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const filter = {
      userId: new Types.ObjectId(userId),
      type: TransactionType.SUBSCRIPTION,
    };

    const [items, total] = await Promise.all([
      this.transactionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.transactionModel.countDocuments(filter),
    ]);

    const mapped = items.map((item) => {
      const plain = item.toObject({ virtuals: true }) as Record<
        string,
        unknown
      >;
      const metadata =
        plain.metadata && typeof plain.metadata === 'object'
          ? (plain.metadata as Record<string, unknown>)
          : {};
      return {
        ...plain,
        planCode: metadata.planCode ?? 'unknown',
        billingCycle: metadata.billingCycle ?? BillingCycle.MONTHLY,
        totalCostCoins: metadata.totalCostCoins ?? null,
        months: metadata.months ?? null,
      };
    });

    return new PaginatedResponseDto(mapped, total, page, limit);
  }

  async consumePostQuota(
    userId: string,
    amount = 1,
    session?: ClientSession,
  ): Promise<{
    subscription: ReturnType<typeof normalizeSubscription>;
    quota: ReturnType<typeof calculateSubscriptionQuota>;
  }> {
    const normalizedAmount = Math.max(Math.floor(amount), 0);
    if (normalizedAmount <= 0) {
      const user = await this.findUserOrFail(userId, session);
      const subscription = normalizeSubscription(user.subscription);
      return {
        subscription,
        quota: calculateSubscriptionQuota(subscription),
      };
    }

    return this.executeInTransaction(async (activeSession) => {
      const user = await this.findUserOrFail(userId, activeSession);
      const normalizedSubscription = normalizeSubscription(
        user.subscription,
        new Date(),
      );
      const quota = calculateSubscriptionQuota(normalizedSubscription);

      if (quota.remainingPosts < normalizedAmount) {
        throw new ForbiddenException(
          `Monthly post quota reached for ${normalizedSubscription.planName} plan`,
        );
      }

      normalizedSubscription.postsUsedInPeriod =
        quota.usedPosts + normalizedAmount;
      user.subscription = normalizedSubscription as never;
      await user.save({ session: activeSession });

      return {
        subscription: normalizedSubscription,
        quota: calculateSubscriptionQuota(normalizedSubscription),
      };
    }, session);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async processAutoRenewSubscriptions() {
    if (this.renewalProcessing) {
      return;
    }

    this.renewalProcessing = true;
    const now = new Date();

    try {
      const candidates = await this.userModel
        .find({
          'subscription.planCode': { $ne: SubscriptionPlanCode.FREE },
        })
        .select({ _id: 1, email: 1, subscription: 1 })
        .exec();

      for (const candidate of candidates) {
        try {
          const current = normalizeSubscription(candidate.subscription, now);
          let next = current;
          let changed = false;

          if (shouldSendReminder(next, now, 7)) {
            await this.sendRenewalReminder(candidate.id, candidate.email, next, 7);
            next = markReminderSent(next, 7, now);
            changed = true;
          }

          if (shouldSendReminder(next, now, 3)) {
            await this.sendRenewalReminder(candidate.id, candidate.email, next, 3);
            next = markReminderSent(next, 3, now);
            changed = true;
          }

          const expiredAt =
            next.expiresAt &&
            now.getTime() >= new Date(next.expiresAt).getTime();
          const graceExpired =
            next.gracePeriodEndsAt &&
            now.getTime() >= new Date(next.gracePeriodEndsAt).getTime();

          if (expiredAt && (next.cancelAtPeriodEnd || !next.autoRenew)) {
            await this.notifySubscriptionExpired(candidate.id, candidate.email, next);
            next = createDefaultSubscription(now);
            changed = true;
          } else if (expiredAt && next.autoRenew) {
            const renewResult = await this.tryAutoRenew(candidate.id, candidate.email, next, now);
            next = renewResult.subscription;
            changed = renewResult.changed || changed;
          } else if (
            next.renewalFailedAt &&
            next.gracePeriodEndsAt &&
            graceExpired
          ) {
            await this.notifySubscriptionExpired(candidate.id, candidate.email, next);
            next = createDefaultSubscription(now);
            changed = true;
          }

          if (changed) {
            candidate.subscription = next as never;
            await candidate.save();
          }
        } catch (error) {
          this.logger.error(
            `Failed processing auto renew for user=${candidate.id}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        }
      }
    } finally {
      this.renewalProcessing = false;
    }
  }

  private async tryAutoRenew(
    userId: string,
    email: string,
    subscription: ReturnType<typeof normalizeSubscription>,
    now: Date,
  ): Promise<{
    changed: boolean;
    subscription: ReturnType<typeof normalizeSubscription>;
  }> {
    const pricing = calculatePlanPriceByCycle(
      subscription.planCode,
      subscription.billingCycle,
    );
    const totalCostCoins = pricing.cyclePriceCoins;
    const coinToVndRate = this.getCoinToVndRate();
    const totalCostAmount = this.toWalletAmount(totalCostCoins, coinToVndRate);

    if (totalCostAmount <= 0) {
      const renewed = purchaseSubscriptionPlan(
        subscription,
        subscription.planCode,
        subscription.billingCycle,
        undefined,
        now,
      );
      await this.notifySubscriptionRenewed(userId, renewed, {
        chargedCoins: 0,
        billingCycle: subscription.billingCycle,
        emailOverride: email,
      });
      return { changed: true, subscription: renewed };
    }

    const renewalId =
      subscription.expiresAt?.toISOString() ?? `${now.getTime()}`;
    const idempotencyKey = `subscription:auto-renew:${userId}:${renewalId}`;

    try {
      await this.walletService.subscribe(userId, totalCostAmount, {
        description: `Subscription auto-renew ${subscription.planName} (${subscription.billingCycle})`,
        note: `Auto renew ${subscription.planCode}`,
        reference: {
          model: 'subscription',
          id: userId,
        },
        idempotencyKey,
        metadata: {
          planCode: subscription.planCode,
          billingCycle: subscription.billingCycle,
          totalCostCoins,
          totalCostAmount,
          coinToVndRate,
          autoRenew: true,
          transactionType: TransactionType.SUBSCRIPTION,
        },
      });

      const renewed = purchaseSubscriptionPlan(
        subscription,
        subscription.planCode,
        subscription.billingCycle,
        undefined,
        now,
      );
      await this.notifySubscriptionRenewed(userId, renewed, {
        chargedCoins: totalCostCoins,
        billingCycle: subscription.billingCycle,
        emailOverride: email,
      });
      return { changed: true, subscription: renewed };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? '');
      const insufficient = message.toLowerCase().includes('insufficient');

      if (!insufficient) {
        throw error;
      }

      const alreadyFailed =
        subscription.renewalFailedAt &&
        subscription.gracePeriodEndsAt &&
        now.getTime() < new Date(subscription.gracePeriodEndsAt).getTime();
      if (alreadyFailed) {
        return { changed: false, subscription };
      }

      const failed = markRenewalFailed(
        subscription,
        now,
        this.getGracePeriodDays(),
      );
      await this.notifySubscriptionRenewalFailed(userId, email, failed, totalCostCoins);

      return { changed: true, subscription: failed };
    }
  }

  private getGracePeriodDays(): number {
    const configured = this.configService.get<number>('SUBSCRIPTION_GRACE_DAYS');
    if (!configured || !Number.isFinite(configured)) {
      return 3;
    }
    return Math.max(1, Math.floor(configured));
  }

  private async sendRenewalReminder(
    userId: string,
    email: string,
    subscription: ReturnType<typeof normalizeSubscription>,
    daysRemaining: 7 | 3,
  ) {
    const requiredCoins = calculatePlanPriceByCycle(
      subscription.planCode,
      subscription.billingCycle,
    ).cyclePriceCoins;
    const expiresAt = subscription.expiresAt ?? new Date();

    await this.notificationsService.createSubscriptionNotification({
      userId,
      type: NotificationType.SUBSCRIPTION_REMINDER,
      title: `Subscription expires in ${daysRemaining} day(s)`,
      message: `Your ${subscription.planName} plan will expire soon. Keep at least ${requiredCoins} coins for auto-renew.`,
      metadata: {
        daysRemaining,
        requiredCoins,
        expiresAt,
        planCode: subscription.planCode,
      },
    });

    await this.mailService.sendSubscriptionReminder(email, {
      planName: subscription.planName,
      expiresAt,
      daysRemaining,
      requiredCoins,
    });
  }

  private async notifySubscriptionRenewed(
    userId: string,
    subscription: ReturnType<typeof normalizeSubscription>,
    input: {
      chargedCoins: number;
      billingCycle: BillingCycle;
      emailOverride?: string;
    },
  ) {
    const user = input.emailOverride
      ? ({ email: input.emailOverride } as Pick<UserDocument, 'email'>)
      : await this.findUserOrFail(userId);

    await this.notificationsService.createSubscriptionNotification({
      userId,
      type: NotificationType.SUBSCRIPTION_RENEWED,
      title: `Subscription renewed: ${subscription.planName}`,
      message: `${subscription.planName} has been renewed (${input.billingCycle}). Charged ${input.chargedCoins} coins.`,
      metadata: {
        planCode: subscription.planCode,
        billingCycle: input.billingCycle,
        chargedCoins: input.chargedCoins,
        nextRenewalAt: subscription.nextRenewalAt,
      },
    });

    await this.mailService.sendSubscriptionRenewed(user.email, {
      planName: subscription.planName,
      billingCycle: input.billingCycle,
      nextRenewalAt: subscription.nextRenewalAt ?? new Date(),
      chargedCoins: input.chargedCoins,
    });
  }

  private async notifySubscriptionRenewalFailed(
    userId: string,
    email: string,
    subscription: ReturnType<typeof normalizeSubscription>,
    requiredCoins: number,
  ) {
    const graceEnds = subscription.gracePeriodEndsAt ?? new Date();

    await this.notificationsService.createSubscriptionNotification({
      userId,
      type: NotificationType.SUBSCRIPTION_FAILED,
      title: `Auto-renew failed for ${subscription.planName}`,
      message: `Insufficient wallet balance. Top up ${requiredCoins} coins before ${graceEnds.toISOString()}.`,
      metadata: {
        planCode: subscription.planCode,
        requiredCoins,
        gracePeriodEndsAt: graceEnds,
      },
    });

    await this.mailService.sendSubscriptionRenewalFailed(email, {
      planName: subscription.planName,
      requiredCoins,
      gracePeriodEndsAt: graceEnds,
    });
  }

  private async notifySubscriptionExpired(
    userId: string,
    email: string,
    subscription: ReturnType<typeof normalizeSubscription>,
  ) {
    const expiredAt = subscription.expiresAt ?? new Date();

    await this.notificationsService.createSubscriptionNotification({
      userId,
      type: NotificationType.SUBSCRIPTION_EXPIRED,
      title: `Subscription expired: ${subscription.planName}`,
      message: `Your ${subscription.planName} plan has expired and account is now on Free.`,
      metadata: {
        previousPlanCode: subscription.planCode,
        expiredAt,
      },
    });

    await this.mailService.sendSubscriptionExpired(email, {
      previousPlanName: subscription.planName,
      expiredAt,
    });
  }

  private getActivePerks(planCode: SubscriptionPlanCode) {
    const plan = getSubscriptionPlanDefinition(planCode);
    return plan.perks;
  }

  private parseRequestedPlanCode(raw: string): SubscriptionPlanCode {
    const normalized = raw?.trim().toLowerCase();
    if (
      normalized !== 'free' &&
      normalized !== 'pro' &&
      normalized !== 'vip' &&
      normalized !== 'starter' &&
      normalized !== 'elite'
    ) {
      throw new BadRequestException('Unsupported subscription plan');
    }

    return toCanonicalPlanCode(normalized);
  }

  private subscriptionChanged(
    left: Partial<User['subscription']> | undefined,
    right: ReturnType<typeof normalizeSubscription>,
  ): boolean {
    if (!left) {
      return true;
    }

    const leftString = JSON.stringify(left);
    const rightString = JSON.stringify(right);
    return leftString !== rightString;
  }

  private async executeInTransaction<T>(
    callback: (session: ClientSession) => Promise<T>,
    session?: ClientSession,
  ): Promise<T> {
    if (session) {
      return callback(session);
    }

    const startedSession = await this.connection.startSession();
    try {
      const shouldUseTransactions = await this.canUseTransactions();
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

          this.transactionsSupported = false;
        }
      }

      return await callback(startedSession);
    } finally {
      await startedSession.endSession();
    }
  }

  private async canUseTransactions(): Promise<boolean> {
    if (this.transactionCapabilityChecked) {
      return this.transactionsSupported;
    }

    try {
      const db = this.connection.db;
      if (!db) {
        throw new Error('MongoDB connection is not ready');
      }

      const hello = await db.admin().command({ hello: 1 });
      const isReplicaSetMember = Boolean(hello?.setName);
      const isMongos = hello?.msg === 'isdbgrid';
      this.transactionsSupported = isReplicaSetMember || isMongos;
    } catch {
      this.transactionsSupported = true;
    } finally {
      this.transactionCapabilityChecked = true;
    }

    return this.transactionsSupported;
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

  private async findUserOrFail(
    userId: string,
    session?: ClientSession,
  ): Promise<UserDocument> {
    const query = this.userModel.findById(userId);
    if (session) {
      query.session(session);
    }

    const user = await query.exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.subscription) {
      user.subscription = createDefaultSubscription() as never;
      if (session) {
        await user.save({ session });
      } else {
        await user.save();
      }
    }

    return user;
  }

  private getCoinToVndRate(): number {
    const configuredRate = this.configService.get<number>(
      'wallet.coinToVndRate',
    );
    if (!configuredRate || !Number.isFinite(configuredRate)) {
      return 1000;
    }

    return configuredRate > 0 ? configuredRate : 1000;
  }

  private toWalletAmount(amountCoins: number, coinToVndRate: number): number {
    if (!Number.isFinite(amountCoins) || amountCoins <= 0) {
      return 0;
    }

    return Math.round(amountCoins * coinToVndRate);
  }
}
