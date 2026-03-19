import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetAutoRenewDto {
  @ApiProperty({
    example: true,
    description: 'Enable or disable auto renewal for the active paid plan',
  })
  @IsBoolean()
  enabled: boolean;
}
