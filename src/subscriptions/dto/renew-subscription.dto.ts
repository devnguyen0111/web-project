import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { BillingCycle, SubscriptionPlanCode } from '../subscription.constants';

export class RenewSubscriptionDto {
  @ApiProperty({
    example: SubscriptionPlanCode.PRO,
    description:
      'Plan code. Supports legacy values starter/elite for backward compatibility.',
  })
  @IsString()
  planCode: string;

  @ApiPropertyOptional({
    enum: BillingCycle,
    default: BillingCycle.MONTHLY,
    description:
      'Preferred billing cycle. Legacy clients can still send months without this field.',
  })
  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1, maximum: 24 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  @IsOptional()
  months?: number;

  @ApiPropertyOptional({
    example: 'renew-subscription-2026-03-19-001',
    description: 'Idempotency key to prevent duplicate charges',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
