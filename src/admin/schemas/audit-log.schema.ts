import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Role } from '../../common/constants/roles.constant';

export type AuditLogDocument = HydratedDocument<AuditLog>;

export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
}

@Schema({
  timestamps: {
    createdAt: true,
    updatedAt: false,
  },
})
export class AuditLog {
  @Prop({ type: Types.ObjectId, index: true })
  userId?: Types.ObjectId;

  @Prop({ type: String, enum: Role })
  userRole?: Role;

  @Prop({ trim: true, maxlength: 128 })
  ip?: string;

  @Prop({ trim: true, maxlength: 500 })
  userAgent?: string;

  @Prop({ required: true, trim: true, maxlength: 8 })
  method: string;

  @Prop({ required: true, trim: true, maxlength: 300 })
  route: string;

  @Prop({ required: true, trim: true, maxlength: 320, index: true })
  action: string;

  @Prop({ trim: true, maxlength: 128 })
  target?: string;

  @Prop({ type: Number, required: true, min: 100, max: 599 })
  statusCode: number;

  @Prop({ type: String, enum: AuditSeverity, default: AuditSeverity.INFO })
  severity: AuditSeverity;

  @Prop({ trim: true, maxlength: 1000 })
  errorMessage?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  details?: Record<string, unknown>;

  createdAt: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ severity: 1, createdAt: -1 });
AuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 180 * 24 * 60 * 60 },
);
