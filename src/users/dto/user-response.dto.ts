import { Role } from '../../common/constants/roles.constant';

export class UserResponseDto {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}
