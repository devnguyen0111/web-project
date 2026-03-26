import { Controller, Get, Param, Patch, Post, Query, Body } from '@nestjs/common';
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
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UsersService } from './users.service';

@ApiTags('admin-users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (admin alias)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({ status: 200, description: 'User list returned' })
  listUsers(@Query() query: PaginationDto) {
    return this.usersService.listUsers(query);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Update user role (admin alias)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of the user' })
  @ApiBody({ type: UpdateUserRoleDto })
  @ApiResponse({ status: 200, description: 'User role updated' })
  async updateRole(
    @CurrentUser('userId') adminUserId: string,
    @Param('id', ParseObjectIdPipe) userId: string,
    @Body() payload: UpdateUserRoleDto,
  ) {
    const user = await this.usersService.updateUserRole(
      adminUserId,
      userId,
      payload.role,
    );
    return this.usersService.toResponse(user);
  }

  @Post(':id/ban')
  @ApiOperation({ summary: 'Ban user (admin alias)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of the user' })
  @ApiResponse({ status: 201, description: 'User banned' })
  async ban(
    @CurrentUser('userId') adminUserId: string,
    @Param('id', ParseObjectIdPipe) userId: string,
  ) {
    const user = await this.usersService.updateUserStatus(
      adminUserId,
      userId,
      false,
    );
    return this.usersService.toResponse(user);
  }

  @Post(':id/unban')
  @ApiOperation({ summary: 'Unban user (admin alias)' })
  @ApiParam({ name: 'id', description: 'Mongo ObjectId of the user' })
  @ApiResponse({ status: 201, description: 'User unbanned' })
  async unban(
    @CurrentUser('userId') adminUserId: string,
    @Param('id', ParseObjectIdPipe) userId: string,
  ) {
    const user = await this.usersService.updateUserStatus(
      adminUserId,
      userId,
      true,
    );
    return this.usersService.toResponse(user);
  }
}
