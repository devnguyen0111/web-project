import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({
    example: false,
    description:
      'When false, user is disabled and cannot access authenticated endpoints',
  })
  @IsBoolean()
  isActive: boolean;
}
