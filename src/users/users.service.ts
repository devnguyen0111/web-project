import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Role } from '../common/constants/roles.constant';
import { MinioService } from '../minio/minio.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import {
  UserPostQuotaResponseDto,
  UserResponseDto,
  UserSubscriptionResponseDto,
  WalletResponseDto,
} from './dto/user-response.dto';
import { User, UserDocument } from './schemas/user.schema';
import { createDefaultWallet } from '../wallet/schemas/wallet.schema';
import { createDefaultSubscription } from '../subscriptions/schemas/subscription.schema';
import {
  calculateSubscriptionQuota,
  normalizeSubscription,
} from '../subscriptions/subscription.util';

interface CreateUserInput {
  fullName: string;
  email: string;
  password: string;
  role?: Role;
  isEmailVerified?: boolean;
  isActive?: boolean;
}

const AUTH_SENSITIVE_FIELDS =
  '+password +refreshToken +emailVerificationCodeHash +emailVerificationCodeExpiresAt +passwordResetCodeHash +passwordResetCodeExpiresAt';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly minioService: MinioService,
  ) {}

  async create(input: CreateUserInput): Promise<UserDocument> {
    const hashedPassword = await bcrypt.hash(input.password, 10);

    const createdUser = await this.userModel.create({
      ...input,
      password: hashedPassword,
      email: input.email.toLowerCase(),
      wallet: createDefaultWallet(),
      subscription: createDefaultSubscription(),
    });

    return createdUser;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() });
  }

  async findByEmailWithSensitive(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select(AUTH_SENSITIVE_FIELDS);
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id);
  }

  async findByIdWithSensitive(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select(AUTH_SENSITIVE_FIELDS);
  }

  async findByIdOrFail(id: string): Promise<UserDocument> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateProfile(
    userId: string,
    payload: UpdateProfileDto,
  ): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(userId, payload, {
        returnDocument: 'after',
        runValidators: true,
      })
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async uploadAvatar(
    userId: string,
    file: {
      buffer: Buffer;
      size: number;
      mimetype?: string;
      originalname?: string;
    },
  ): Promise<UserDocument> {
    const user = await this.findByIdOrFail(userId);
    const oldAvatarUrl = user.avatarUrl;
    const avatarBucket = this.minioService.getBucket('avatars');

    const upload = await this.minioService.uploadFile(
      avatarBucket,
      file,
      `users/${userId}`,
    );

    user.avatarUrl = upload.url;
    await user.save();

    if (oldAvatarUrl && oldAvatarUrl !== upload.url) {
      await this.minioService.removeObjectByUrl(avatarBucket, oldAvatarUrl);
    }

    return user;
  }

  async updateRefreshToken(
    userId: string,
    refreshToken: string | null,
  ): Promise<void> {
    const hashedRefreshToken = refreshToken
      ? await bcrypt.hash(refreshToken, 10)
      : null;

    await this.userModel.findByIdAndUpdate(userId, {
      refreshToken: hashedRefreshToken,
    });
  }

  async updateEmailVerificationCode(
    userId: string,
    codeHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      emailVerificationCodeHash: codeHash,
      emailVerificationCodeExpiresAt: expiresAt,
    });
  }

  async markEmailAsVerified(userId: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          isEmailVerified: true,
          emailVerificationCodeHash: null,
          emailVerificationCodeExpiresAt: null,
        },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updatePasswordResetCode(
    userId: string,
    codeHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      passwordResetCodeHash: codeHash,
      passwordResetCodeExpiresAt: expiresAt,
    });
  }

  async clearPasswordResetCode(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      passwordResetCodeHash: null,
      passwordResetCodeExpiresAt: null,
    });
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(password, 10);
    await this.userModel.findByIdAndUpdate(userId, {
      password: hashedPassword,
    });
  }

  async listUsers(
    query: PaginationDto,
  ): Promise<PaginatedResponseDto<UserResponseDto>> {
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.userModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit),
      this.userModel.countDocuments(),
    ]);

    return new PaginatedResponseDto(
      items.map((item) => this.toResponse(item)),
      total,
      query.page,
      query.limit,
    );
  }

  async updateUserRole(
    actorUserId: string,
    targetUserId: string,
    role: Role,
  ): Promise<UserDocument> {
    if (role === Role.GUEST) {
      throw new BadRequestException('Guest role cannot be assigned to users');
    }

    if (actorUserId === targetUserId) {
      throw new BadRequestException('Admin cannot change their own role');
    }

    const targetUser = await this.findByIdOrFail(targetUserId);
    if (targetUser.role === role) {
      return targetUser;
    }

    if (targetUser.role === Role.ADMIN && role !== Role.ADMIN) {
      const adminCount = await this.userModel.countDocuments({
        role: Role.ADMIN,
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot change role of the last admin');
      }
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        targetUserId,
        {
          role,
          refreshToken: null,
        },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .exec();

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    return updatedUser;
  }

  async updateUserStatus(
    actorUserId: string,
    targetUserId: string,
    isActive: boolean,
  ): Promise<UserDocument> {
    if (actorUserId === targetUserId && !isActive) {
      throw new BadRequestException('Admin cannot disable their own account');
    }

    const targetUser = await this.findByIdOrFail(targetUserId);
    const currentActive = targetUser.isActive !== false;
    if (currentActive === isActive) {
      return targetUser;
    }

    if (targetUser.role === Role.ADMIN && currentActive && !isActive) {
      const activeAdminCount = await this.userModel.countDocuments({
        role: Role.ADMIN,
        isActive: { $ne: false },
      });
      if (activeAdminCount <= 1) {
        throw new BadRequestException('Cannot disable the last active admin');
      }
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        targetUserId,
        {
          isActive,
          refreshToken: null,
        },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .exec();

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    return updatedUser;
  }

  async updateUserByAdmin(
    actorUserId: string,
    targetUserId: string,
    payload: UpdateUserAdminDto,
  ): Promise<UserDocument> {
    const hasPayload = Object.values(payload).some(
      (value) => value !== undefined,
    );
    if (!hasPayload) {
      throw new BadRequestException('At least one field must be provided');
    }

    const targetUser = await this.findByIdOrFail(targetUserId);
    if (
      actorUserId === targetUserId &&
      payload.isEmailVerified !== undefined &&
      payload.isEmailVerified !== targetUser.isEmailVerified
    ) {
      throw new BadRequestException(
        'Admin cannot change own verification state via admin endpoint',
      );
    }

    const normalizedPayload: Partial<UpdateUserAdminDto> = {
      ...payload,
      ...(payload.email ? { email: payload.email.toLowerCase() } : {}),
    };

    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        targetUserId,
        {
          ...normalizedPayload,
          ...(payload.email ? { refreshToken: null } : {}),
        },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .exec();

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    return updatedUser;
  }

  toResponse(user: UserDocument): UserResponseDto {
    const wallet = this.normalizeWallet(user.wallet);
    const normalizedSubscription = normalizeSubscription(user.subscription);
    const postQuota = calculateSubscriptionQuota(normalizedSubscription);
    const subscription: UserSubscriptionResponseDto = {
      planCode: normalizedSubscription.planCode,
      planName: normalizedSubscription.planName,
      basePostLimit: normalizedSubscription.basePostLimit,
      extraPosts: normalizedSubscription.extraPosts,
      monthlyPriceCoins: normalizedSubscription.monthlyPriceCoins,
      billingCycle: normalizedSubscription.billingCycle,
      autoRenew: normalizedSubscription.autoRenew,
      cancelAtPeriodEnd: normalizedSubscription.cancelAtPeriodEnd,
      status: normalizedSubscription.status,
      startedAt: normalizedSubscription.startedAt,
      expiresAt: normalizedSubscription.expiresAt,
      currentPeriodStart: normalizedSubscription.currentPeriodStart,
      currentPeriodEnd: normalizedSubscription.currentPeriodEnd,
      postsUsedInPeriod: normalizedSubscription.postsUsedInPeriod,
      renewedAt: normalizedSubscription.renewedAt,
      nextRenewalAt: normalizedSubscription.nextRenewalAt,
      renewalFailedAt: normalizedSubscription.renewalFailedAt,
      gracePeriodEndsAt: normalizedSubscription.gracePeriodEndsAt,
      reminder7dSentAt: normalizedSubscription.reminder7dSentAt,
      reminder3dSentAt: normalizedSubscription.reminder3dSentAt,
    };
    const quota: UserPostQuotaResponseDto = {
      allowedPosts: postQuota.allowedPosts,
      usedPosts: postQuota.usedPosts,
      remainingPosts: postQuota.remainingPosts,
      exhausted: postQuota.exhausted,
    };

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive !== false,
      avatarUrl: user.avatarUrl,
      wallet,
      subscription,
      postQuota: quota,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private normalizeWallet(
    wallet: Partial<WalletResponseDto> | undefined,
  ): WalletResponseDto {
    const defaults = createDefaultWallet();

    return {
      balance: wallet?.balance ?? defaults.balance,
      frozenBalance: wallet?.frozenBalance ?? defaults.frozenBalance,
      totalEarned: wallet?.totalEarned ?? defaults.totalEarned,
      totalSpent: wallet?.totalSpent ?? defaults.totalSpent,
      lifetimeDeposit: wallet?.lifetimeDeposit ?? defaults.lifetimeDeposit,
    };
  }
}
