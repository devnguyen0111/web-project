import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Role } from '../common/constants/roles.constant';
import { MinioService } from '../minio/minio.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User, UserDocument } from './schemas/user.schema';

interface CreateUserInput {
  fullName: string;
  email: string;
  password: string;
  role?: Role;
  isEmailVerified?: boolean;
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

  toResponse(user: UserDocument): UserResponseDto {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
