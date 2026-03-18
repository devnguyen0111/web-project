import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '../common/constants/roles.constant';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-objectid.pipe';
import { ParseFilePipeBuilder } from '@nestjs/common';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my profile' })
  @ApiResponse({ status: 200, description: 'Profile returned' })
  async getMe(@CurrentUser('userId') userId: string) {
    const user = await this.usersService.findByIdOrFail(userId);
    return this.usersService.toResponse(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my profile' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateMe(
    @CurrentUser('userId') userId: string,
    @Body() payload: UpdateProfileDto,
  ) {
    const user = await this.usersService.updateProfile(userId, payload);
    return this.usersService.toResponse(user);
  }

  @Patch('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload my avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 200, description: 'Avatar updated' })
  async uploadMyAvatar(
    @CurrentUser('userId') userId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/i })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: {
      buffer: Buffer;
      size: number;
      mimetype?: string;
      originalname?: string;
    },
  ) {
    const user = await this.usersService.uploadAvatar(userId, file);
    return this.usersService.toResponse(user);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get my profile' })
  @ApiResponse({ status: 200, description: 'Profile returned' })
  async getProfile(@CurrentUser('userId') userId: string) {
    const user = await this.usersService.findByIdOrFail(userId);
    return this.usersService.toResponse(user);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update my profile' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() payload: UpdateProfileDto,
  ) {
    const user = await this.usersService.updateProfile(userId, payload);
    return this.usersService.toResponse(user);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List users (admin only)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({ status: 200, description: 'User list returned' })
  async listUsers(@Query() query: PaginationDto) {
    return this.usersService.listUsers(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get user by id (admin only)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of the user' })
  @ApiResponse({ status: 200, description: 'User returned' })
  async getUserById(@Param('id', ParseObjectIdPipe) id: string) {
    const user = await this.usersService.findByIdOrFail(id);
    return this.usersService.toResponse(user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update user profile (admin only)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of the user' })
  @ApiBody({ type: UpdateUserAdminDto })
  @ApiResponse({ status: 200, description: 'User updated' })
  async updateUserByAdmin(
    @CurrentUser('userId') adminUserId: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() payload: UpdateUserAdminDto,
  ) {
    const user = await this.usersService.updateUserByAdmin(
      adminUserId,
      id,
      payload,
    );
    return this.usersService.toResponse(user);
  }

  @Patch(':id/role')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update user role (admin only)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of the user' })
  @ApiBody({ type: UpdateUserRoleDto })
  @ApiResponse({ status: 200, description: 'User role updated' })
  async updateUserRole(
    @CurrentUser('userId') adminUserId: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() payload: UpdateUserRoleDto,
  ) {
    const user = await this.usersService.updateUserRole(
      adminUserId,
      id,
      payload.role,
    );
    return this.usersService.toResponse(user);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update user active status (admin only)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of the user' })
  @ApiBody({ type: UpdateUserStatusDto })
  @ApiResponse({ status: 200, description: 'User status updated' })
  async updateUserStatus(
    @CurrentUser('userId') adminUserId: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() payload: UpdateUserStatusDto,
  ) {
    const user = await this.usersService.updateUserStatus(
      adminUserId,
      id,
      payload.isActive,
    );
    return this.usersService.toResponse(user);
  }
}
