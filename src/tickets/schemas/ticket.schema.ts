import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TicketDocument = HydratedDocument<Ticket>;

export enum TicketRelatedType {
  ORDER = 'order',
  PRODUCT = 'product',
  WALLET = 'wallet',
  ACCOUNT = 'account',
}

export enum TicketCategory {
  ORDER_ISSUE = 'order_issue',
  PAYMENT = 'payment',
  PRODUCT_QUALITY = 'product_quality',
  REFUND = 'refund',
  CUSTOM_ORDER = 'custom_order',
  ACCOUNT = 'account',
  STORE_REPORT = 'store_report',
  BUG_REPORT = 'bug_report',
  FEATURE_REQUEST = 'feature_request',
  GENERAL = 'general',
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum TicketStatus {
  OPEN = 'open',
  AWAITING_USER = 'awaiting_user',
  IN_PROGRESS = 'in_progress',
  ESCALATED = 'escalated',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  REOPENED = 'reopened',
}

export enum TicketLastMessageBy {
  USER = 'user',
  STAFF = 'staff',
}

@Schema({ _id: false })
export class TicketRelatedTo {
  @Prop({ type: String, enum: TicketRelatedType, required: true })
  type: TicketRelatedType;

  @Prop({ type: Types.ObjectId, required: true })
  id: Types.ObjectId;
}

export const TicketRelatedToSchema =
  SchemaFactory.createForClass(TicketRelatedTo);

@Schema({ _id: false })
export class TicketSla {
  @Prop({ type: Date, required: true })
  firstResponseDue: Date;

  @Prop({ type: Date, required: true })
  resolutionDue: Date;
}

export const TicketSlaSchema = SchemaFactory.createForClass(TicketSla);

@Schema({ _id: false })
export class TicketSatisfaction {
  @Prop({ min: 1, max: 5 })
  rating?: number;

  @Prop({ trim: true, maxlength: 1000 })
  comment?: string;

  @Prop({ type: Date })
  ratedAt?: Date;
}

export const TicketSatisfactionSchema =
  SchemaFactory.createForClass(TicketSatisfaction);

@Schema({ timestamps: true })
export class Ticket {
  @Prop({ required: true, unique: true, index: true, maxlength: 64 })
  ticketNumber: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, index: true })
  assignedTo?: Types.ObjectId;

  @Prop({ type: TicketRelatedToSchema })
  relatedTo?: TicketRelatedTo;

  @Prop({ required: true, trim: true, maxlength: 200 })
  subject: string;

  @Prop({ type: String, enum: TicketCategory, default: TicketCategory.GENERAL })
  category: TicketCategory;

  @Prop({ type: String, enum: TicketPriority, default: TicketPriority.MEDIUM })
  priority: TicketPriority;

  @Prop({ type: String, enum: TicketStatus, default: TicketStatus.OPEN })
  status: TicketStatus;

  @Prop({ type: TicketSlaSchema, required: true })
  sla: TicketSla;

  @Prop({ type: Date })
  firstResponseAt?: Date;

  @Prop({ type: Date })
  resolvedAt?: Date;

  @Prop({ type: Date })
  closedAt?: Date;

  @Prop({ type: TicketSatisfactionSchema })
  satisfaction?: TicketSatisfaction;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: false })
  isEscalated: boolean;

  @Prop({ type: Types.ObjectId })
  escalatedTo?: Types.ObjectId;

  @Prop({ required: true, min: 0, default: 0 })
  messagesCount: number;

  @Prop({ type: Date })
  lastMessageAt?: Date;

  @Prop({
    type: String,
    enum: TicketLastMessageBy,
    default: TicketLastMessageBy.USER,
  })
  lastMessageBy: TicketLastMessageBy;

  createdAt: Date;
  updatedAt: Date;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);

TicketSchema.index({ createdBy: 1, status: 1, createdAt: -1 });
TicketSchema.index({ assignedTo: 1, status: 1, priority: -1, createdAt: 1 });
TicketSchema.index({ status: 1, priority: -1, createdAt: 1 });
TicketSchema.index({ 'relatedTo.type': 1, 'relatedTo.id': 1 });
