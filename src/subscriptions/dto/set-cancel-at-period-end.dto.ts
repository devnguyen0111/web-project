import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class SetCancelAtPeriodEndDto {
  @ApiPropertyOptional({
    example: true,
    default: true,
    description:
      'When true, subscription remains active until period end and then downgrades',
  })
  @IsOptional()
  @IsBoolean()
  cancel?: boolean;
}
