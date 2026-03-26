import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TicketMessageDocument = HydratedDocument<TicketMessage>;

@Schema({ _id: false })
export class TicketMessageAttachment {
  @Prop({ required: true, trim: true, maxlength: 255 })
  fileName: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  url: string;

  @Prop({ min: 1 })
  size?: number;

  @Prop({ trim: true, maxlength: 120 })
  mimeType?: string;
}

export const TicketMessageAttachmentSchema = SchemaFactory.createForClass(
  TicketMessageAttachment,
);

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class TicketMessage {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  ticketId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  senderId?: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 4000 })
  content: string;

  @Prop({ type: [TicketMessageAttachmentSchema], default: [] })
  attachments: TicketMessageAttachment[];

  @Prop({ default: false, index: true })
  isInternal: boolean;

  @Prop({ default: false })
  isSystem: boolean;

  @Prop({ trim: true, maxlength: 120 })
  systemEvent?: string;

  createdAt: Date;
}

export const TicketMessageSchema = SchemaFactory.createForClass(TicketMessage);

TicketMessageSchema.index({ ticketId: 1, createdAt: 1 });
TicketMessageSchema.index({ ticketId: 1, isInternal: 1 });
