import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn } from 'class-validator';
import { Role } from '../../common/constants/roles.constant';

const ADMIN_ASSIGNABLE_ROLES = [Role.AUTHOR, Role.STAFF, Role.ADMIN];

export class UpdateUserRoleDto {
  @ApiProperty({
    enum: ADMIN_ASSIGNABLE_ROLES,
    example: Role.STAFF,
    description: 'Role assigned by admin',
  })
  @IsEnum(Role)
  @IsIn(ADMIN_ASSIGNABLE_ROLES)
  role: Role;
}
