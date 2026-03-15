import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../common/constants/roles.constant';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-objectid.pipe';
import { UpdateProfileDto } from './dto/update-profile.dto';
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
}
